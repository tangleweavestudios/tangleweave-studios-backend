use std::sync::Arc;
use tokio::sync::RwLock;
use axum::{
    body::Body,
    extract::{Request, Extension, State},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation, jwk::JwkSet};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub roles: Option<Vec<String>>,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
    pub aud: Vec<String>,
}

impl Claims {
    pub fn has_role(&self, role: &str) -> bool {
        self.roles.as_ref()
            .map(|roles| roles.iter().any(|r| r == role))
            .unwrap_or(false)
    }
}

pub struct AuthConfig {
    pub jwks_url: String,
    pub issuer: String,
    pub audience: String,
    pub decoding_key: Arc<RwLock<Option<DecodingKey>>>,
    pub jwks: Arc<RwLock<JwkSet>>,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        Self {
            jwks_url: std::env::var("JWKS_URL")
                .unwrap_or_else(|_| "http://rauthy:8443/jwks".to_string()),
            issuer: std::env::var("OIDC_ISSUER")
                .unwrap_or_else(|_| "http://rauthy:8443".to_string()),
            audience: std::env::var("OIDC_CLIENT_ID")
                .unwrap_or_else(|_| "backoffice-frontend".to_string()),
            decoding_key: Arc::new(RwLock::new(None)),
            jwks: Arc::new(RwLock::new(JwkSet { keys: vec![] })),
        }
    }

    pub async fn start_jwks_rotation(&self) {
        let jwks_url = self.jwks_url.clone();
        let decoding_key = self.decoding_key.clone();
        let jwks = self.jwks.clone();
        let issuer = self.issuer.clone();

        tokio::spawn(async move {
            let mut retry_count = 0;
            let max_retries = 5;
            let base_delay = Duration::from_secs(1);

            loop {
                match Self::fetch_and_update_keys(&jwks_url, &decoding_key, &jwks).await {
                    Ok(_) => {
                        tracing::info!("JWKS keys updated successfully");
                        retry_count = 0;
                    }
                    Err(e) => {
                        retry_count += 1;
                        let delay = base_delay * 2u32.pow(retry_count.min(5));
                        tracing::warn!("JWKS fetch failed (attempt {}/{}): {}. Retrying in {:?}", 
                            retry_count, max_retries, e, delay);
                        
                        if retry_count >= max_retries {
                            tracing::error!("Max JWKS retry attempts reached. Will continue retrying.");
                            retry_count = max_retries;
                        }
                    }
                }

                tokio::time::sleep(Duration::from_secs(3600)).await;
            }
        });
    }

    async fn fetch_and_update_keys(
        jwks_url: &str,
        decoding_key: &Arc<RwLock<Option<DecodingKey>>>,
        jwks: &Arc<RwLock<JwkSet>>,
    ) -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let response = client
            .get(jwks_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch JWKS: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("JWKS endpoint returned status: {}", response.status()));
        }

        let jwks_response: JwkSet = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse JWKS: {}", e))?;

        if jwks_response.keys.is_empty() {
            return Err("JWKS contains no keys".to_string());
        }

        let mut new_key: Option<DecodingKey> = None;

        for key in &jwks_response.keys {
            if let Some(dec_key) = Self::jwk_to_decoding_key(key)? {
                new_key = Some(dec_key);
                break;
            }
        }

        let key = new_key.ok_or("No suitable RSA key found in JWKS")?;

        {
            let mut write_key = decoding_key.write().await;
            *write_key = Some(key);
        }

        {
            let mut write_jwks = jwks.write().await;
            *write_jwks = jwks_response;
        }

        Ok(())
    }

    fn jwk_to_decoding_key(jwk: &jsonwebtoken::jwk::Jwk) -> Result<Option<DecodingKey>, String> {
        if let jsonwebtoken::jwk::AlgorithmParameters::RSA(rsa_params) = &jwk.algorithm {
            let n_str = rsa_params.n.as_str();
            let e_str = rsa_params.e.as_str();
            
            let key = DecodingKey::from_rsa_components(n_str, e_str)
                .map_err(|e| format!("Failed to create RSA key: {}", e))?;
            return Ok(Some(key));
        }

        Ok(None)
    }

    pub async fn validate_token(&self, token: &str) -> Result<Claims, String> {
        let decoding_key = self.decoding_key.read().await;
        
        let key = decoding_key.as_ref()
            .ok_or_else(|| "JWKS not loaded yet".to_string())?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.issuer]);
        validation.set_audience(&[&self.audience]);
        validation.validate_exp = true;
        validation.validate_nbf = true;

        let token_data = decode::<Claims>(token, key, &validation)
            .map_err(|e| format!("Invalid token: {}", e))?;

        Ok(token_data.claims)
    }
}

#[derive(Clone)]
pub struct UserClaims(pub Claims);

pub async fn auth_middleware(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (StatusCode::UNAUTHORIZED, "Missing or invalid Authorization header")
                .into_response();
        }
    };

    match auth_config.validate_token(token).await {
        Ok(claims) => {
            request.extensions_mut().insert(UserClaims(claims));
            next.run(request).await
        }
        Err(e) => {
            tracing::warn!("Auth failed: {}", e);
            (StatusCode::UNAUTHORIZED, format!("Invalid token: {}", e)).into_response()
        }
    }
}

