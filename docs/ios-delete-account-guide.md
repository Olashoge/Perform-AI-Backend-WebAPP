# iOS Delete Account — Complete Integration Guide

This document contains every detail the iOS app needs to implement the "Delete Account" feature, connecting to the Perform AI backend.

---

## 1. Base URL

```swift
// Development (local Replit preview or simulator)
let baseURL = "https://<your-replit-slug>.replit.app"

// Production (after publishing)
let baseURL = "https://your-production-domain.com"
```

All API paths below are relative to this base URL.

---

## 2. Authentication Recap (Required Context)

The iOS app uses **JWT Bearer tokens** for all authenticated requests. Before calling Delete Account, the user must already be logged in with valid tokens stored in Keychain.

### 2a. Login (obtain tokens)

```
POST /api/auth/token-login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "a8f2e1c9b0d3...80-char-hex-string",
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com"
  }
}
```

- `accessToken` — JWT, expires in **15 minutes**
- `refreshToken` — opaque hex string, expires in **30 days**, single-use (rotated on each refresh)

Store both in iOS Keychain immediately after login.

### 2b. Token Refresh (if access token expired)

```
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<stored-refresh-token>"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOi...(new)",
  "refreshToken": "c7d4e5f6a1b2...(new)"
}
```

**CRITICAL:** Save the new `refreshToken` immediately — the old one is **permanently revoked** after use. If you lose the new one, the user must log in again.

### 2c. How Every Authenticated Request Must Look

Every request to a protected endpoint (including Delete Account) must include:

```
Authorization: Bearer <accessToken>
```

This is a standard HTTP header. The word `Bearer` followed by a space followed by the raw JWT string.

---

## 3. The Delete Account Endpoint

### Request

```
DELETE /api/me
```

**Headers (required):**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request body:** None. Empty. Do not send a body. The server identifies the user entirely from the JWT token in the Authorization header.

**No query parameters.**

### Success Response

**HTTP 200:**
```json
{
  "success": true
}
```

This means the account and ALL associated data has been permanently deleted. There is no undo.

### Error Responses

All errors return this exact JSON shape:

```json
{
  "success": false,
  "code": "SOME_CODE",
  "message": "Human-readable message to show the user"
}
```

| HTTP Status | `code` Value | `message` Value | When It Happens |
|---|---|---|---|
| **401** | `AUTH_REQUIRED` | `Your session expired. Please log in again.` | Access token is missing, invalid, or expired AND no valid session cookie |
| **404** | `USER_NOT_FOUND` | `Account not found.` | The user ID from the token doesn't match any user in the database (edge case — user already deleted) |
| **500** | `SERVER_ERROR` | `Something went wrong on our side. Please try again.` | Database error or unexpected server failure |

If the network request fails entirely (timeout, no internet, DNS failure), there will be no JSON response at all — handle this as a connectivity error.

---

## 4. What Gets Deleted (Server Side)

When `DELETE /api/me` succeeds, the server deletes ALL of the following in a single atomic database transaction (all-or-nothing — no partial deletes):

1. `activity_completions` — meal/workout completion checkmarks
2. `daily_workouts` — single-day workout plans
3. `daily_meals` — single-day meal plans
4. `weekly_adaptations` — adaptive engine weekly records
5. `performance_summaries` — weekly performance scores
6. `wellness_plan_specs` — wellness plan specifications
7. `constraint_violations` — safety constraint logs
8. `weekly_check_ins` — weight/energy/compliance logs
9. `exercise_preferences` — liked/disliked/avoided exercises
10. `ingredient_avoid_proposals` — ingredient avoidance proposals
11. `workout_feedback` — workout session likes/dislikes
12. `meal_feedback` — meal likes/dislikes
13. `ingredient_preferences` — ingredient avoid/prefer records
14. `owned_grocery_items` — grocery owned-item checkboxes
15. `refresh_tokens` — all JWT refresh tokens (invalidates all sessions everywhere)
16. `goal_plans` — all goal/wellness plans
17. `workout_plans` — all 7-day workout plans
18. `meal_plans` — all 7-day meal plans
19. `audit_logs` — all action logs
20. `user_profiles` — the Performance Blueprint profile
21. `user_sessions` — web session records (connect-pg-simple)
22. `users` — the user account record itself

---

## 5. Complete Swift Implementation

