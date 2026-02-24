# iOS Guide: Plan Generation — Complete Implementation Reference

This document covers how to generate all 5 plan types from the iOS app. Each section provides the exact API endpoint, request body, response shape, polling mechanism, and common error handling.

**The #1 reason plans fail to generate from a mobile client:** the request body doesn't match the expected schema exactly, or required fields are missing. This guide specifies every required field.

---

## Table of Contents

1. [Prerequisites (Profile Required)](#1-prerequisites)
2. [7-Day Meal Plan Generation](#2-seven-day-meal-plan)
3. [7-Day Workout Plan Generation](#3-seven-day-workout-plan)
4. [Wellness (Goal) Plan Generation](#4-wellness-goal-plan)
5. [Daily Meal Generation](#5-daily-meal)
6. [Daily Workout Generation](#6-daily-workout)
7. [Common Error Responses](#7-common-errors)
8. [Complete API Quick Reference](#8-quick-reference)

---

## 1. Prerequisites

### Profile Must Exist

**All 5 plan types require a completed user profile.** If no profile exists, every generation endpoint returns:

```json
HTTP 400
{
  "message": "Please complete your Performance Blueprint (profile) before creating a meal plan.",
  "profileRequired": true
}
```

Check for `profileRequired: true` in error responses and navigate to the profile setup screen.

### AI Rate Limit

All generation endpoints enforce a **10 AI calls per user per day** limit:

```json
HTTP 429
{
  "message": "Daily AI call limit reached (10/day). Try again tomorrow."
}
```

### Authentication

All endpoints require authentication. Use JWT Bearer token:
```
Authorization: Bearer <accessToken>
```

---

## 2. 7-Day Meal Plan Generation

### Step 1: Submit the Form

```
POST /api/plan
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "startDate": "2026-03-01",
  "goal": "weight_loss",
  "dietStyles": ["Mediterranean", "High Protein"],
  "foodsToAvoid": ["Pork"],
  "householdSize": 2,
  "prepStyle": "cook_daily",
  "budgetMode": "normal",
  "cookingTime": "quick",
  "mealsPerDay": 3,
  "mealSlots": null,
  "allergies": "tree nuts",
  "spiceLevel": "medium",
  "authenticityMode": "mixed"
}
```

### Field Reference

| Field | Type | Required | Values |
|:------|:-----|:---------|:-------|
| `idempotencyKey` | string (UUID) | Recommended | Any UUID v4. Prevents duplicate plans if the request is retried. |
| `startDate` | string | Optional | `"YYYY-MM-DD"`. If provided, plan starts as Scheduled. If omitted, starts as Draft. |
| `goal` | string | **Required** | `"weight_loss"`, `"muscle_gain"`, `"energy"`, `"maintenance"`, `"performance"` |
| `dietStyles` | string[] | **Required** (min 1) | Any cuisine/diet strings (e.g., `"Mediterranean"`, `"Keto"`, `"Japanese"`, `"High Protein"`) |
| `foodsToAvoid` | string[] | Optional | Default `[]`. Any food names. |
| `householdSize` | number | **Required** | Integer 1–8 |
| `prepStyle` | string | **Required** | `"cook_daily"`, `"batch_2day"`, `"batch_3to4day"` |
| `budgetMode` | string | **Required** | `"normal"`, `"budget_friendly"` |
| `cookingTime` | string | **Required** | `"quick"`, `"normal"` |
| `mealsPerDay` | number | **Required** | `2` or `3` |
| `mealSlots` | string[] | Conditional | **Required if `mealsPerDay` is 2.** Exactly 2 values from: `"breakfast"`, `"lunch"`, `"dinner"`. Omit or null if `mealsPerDay` is 3. |
| `allergies` | string | Optional | Free text |
| `spiceLevel` | string | Optional | `"none"`, `"mild"`, `"medium"` (default), `"hot"` |
| `authenticityMode` | string | Optional | `"traditional"`, `"weeknight"`, `"mixed"` (default) |
| `age` | number | Optional | 1–120. Auto-populated from profile if omitted. |
| `currentWeight` | number | Optional | Auto-populated from profile. |
| `targetWeight` | number | Optional | Auto-populated from profile. |
| `weightUnit` | string | Optional | `"lb"` (default) or `"kg"` |
| `workoutDaysPerWeek` | number | Optional | 0–7 |
| `workoutDays` | string[] | Optional | `["Mon", "Wed", "Fri"]` etc. Used for wellness context. |

### Step 2: Handle the Response

**Success Response (HTTP 200):**
```json
{
  "id": "plan-uuid-here",
  "userId": "user-uuid",
  "status": "pending",
  "planJson": null,
  "preferencesJson": { ... },
  "planStartDate": "2026-03-01",
  "createdAt": "2026-02-24T10:00:00Z",
  "idempotencyKey": "550e8400-..."
}
```

**Critical:** The plan is NOT ready yet. `status` will be `"pending"`. You must navigate to a generating/loading screen and start polling.

### Step 3: Poll for Completion

```
GET /api/plan/:id/status
```

Response:
```json
{
  "id": "plan-uuid",
  "status": "pending" | "ready" | "failed",
  "pricingStatus": "pending" | "ready" | null
}
```

**Polling rules:**
- Poll every **1.5 seconds**
- When `status === "ready"` → stop polling, fetch the full plan, navigate to plan view
- When `status === "failed"` → stop polling, show error, offer retry
- Timeout after **2 minutes** → show timeout message, offer manual refresh

### Step 4: Fetch the Full Plan

```
GET /api/plan/:id
```

Returns the complete plan object including `planJson` (the 7-day meal plan with recipes, ingredients, macros) and `groceryPricingJson` (estimated costs).

### Idempotency Key Behavior

If you send the same `idempotencyKey` twice, the server returns the existing plan instead of creating a duplicate. Generate a new UUID for each new plan generation attempt.

---

## 3. 7-Day Workout Plan Generation

### Step 1: Submit the Form

```
POST /api/workout
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "idempotencyKey": "660e8400-e29b-41d4-a716-446655440000",
  "startDate": "2026-03-01",
  "preferences": {
    "goal": "muscle_gain",
    "location": "gym",
    "trainingMode": "strength",
    "focusAreas": ["Upper Body", "Core"],
    "daysOfWeek": ["Mon", "Wed", "Fri"],
    "sessionLength": 45,
    "experienceLevel": "intermediate",
    "limitations": "Minor lower back pain",
    "equipmentAvailable": ["Dumbbells", "Barbell", "Bench", "Cable Machine"]
  }
}
```

**IMPORTANT:** The preferences are nested inside a `preferences` object. This is different from the meal plan endpoint which has flat fields. The `idempotencyKey` and `startDate` are at the top level, NOT inside `preferences`.

### Field Reference

| Field | Type | Required | Values |
|:------|:-----|:---------|:-------|
| `idempotencyKey` | string (UUID) | Recommended | Prevents duplicates |
| `startDate` | string | Optional | `"YYYY-MM-DD"` |
| `preferences.goal` | string | **Required** | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"` |
| `preferences.location` | string | **Required** | `"gym"`, `"home"`, `"outdoors"`, or `""` (empty string) |
| `preferences.trainingMode` | string | **Required** | `"strength"`, `"cardio"`, `"both"` |
| `preferences.focusAreas` | string[] | **Required** (min 1) | e.g., `["Full Body"]`, `["Upper Body", "Core", "Legs"]` |
| `preferences.daysOfWeek` | string[] | **Required** (min 1) | `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` |
| `preferences.sessionLength` | number | **Required** | `20`, `30`, `45`, or `60` |
| `preferences.experienceLevel` | string | **Required** | `"beginner"`, `"intermediate"`, `"advanced"` |
| `preferences.limitations` | string | Optional | Free text |
| `preferences.equipmentAvailable` | string[] | Optional | e.g., `["Dumbbells", "Resistance Bands"]` |

### Step 2: Handle the Response

```json
{
  "id": "workout-plan-uuid",
  "status": "generating"
}
```

### Step 3: Poll for Completion

```
GET /api/workout/:id/status
```

Response:
```json
{
  "status": "generating" | "ready" | "failed",
  "errorMessage": null
}
```

**Polling rules:** Same as meal plan — every 1.5 seconds, 2-minute timeout.

### Step 4: Fetch the Full Plan

```
GET /api/workout/:id
```

Returns the complete workout plan including `planJson` (7 days with sessions, exercises, sets, reps, rest times).

---

## 4. Wellness (Goal) Plan Generation

The Wellness plan is a **combined** generation that creates a goal plan which orchestrates generating both a meal plan AND a workout plan (or just one). It has a multi-stage progress system.

### Step 1: Submit the Form

```
POST /api/goal-plans/generate
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "goalType": "weight_loss",
  "planType": "both",
  "startDate": "2026-03-01",
  "pace": "moderate",
  "globalInputs": {
    "age": 30,
    "currentWeight": 180,
    "targetWeight": 165,
    "weightUnit": "lb"
  },
  "mealPreferences": {
    "goal": "weight_loss",
    "dietStyles": ["Mediterranean"],
    "foodsToAvoid": [],
    "householdSize": 1,
    "prepStyle": "cook_daily",
    "budgetMode": "normal",
    "cookingTime": "quick",
    "mealsPerDay": 3,
    "spiceLevel": "medium",
    "authenticityMode": "mixed"
  },
  "workoutPreferences": {
    "goal": "weight_loss",
    "location": "gym",
    "trainingMode": "both",
    "focusAreas": ["Full Body"],
    "daysOfWeek": ["Mon", "Wed", "Fri"],
    "sessionLength": 45,
    "experienceLevel": "intermediate",
    "equipmentAvailable": ["Dumbbells", "Barbell"]
  }
}
```

### Field Reference

| Field | Type | Required | Notes |
|:------|:-----|:---------|:------|
| `goalType` | string | **Required** | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"`, `"energy"`, `"general_fitness"`, `"mobility"`, `"endurance"`, `"strength"` |
| `planType` | string | Optional | `"both"` (default), `"meal"`, `"workout"`. Determines which sub-plans to generate. |
| `startDate` | string | Optional | `"YYYY-MM-DD"` |
| `pace` | string | Optional | e.g., `"moderate"`, `"aggressive"`, `"conservative"` |
| `globalInputs` | object | Optional | `{age, currentWeight, targetWeight, weightUnit}` — pre-filled from profile |
| `mealPreferences` | object | Conditional | **Required if `planType` is `"both"` or `"meal"`.** Same schema as 7-day meal plan fields (see §2). |
| `workoutPreferences` | object | Conditional | **Required if `planType` is `"both"` or `"workout"`.** Same schema as workout `preferences` object (see §3). |

**IMPORTANT:** `mealPreferences` and `workoutPreferences` use the same field schemas as the standalone endpoints, but they are at the top level here (not nested inside a `preferences` wrapper like the standalone workout endpoint).

### Step 2: Handle the Response

```json
{
  "id": "goal-plan-uuid",
  "goalType": "weight_loss",
  "planType": "both",
  "status": "generating",
  "progress": {
    "stage": "TRAINING",
    "stageStatuses": {
      "TRAINING": "PENDING",
      "NUTRITION": "PENDING",
      "SCHEDULING": "PENDING",
      "FINALIZING": "PENDING"
    }
  },
  "mealPlanId": null,
  "workoutPlanId": null
}
```

### Step 3: Poll for Completion (Multi-Stage)

```
GET /api/goal-plans/:id/generation-status
```

Response:
```json
{
  "goalPlanId": "goal-uuid",
  "status": "generating" | "ready" | "failed",
  "planType": "both",
  "progress": {
    "stage": "NUTRITION",
    "stageStatuses": {
      "TRAINING": "DONE",
      "NUTRITION": "RUNNING",
      "SCHEDULING": "PENDING",
      "FINALIZING": "PENDING"
    }
  },
  "mealPlan": { "id": "meal-uuid", "status": "generating", "errorMessage": null },
  "workoutPlan": { "id": "workout-uuid", "status": "ready", "errorMessage": null }
}
```

**Polling rules:**
- Poll every **2 seconds**
- Show a multi-step progress indicator using `stageStatuses`:
  1. **Training** → PENDING → RUNNING → DONE (or SKIPPED if `planType === "meal"`)
  2. **Nutrition** → PENDING → RUNNING → DONE (or SKIPPED if `planType === "workout"`)
  3. **Scheduling** → RUNNING → DONE
  4. **Finalizing** → RUNNING → DONE
- When `status === "ready"` → stop polling, navigate to goal plan view
- When `status === "failed"` → show error
- Timeout after **3 minutes** (this takes longer since it generates 2 plans)

### Stage Status Values

| Value | Meaning |
|:------|:--------|
| `"PENDING"` | Not started yet |
| `"RUNNING"` | Currently being generated |
| `"DONE"` | Successfully completed |
| `"FAILED"` | Generation failed |
| `"SKIPPED"` | Not needed (e.g., TRAINING is SKIPPED when `planType === "meal"`) |

### Step 4: Fetch the Full Goal Plan

```
GET /api/goal-plans/:id
```

Returns the goal plan with linked `mealPlanId` and `workoutPlanId`. Fetch each sub-plan separately:
- `GET /api/plan/:mealPlanId` for the meal plan
- `GET /api/workout/:workoutPlanId` for the workout plan

---

## 5. Daily Meal Generation

### Step 1: Submit

```
POST /api/daily-meal
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "date": "2026-02-24",
  "mealsPerDay": 3
}
```

### Field Reference

| Field | Type | Required | Values |
|:------|:-----|:---------|:-------|
| `date` | string | **Required** | `"YYYY-MM-DD"`. Cannot be a past date. |
| `mealsPerDay` | number | **Required** | `2` or `3` |

That's it — only 2 fields. Everything else comes from the user's profile automatically.

### Step 2: Handle the Response

```json
{
  "id": "daily-meal-uuid",
  "status": "generating"
}
```

### Step 3: Poll for Completion

```
GET /api/daily-meal/:date
```

Where `:date` is the same `YYYY-MM-DD` string you sent. The response includes a `status` field.

**Polling rules:**
- Poll every **2 seconds**
- When `status === "ready"` → display the plan
- When `status === "failed"` → show error, offer regeneration
- Timeout after **60 seconds**

### Step 4: Full Response (Ready State)

```json
{
  "id": "uuid",
  "userId": "...",
  "date": "2026-02-24",
  "status": "ready",
  "generatedTitle": "Daily Meals — Monday, February 24",
  "planJson": {
    "title": "...",
    "meals": {
      "breakfast": {
        "name": "Greek Yogurt Bowl",
        "cuisineTag": "Mediterranean",
        "prepTimeMinutes": 10,
        "servings": 1,
        "ingredients": ["greek yogurt", "honey", "granola", "berries"],
        "steps": ["Combine yogurt with toppings..."],
        "nutritionEstimateRange": { "calories": "350", "protein_g": "25", "carbs_g": "40", "fat_g": "12" },
        "whyItHelpsGoal": "High protein start supports muscle recovery"
      },
      "lunch": { ... },
      "dinner": { ... }
    },
    "nutritionSummary": { ... }
  },
  "groceryJson": { ... }
}
```

### Conflict Handling

If a daily meal already exists for that date (and isn't failed), the server returns:
```json
HTTP 409
{
  "message": "A daily meal already exists for this date",
  "existing": { ... }
}
```

To regenerate, use: `POST /api/daily-meal/:date/regenerate` (no body needed).

---

## 6. Daily Workout Generation

### Step 1: Submit

```
POST /api/daily-workout
Content-Type: application/json
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "date": "2026-02-24"
}
```

**Only 1 field.** Everything comes from the user's profile (training location, experience level, equipment, etc.).

### Field Reference

| Field | Type | Required | Values |
|:------|:-----|:---------|:-------|
| `date` | string | **Required** | `"YYYY-MM-DD"`. Cannot be a past date. |

### Step 2: Handle the Response

```json
{
  "id": "daily-workout-uuid",
  "status": "generating"
}
```

### Step 3: Poll for Completion

```
GET /api/daily-workout/:date
```

**Polling rules:** Same as daily meal — every 2 seconds, 60-second timeout.

### Step 4: Full Response (Ready State)

```json
{
  "id": "uuid",
  "userId": "...",
  "date": "2026-02-24",
  "status": "ready",
  "planJson": {
    "session": {
      "mode": "strength",
      "focus": "Upper Body Push",
      "durationMinutes": 45,
      "intensity": "moderate",
      "warmup": ["5 min light cardio", "Arm circles 30s each direction"],
      "main": [
        {
          "name": "Barbell Bench Press",
          "type": "strength",
          "sets": 4,
          "reps": "8-10",
          "restSeconds": 90,
          "notes": "Focus on controlled eccentric"
        }
      ],
      "finisher": ["Burnout set: push-ups to failure"],
      "cooldown": ["Chest stretch 30s each side", "Shoulder stretch"],
      "coachingCues": ["Keep core braced throughout"]
    }
  }
}
```

### Conflict Handling

Same as daily meal — returns `409` if one already exists. Use `POST /api/daily-workout/:date/regenerate` to regenerate.

---

## 7. Common Error Responses

### Profile Missing (HTTP 400)
```json
{
  "message": "Profile required",
  "profileRequired": true
}
```
**Action:** Navigate to profile setup screen.

### Validation Error (HTTP 400)
```json
{
  "message": "Select at least one diet/cuisine style"
}
```
**Action:** Show the specific validation message to the user. Check which required fields are missing.

### Constraint Blocked (HTTP 400)
```json
{
  "message": "Plan blocked by safety constraints.",
  "blocked": true,
  "violations": [
    {
      "ruleKey": "min_age_check",
      "severity": "BLOCK",
      "message": "Users under 16 require medical guidance for restrictive diet plans.",
      "category": "safety"
    }
  ]
}
```
**Action:** Show the violation message. This is a safety block that cannot be bypassed.

### Already Generating (HTTP 200 — not an error)
```json
{
  "id": "existing-plan-uuid",
  "status": "generating"
}
```
If a plan is already being generated for this user, the server returns the existing one instead of creating a duplicate. Navigate to the generating screen for this plan.

### Daily Plan Conflict (HTTP 409)
```json
{
  "message": "A daily meal already exists for this date",
  "existing": { "id": "...", "status": "ready", ... }
}
```
**Action:** Show the existing plan, or offer to regenerate it.

### AI Rate Limit (HTTP 429)
```json
{
  "message": "Daily AI call limit reached (10/day). Try again tomorrow."
}
```

### Past Date (HTTP 400)
```json
{
  "message": "Cannot create plans for past dates"
}
```

---

## 8. Complete API Quick Reference

### Generation Endpoints

| Plan Type | Method | Endpoint | Body Fields |
|:----------|:-------|:---------|:------------|
| 7-Day Meal | POST | `/api/plan` | `{idempotencyKey, startDate, goal, dietStyles, foodsToAvoid, householdSize, prepStyle, budgetMode, cookingTime, mealsPerDay, mealSlots?, allergies?, spiceLevel?, authenticityMode?}` |
| 7-Day Workout | POST | `/api/workout` | `{idempotencyKey, startDate, preferences: {goal, location, trainingMode, focusAreas, daysOfWeek, sessionLength, experienceLevel, limitations?, equipmentAvailable?}}` |
| Wellness (Goal) | POST | `/api/goal-plans/generate` | `{goalType, planType?, startDate?, pace?, globalInputs?, mealPreferences?, workoutPreferences?}` |
| Daily Meal | POST | `/api/daily-meal` | `{date, mealsPerDay}` |
| Daily Workout | POST | `/api/daily-workout` | `{date}` |

### Polling Endpoints

| Plan Type | Method | Endpoint | Key Response Fields |
|:----------|:-------|:---------|:--------------------|
| 7-Day Meal | GET | `/api/plan/:id/status` | `{status, pricingStatus}` |
| 7-Day Workout | GET | `/api/workout/:id/status` | `{status, errorMessage}` |
| Wellness (Goal) | GET | `/api/goal-plans/:id/generation-status` | `{status, progress, mealPlan, workoutPlan}` |
| Daily Meal | GET | `/api/daily-meal/:date` | `{status}` (full object returned) |
| Daily Workout | GET | `/api/daily-workout/:date` | `{status}` (full object returned) |

### Full Plan Fetch Endpoints

| Plan Type | Method | Endpoint |
|:----------|:-------|:---------|
| 7-Day Meal | GET | `/api/plan/:id` |
| 7-Day Workout | GET | `/api/workout/:id` |
| Wellness (Goal) | GET | `/api/goal-plans/:id` |
| Daily Meal | GET | `/api/daily-meal/:date` |
| Daily Workout | GET | `/api/daily-workout/:date` |

### Regeneration Endpoints

| Plan Type | Method | Endpoint | Notes |
|:----------|:-------|:---------|:------|
| Daily Meal | POST | `/api/daily-meal/:date/regenerate` | No body needed |
| Daily Workout | POST | `/api/daily-workout/:date/regenerate` | No body needed |

### Polling Intervals

| Plan Type | Interval | Timeout |
|:----------|:---------|:--------|
| 7-Day Meal | 1.5s | 2 min |
| 7-Day Workout | 1.5s | 2 min |
| Wellness (Goal) | 2s | 3 min |
| Daily Meal | 2s | 60s |
| Daily Workout | 2s | 60s |

---

## Debugging Checklist: "Why Won't My Plan Generate?"

If your iOS form submits but nothing happens, check these in order:

1. **Is the profile created?** Call `GET /api/profile` — if 404, the user needs to complete their profile first.
2. **Are you sending the right Content-Type?** Must be `application/json`.
3. **Is the Authorization header correct?** Must be `Bearer <accessToken>` with a valid, non-expired token.
4. **Check the HTTP response status.** A 400 means validation failed — read the `message` field.
5. **For workout plans: are preferences nested?** The body must be `{ preferences: { ... } }`, not flat.
6. **For meal plans: is `dietStyles` an array with at least 1 item?** Empty array will fail validation.
7. **For daily plans: is the date today or in the future?** Past dates are rejected.
8. **For daily plans: does one already exist?** Check for 409 status and handle the existing plan.
9. **Are you polling after the POST?** The POST only starts generation — you must poll the status endpoint until `status === "ready"`.
10. **Is the AI rate limit hit?** Check for 429 status. Max 10 AI calls per day per user.
