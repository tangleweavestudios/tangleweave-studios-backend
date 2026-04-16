use axum::{
    body::Body,
    extract::{Request, Extension},
    http::StatusCode,
    middleware::Next,
    response::IntoResponse,
    Json,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub role: Option<String>,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
    pub aud: Vec<String>,
}

#[derive(Clone)]
pub struct AuthConfig {
    pub jwks_url: String,
    pub issuer: String,
    pub audience: String,
    pub decoding_key: Option<DecodingKey>,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        Self {
            jwks_url: std::env::var("JWKS_URL")
                .unwrap_or_else(|_| "http://localhost:8443/jwks".to_string()),
            issuer: std::env::var("OIDC_ISSUER")
                .unwrap_or_else(|_| "http://localhost:8443".to_string()),
            audience: std::env::var("OIDC_CLIENT_ID")
                .unwrap_or_else(|_| "backoffice-frontend".to_string()),
            decoding_key: None,
        }
    }

    pub async fn fetch_jwks(&self) -> Result<DecodingKey, String> {
        let client = reqwest::Client::new();
        let response = client
            .get(&self.jwks_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch JWKS: {}", e))?;

        let jwks: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse JWKS: {}", e))?;

        let keys = jwks["keys"]
            .as_array()
            .ok_or("No keys in JWKS")?;

        let key = keys
            .first()
            .ok_or("No key found in JWKS")?;

        let x5c = key["x5c"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str());

        if let Some(cert) = x5c {
            let pem = format!(
                "-----BEGIN CERTIFICATE-----\n{}\n-----END CERTIFICATE-----",
                cert
            );
            
            return Ok(DecodingKey::from_rsa_pem(pem.as_bytes())
                .map_err(|e| format!("Failed to create DecodingKey: {}", e))?);
        }

        let n = key["n"]
            .as_str()
            .ok_or("Missing 'n' in JWKS key")?;
        let e = key["e"]
            .as_str()
            .ok_or("Missing 'e' in JWKS key")?;

        DecodingKey::from_rsa_components(n, e)
            .map_err(|e| format!("Failed to create RSA key: {}", e))
    }
}

pub async fn auth_middleware(
    Extension(auth_config): Extension<AuthConfig>,
    mut request: Request<Body>,
    next: Next,
) -> impl IntoResponse {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                "Missing or invalid Authorization header",
            )
                .into_response();
        }
    };

    let decoding_key = match &auth_config.decoding_key {
        Some(key) => key.clone(),
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "JWKS not configured",
            )
                .into_response();
        }
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[&auth_config.issuer]);
    validation.set_audience(&[&auth_config.audience]);
    validation.validate_exp = true;
    validation.validate_nbf = true;

    match decode::<Claims>(token, &decoding_key, &validation) {
        Ok(token_data) => {
            request.extensions_mut().insert(token_data.claims);
            next.run(request).await
        }
        Err(e) => {
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
    Extension(auth_config): Extension<AuthConfig>,
) -> impl IntoResponse {
    let redirect_uri = std::env::var("OIDC_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:5173/callback".to_string());
    
    Json(OidcConfig {
        issuer: auth_config.issuer,
        client_id: auth_config.audience,
        redirect_uri,
        jwks_url: auth_config.jwks_url,
    })
}