```swift
import Foundation
import Security // For Keychain

// MARK: - Configuration

struct APIConfig {
    // CHANGE THIS to your actual deployed URL
    static let baseURL = "https://<your-domain>.replit.app"
}

// MARK: - Keychain Helpers

enum KeychainHelper {
    static func save(key: String, value: String) {
        let data = value.data(using: .utf8)!
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary) // Remove old value
        SecItemAdd(query as CFDictionary, nil)
    }
    
    static func load(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    
    static func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
    
    static func clearAllTokens() {
        delete(key: "accessToken")
        delete(key: "refreshToken")
    }
}

// MARK: - Error Types

struct APIErrorResponse: Codable {
    let success: Bool
    let code: String
    let message: String
}

enum DeleteAccountError: Error {
    case authRequired(String)       // 401 — token expired / not logged in
    case userNotFound(String)       // 404 — account already gone
    case serverError(String)        // 500 — backend failure
    case networkError(String)       // No response at all
    case unknownError(String)       // Unexpected status code
    
    var userFacingMessage: String {
        switch self {
        case .authRequired(let msg): return msg
        case .userNotFound(let msg): return msg
        case .serverError(let msg): return msg
        case .networkError(let msg): return msg
        case .unknownError(let msg): return msg
        }
    }
    
    var requiresRelogin: Bool {
        if case .authRequired = self { return true }
        return false
    }
}

// MARK: - Token Refresh

func refreshAccessToken() async throws -> String {
    guard let refreshToken = KeychainHelper.load(key: "refreshToken") else {
        throw DeleteAccountError.authRequired("Your session expired. Please log in again.")
    }
    
    let url = URL(string: "\(APIConfig.baseURL)/api/auth/refresh")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["refreshToken": refreshToken])
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw DeleteAccountError.networkError("Unable to reach the server. Check your connection and try again.")
    }
    
    if httpResponse.statusCode == 200 {
        struct RefreshResponse: Codable {
            let accessToken: String
            let refreshToken: String
        }
        let tokens = try JSONDecoder().decode(RefreshResponse.self, from: data)
        // CRITICAL: Save BOTH tokens immediately — old refresh token is now revoked
        KeychainHelper.save(key: "accessToken", value: tokens.accessToken)
        KeychainHelper.save(key: "refreshToken", value: tokens.refreshToken)
        return tokens.accessToken
    } else {
        // Refresh failed — user must log in again
        KeychainHelper.clearAllTokens()
        throw DeleteAccountError.authRequired("Your session expired. Please log in again.")
    }
}

// MARK: - Delete Account

func deleteAccount() async throws {
    guard var accessToken = KeychainHelper.load(key: "accessToken") else {
        throw DeleteAccountError.authRequired("Your session expired. Please log in again.")
    }
    
    // First attempt
    let result = try await performDeleteRequest(accessToken: accessToken)
    
    if result == .success {
        return // Done — account deleted
    }
    
    if result == .tokenExpired {
        // Access token expired — try refresh, then retry once
        accessToken = try await refreshAccessToken()
        let retryResult = try await performDeleteRequest(accessToken: accessToken)
        if retryResult == .success {
            return // Done — account deleted on retry
        }
        if retryResult == .tokenExpired {
            KeychainHelper.clearAllTokens()
            throw DeleteAccountError.authRequired("Your session expired. Please log in again.")
        }
    }
}

enum DeleteResult {
    case success
    case tokenExpired
}

private func performDeleteRequest(accessToken: String) async throws -> DeleteResult {
    let url = URL(string: "\(APIConfig.baseURL)/api/me")!
    var request = URLRequest(url: url)
    request.httpMethod = "DELETE"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // No request body — intentionally empty
    
    let data: Data
    let response: URLResponse
    
    do {
        (data, response) = try await URLSession.shared.data(for: request)
    } catch {
        throw DeleteAccountError.networkError(
            "Unable to reach the server. Check your connection and try again."
        )
    }
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw DeleteAccountError.networkError(
            "Unable to reach the server. Check your connection and try again."
        )
    }
    
    switch httpResponse.statusCode {
    case 200:
        // Account deleted successfully
        // Clear ALL local data
        KeychainHelper.clearAllTokens()
        return .success
        
    case 401:
        // Token expired — signal caller to refresh and retry
        return .tokenExpired
        
    case 404:
        // User not found (already deleted?)
        KeychainHelper.clearAllTokens()
        if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            throw DeleteAccountError.userNotFound(errorResponse.message)
        }
        throw DeleteAccountError.userNotFound("Account not found.")
        
    case 500:
        if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            throw DeleteAccountError.serverError(errorResponse.message)
        }
        throw DeleteAccountError.serverError(
            "Something went wrong on our side. Please try again."
        )
        
    default:
        if let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data) {
            throw DeleteAccountError.unknownError(errorResponse.message)
        }
        throw DeleteAccountError.unknownError(
            "Something went wrong. Please try again."
        )
    }
}

// MARK: - Usage in a SwiftUI View

/*
 
 Button("Delete My Account", role: .destructive) {
     showDeleteConfirmation = true
 }
 .confirmationDialog(
     "Are you sure you want to delete your account?",
     isPresented: $showDeleteConfirmation,
     titleVisibility: .visible
 ) {
     Button("Delete Everything", role: .destructive) {
         Task {
             isDeleting = true
             do {
                 try await deleteAccount()
                 // Success — navigate to auth/welcome screen
                 isDeleting = false
                 navigateToWelcomeScreen()
             } catch let error as DeleteAccountError {
                 isDeleting = false
                 errorMessage = error.userFacingMessage
                 showError = true
                 if error.requiresRelogin {
                     navigateToLoginScreen()
                 }
             } catch {
                 isDeleting = false
                 errorMessage = "Something went wrong. Please try again."
                 showError = true
             }
         }
     }
     Button("Cancel", role: .cancel) {}
 } message: {
     Text("This will permanently delete your account and all your data including meal plans, workout plans, preferences, and progress history. This cannot be undone.")
 }
 
 */
```

