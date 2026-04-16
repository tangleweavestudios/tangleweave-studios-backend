use axum::{extract::State, Json, http::StatusCode, response::IntoResponse};
use crate::models::{User, CreateUser};
use crate::AppState;

pub async fn create_user(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> impl IntoResponse {
    // Используем .query_as::<_, User>
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email"
    )
    .bind(payload.username)
    .bind(payload.email)
    .fetch_one(&state.db)
    .await;

    match user {
        Ok(u) => (StatusCode::CREATED, Json(u)).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

pub async fn get_users(State(state): State<AppState>) -> impl IntoResponse {
    // Используем .query_as::<_, User>
    let users = sqlx::query_as::<_, User>("SELECT id, username, email FROM users")
        .fetch_all(&state.db)
        .await;

    match users {
        Ok(list) => Json(list).into_response(),
        Err(e) => {
            eprintln!("Ошибка БД: {}", e); // Полезно для отладки
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}