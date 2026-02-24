# iOS Guide: Meal Swaps, Day Regens, Workout Session Regens & the Allowance Budget

This document covers every swap and regeneration action available in the app, the endpoints, request/response shapes, the allowance/budget system that governs usage limits, and how to replicate the full web app behavior on iOS.

---

## Overview: What Can Be Swapped or Regenerated?

| Action | What It Does | Endpoint | Budget Source |
|:-------|:-------------|:---------|:-------------|
| **Meal Swap** | Replace a single meal (breakfast/lunch/dinner) with a new AI-generated one | `POST /api/plan/:id/swap` | Daily meal swap allowance |
| **Day Regen (Meal)** | Regenerate all meals for a single day | `POST /api/plan/:id/regenerate-day` | Daily meal regen allowance + total plan regens |
| **Workout Session Regen** | Regenerate a single day's workout session | `POST /api/workout/:id/regenerate-session` | Daily workout regen allowance + total plan regens |
| **Grocery List Regen** | Rebuild the grocery list from current plan ingredients | `POST /api/plan/:id/grocery/regenerate` | No budget (unlimited) |
| **Daily Meal Regen** | Regenerate a standalone single-day meal plan | `POST /api/daily-meal/:date/regenerate` | No budget (uses daily AI limit only) |
| **Daily Workout Regen** | Regenerate a standalone single-day workout plan | `POST /api/daily-workout/:date/regenerate` | No budget (uses daily AI limit only) |

There is **no "Full Plan Regen" endpoint**. To regenerate an entire plan, the user creates a brand new plan through the normal generation flow (`POST /api/plan` or `POST /api/goal-plans/generate`). The total plan regen counter in the budget still tracks this conceptually — but the action is "generate a new plan," not "regen an existing plan."

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
2. Invalidate/refetch the grocery list (the server already resets pricing and triggers re-pricing in the background)

### Error Responses

| Code | Body | Meaning |
|:-----|:-----|:--------|
| 403 | `{ "message": "You've used all 2 meal swaps for today. Resets at midnight UTC.", "nextResetAt": "2026-03-02T00:00:00.000Z" }` | Daily swap limit reached |
| 403 | `{ "message": "Maximum swaps (3) reached for this plan" }` | Legacy limit (no allowance system) |
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex or mealType" }` | Bad input |
| 400 | `{ "message": "No meal found at that slot" }` | That meal slot is empty (e.g., no breakfast in a 2-meal plan) |
| 404 | `{ "message": "Plan not found" }` | Invalid plan ID or not owned by user |

### Web App Behavior
- The swap button appears on each meal card
- While swapping, the button shows a spinner
- After success, the meal card updates with the new meal
- The "Swaps remaining: X/3" counter decrements (legacy plans without allowance)
- With allowance: "Daily swaps: X/2" is shown

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
| 403 | `{ "message": "Regen cooldown active. Available in 342 minutes.", "cooldownMinutesRemaining": 342 }` | Cooldown triggered (3 regens in 24 hours) |
| 403 | `{ "message": "You've used your 1 daily meal regen. Resets at midnight UTC.", "nextResetAt": "..." }` | Daily regen limit reached |
| 403 | `{ "message": "You've used all 5 regens for this wellness plan." }` | Total plan regen budget exhausted |
| 403 | `{ "message": "Maximum day regenerations (1) reached for this plan" }` | Legacy limit (no allowance) |
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex (1-7)" }` | Bad input |

### Web App Behavior
- The "Regenerate Day" button appears on each day card header
- Disabled when `regenDayCount >= 1` (legacy) or when budget is exhausted
- Shows "Day regens remaining: X/1" in the budget panel

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
| 403 | `{ "message": "Regen cooldown active. Available in X minutes.", "cooldownMinutesRemaining": X }` | Cooldown active |
| 403 | `{ "message": "You've used your 1 daily regen. Resets at midnight UTC.", "nextResetAt": "..." }` | Daily workout regen limit |
| 403 | `{ "message": "You've used all X regens for this wellness plan." }` | Total plan regen budget exhausted |
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex (1-7)" }` | Bad input |
| 400 | `{ "message": "No workout session exists for this day" }` | This day is a rest day |

