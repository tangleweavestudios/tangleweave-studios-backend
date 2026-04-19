use axum::{
    extract::{Path, Query, State, Extension},
    http::StatusCode,
    Json,
    response::IntoResponse,
};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, FromRow};
use uuid::Uuid;

use crate::auth::UserClaims;
use crate::models::*;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub nakama_url: String,
    pub nakama_api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Pagination {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub page: u32,
    pub limit: u32,
    pub total: i64,
    pub total_pages: u32,
}

pub async fn health_check() -> &'static str {
    "OK"
}

pub async fn get_users(
    State(state): State<AppState>,
    Extension(claims): Extension<UserClaims>,
    Query(pagination): Query<Pagination>,
) -> impl IntoResponse {
    let page = pagination.page.unwrap_or(1).max(1);
    let limit = pagination.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let users = sqlx::query_as::<_, User>(
        "SELECT id, external_id, email, display_name, role, balance, is_banned, ban_reason, created_at, updated_at 
         FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2"
    )
    .bind(limit as i32)
    .bind(offset as i32)
    .fetch_all(&state.db)
    .await;

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    match users {
        Ok(list) => Json(PaginatedResponse {
            data: list,
            page,
            limit,
            total,
            total_pages: ((total as f64) / (limit as f64)).ceil() as u32,
        }).into_response(),
        Err(e) => {
            tracing::error!("Database error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_user(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
    Path(user_id): Path<Uuid>,
) -> impl IntoResponse {
    let user = sqlx::query_as::<_, User>(
        "SELECT id, external_id, email, display_name, role, balance, is_banned, ban_reason, created_at, updated_at 
         FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await;

    match user {
        Ok(Some(u)) => Json(u).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Database error: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn grant_reward(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<GrantRewardRequest>,
) -> impl IntoResponse {
    let reward_id = Uuid::new_v4();
    let admin_id = "system";

    let tx_result = sqlx::query_as::<_, Reward>(
        r#"
        INSERT INTO rewards (id, user_id, reward_type, amount, reason, granted_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, reward_type, amount, reason, granted_by, created_at
        "#
    )
    .bind(reward_id)
    .bind(user_id)
    .bind(&req.reward_type)
    .bind(req.amount)
    .bind(&req.reason)
    .bind(admin_id)
    .fetch_one(&state.db)
    .await;

    match tx_result {
        Ok(reward) => {
            let _ = sqlx::query(&format!(
                "UPDATE users SET balance = balance + {} WHERE id = $1",
                req.amount
            ))
            .bind(user_id)
            .execute(&state.db)
            .await;

            let user = sqlx::query_as::<_, User>(
                "SELECT * FROM users WHERE id = $1"
            )
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            .ok();

            if let Some(ref u) = user {
                if let Err(e) = sync_balance_to_nakama(&state, &u.external_id, &req.reward_type, req.amount).await {
                    tracing::warn!("Failed to sync balance with Nakama: {}", e);
                }
            }

            Json(ApiResponse::success(reward)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to grant reward: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn ban_user(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<BanUserRequest>,
) -> impl IntoResponse {
    let user = sqlx::query_as::<_, User>(
        r#"
        UPDATE users SET is_banned = true, ban_reason = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING id, external_id, email, display_name, role, balance, is_banned, ban_reason, created_at, updated_at
        "#
    )
    .bind(user_id)
    .bind(&req.reason)
    .fetch_optional(&state.db)
    .await;

    match user {
        Ok(Some(u)) => Json(ApiResponse::success(u)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to ban user: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn unban_user(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
    Path(user_id): Path<Uuid>,
) -> impl IntoResponse {
    let user = sqlx::query_as::<_, User>(
        r#"
        UPDATE users SET is_banned = false, ban_reason = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING id, external_id, email, display_name, role, balance, is_banned, ban_reason, created_at, updated_at
        "#
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await;

    match user {
        Ok(Some(u)) => Json(ApiResponse::success(u)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to unban user: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_promocodes(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
) -> impl IntoResponse {
    let promocodes = sqlx::query_as::<_, Promocode>(
        "SELECT * FROM promocodes ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await;

    match promocodes {
        Ok(list) => Json(list).into_response(),
        Err(e) => {
            tracing::error!("Failed to list promocodes: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn create_promocode(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
    Json(req): Json<CreatePromocodeRequest>,
) -> impl IntoResponse {
    let code = req.code.unwrap_or_else(generate_promocode_code);
    let expires_at = req.expires_at.unwrap_or_else(|| Utc::now() + Duration::days(30));

    let existing = sqlx::query_scalar::<_, (String,)>(
        "SELECT code FROM promocodes WHERE code = $1"
    )
    .bind(&code)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if existing.is_some() {
        return Json(ApiResponse::<()>::error("Promocode already exists")).into_response();
    }

    let promocode = sqlx::query_as::<_, Promocode>(
        r#"
        INSERT INTO promocodes (id, code, reward_type, amount, max_uses, expires_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        RETURNING id, code, reward_type, amount, max_uses, used_count, expires_at, is_active, created_at
        "#
    )
    .bind(&code)
    .bind(&req.reward_type)
    .bind(req.amount)
    .bind(req.max_uses)
    .bind(expires_at)
    .fetch_one(&state.db)
    .await;

    match promocode {
        Ok(p) => Json(ApiResponse::success(p)).into_response(),
        Err(e) => {
            tracing::error!("Failed to create promocode: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn use_promocode(
    State(state): State<AppState>,
    Json(req): Json<UsePromocodeRequest>,
) -> impl IntoResponse {
    let promocode = sqlx::query_as::<_, Promocode>(
        "SELECT * FROM promocodes WHERE code = $1 AND is_active = true"
    )
    .bind(&req.code)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let Some(pc) = promocode else {
        return Json(ApiResponse::<()>::error("Promocode not found")).into_response();
    };

    if pc.expires_at.map(|e| e < Utc::now()).unwrap_or(false) {
        return Json(ApiResponse::<()>::error("Promocode expired")).into_response();
    }

    if pc.max_uses.map(|m| m <= pc.used_count).unwrap_or(false) {
        return Json(ApiResponse::<()>::error("Promocode usage limit reached")).into_response();
    }

    let used = sqlx::query_scalar::<_, (i64,)>(
        "SELECT COUNT(*) FROM reward_history WHERE source = $1 AND user_id = $2"
    )
    .bind(format!("promocode:{}", req.code))
    .bind(req.user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or((0,));

    if used.0 > 0 {
        return Json(ApiResponse::<()>::error("Promocode already used by this user")).into_response();
    }

    let tx_result = sqlx::query_as::<_, Reward>(
        r#"
        INSERT INTO rewards (id, user_id, reward_type, amount, reason, granted_by)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, 'promocode')
        RETURNING id, user_id, reward_type, amount, reason, granted_by, created_at
        "#
    )
    .bind(req.user_id)
    .bind(&pc.reward_type)
    .bind(pc.amount)
    .bind(format!("Promocode: {}", req.code))
    .fetch_one(&state.db)
    .await;

    match tx_result {
        Ok(reward) => {
            sqlx::query(
                "UPDATE promocodes SET used_count = used_count + 1 WHERE id = $1"
            )
            .bind(pc.id)
            .execute(&state.db)
            .await
            .ok();

            let user = sqlx::query_as::<_, User>(
                "SELECT * FROM users WHERE id = $1"
            )
            .bind(req.user_id)
            .fetch_one(&state.db)
            .await
            .ok();

            if let Some(ref u) = user {
                let _ = sync_balance_to_nakama(&state, &u.external_id, &pc.reward_type, pc.amount).await;
            }

            Json(ApiResponse::success(reward)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to use promocode: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_stats(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
) -> impl IntoResponse {
    let total_users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    let active_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let banned_users: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE is_banned = true"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let total_rewards: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM rewards")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

    let pending_payments: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM payment_webhooks WHERE processed = false"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let stats = serde_json::json!({
        "total_users": total_users,
        "active_users_7d": active_users,
        "banned_users": banned_users,
        "total_rewards": total_rewards,
        "pending_payments": pending_payments,
    });

    Json(ApiResponse::success(stats)).into_response()
}

pub async fn payment_webhook(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let event_type = payload.get("event")
        .and_then(|e| e.as_str())
        .unwrap_or("unknown")
        .to_string();

    let provider = payload.get("provider")
        .and_then(|p| p.as_str())
        .unwrap_or("unknown")
        .to_string();

    let webhook_id: Uuid = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO payment_webhooks (id, provider, event_type, payload, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        "#
    )
    .bind(webhook_id)
    .bind(&provider)
    .bind(&event_type)
    .bind(&payload)
    .execute(&state.db)
    .await
    .ok();

    Json(ApiResponse::success(serde_json::json!({
        "webhook_id": webhook_id,
        "status": "queued"
    }))).into_response()
}

pub async fn get_pending_payments(
    State(state): State<AppState>,
    Extension(_claims): Extension<UserClaims>,
) -> impl IntoResponse {
    let payments = sqlx::query_as::<_, PendingPayment>(
        r#"
        SELECT id, provider, event_type, payload, created_at 
        FROM payment_webhooks 
        WHERE processed = false 
        ORDER BY created_at ASC 
        LIMIT 100
        "#
    )
    .fetch_all(&state.db)
    .await;

    match payments {
        Ok(list) => Json(ApiResponse::success(list)).into_response(),
        Err(e) => {
            tracing::error!("Failed to get pending payments: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

fn generate_promocode_code() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".chars().collect();
    (0..8)
        .map(|_| chars[rng.gen_range(0..chars.len())])
        .collect()
}

async fn sync_balance_to_nakama(
    state: &AppState,
    user_external_id: &str,
    reward_type: &str,
    amount: i32,
) -> Result<(), String> {
    let nakama_url = &state.nakama_url;
    let api_key = state.nakama_api_key.as_ref()
        .ok_or("NAKAMA_API_KEY not configured")?;

    let client = reqwest::Client::new();
    
    let payload = serde_json::json!({
        "type": reward_type,
        "amount": amount,
    });

    let response = client
        .post(format!("{}/v2/rpc/grant_reward", nakama_url))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "id": "grant_reward",
            "payload": payload,
            "user_id": user_external_id
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Nakama returned: {}", response.status()));
    }

    tracing::info!("Balance synced to Nakama for user {}", user_external_id);
    Ok(())
}

#[derive(Debug, FromRow, Serialize)]
pub struct PendingPayment {
    pub id: Uuid,
    pub provider: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}
