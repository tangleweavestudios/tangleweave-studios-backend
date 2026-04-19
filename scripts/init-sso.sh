#!/bin/bash
# ==============================================================================
# Rauthy SSO Auto-Configuration Script
# ==============================================================================
# This script automatically creates OIDC clients and roles via Rauthy API.
# 
# Usage:
#   1. Start Rauthy with a clean database (first time)
#   2. Wait for migrations to complete (~10 seconds)
#   3. Run: ./scripts/init-sso.sh
#
# Requirements:
#   - curl
#   - jq (optional, for pretty JSON output)
#
# Note: If the API key doesn't work, create clients manually via the admin UI:
#   https://localhost/rauthy
#   Login: admin@localhost.de / (BOOTSTRAP_ADMIN_PASSWORD_PLAIN)
# ==============================================================================

set -e

# Configuration
API_KEY_SECRET="${BOOTSTRAP_API_KEY_SECRET:-TwUA2M7RZ8H3FyJHbti2AcMADPDCxDqUKbvi8FDnm3nYidwQx57Wfv6iaVTQynMh}"
RAUTHY_URL="${RAUTHY_URL:-https://localhost/auth/v1}"
API_KEY_NAME="bootstrap"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Wait for Rauthy to be ready
wait_for_rauthy() {
    echo_step "Waiting for Rauthy to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sk -o /dev/null -w "%{http_code}" "$RAUTHY_URL/health" | grep -q "200"; then
            echo_success "Rauthy is ready!"
            return 0
        fi
        echo "  Attempt $attempt/$max_attempts..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo_error "Rauthy did not become ready in time"
    return 1
}

# Test API key
test_api_key() {
    echo_step "Testing API key authentication..."
    
    local response=$(curl -sk -w "\n%{http_code}" -X GET "$RAUTHY_URL/clients" \
        -H "Authorization: API-Key ${API_KEY_NAME}\$${API_KEY_SECRET}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ]; then
        echo_success "API key authentication successful!"
        return 0
    else
        echo_error "API key authentication failed (HTTP $http_code)"
        echo "Response: $body"
        echo ""
        echo_warning "Please create an API key manually via the admin UI:"
        echo "  1. Access: https://localhost/rauthy"
        echo "  2. Login: admin@localhost.de / \$BOOTSTRAP_ADMIN_PASSWORD_PLAIN"
        echo "  3. Go to: Auth Providers -> API Keys"
        echo "  4. Create a new API key with Clients and Roles permissions"
        echo ""
        return 1
    fi
}

# Delete client if exists (for updates)
delete_client() {
    local client_id="$1"
    curl -sk -X DELETE "$RAUTHY_URL/clients/$client_id" \
        -H "Authorization: $(get_auth_header)" 2>/dev/null || true
}

# Create authorization header
get_auth_header() {
    echo "API-Key ${API_KEY_NAME}\$${API_KEY_SECRET}"
}

# Create a role
create_role() {
    local role_name="$1"
    
    echo_step "Creating role: $role_name"
    
    local response=$(curl -sk -w "\n%{http_code}" -X POST "$RAUTHY_URL/roles" \
        -H "Authorization: $(get_auth_header)" \
        -H "Content-Type: application/json" \
        -d "{\"role\": \"$role_name\"}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo_success "Role '$role_name' created"
        return 0
    elif [ "$http_code" = "409" ] || [ "$http_code" = "400" ]; then
        echo_success "Role '$role_name' already exists"
        return 0
    else
        echo_error "Failed to create role '$role_name' (HTTP $http_code)"
        echo "Response: $body"
        return 1
    fi
}

# Create an OIDC client
create_client() {
    local client_id="$1"
    local name="$2"
    local redirect_uris="$3"
    local scopes="$4"
    
    echo_step "Creating client: $client_id"
    
    local response=$(curl -sk -w "\n%{http_code}" -X POST "$RAUTHY_URL/clients" \
        -H "Authorization: $(get_auth_header)" \
        -H "Content-Type: application/json" \
        -d "{
            \"id\": \"$client_id\",
            \"name\": \"$name\",
            \"secret\": null,
            \"confidential\": false,
            \"redirect_uris\": $redirect_uris,
            \"post_logout_redirect_uris\": $redirect_uris,
            \"allowed_origins\": [\"https://localhost\", \"http://localhost\"],
            \"enabled\": true,
            \"flows_enabled\": [\"authorization_code\", \"refresh_token\"],
            \"access_token_alg\": \"RS256\",
            \"id_token_alg\": \"RS256\",
            \"auth_code_lifetime\": 300,
            \"access_token_lifetime\": 1800,
            \"scopes\": $scopes,
            \"default_scopes\": $scopes,
            \"challenges\": [\"S256\"],
            \"force_mfa\": false
        }")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo_success "Client '$client_id' created"
        return 0
    elif [ "$http_code" = "409" ]; then
        echo_success "Client '$client_id' already exists"
        return 0
    elif [ "$http_code" = "400" ]; then
        if echo "$body" | grep -qi "already exists"; then
            echo_success "Client '$client_id' already exists"
            return 0
        else
            echo_error "Failed to create client '$client_id' (HTTP $http_code)"
            echo "Response: $body"
            return 1
        fi
    else
        echo_error "Failed to create client '$client_id' (HTTP $http_code)"
        echo "Response: $body"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    echo "=============================================="
    echo "  TangleWeave Studios - SSO Auto-Configuration"
    echo "=============================================="
    echo ""
    
    # Wait for Rauthy
    wait_for_rauthy || exit 1
    echo ""
    
    # Test API key
    if ! test_api_key; then
        echo_error "Cannot proceed without valid API key"
        exit 1
    fi
    echo ""
    
    # Create roles
    echo "--- Creating Roles ---"
    create_role "admin"
    create_role "support"
    create_role "player"
    echo ""
    
    # Create OIDC clients
    echo "--- Creating OIDC Clients ---"
    
    # Delete existing clients first (idempotent approach)
    echo_step "Cleaning up existing clients..."
    delete_client "unwind-game"
    delete_client "backoffice-admin"
    delete_client "backoffice-api"
    delete_client "nakama-console"
    
    # Godot Game Client
    create_client \
        "unwind-game" \
        "Unwind - The Magic Atlas" \
        '["https://localhost/callback", "http://127.0.0.1:*/callback", "unwind://auth"]' \
        '["openid", "profile", "email"]'
    
    # Backoffice Frontend
    create_client \
        "backoffice-admin" \
        "Tangleweave Backoffice" \
        '["https://localhost/callback", "https://localhost/auth/callback"]' \
        '["openid", "profile", "email", "roles"]'
    
    # Backoffice API (machine-to-machine)
    create_client \
        "backoffice-api" \
        "Backoffice API" \
        '[]' \
        '["openid", "profile"]'
    
    # Nakama Console (OAuth2-Proxy)
    create_client \
        "nakama-console" \
        "Nakama Console" \
        '["https://localhost/oauth2/callback"]' \
        '["openid", "profile", "email"]'
    
    echo ""
    echo "=============================================="
    echo_success "SSO Configuration Complete!"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "  1. Access Rauthy admin: https://localhost/rauthy"
    echo "  2. Login: admin@localhost.de / \$BOOTSTRAP_ADMIN_PASSWORD_PLAIN"
    echo "  3. Verify OIDC clients and roles"
    echo "  4. Update .env with client credentials for your app"
    echo ""
}

# Run main function
main "$@"