### Web App Behavior
- A "Regenerate" button appears on each workout session card
- While regenerating, a spinner shows on that specific day
- After success, the exercises update in place

---

## 4. Grocery List Regen

Rebuilds the grocery list by scanning all current meals in the plan and re-categorizing ingredients. Then triggers a fresh AI pricing estimate. **This has no budget limit.**

### Endpoint

```
POST /api/plan/:mealPlanId/grocery/regenerate
Authorization: Bearer <accessToken>
```

**No request body needed.**

### Success Response (HTTP 200)

Returns the updated meal plan object. After calling this:
- Re-fetch `GET /api/plan/:id/grocery` to get the new grocery list
- Pricing will be `null` initially (re-pricing runs in background)
- Poll or re-fetch after 5-10 seconds for pricing

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

## The Allowance Budget System

The allowance system controls how many swaps and regens a user can perform. It is tied to a **Wellness/Goal Plan** — standalone meal or workout plans without a parent goal plan use a simpler legacy counter system.

### Fetching the Current Budget

```
GET /api/allowance/current?mealPlanId=<optional>
Authorization: Bearer <accessToken>
```

The `mealPlanId` query parameter is optional. If provided, it resolves the allowance for the goal plan that contains that meal plan. If omitted, it returns the most recent active allowance.

### Response (HTTP 200)

```json
{
  "goalPlanId": "uuid",
  "allowanceId": "uuid",
  "today": {
    "mealSwapsUsed": 1,
    "mealSwapsLimit": 2,
    "workoutSwapsUsed": 0,
    "workoutSwapsLimit": 2,
    "mealRegensUsed": 0,
    "mealRegensLimit": 1,
    "workoutRegensUsed": 0,
    "workoutRegensLimit": 1
  },
  "plan": {
    "regensUsed": 3,
    "regensLimit": 5
  },
  "cooldown": {
    "active": false,
    "minutesRemaining": 0
  },
  "flexTokensAvailable": 2,
  "coachInsight": "You earned +1 regen from 85% adherence."
}
```

### Response (null)

If no allowance exists (user has no goal plan), the endpoint returns `null`.

### Field Reference

| Field | Description |
|:------|:------------|
| `today.mealSwapsUsed` | Meal swaps used today (resets at midnight UTC) |
| `today.mealSwapsLimit` | Max meal swaps allowed per day (base + bonus) |
| `today.workoutSwapsUsed` | Workout swaps used today |
| `today.workoutSwapsLimit` | Max workout swaps per day |
| `today.mealRegensUsed` | Meal day regens used today |
| `today.mealRegensLimit` | Max meal day regens per day |
| `today.workoutRegensUsed` | Workout session regens used today |
| `today.workoutRegensLimit` | Max workout session regens per day |
| `plan.regensUsed` | Total regens used across the entire plan lifetime |
| `plan.regensLimit` | Total regens allowed for this plan (base + bonus - penalty, min 3) |
| `cooldown.active` | Whether a regen cooldown is currently active |
| `cooldown.minutesRemaining` | Minutes until cooldown expires |
| `flexTokensAvailable` | Flex tokens that can be redeemed for extra regens |
| `coachInsight` | Human-readable message about bonuses/penalties (nullable) |

### Default Budget Limits

| Resource | Default Limit | Reset |
|:---------|:-------------|:------|
| Meal Swaps per Day | 2 (base) + bonuses | Midnight UTC |
| Workout Swaps per Day | 2 (base) + bonuses | Midnight UTC |
| Meal Day Regens per Day | 1 | Midnight UTC |
| Workout Session Regens per Day | 1 | Midnight UTC |
| Total Plan Regens (lifetime) | 5 (base) + bonuses - penalties (min 3) | Never (permanent) |
| AI Calls per Day | 10 (global, not per plan) | Midnight UTC |