---

## 6. Request/Response Flow Diagram

```
iOS App                                    Backend Server
  |                                              |
  |  DELETE /api/me                              |
  |  Authorization: Bearer eyJhbG...             |
  |  (no body)                                   |
  |--------------------------------------------->|
  |                                              |
  |                              Verify JWT token |
  |                              Extract userId   |
  |                              Verify user exists|
  |                                              |
  |                              BEGIN TRANSACTION |
  |                              DELETE from 22    |
  |                              tables in order   |
  |                              COMMIT            |
  |                                              |
  |<---------------------------------------------|
  |  200 { "success": true }                     |
  |                                              |
  |  iOS: Clear Keychain tokens                  |
  |  iOS: Clear cached data                      |
  |  iOS: Navigate to Welcome screen             |
```

---

## 7. Error Flow Diagram

```
iOS App                                    Backend Server
  |                                              |
  |  DELETE /api/me                              |
  |  Authorization: Bearer <EXPIRED-TOKEN>       |
  |--------------------------------------------->|
  |                                              |
  |<---------------------------------------------|
  |  401 { "success":false,                      |
  |        "code":"AUTH_REQUIRED",               |
  |        "message":"Your session expired..." } |
  |                                              |
  |  POST /api/auth/refresh                      |
  |  { "refreshToken": "a8f2..." }               |
  |--------------------------------------------->|
  |                                              |
  |<---------------------------------------------|
  |  200 { "accessToken":"new...",               |
  |        "refreshToken":"new..." }             |
  |                                              |
  |  iOS: Save BOTH new tokens to Keychain       |
  |                                              |
  |  DELETE /api/me (RETRY)                      |
  |  Authorization: Bearer <NEW-TOKEN>           |
  |--------------------------------------------->|
  |                                              |
  |<---------------------------------------------|
  |  200 { "success": true }                     |
```

---

## 8. Checklist for iOS Implementation

- [ ] Base URL is set to the correct deployed backend URL
- [ ] Access token is read from Keychain before the DELETE call
- [ ] `Authorization: Bearer <token>` header is set exactly (capital B, one space, raw token)
- [ ] HTTP method is `DELETE` (not POST, not GET)
- [ ] Path is exactly `/api/me` (not `/api/user`, not `/api/users/me`, not `/me`)
- [ ] No request body is sent
- [ ] On 200: clear Keychain (both accessToken and refreshToken)
- [ ] On 200: clear any local caches (UserDefaults, Core Data, in-memory state)
- [ ] On 200: navigate to welcome/auth screen
- [ ] On 401: attempt token refresh via `POST /api/auth/refresh`, then retry DELETE once
- [ ] On 401 after retry: clear tokens, navigate to login screen
- [ ] On 404: show error message from server response, clear tokens
- [ ] On 500: show error message from server response, allow retry
- [ ] On network failure: show "Unable to reach the server" message
- [ ] Confirmation dialog shown before delete (Apple App Store requires this)
- [ ] Loading/spinner shown during delete operation
- [ ] Delete button is disabled while request is in progress
