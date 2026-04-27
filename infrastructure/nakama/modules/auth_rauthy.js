"use strict";
// Rauthy OIDC Authentication Module for Nakama
// Validates OIDC tokens from Rauthy and authenticates users
// --------------------------------------------------------------
let RAUTHY_ISSUER = "https://rauthy:8443";
let RAUTHY_JWKS_URL = "https://rauthy:8443/auth/v1/oidc/certs";
let RAUTHY_USERINFO_URL = "http://rauthy:8080/auth/v1/oidc/userinfo";
let RAUTHY_CLIENT_ID = "unwind-game";
const AUTH_TIMEOUT_MS = 5000;
// Cache for JWKS
let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL_MS = 3600000; // 1 hour
function base64UrlDecode(str) {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function fetchJWKS() {
    const now = Date.now();
    if (jwksCache && (now - jwksCacheTime) < JWKS_CACHE_TTL_MS) {
        return jwksCache;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
        const response = await fetch(RAUTHY_JWKS_URL, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`JWKS fetch failed: ${response.status}`);
        }
        jwksCache = await response.json();
        jwksCacheTime = now;
        return jwksCache;
    }
    catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
function pemFromRSAComponents(modulus, exponent) {
    const modulusBytes = base64UrlDecode(modulus);
    const exponentBytes = base64UrlDecode(exponent);
    const sequence = [];
    // RSA modulus
    sequence.push(0x02);
    const modBytes = encodeLengthPrefix(modulusBytes);
    sequence.push(...modBytes, ...modulusBytes);
    // RSA exponent  
    sequence.push(0x02);
    const expBytes = encodeLengthPrefix(exponentBytes);
    sequence.push(...expBytes, ...exponentBytes);
    // Wrap in BIT STRING
    const bitString = [0x03, 0x82, 0x01, 0x01, 0x00];
    for (const byte of sequence) {
        bitString.push(byte);
    }
    // Wrap in SEQUENCE
    const der = [0x30, 0x82];
    const derLength = bitString.length;
    der.push((derLength >> 8) & 0xFF, derLength & 0xFF, ...bitString);
    // Convert to PEM
    let pem = '-----BEGIN PUBLIC KEY-----\n';
    const base64 = btoa(String.fromCharCode.apply(null, der))
        .replace(/-/g, '+').replace(/_/g, '/');
    for (let i = 0; i < base64.length; i += 64) {
        pem += base64.substring(i, i + 64) + '\n';
    }
    pem += '-----END PUBLIC KEY-----';
    return pem;
}
function encodeLengthPrefix(bytes) {
    const len = bytes.length;
    if (len < 128) {
        return [len];
    }
    const bytes2 = [0x80 | (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF];
    return bytes2;
}
async function verifyRS256(token, jwks) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid token format');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    // Decode header
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
    if (header.alg !== 'RS256') {
        throw new Error(`Unsupported algorithm: ${header.alg}`);
    }
    // Find the key
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key || key.kty !== 'RSA') {
        throw new Error('No suitable RSA key found');
    }
    // Verify signature using Web Crypto API
    const signature = base64UrlDecode(signatureB64);
    const payload = `${headerB64}.${payloadB64}`;
    const payloadBytes = new TextEncoder().encode(payload);
    // ИСПРАВЛЕНИЕ: Добавляем 'as any', чтобы TypeScript не ругался на типы буферов
    const publicKey = await crypto.subtle.importKey('spki', base64UrlDecode(key.n), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const isValid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, publicKey, signature, payloadBytes);
    if (!isValid) {
        throw new Error('Signature verification failed');
    }
    // Decode and parse payload
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    // Verify claims
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
        throw new Error('Token expired');
    }
    if (claims.iat && claims.iat > now + 60) {
        throw new Error('Token issued in the future');
    }
    if (claims.iss !== RAUTHY_ISSUER) {
        throw new Error(`Invalid issuer: ${claims.iss} (Expected: ${RAUTHY_ISSUER})`);
    }
    // Check audience
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(RAUTHY_CLIENT_ID) && !audience.includes(RAUTHY_ISSUER)) {
        throw new Error('Invalid audience');
    }
    return claims;
}
function normalizeUsername(claims) {
    // Use email prefix or preferred_username or sub
    if (claims.preferred_username) {
        return claims.preferred_username.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    if (claims.email) {
        return claims.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
    return claims.sub.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
}
async function authenticateWithRauthyToken(logger, db, token) {
    try {
        // Fetch and cache JWKS
        const jwks = await fetchJWKS();
        // Verify token
        const claims = await verifyRS256(token, jwks);
        // Generate consistent user ID from subject
        const externalId = `rauthy:${claims.sub}`;
        // Look up or create user
        let userId = await findUserByExternalId(db, externalId);
        const username = normalizeUsername(claims);
        if (!userId) {
            // Create new user
            const metadata = {
                email: claims.email,
                name: claims.name || username,
                roles: claims.roles || [],
                rauthy_sub: claims.sub,
            };
            userId = await db.authenticateCustom(externalId, false);
            if (userId) {
                await db.updateAccount(userId, {
                    username: username,
                    displayName: claims.name || username,
                    metadata: metadata
                });
                logger.info(`Created new user from Rauthy: ${username} (${userId})`);
            }
        }
        if (!userId) {
            throw new Error('Failed to authenticate user');
        }
        return {
            userId: userId,
            username: username,
            email: claims.email
        };
    }
    catch (error) {
        logger.error(`Rauthy authentication failed: ${error}`);
        throw error;
    }
}
async function findUserByExternalId(db, externalId) {
    try {
        const result = await db.users([externalId]);
        if (result && result.length > 0) {
            return result[0].userId;
        }
        return null;
    }
    catch {
        return null;
    }
}
// RPC to authenticate with Rauthy OIDC token
function rpcAuthenticateRauthy(ctx, logger, nk, payload) {
    try {
        const { token } = JSON.parse(payload);
        if (!token || typeof token !== 'string') {
            return JSON.stringify({
                success: false,
                error: 'Missing or invalid token'
            });
        }
        let result = null;
        let error = null;
        // Use setTimeout to run async code synchronously (Nakama runtime limitation)
        authenticateWithRauthyToken(logger, nk, token)
            .then(res => { result = res; })
            .catch(err => { error = err; });
        // For now, return error as Nakama TS runtime is async
        // The client should use this RPC to validate the token server-side
        return JSON.stringify({
            success: false,
            error: 'Use authenticateRauthy() from the client SDK instead',
            instructions: {
                flow: '1. Client obtains OIDC token from Rauthy via PKCE flow',
                flow2: '2. Client sends token to Nakama for custom authentication',
                flow3: '3. Server validates token and returns Nakama session'
            }
        });
    }
    catch (error) {
        logger.error(`RPC authenticate_rauthy error: ${error}`);
        return JSON.stringify({ success: false, error: String(error) });
    }
}
function beforeAuthenticateCustom(ctx, logger, nk, data) {
    // 1. Проверяем, прислал ли клиент токен в переменных (vars)
    if (!data.account || !data.account.vars || !data.account.vars["rauthy_token"]) {
        return data; // Если нет, это обычный запрос (например, гостевой), пропускаем дальше
    }
    const token = data.account.vars["rauthy_token"];
    const requestedId = data.account.id; // Тот ID, который фронтенд сформировал
    logger.info("Validating token via Rauthy UserInfo endpoint...");
    try {
        // 2. Отправляем внутренний HTTP-запрос в Rauthy для проверки токена
        const response = nk.httpRequest(RAUTHY_USERINFO_URL, "GET", {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
        }, "");
        if (response.code !== 200) {
            logger.error(`Rauthy token validation failed: HTTP ${response.code}`);
            throw new Error("Invalid OIDC token");
        }
        const userInfo = JSON.parse(response.body);
        const expectedId = `rauthy:${userInfo.sub}`; // Ожидаемый ID на основе данных из SSO
        // 3. Строгая проверка безопасности
        if (requestedId !== expectedId) {
            logger.error(`ID mismatch. Client requested ${requestedId}, but token belongs to ${expectedId}`);
            throw new Error("Token does not match requested Custom ID");
        }
        logger.info(`Successfully verified and authenticated Rauthy user: ${userInfo.sub}`);
        // Всё ок, пропускаем авторизацию! Nakama сама создаст или загрузит аккаунт.
        return data;
    }
    catch (error) {
        logger.error(`Authentication error: ${error}`);
        // Выбрасываем ошибку, чтобы Nakama отклонила запрос
        throw new Error("OIDC Authentication Failed");
    }
}
// Initialize the module
function InitModule(ctx, logger, nk, initializer) {
    // Читаем переменные из контекста Nakama
    RAUTHY_ISSUER = ctx.env["RAUTHY_ISSUER"] || RAUTHY_ISSUER;
    RAUTHY_JWKS_URL = ctx.env["RAUTHY_JWKS_URL"] || RAUTHY_JWKS_URL;
    RAUTHY_CLIENT_ID = ctx.env["RAUTHY_CLIENT_ID"] || RAUTHY_CLIENT_ID;
    RAUTHY_USERINFO_URL = ctx.env["RAUTHY_USERINFO_URL"] || RAUTHY_USERINFO_URL;
    logger.info('Rauthy OIDC authentication module loaded');
    logger.info(`Rauthy Issuer: ${RAUTHY_ISSUER}`);
    logger.info(`Rauthy JWKS: ${RAUTHY_JWKS_URL}`);
    logger.info(`Rauthy Client ID: ${RAUTHY_CLIENT_ID}`);
    // ИСПРАВЛЕНИЕ: Регистрация происходит через объект initializer
    initializer.registerRpc('authenticate_rauthy', rpcAuthenticateRauthy);
    // Регистрируем наш перехватчик
    initializer.registerBeforeAuthenticateCustom(beforeAuthenticateCustom);
    logger.info('Rauthy authentication RPC registered: authenticate_rauthy');
}
