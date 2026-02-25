# iOS Guide: Meal Swaps, Day Regens & Workout Session Regens

This document covers every swap and regeneration action available in the app, the endpoints, and request/response shapes. All swaps and regenerations are **unlimited** — there is no budget, allowance, or cooldown system.

---

## Overview: What Can Be Swapped or Regenerated?

| Action | What It Does | Endpoint |
|:-------|:-------------|:---------|
| **Meal Swap** | Replace a single meal (breakfast/lunch/dinner) with a new AI-generated one | `POST /api/plan/:id/swap` |
| **Day Regen (Meal)** | Regenerate all meals for a single day | `POST /api/plan/:id/regenerate-day` |
| **Workout Session Regen** | Regenerate a single day's workout session | `POST /api/workout/:id/regenerate-session` |
| **Grocery List Regen** | Rebuild the grocery list from current plan ingredients | `POST /api/plan/:id/grocery/regenerate` |
| **Daily Meal Regen** | Regenerate a standalone single-day meal plan | `POST /api/daily-meal/:date/regenerate` |
| **Daily Workout Regen** | Regenerate a standalone single-day workout plan | `POST /api/daily-workout/:date/regenerate` |

There is **no "Full Plan Regen" endpoint**. To regenerate an entire plan, the user creates a brand new plan through the normal generation flow (`POST /api/plan` or `POST /api/goal-plans/generate`).

---

## 1. Meal Swap

Replaces ONE meal in a 7-day meal plan with a freshly AI-generated alternative.

### Endpoint

```
POST /api/plan/:mealPlanId/swap
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Request Body

```json
{
  "dayIndex": 3,
  "mealType": "lunch"
}
```

| Field | Type | Required | Valid Values |
|:------|:-----|:---------|:-------------|
| `dayIndex` | number | **YES** | `1` through `7` |
| `mealType` | string | **YES** | `"breakfast"`, `"lunch"`, or `"dinner"` |

### Success Response (HTTP 200)

Returns the **entire updated meal plan object** (same shape as `GET /api/plan/:id`). The swapped meal is already in the plan JSON. You should:
1. Replace your local plan data with the response
2. Invalidate/refetch the grocery list

### Error Responses

| Code | Body | Meaning |
|:-----|:-----|:--------|
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex or mealType" }` | Bad input |
| 400 | `{ "message": "No meal found at that slot" }` | That meal slot is empty (e.g., no breakfast in a 2-meal plan) |
| 404 | `{ "message": "Plan not found" }` | Invalid plan ID or not owned by user |

### Web App Behavior
- The swap button appears on each meal card
- While swapping, the button shows a spinner
- After success, the meal card updates with the new meal
- Swaps are unlimited

---

## 2. Day Regen (Meal)

Regenerates ALL meals for a single day in a 7-day meal plan. The AI generates a completely new set of breakfast, lunch, and dinner.

### Endpoint

```
POST /api/plan/:mealPlanId/regenerate-day
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Request Body

```json
{
  "dayIndex": 5
}
```

| Field | Type | Required | Valid Values |
|:------|:-----|:---------|:-------------|
| `dayIndex` | number | **YES** | `1` through `7` |

### Success Response (HTTP 200)

Returns the **entire updated meal plan object**. The regenerated day's meals are replaced in the plan JSON.

After success:
1. Replace your local plan data with the response
2. Invalidate/refetch the grocery list

### Error Responses

| Code | Body | Meaning |
|:-----|:-----|:--------|
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex (1-7)" }` | Bad input |

### Web App Behavior
- The "Regenerate Day" button appears on each day card header
- Day regenerations are unlimited

---

## 3. Workout Session Regen

Regenerates a single day's workout session in a 7-day workout plan. Only works on days that have a workout session (rest days are skipped).

### Endpoint

```
POST /api/workout/:workoutPlanId/regenerate-session
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### Request Body

```json
{
  "dayIndex": 2
}
```

| Field | Type | Required | Valid Values |
|:------|:-----|:---------|:-------------|
| `dayIndex` | number | **YES** | `1` through `7` |

### Success Response (HTTP 200)

Returns the **entire updated workout plan object**. The day's session is replaced with a new AI-generated one.

### Error Responses

| Code | Body | Meaning |
|:-----|:-----|:--------|
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex (1-7)" }` | Bad input |
| 400 | `{ "message": "No workout session exists for this day" }` | This day is a rest day |

### Web App Behavior
- A "Regenerate" button appears on each workout session card
- While regenerating, a spinner shows on that specific day
- After success, the exercises update in place
- Workout session regenerations are unlimited

---

## 4. Grocery List Regen

Rebuilds the grocery list by scanning all current meals in the plan and re-categorizing ingredients.

### Endpoint

```
POST /api/plan/:mealPlanId/grocery/regenerate
Authorization: Bearer <accessToken>
```

**No request body needed.**

### Success Response (HTTP 200)