pub async fn admin_auth_middleware(
    State(auth_config): State<Arc<AuthConfig>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (StatusCode::UNAUTHORIZED, "Missing or invalid Authorization header")
                .into_response();
        }
    };

    match auth_config.validate_token(token).await {
        Ok(claims) => {
            if !claims.has_role("admin") && !claims.has_role("support") {
                return (StatusCode::FORBIDDEN, "Insufficient permissions").into_response();
            }
            request.extensions_mut().insert(UserClaims(claims));
            next.run(request).await
        }
        Err(e) => {
            tracing::warn!("Admin auth failed: {}", e);
            (StatusCode::UNAUTHORIZED, format!("Invalid token: {}", e)).into_response()
        }
    }
}

#[derive(Serialize)]
pub struct OidcConfig {
    pub issuer: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub jwks_url: String,
}

pub async fn get_oidc_config(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
) -> impl IntoResponse {
    let redirect_uri = std::env::var("OIDC_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost/callback".to_string());
    
    Json(OidcConfig {
        issuer: auth_config.issuer.clone(),
        client_id: auth_config.audience.clone(),
        redirect_uri,
        jwks_url: auth_config.jwks_url.clone(),
    })
}

#[derive(Serialize, Deserialize)]
struct RauthyOidcDiscovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: String,
    jwks_uri: String,
    end_session_endpoint: String,
    #[serde(rename = "scopes_supported")]
    scopes_supported: Vec<String>,
    #[serde(rename = "response_types_supported")]
    response_types_supported: Vec<String>,
}

pub async fn get_oidc_discovery(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
) -> impl IntoResponse {
    let rauthy_url = auth_config.issuer.clone();
    let discovery_url = format!("{}/.well-known/openid-configuration", rauthy_url);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create HTTP client");
    
    match client.get(&discovery_url).send().await {
        Ok(response) => {
            let mut body: serde_json::Value = response.json().await.unwrap_or_default();
            
            if let Some(obj) = body.as_object_mut() {
                obj.insert("issuer".to_string(), serde_json::json!("http://localhost/auth/v1"));
                obj.insert("authorization_endpoint".to_string(), serde_json::json!("http://localhost/auth/v1/oidc/authorize"));
                obj.insert("token_endpoint".to_string(), serde_json::json!("http://localhost/auth/v1/oidc/token"));
                if let Some(jwks_uri) = obj.get("jwks_uri") {
                    obj.insert("jwks_uri".to_string(), serde_json::json!("http://localhost/auth/v1/oidc/certs"));
                }
            }
            
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to fetch OIDC discovery: {}", e);
            (StatusCode::BAD_GATEWAY, Json(serde_json::json!({
                "error": "Failed to fetch OIDC discovery",
                "message": e.to_string()
            }))).into_response()
        }
    }
}

pub async fn get_jwks(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
) -> impl IntoResponse {
    let jwks = auth_config.jwks.read().await;
    Json(jwks.clone())
}

pub async fn oidc_authorize(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let rauthy_url = &auth_config.issuer;
    let authorize_url = format!("{}/oidc/authorize", rauthy_url);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("Failed to create HTTP client");
    
    let mut query_params = String::new();
    for (key, value) in &params {
        if !query_params.is_empty() {
            query_params.push('&');
        }
        query_params.push_str(&format!("{}={}", key, urlencoding::encode(value)));
    }
    
    let final_url = format!("{}?{}", authorize_url, query_params);
    
    match client.get(&final_url).send().await {
        Ok(response) => {
            let status = response.status();
            let headers = response.headers().clone();
            let body = response.bytes().await.unwrap_or_default();
            
            if status == 302 || status == 303 {
                if let Some(location) = headers.get("location") {
                    return (
                        StatusCode::FOUND,
                        [(header::LOCATION, location.to_str().unwrap_or("/"))],
                        body,
                    ).into_response();
                }
            }
            
            (status, body).into_response()
        }
        Err(e) => {
            tracing::error!("OIDC authorize error: {}", e);
            (StatusCode::BAD_GATEWAY, format!("OIDC error: {}", e)).into_response()
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct TokenRequest {
    pub grant_type: String,
    pub code: Option<String>,
    pub redirect_uri: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub refresh_token: Option<String>,
    pub code_verifier: Option<String>,
}

pub async fn oidc_token(
    Extension(auth_config): Extension<Arc<AuthConfig>>,
    axum::extract::Form(body): axum::extract::Form<TokenRequest>,
) -> impl IntoResponse {
    let rauthy_url = &auth_config.issuer;
    let token_url = format!("{}/oidc/token", rauthy_url);
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .build()
        .expect("Failed to create HTTP client");
    
    let mut form = std::collections::HashMap::new();
    form.insert("grant_type", body.grant_type);
    if let Some(code) = body.code {
        form.insert("code", code);
    }
    if let Some(uri) = body.redirect_uri {
        form.insert("redirect_uri", uri);
    }
    if let Some(client_id) = body.client_id {
        form.insert("client_id", client_id);
    }
    if let Some(verifier) = body.code_verifier {
        form.insert("code_verifier", verifier);
    }
    
    match client.post(&token_url).form(&form).send().await {
        Ok(response) => {
            let status = response.status();
            let body = response.json::<serde_json::Value>().await.unwrap_or_default();
            (status, Json(body)).into_response()
        }
        Err(e) => {
            tracing::error!("OIDC token error: {}", e);
            (StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": e.to_string()}))).into_response()
        }
    }
}
