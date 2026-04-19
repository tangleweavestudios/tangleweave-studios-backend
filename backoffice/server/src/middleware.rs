use std::sync::Arc;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use axum::{
    body::Body,
    extract::{Request, State},
    http::{StatusCode, HeaderValue},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use tokio::sync::RwLock;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

const RATE_LIMIT_REQUESTS: u64 = 5;
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct RateLimitEntry {
    requests: Vec<Instant>,
}

pub struct RateLimiter {
    entries: RwLock<HashMap<String, RateLimitEntry>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
        }
    }

    pub async fn check_rate_limit(&self, key: &str) -> bool {
        let mut entries = self.entries.write().await;
        let entry = entries.entry(key.to_string()).or_default();
        
        let now = Instant::now();
        
        entry.requests.retain(|&t| now.duration_since(t) < RATE_LIMIT_WINDOW);
        
        if entry.requests.len() >= RATE_LIMIT_REQUESTS as usize {
            return false;
        }
        
        entry.requests.push(now);
        true
    }

    pub async fn cleanup(&self) {
        let mut entries = self.entries.write().await;
        let now = Instant::now();
        
        entries.retain(|_, entry| {
            entry.requests.iter().any(|t| now.duration_since(*t) < RATE_LIMIT_WINDOW)
        });
    }
}

pub async fn rate_limit_promocode(
    State(rate_limiter): State<Arc<RateLimiter>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let user_id = request
        .headers()
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("anonymous");

    let key = format!("promocode:{}", user_id);
    
    if !rate_limiter.check_rate_limit(&key).await {
        tracing::warn!("Rate limit exceeded for user: {}", user_id);
        return (StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({
            "success": false,
            "error": "Too many requests. Please wait a minute.",
            "retry_after": RATE_LIMIT_WINDOW.as_secs()
        })))
        .into_response();
    }
    
    next.run(request).await
}

pub async fn rate_limit_payment(
    State(rate_limiter): State<Arc<RateLimiter>>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let ip = request
        .headers()
        .get("X-Forwarded-For")
        .or_else(|| request.headers().get("X-Real-IP"))
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    let key = format!("payment:{}", ip);
    
    if !rate_limiter.check_rate_limit(&key).await {
        tracing::warn!("Payment rate limit exceeded for IP: {}", ip);
        return (StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({
            "success": false,
            "error": "Too many payment requests. Please try again later."
        })))
        .into_response();
    }
    
    next.run(request).await
}

pub async fn hmac_verify_payment_webhook(
    request: Request<Body>,
    next: Next,
) -> Response {
    let webhook_secret = std::env::var("PAYMENT_WEBHOOK_SECRET")
        .unwrap_or_else(|_| "".to_string());

    if webhook_secret.is_empty() {
        tracing::warn!("PAYMENT_WEBHOOK_SECRET not configured - skipping HMAC verification");
        return next.run(request).await;
    }

    let signature = request
        .headers()
        .get("X-Signature")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let Some(sig) = signature else {
        return (StatusCode::UNAUTHORIZED, "Missing X-Signature header").into_response();
    };

    let (parts, body) = request.into_parts();
    let bytes = match axum::body::to_bytes(body, 10_485_760).await {
        Ok(b) => b,
        Err(_) => return (StatusCode::BAD_REQUEST, "Failed to read body").into_response(),
    };
    
    let mut mac = HmacSha256::new_from_slice(webhook_secret.as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(&bytes);
    let expected_sig = hex::encode(mac.finalize().into_bytes());

    if sig != expected_sig {
        tracing::warn!("Invalid webhook signature");
        return (StatusCode::UNAUTHORIZED, "Invalid signature").into_response();
    }

    let request = Request::from_parts(parts, Body::from(bytes));
    next.run(request).await
}

pub async fn request_id_middleware(
    request: Request<Body>,
    next: Next,
) -> Response {
    let request_id = uuid::Uuid::new_v4().to_string();
    
    let mut response = next.run(request).await;
    
    response.headers_mut().insert(
        "X-Request-Id",
        HeaderValue::from_str(&request_id).unwrap_or_else(|_| HeaderValue::from_static("")),
    );
    
    response
}

pub async fn security_headers_middleware(
    request: Request<Body>,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    
    response.headers_mut().insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    response.headers_mut().insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    response.headers_mut().insert("X-XSS-Protection", HeaderValue::from_static("1; mode=block"));
    response.headers_mut().insert("Referrer-Policy", HeaderValue::from_static("strict-origin-when-cross-origin"));
    response.headers_mut().insert(
        "Strict-Transport-Security",
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );
    
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_allows_requests() {
        let limiter = Arc::new(RateLimiter::new());
        
        for i in 0..RATE_LIMIT_REQUESTS {
            let allowed = limiter.check_rate_limit(&format!("user_{}", i)).await;
            assert!(allowed, "Request {} should be allowed", i);
        }
    }

    #[tokio::test]
    async fn test_rate_limiter_blocks_after_limit() {
        let limiter = Arc::new(RateLimiter::new());
        let user_id = "test_user";
        
        for _ in 0..RATE_LIMIT_REQUESTS {
            limiter.check_rate_limit(user_id).await;
        }
        
        let allowed = limiter.check_rate_limit(user_id).await;
        assert!(!allowed, "Request after limit should be blocked");
    }
}
