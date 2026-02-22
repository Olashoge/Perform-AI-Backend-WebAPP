# Perform AI — JWT Authentication Guide for Mobile / API Clients

## Overview

Perform AI uses **dual authentication**:

| Channel | Mechanism |
|---------|-----------|
| Web app | Cookie-based sessions (`express-session`) |
| Mobile / API | JWT Bearer tokens |

Mobile clients (React Native, iOS, Android) should **exclusively** use the JWT token path described below. Cookie sessions are managed automatically by the browser and are not relevant to native apps.

---

## JWT Architecture

| Property | Value |
|----------|-------|
| **Access token lifetime** | 15 minutes (configurable via `JWT_ACCESS_TTL`) |
| **Refresh token lifetime** | 30 days (configurable via `JWT_REFRESH_TTL`) |
| **Refresh token format** | 40-byte random hex string |
| **Refresh token storage** | SHA-256 hash stored server-side (plaintext never persisted) |
| **Token rotation** | Every refresh issues a **new** access + refresh pair; the old refresh token is immediately revoked |

### Access Token Payload

```json
{
  "userId": "string",
  "email": "string",
  "iat": 1700000000,
  "exp": 1700000900
}
```

---

## Auth Flow

### 1. Registration

Create a new account. This endpoint sets a cookie session (for web) but does **not** return tokens. After signup, call **token-login** to obtain a JWT pair.

```
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success (200):**
```json
{
  "id": "cuid_abc123",
  "email": "user@example.com"
}
```

**Errors:**
| Status | Body |
|--------|------|
| 400 | `{ "message": "Invalid input" }` |
| 409 | `{ "message": "Email already in use" }` |

---

### 2. Login (Token-based)

Exchange credentials for an access + refresh token pair.

```
POST /api/auth/token-login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Success (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "a3f8b2c1d4e5...80-char-hex-string",
  "user": {
    "id": "cuid_abc123",
    "email": "user@example.com"
  }
}
```

**Storage:** Save **both** tokens in secure storage immediately (Keychain on iOS, `react-native-keychain` or `expo-secure-store` on React Native).

**Errors:**
| Status | Body |
|--------|------|
| 400 | `{ "message": "Invalid input" }` |
| 401 | `{ "message": "Invalid credentials" }` |

---

### 3. Making Authenticated Requests

All protected endpoints require the `Authorization` header:

```
GET /api/plans
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

The server middleware (`requireAuth`) uses a two-step fallback:

1. **Bearer token** — checks `Authorization: Bearer <token>` header first. If valid JWT, sets `req.userId` and proceeds.
2. **Session cookie** — if no Bearer token is present (or the header is missing), falls back to cookie-based session auth (`req.session.userId`).
3. **401** — if neither method yields a user ID, returns `401 Unauthorized`.

For **mobile clients**, only the Bearer path is relevant. The session fallback exists for the web app, which uses cookie-based sessions set by `POST /api/auth/login`.

---

### 4. Token Refresh

When you receive a **401** (access token expired), exchange the refresh token for a new pair.

```
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "a3f8b2c1d4e5...80-char-hex-string"
}
```

**Success (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...(new)",
  "refreshToken": "b7d9e3f0a1c2...new-80-char-hex-string"
}
```

> **IMPORTANT:** Save the new `refreshToken` immediately. The old one is **revoked on use** (rotation). If you lose the new token, the user must log in again.

**Errors:**
| Status | Body |
|--------|------|
| 400 | `{ "message": "refreshToken is required" }` |
| 401 | `{ "message": "Invalid refresh token" }` |
| 401 | `{ "message": "Refresh token expired" }` |

---

### 5. Logout

Revoke the refresh token server-side. The access token will naturally expire after its TTL.

```
POST /api/auth/token-logout
Content-Type: application/json

{
  "refreshToken": "a3f8b2c1d4e5...80-char-hex-string"
}
```

**Success (200):**
```json
{
  "ok": true
}
```

---

### 6. Checking Auth State

Verify the current access token and retrieve the authenticated user.

```
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Authenticated (200):**
```json
{
  "id": "cuid_abc123",
  "email": "user@example.com"
}
```

**Not authenticated:** `401`

---

## Implementation Patterns for React Native

### Token Storage

Use a secure, encrypted storage mechanism — **never** plain `AsyncStorage`.

