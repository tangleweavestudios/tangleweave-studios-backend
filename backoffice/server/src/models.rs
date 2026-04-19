use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub external_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub role: String,
    pub balance: i32,
    pub is_banned: bool,
    pub ban_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Reward {
    pub id: Uuid,
    pub user_id: Uuid,
    pub reward_type: String,
    pub amount: i32,
    pub reason: Option<String>,
    pub granted_by: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Promocode {
    pub id: Uuid,
    pub code: String,
    pub reward_type: String,
    pub amount: i32,
    pub max_uses: Option<i32>,
    pub used_count: i32,
    pub expires_at: Option<DateTime<Utc>>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub external_id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GrantRewardRequest {
    pub reward_type: String,
    pub amount: i32,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BanUserRequest {
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePromocodeRequest {
    pub code: Option<String>,
    pub reward_type: String,
    pub amount: i32,
    pub max_uses: Option<i32>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsePromocodeRequest {
    pub code: String,
    pub user_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }
}

impl<T: Serialize> From<ApiResponse<T>> for Option<T> {
    fn from(response: ApiResponse<T>) -> Self {
        if response.success {
            response.data
        } else {
            None
        }
    }
}

impl ApiResponse<()> {
    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.into()),
        }
    }
}