Returns the updated meal plan object. After calling this:
- Re-fetch `GET /api/plan/:id/grocery` to get the new grocery list

### When to Call This

Call grocery regenerate **after any meal swap or day regen completes**. The server does this automatically during swap/regen, but it's good practice to also re-fetch the grocery data on the client side. The web app invalidates the grocery query cache after any swap or regen mutation.

---

## 5. Daily Meal Regen

Regenerates a standalone single-day meal plan (not part of a 7-day plan). This is async — it returns immediately and generates in the background.

### Endpoint

```
POST /api/daily-meal/:date/regenerate
Authorization: Bearer <accessToken>
```

**No request body needed.** The date is in the URL as `YYYY-MM-DD`.

### Response (HTTP 200)

```json
{
  "id": "uuid-of-daily-meal-record",
  "status": "generating"
}
```

**This is async.** After receiving the response, poll for completion:

```
GET /api/daily-meal/:date
```

Poll every 2 seconds until `status === "ready"`.

### Error Responses

| Code | Body |
|:-----|:-----|
| 400 | `{ "message": "Profile required", "profileRequired": true }` |
| 404 | `{ "message": "No daily meal found for this date" }` |

---

## 6. Daily Workout Regen

Regenerates a standalone single-day workout plan. Also async.

### Endpoint

```
POST /api/daily-workout/:date/regenerate
Authorization: Bearer <accessToken>
```

**No request body needed.** The date is in the URL as `YYYY-MM-DD`.

### Response (HTTP 200)

```json
{
  "id": "uuid-of-daily-workout-record",
  "status": "generating"
}
```

Poll `GET /api/daily-workout/:date` every 2 seconds until `status === "ready"`.

### Error Responses

| Code | Body |
|:-----|:-----|
| 400 | `{ "message": "Profile required", "profileRequired": true }` |
| 404 | `{ "message": "No daily workout found for this date" }` |

---

## iOS Implementation Guide

### Swap Button on Each Meal

- Show swap button on every meal card
- Swaps are always enabled (no budget checks needed)
- On tap: call `POST /api/plan/:id/swap` with `{ dayIndex, mealType }`
- Show spinner while in progress
- On success: update the plan data locally, refetch grocery list

### Regen Button on Each Day

- Show regen button on each day header
- Regens are always enabled (no budget checks needed)
- On tap: call `POST /api/plan/:id/regenerate-day` with `{ dayIndex }`
- On success: update the plan data, refetch grocery list

### Regen Button on Each Workout Session

Same pattern as day regen but on workout session cards:
- Call `POST /api/workout/:id/regenerate-session` with `{ dayIndex }`
- Only show on days that have a session (not rest days)
- Regens are always enabled

### After Every Swap or Regen

1. Update local plan data from the response
2. Invalidate/refetch grocery list (`GET /api/plan/:id/grocery`)

---

## Complete Request/Response Summary

### Meal Swap
```
POST /api/plan/:id/swap
Body: { "dayIndex": 3, "mealType": "lunch" }
-> 200: Full updated meal plan object
-> 429: AI rate limit
```

### Day Regen (Meal)
```
POST /api/plan/:id/regenerate-day
Body: { "dayIndex": 5 }
-> 200: Full updated meal plan object
-> 429: AI rate limit
```

### Workout Session Regen
```
POST /api/workout/:id/regenerate-session
Body: { "dayIndex": 2 }
-> 200: Full updated workout plan object
-> 429: AI rate limit
-> 400: Rest day (no session)
```

### Grocery List Regen
```
POST /api/plan/:id/grocery/regenerate
Body: (none)
-> 200: Full updated meal plan object
```

### Daily Meal Regen (async)
```
POST /api/daily-meal/:date/regenerate
Body: (none)
-> 200: { "id": "uuid", "status": "generating" }
   Then poll GET /api/daily-meal/:date until status === "ready"
```

### Daily Workout Regen (async)
```
POST /api/daily-workout/:date/regenerate
Body: (none)
-> 200: { "id": "uuid", "status": "generating" }
   Then poll GET /api/daily-workout/:date until status === "ready"
```

---

## Key Difference: Synchronous vs Asynchronous

| Action | Type | Response Contains |
|:-------|:-----|:-----------------|
| Meal Swap | **Synchronous** | Full updated plan (meal is already swapped) |
| Day Regen (Meal) | **Synchronous** | Full updated plan (day is already regenerated) |
| Workout Session Regen | **Synchronous** | Full updated plan (session is already regenerated) |
| Grocery Regen | **Synchronous** | Full updated plan (grocery list rebuilt) |
| Daily Meal Regen | **Asynchronous** | `{ id, status: "generating" }` -> must poll |
| Daily Workout Regen | **Asynchronous** | `{ id, status: "generating" }` -> must poll |

For synchronous endpoints, the response includes the final result. No polling needed.
For async endpoints (daily meal/workout regen), you get an immediate acknowledgment and must poll for completion.
