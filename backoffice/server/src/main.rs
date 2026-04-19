mod models;
mod handlers;
mod auth;
mod middleware;

use std::sync::Arc;
use std::time::Duration;
use axum::{
    routing::{get, post},
    Router,
    middleware::{from_fn_with_state},
};
use tower_http::cors::{CorsLayer, Any};
use tower_http::trace::TraceLayer;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::net::SocketAddr;

use auth::{admin_auth_middleware, AuthConfig, get_oidc_discovery};
use handlers::AppState;
use middleware::{RateLimiter, rate_limit_promocode, rate_limit_payment, request_id_middleware, security_headers_middleware};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    tracing::info!("Starting TangleWeave Backoffice API v2");

    dotenvy::dotenv().ok();
    
    let db_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    let nakama_url = std::env::var("NAKAMA_URL")
        .unwrap_or_else(|_| "http://nakama:7350".to_string());
    let nakama_api_key = std::env::var("NAKAMA_API_KEY").ok();

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(30))
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    tracing::info!("Database connection established");

    let auth_config = Arc::new(AuthConfig::from_env());
    
    auth_config.start_jwks_rotation().await;
    
    tokio::time::sleep(Duration::from_secs(2)).await;
    tracing::info!("JWKS rotation started");

    let rate_limiter = Arc::new(RateLimiter::new());
    
    let state = AppState {
        db: pool.clone(),
        nakama_url,
        nakama_api_key,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let public_routes = Router::new()
        .route("/health", get(handlers::health_check))
        .route("/auth/v1/.well-known/openid-configuration", get(get_oidc_discovery))
        .route("/api/webhooks/payment", post(handlers::payment_webhook))
        .layer(cors.clone())
        .layer(from_fn_with_state(rate_limiter.clone(), rate_limit_payment))
        .layer(axum::extract::Extension(auth_config.clone()))
        .with_state(state.clone());

    let protected_routes = Router::new()
        .route("/api/users", get(handlers::get_users))
        .route("/api/users/{id}", get(handlers::get_user))
        .route("/api/users/{id}/reward", post(handlers::grant_reward))
        .route("/api/users/{id}/ban", post(handlers::ban_user))
        .route("/api/users/{id}/unban", post(handlers::unban_user))
        .route("/api/promocodes", get(handlers::list_promocodes))
        .route("/api/promocodes", post(handlers::create_promocode))
        .route("/api/promocodes/{code}/use", post(handlers::use_promocode))
        .route("/api/stats", get(handlers::get_stats))
        .route("/api/payments/pending", get(handlers::get_pending_payments))
        .layer(cors.clone())
        .layer(from_fn_with_state(auth_config.clone(), admin_auth_middleware))
        .layer(from_fn_with_state(rate_limiter.clone(), rate_limit_promocode))
        .with_state(state.clone());

    let app = public_routes
        .merge(protected_routes)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::middleware::from_fn(request_id_middleware))
        .layer(axum::middleware::from_fn(security_headers_middleware));

    tokio::spawn({
        let pool = pool.clone();
        async move {
            payment_worker(pool).await;
        }
    });

    tokio::spawn({
        let limiter = rate_limiter.clone();
        async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                limiter.cleanup().await;
                tracing::debug!("Rate limiter cleanup completed");
            }
        }
    });

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Server listening on http://{}", addr);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn payment_worker(db_pool: PgPool) {
    tracing::info!("Payment worker started");
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .expect("Failed to create HTTP client");

    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;

        let pending_payments = sqlx::query_as::<_, (sqlx::types::Uuid, String, String, serde_json::Value)>(
            r#"
            SELECT id, provider, event_type, payload 
            FROM payment_webhooks 
            WHERE processed = false 
            ORDER BY created_at ASC 
            LIMIT 10
            FOR UPDATE SKIP LOCKED
            "#
        )
        .fetch_all(&db_pool)
        .await;

        let Ok(payments) = pending_payments else {
            tracing::error!("Failed to fetch pending payments: {:?}", pending_payments.err());
            continue;
        };

        for (webhook_id, provider, event_type, payload) in payments {
            tracing::info!("Processing payment webhook: {} ({})", webhook_id, event_type);

            let result = process_payment(&client, &db_pool, &provider, &event_type, &payload).await;

            match result {
                Ok(_) => {
                    sqlx::query(
                        "UPDATE payment_webhooks SET processed = true, processed_at = NOW() WHERE id = $1"
                    )
                    .bind(webhook_id)
                    .execute(&db_pool)
                    .await
                    .ok();
                    
                    tracing::info!("Payment webhook {} processed successfully", webhook_id);
                }
                Err(e) => {
                    tracing::error!("Failed to process payment webhook {}: {}", webhook_id, e);
                    
                    sqlx::query(
                        "UPDATE payment_webhooks SET processed = false, error_message = $2 WHERE id = $1"
                    )
                    .bind(webhook_id)
                    .bind(&e)
                    .execute(&db_pool)
                    .await
                    .ok();
                }
            }
        }
    }
}

async fn process_payment(
    client: &reqwest::Client,
    db_pool: &PgPool,
    provider: &str,
    event_type: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    match (provider, event_type) {
        ("stripe", "payment_intent.succeeded") | ("xsolla", "payment_completed") => {
            let user_id = payload.get("user_id")
                .and_then(|v| v.as_str())
                .ok_or("Missing user_id in payment payload")?;
            
            let amount = payload.get("amount")
                .and_then(|v| v.as_i64())
                .ok_or("Missing amount in payment payload")?;
            
            let gems_amount = calculate_gems_from_amount(amount);
            
            let external_id = format!("payment_{}", user_id);
            
            let existing = sqlx::query_scalar::<_, (i64,)>(
                "SELECT COUNT(*) FROM rewards WHERE granted_by = $1"
            )
            .bind(&external_id)
            .fetch_one(db_pool)
            .await
            .unwrap_or((0,));

            if existing.0 > 0 {
                tracing::warn!("Payment already processed: {}", external_id);
                return Ok(());
            }

            sqlx::query(
                r#"
                INSERT INTO rewards (id, user_id, reward_type, amount, reason, granted_by)
                SELECT gen_random_uuid(), u.id, 'gems', $1, 'Payment', $3, u.external_id
                FROM users u
                WHERE u.external_id = $2 OR u.email = $2
                ON CONFLICT DO NOTHING
                "#
            )
            .bind(gems_amount)
            .bind(user_id)
            .bind(&external_id)
            .execute(db_pool)
            .await
            .map_err(|e| format!("Failed to insert reward: {}", e))?;

            tracing::info!("Granted {} gems to user {}", gems_amount, user_id);
            Ok(())
        }
        _ => {
            tracing::debug!("Skipping unhandled payment event: {} / {}", provider, event_type);
            Ok(())
        }
    }
}

fn calculate_gems_from_amount(amount_cents: i64) -> i32 {
    match amount_cents {
        0..=99 => 5,
        100..=499 => 50,
        500..=999 => 120,
        1000..=2499 => 280,
        2500..=4999 => 700,
        5000..=9999 => 1600,
        _ => (amount_cents / 10) as i32,
    }
}