```typescript
// Using react-native-keychain
import * as Keychain from 'react-native-keychain';

async function saveTokens(accessToken: string, refreshToken: string) {
  await Keychain.setGenericPassword('tokens', JSON.stringify({ accessToken, refreshToken }));
}

async function getTokens(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const credentials = await Keychain.getGenericPassword();
  if (!credentials) return null;
  return JSON.parse(credentials.password);
}

async function clearTokens() {
  await Keychain.resetGenericPassword();
}
```

```typescript
// Using expo-secure-store
import * as SecureStore from 'expo-secure-store';

async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync('accessToken', accessToken);
  await SecureStore.setItemAsync('refreshToken', refreshToken);
}

async function getTokens() {
  const accessToken = await SecureStore.getItemAsync('accessToken');
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}
```

---

### API Client with Automatic Token Refresh

```typescript
const BASE_URL = 'https://your-perform-ai-domain.com';

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

function onRefreshComplete(newAccessToken: string) {
  refreshQueue.forEach(resolve => resolve(newAccessToken));
  refreshQueue = [];
}

async function refreshAccessToken(): Promise<string> {
  const tokens = await getTokens();
  if (!tokens?.refreshToken) throw new Error('No refresh token');

  const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!response.ok) {
    await clearTokens();
    throw new Error('Refresh failed');
  }

  const data = await response.json();
  await saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tokens = await getTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && tokens?.refreshToken) {
    if (isRefreshing) {
      const newToken = await new Promise<string>(resolve => refreshQueue.push(resolve));
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    } else {
      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        onRefreshComplete(newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      } catch (error) {
        isRefreshing = false;
        refreshQueue = [];
        // Navigate to login screen
        throw error;
      }
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${response.status}`);
  }

  return response.json();
}
```

**Usage:**

```typescript
// Login
const { accessToken, refreshToken, user } = await apiRequest('/api/auth/token-login', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
});
await saveTokens(accessToken, refreshToken);

// Fetch plans (auto-refreshes if 401)
const plans = await apiRequest('/api/plans');

// Logout
const tokens = await getTokens();
await apiRequest('/api/auth/token-logout', {
  method: 'POST',
  body: JSON.stringify({ refreshToken: tokens?.refreshToken }),
});
await clearTokens();
```

---

### Token Refresh Queue

The API client above already handles concurrent 401s. The key pattern:

1. The **first** 401 triggers a refresh request.
2. **Subsequent** 401s that arrive while the refresh is in-flight are queued.
3. Once the refresh completes, all queued requests retry with the new access token.
4. If the refresh fails, all queued requests are rejected and the user is redirected to login.

This prevents multiple simultaneous refresh calls from causing token rotation conflicts.

---

## Security Notes

- **Never** store tokens in `AsyncStorage` — it is unencrypted on-device storage.
- **Access tokens** are stateless JWTs verified by signature alone — no database lookup required.
- **Refresh tokens** are stateful — the server checks the SHA-256 hash against the database on every use.
- **Token rotation** ensures that a stolen refresh token can only be used once. After use, the old token is revoked.
- If a **revoked** refresh token is presented, treat it as a potential breach — consider revoking all tokens for that user.
- The server stores per refresh token: `tokenHash` (SHA-256), `expiresAt`, `revokedAt`, `lastUsedAt`, `userAgent`, `ipAddress`.

---

## Error Codes Reference

| Status | Scenario | Response Body |
|--------|----------|---------------|
| 200 | Success | Endpoint-specific (see above) |
| 400 | Missing or invalid request body | `{ "message": "..." }` |
| 401 | Invalid or expired access token | `{ "message": "Invalid or expired token" }` |
| 401 | Invalid credentials on login | `{ "message": "Invalid credentials" }` |
| 401 | Invalid or expired refresh token | `{ "message": "Invalid refresh token" }` or `{ "message": "Refresh token expired" }` |
| 409 | Email already registered | `{ "message": "Email already in use" }` |
| 500 | Server error | `{ "message": "Internal server error" }` |

---

## Environment Variables (Server-side, for reference)

| Variable | Purpose | Default |
|----------|---------|---------|
| `JWT_ACCESS_SECRET` | HMAC secret for signing access tokens | *Required* |
| `JWT_REFRESH_SECRET` | Loaded but not used for refresh tokens (they are random bytes hashed with SHA-256) | *Required* |
| `JWT_ACCESS_TTL` | Access token lifetime | `"15m"` |
| `JWT_REFRESH_TTL` | Refresh token lifetime (supports `s`, `m`, `h`, `d` suffixes) | `"30d"` |