### Budget Rules

1. **Daily limits reset at midnight UTC.** After reset, the user gets their full daily allotment again.
2. **Total plan regens are permanent.** Once used, they don't come back. This total is shared between meal regens and workout regens.
3. **Cooldown triggers after 3 regens in 24 hours.** If a user regens 3 times within any 24-hour window, a 6-hour cooldown is activated. During cooldown, no regens are allowed.
4. **Bonuses come from adherence.** High weekly adherence (completing meals and workouts) earns bonus swaps and regens.
5. **Penalties come from over-regenerating.** If the user used too many regens on the previous plan, they may lose some regen budget on the next one.
6. **Flex tokens can bypass limits.** Redeeming a flex token restores 1 meal regen for today.

---

## Redeeming a Flex Token

```
POST /api/allowance/redeem-flex-token
Authorization: Bearer <accessToken>
```

**No request body needed.**

### Success Response (HTTP 200)

```json
{
  "success": true,
  "message": "Flex token redeemed. You have an extra regen available."
}
```

### Failure Response (HTTP 400)

```json
{
  "success": false,
  "message": "No flex tokens available to redeem."
}
```

After redeeming, refetch `GET /api/allowance/current` to see the updated budget.

---

## iOS Implementation Guide

### Budget UI (Budget Panel)

The web app shows a "Budget" panel on the plan view page with:
- "Daily swaps: X/Y" (meal swaps used / limit)
- "Day regens remaining: X/Y"
- "Plan regens: X/Y" (total used / total limit)
- Cooldown timer if active
- Flex token redemption button
- Coach insight message

On iOS, display this as a compact section or bottom sheet accessible from the plan view.

### Swap Button on Each Meal

```
┌──────────────────────────┐
│ 🍳 Greek Veggie Omelet   │
│ Mediterranean · 25 min   │
│                          │
│ [👍] [👎] [🔄 Swap]      │
└──────────────────────────┘
```

- Show 🔄 swap button on every meal card
- Disable if daily swap limit reached (check `today.mealSwapsUsed >= today.mealSwapsLimit`)
- On tap: call `POST /api/plan/:id/swap` with `{ dayIndex, mealType }`
- Show spinner while in progress
- On success: update the plan data locally, refetch grocery list
- On 403: show the error message ("You've used all X meal swaps for today...")

### Regen Button on Each Day

```
┌──────────────────────────┐
│ Day 3 - Wednesday    [↻] │
│ ─────────────────────── │
│ Breakfast: ...           │
│ Lunch: ...               │
│ Dinner: ...              │
└──────────────────────────┘
```

- Show ↻ regen button on each day header
- Disable if daily regen limit reached OR total plan regens exhausted OR cooldown active
- On tap: call `POST /api/plan/:id/regenerate-day` with `{ dayIndex }`
- On success: update the plan data, refetch grocery list
- On 403 with `cooldownMinutesRemaining`: show "Cooldown: X minutes remaining"

### Regen Button on Each Workout Session

Same pattern as day regen but on workout session cards:
- Call `POST /api/workout/:id/regenerate-session` with `{ dayIndex }`
- Only show on days that have a session (not rest days)

### After Every Swap or Regen

1. Update local plan data from the response
2. Invalidate/refetch grocery list (`GET /api/plan/:id/grocery`)
3. Refetch allowance state (`GET /api/allowance/current`)
4. Optionally call `POST /api/plan/:id/grocery/regenerate` to force a grocery rebuild

### Handling Disabled State

Before showing a swap/regen button, check:

```swift
// For meal swap button
let canSwap: Bool = {
    guard let allowance = allowance else { return true }  // No budget = legacy, use swapCount
    return allowance.today.mealSwapsUsed < allowance.today.mealSwapsLimit
}()

// For meal day regen button
let canRegenDay: Bool = {
    guard let allowance = allowance else { return plan.regenDayCount < 1 }
    if allowance.cooldown.active { return false }
    if allowance.today.mealRegensUsed >= allowance.today.mealRegensLimit { return false }
    if allowance.plan.regensUsed >= allowance.plan.regensLimit { return false }
    return true
}()

// For workout session regen button
let canRegenWorkout: Bool = {
    guard let allowance = allowance else { return true }
    if allowance.cooldown.active { return false }
    if allowance.today.workoutRegensUsed >= allowance.today.workoutRegensLimit { return false }
    if allowance.plan.regensUsed >= allowance.plan.regensLimit { return false }
    return true
}()
```

### Showing Remaining Budget

```swift
// "1/2 swaps remaining today"
let swapsRemaining = allowance.today.mealSwapsLimit - allowance.today.mealSwapsUsed

// "3/5 plan regens remaining"
let planRegensRemaining = allowance.plan.regensLimit - allowance.plan.regensUsed

// Cooldown display
if allowance.cooldown.active {
    let hours = allowance.cooldown.minutesRemaining / 60
    let mins = allowance.cooldown.minutesRemaining % 60
    // Show "Cooldown: Xh Ym remaining"
}
```

---

## Complete Request/Response Summary

### Meal Swap
```
POST /api/plan/:id/swap
Body: { "dayIndex": 3, "mealType": "lunch" }
→ 200: Full updated meal plan object
→ 403: Budget exceeded
→ 429: AI rate limit
```

### Day Regen (Meal)
```
POST /api/plan/:id/regenerate-day
Body: { "dayIndex": 5 }
→ 200: Full updated meal plan object
→ 403: Budget exceeded or cooldown active
→ 429: AI rate limit
```

### Workout Session Regen
```
POST /api/workout/:id/regenerate-session
Body: { "dayIndex": 2 }
→ 200: Full updated workout plan object
→ 403: Budget exceeded or cooldown active
→ 429: AI rate limit
→ 400: Rest day (no session)
```

### Grocery List Regen
```
POST /api/plan/:id/grocery/regenerate
Body: (none)
→ 200: Full updated meal plan object
```

### Daily Meal Regen (async)
```
POST /api/daily-meal/:date/regenerate
Body: (none)
→ 200: { "id": "uuid", "status": "generating" }
   Then poll GET /api/daily-meal/:date until status === "ready"
```

### Daily Workout Regen (async)
```
POST /api/daily-workout/:date/regenerate
Body: (none)
→ 200: { "id": "uuid", "status": "generating" }
   Then poll GET /api/daily-workout/:date until status === "ready"
```

### Get Budget
```
GET /api/allowance/current?mealPlanId=<optional>
→ 200: AllowanceState object (or null)
```

### Redeem Flex Token
```
POST /api/allowance/redeem-flex-token
Body: (none)
→ 200: { "success": true, "message": "..." }
→ 400: { "success": false, "message": "No flex tokens available" }
```

---

## Key Difference: Synchronous vs Asynchronous

| Action | Type | Response Contains |
|:-------|:-----|:-----------------|
| Meal Swap | **Synchronous** | Full updated plan (meal is already swapped) |
| Day Regen (Meal) | **Synchronous** | Full updated plan (day is already regenerated) |
| Workout Session Regen | **Synchronous** | Full updated plan (session is already regenerated) |
| Grocery Regen | **Synchronous** | Full updated plan (grocery list rebuilt, pricing pending) |
| Daily Meal Regen | **Asynchronous** | `{ id, status: "generating" }` → must poll |
| Daily Workout Regen | **Asynchronous** | `{ id, status: "generating" }` → must poll |

For synchronous endpoints, the response includes the final result. No polling needed.
For async endpoints (daily meal/workout regen), you get an immediate acknowledgment and must poll for completion.
