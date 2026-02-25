# Perform AI — Mobile API Reference

Base URL: `https://<your-domain>`

All endpoints return JSON. Dates use `YYYY-MM-DD` format. IDs are UUIDs.

---

## Table of Contents

- [Authentication](#authentication)
- [Auth Check](#auth-check)
- [Profile](#profile)
- [Meal Plans](#meal-plans)
- [Grocery](#grocery)
- [Meal Feedback & Preferences](#meal-feedback--preferences)
- [Workout Plans](#workout-plans)
- [Workout Feedback](#workout-feedback)
- [Exercise Preferences](#exercise-preferences)
- [Goal Plans](#goal-plans)
- [Calendar](#calendar)
- [Ingredient Proposals](#ingredient-proposals)
- [Check-ins](#check-ins)
- [Performance](#performance)
- [Weekly Adaptation](#weekly-adaptation)
- [Daily Planning](#daily-planning)
- [Completions](#completions)
- [Async Plan Generation Pattern](#async-plan-generation-pattern)
- [Rate Limits](#rate-limits)
- [Common Error Responses](#common-error-responses)

---

## Authentication

All auth endpoints are **public** (no token required).

Mobile clients should use the **token-based** auth flow (`token-login`, `refresh`, `token-logout`) and include the access token in subsequent requests via the `Authorization: Bearer <accessToken>` header.

### POST /api/auth/signup

Create a new account.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

| Field      | Type   | Required | Notes                          |
|------------|--------|----------|--------------------------------|
| `email`    | string | Yes      | Valid email address            |
| `password` | string | Yes      | Minimum 6 characters           |

**Response (200):**

```json
{
  "id": "a1b2c3d4-...",
  "email": "user@example.com"
}
```

**Errors:** `400` validation error, `409` email already in use.

---

### POST /api/auth/login

Session-based login (sets HTTP cookie). Primarily for web clients.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):**

```json
{
  "id": "a1b2c3d4-...",
  "email": "user@example.com"
}
```

**Errors:** `400` validation error, `401` invalid credentials.

---

### POST /api/auth/token-login

Token-based login — **recommended for mobile clients**. Returns a short-lived access token (JWT, 15 min default) and a long-lived refresh token (30 days default).

**Request:**

```json
{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "a8f2e1c9b0d3...",
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com"
  }
}
```

**Errors:** `400` validation error, `401` invalid credentials.

---

### POST /api/auth/refresh

Exchange a valid refresh token for a new access/refresh token pair. The old refresh token is revoked (single-use rotation).

**Request:**

```json
{
  "refreshToken": "a8f2e1c9b0d3..."
}
```

**Response (200):**

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "c7d4e5f6a1b2..."
}
```

**Errors:** `400` missing token, `401` invalid or expired refresh token.

---

### POST /api/auth/token-logout

Revoke a refresh token. Always returns success even if the token was already revoked.

**Request:**

```json
{
  "refreshToken": "a8f2e1c9b0d3..."
}
```

**Response (200):**

```json
{
  "ok": true
}
```

---

## Auth Check

### GET /api/auth/me

> **Protected** — requires `Authorization: Bearer <accessToken>`

Returns the authenticated user's identity.

**Response (200):**

```json
{
  "id": "a1b2c3d4-...",
  "email": "user@example.com"
}
```

**Errors:** `401` not authenticated or token expired.

---

## Profile

> **Protected** — all profile endpoints require `Authorization: Bearer <accessToken>`

A user profile must be created before generating any plans.

### GET /api/profile

Get the current user's profile.

**Response (200):** Profile object or `null` if no profile exists.

```json
{
  "id": "...",
  "userId": "...",
  "unitSystem": "imperial",
  "age": 30,
  "sex": "male",
  "heightCm": 180,
  "weightKg": 80.5,
  "targetWeightKg": 75.0,
  "primaryGoal": "weight_loss",
  "trainingExperience": "intermediate",
  "injuries": [],
  "mobilityLimitations": [],
  "chronicConditions": [],
  "healthConstraints": [],
  "sleepHours": 7.5,
  "stressLevel": "moderate",
  "activityLevel": "moderate",
  "trainingDaysOfWeek": ["mon", "wed", "fri"],
  "sessionDurationMinutes": 45,
  "allergies": [],
  "intolerances": [],
  "religiousRestrictions": [],
  "allergiesIntolerances": [],
  "foodsToAvoid": [],
  "foodsToAvoidNotes": null,
  "appetiteLevel": "normal",
  "spicePreference": "medium",
  "bodyContext": "",
  "favoriteMealsText": "",
  "workoutLocationDefault": "gym",
  "equipmentAvailable": ["barbell", "dumbbell"],
  "equipmentOtherNotes": null
}
```

---

### POST /api/profile

Create a new profile. Fails with `409` if a profile already exists (use `PUT` to update instead).

### PUT /api/profile

Create or update the profile (upsert).

**Request body (shared by POST and PUT):**

| Field                    | Type     | Required | Notes                                                                 |
|--------------------------|----------|----------|-----------------------------------------------------------------------|
| `unitSystem`             | string   | No       | `"imperial"` or `"metric"`. Default: `"imperial"`                     |
| `age`                    | integer  | Yes      |                                                                       |
| `sex`                    | string   | No       | e.g. `"male"`, `"female"`, `"other"`                                  |
| `heightCm`               | integer  | No       | Height in centimeters                                                 |
| `weightKg`               | number   | Yes      | Weight in kilograms                                                   |
| `targetWeightKg`          | number   | No       | Target weight in kilograms                                            |
| `primaryGoal`             | string   | Yes      | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"`, `"energy"` etc. |
| `trainingExperience`      | string   | Yes      | `"beginner"`, `"intermediate"`, `"advanced"`                          |
| `injuries`               | string[] | No       | List of injury descriptions                                           |
| `mobilityLimitations`    | string[] | No       | List of mobility limitation descriptions                              |
| `chronicConditions`       | string[] | No       | List of chronic conditions                                            |
| `healthConstraints`       | string[] | No       | List of health constraints                                            |
| `sleepHours`              | number   | No       | Average hours of sleep per night                                      |
| `stressLevel`             | string   | No       | e.g. `"low"`, `"moderate"`, `"high"`                                  |
| `activityLevel`           | string   | No       | `"sedentary"`, `"moderate"`, or `"active"`                            |
| `trainingDaysOfWeek`      | string[] | Yes      | Lowercase day abbreviations: `["mon", "wed", "fri"]`                  |
| `sessionDurationMinutes`  | integer  | No       | Typical workout session length                                        |
| `allergies`              | string[] | No       |                                                                       |
| `intolerances`           | string[] | No       |                                                                       |
| `religiousRestrictions`   | string[] | No       |                                                                       |
| `allergiesIntolerances`   | string[] | No       | Combined allergy/intolerance list                                     |
| `foodsToAvoid`           | string[] | No       |                                                                       |
| `foodsToAvoidNotes`       | string   | No       | Free-text notes (max 500 chars)                                       |
| `appetiteLevel`           | string   | No       | e.g. `"low"`, `"normal"`, `"high"`                                    |
| `spicePreference`         | string   | No       | `"mild"`, `"medium"`, or `"spicy"` (profile-level preference)        |
| `bodyContext`             | string   | No       | Free-text body context                                                |
| `favoriteMealsText`       | string   | No       | Free-text favorite meals description                                  |
| `workoutLocationDefault`  | string   | No       | `"gym"`, `"home"`, `"outdoors"`. Default: `"gym"`                     |
| `equipmentAvailable`      | string[] | No       | e.g. `["barbell", "dumbbell", "pull_up_bar"]`                         |
| `equipmentOtherNotes`     | string   | No       | Free-text equipment notes                                             |

**Response (200):** The created/updated profile object.

**Errors:** `400` validation error, `409` profile already exists (POST only).

---

## Meal Plans

> **Protected** — all endpoints require `Authorization: Bearer <accessToken>`

Meal plans use [async generation](#async-plan-generation-pattern). A profile must exist before creating a plan.

### POST /api/plan

Create a new 7-day meal plan. Returns immediately with a pending plan; generation happens asynchronously.

**Request:**

```json
{
  "goal": "weight_loss",
  "dietStyles": ["mediterranean", "asian"],
  "foodsToAvoid": ["shellfish"],
  "householdSize": 2,
  "prepStyle": "batch_2day",
  "budgetMode": "normal",
  "cookingTime": "normal",
  "mealsPerDay": 3,
  "mealSlots": ["breakfast", "lunch", "dinner"],
  "allergies": "tree nuts",
  "age": 30,
  "currentWeight": 180,
  "targetWeight": 165,
  "weightUnit": "lb",
  "workoutDaysPerWeek": 4,
  "workoutDays": ["Mon", "Tue", "Thu", "Fri"],
  "spiceLevel": "medium",
  "authenticityMode": "mixed",
  "idempotencyKey": "unique-client-key-123",
  "startDate": "2026-03-01"
}
```

| Field               | Type     | Required | Notes                                                         |
|---------------------|----------|----------|---------------------------------------------------------------|
| `goal`              | string   | Yes      | `"weight_loss"`, `"muscle_gain"`, `"energy"`, `"maintenance"`, `"performance"` |
| `dietStyles`        | string[] | Yes      | At least one style                                            |
| `foodsToAvoid`      | string[] | No       | Default: `[]`                                                 |
| `householdSize`     | integer  | Yes      | 1–8                                                           |
| `prepStyle`         | string   | Yes      | `"cook_daily"`, `"batch_2day"`, `"batch_3to4day"`             |
| `budgetMode`        | string   | Yes      | `"normal"`, `"budget_friendly"`                               |
| `cookingTime`       | string   | Yes      | `"quick"`, `"normal"`                                         |
| `mealsPerDay`       | integer  | No       | `2` or `3`. Default: `3`                                      |
| `mealSlots`         | string[] | No       | `["breakfast", "lunch", "dinner"]`. Required if `mealsPerDay` is 2 (pick 2 slots) |
| `allergies`         | string   | No       | Free-text allergy description                                 |
| `age`               | integer  | No       | 1–120                                                         |
| `currentWeight`     | number   | No       | 1–1000                                                        |
| `targetWeight`      | number   | No       | 1–1000                                                        |
| `weightUnit`        | string   | No       | `"lb"` or `"kg"`. Default: `"lb"`                             |
| `workoutDaysPerWeek`| integer  | No       | 0–7                                                           |
| `workoutDays`       | string[] | No       | e.g. `["Mon", "Wed", "Fri"]`                                  |
| `spiceLevel`        | string   | No       | `"none"`, `"mild"`, `"medium"`, `"hot"`. Default: `"medium"`  |
| `authenticityMode`  | string   | No       | `"traditional"`, `"weeknight"`, `"mixed"`. Default: `"mixed"` |
| `idempotencyKey`    | string   | No       | Prevents duplicate plan creation                              |
| `startDate`         | string   | No       | `YYYY-MM-DD` format                                           |

**Response (200):**

```json
{
  "id": "plan-uuid-...",
  "userId": "...",
  "status": "pending",
  "preferencesJson": { ... },
  "planStartDate": "2026-03-01",
  "createdAt": "2026-02-22T10:00:00.000Z"
}
```

**Errors:** `400` validation/profile required/constraint blocked, `429` daily AI limit reached.

---

### GET /api/plan/:id/status

Poll plan generation status.

**Response (200):**

```json
{
  "id": "plan-uuid-...",
  "status": "ready"
}
```

`status` values: `"pending"`, `"generating"`, `"ready"`, `"failed"`

---

### GET /api/plan/:id

Get the full plan object including generated meals, grocery list, and nutrition data.

**Response (200):** Full meal plan object with `planJson` containing:

```json
{
  "id": "...",
  "status": "ready",
  "planJson": {
    "title": "Mediterranean Weight Loss Plan",
    "summary": "...",
    "days": [
      {
        "dayIndex": 1,
        "dayName": "Monday",
        "meals": {
          "breakfast": {
            "name": "Greek Yogurt Bowl",
            "cuisineTag": "mediterranean",
            "prepTimeMinutes": 10,
            "servings": 2,
            "ingredients": ["greek yogurt", "honey", "walnuts"],
            "steps": ["Combine yogurt...", "Top with..."],
            "nutritionEstimateRange": {
              "calories": "350-400",
              "protein_g": "20-25",
              "carbs_g": "40-45",
              "fat_g": "12-15"
            },
            "whyItHelpsGoal": "High protein supports satiety..."
          },
          "lunch": { ... },
          "dinner": { ... }
        }
      }
    ],
    "groceryList": {
      "sections": [
        {
          "name": "Produce",
          "items": [
            { "item": "Spinach", "quantity": "2 bags", "notes": "fresh" }
          ]
        }
      ]
    },
    "nutritionNotes": {
      "dailyMacroTargetsRange": { ... },
      "howThisSupportsGoal": ["..."]
    },
    "batchPrepPlan": {
      "prepDay": "Sunday",
      "steps": ["..."],
      "storageTips": ["..."]
    }
  },
  "preferencesJson": { ... },
  "planStartDate": "2026-03-01"
}
```

---

### GET /api/plans

Get all of the current user's meal plans (excludes soft-deleted).

**Response (200):** Array of plan objects.

---

### DELETE /api/plans/:id

Soft-delete a meal plan.

**Response (200):** `{ "ok": true }`

---

### POST /api/plan/:id/swap

Swap a single meal in a plan for a new AI-generated alternative.

**Request:**

```json
{
  "dayIndex": 1,
  "mealType": "lunch"
}
```

| Field      | Type    | Required | Notes                                    |
|------------|---------|----------|------------------------------------------|
| `dayIndex` | integer | Yes      | 1-based day index within the 7-day plan  |
| `mealType` | string  | Yes      | `"breakfast"`, `"lunch"`, or `"dinner"`  |

**Response (200):** Updated plan object.

Swaps are unlimited. No budget or allowance checks are performed.

**Errors:** `429` daily AI limit.

---

### POST /api/plan/:id/regenerate-day

Regenerate all meals for a specific day.

**Request:**

```json
{
  "dayIndex": 3
}
```

**Response (200):** Updated plan object.

Day regenerations are unlimited. No budget or allowance checks are performed.

**Errors:** `429` daily AI limit.

---

### PATCH /api/plan/:id/start-date

Update the plan's start date.

**Request:**

```json
{
  "startDate": "2026-03-08"
}
```

**Response (200):** Updated plan object.

---

## Grocery

> **Protected** — requires `Authorization: Bearer <accessToken>`

### GET /api/plan/:id/grocery

Get the grocery list with ownership status.

**Response (200):**

```json
{
  "groceryList": {
    "sections": [
      {
        "name": "Produce",
        "items": [
          { "item": "Spinach", "quantity": "2 bags", "notes": "fresh" }
        ]
      }
    ]
  },
  "ownedItems": ["spinach"]
}
```

---

### POST /api/plan/:id/grocery/owned

Mark a grocery item as owned/not owned.

**Request:**

```json
{
  "itemKey": "spinach",
  "isOwned": true
}
```

**Response (200):** `{ "ok": true }`

---

### POST /api/plan/:id/grocery/regenerate

Regenerate the grocery list (e.g., after meal swaps).

**Response (200):** Updated plan object.

---

## Meal Feedback & Preferences

> **Protected** — requires `Authorization: Bearer <accessToken>`

### POST /api/feedback/meal

Submit feedback for a meal. Used to personalize future plan generation.

**Request:**

```json
{
  "planId": "plan-uuid-...",
  "mealFingerprint": "greek-yogurt-bowl-mediterranean",
  "mealName": "Greek Yogurt Bowl",
  "cuisineTag": "mediterranean",
  "feedback": "like",
  "ingredients": ["greek yogurt", "honey", "walnuts"]
}
```

| Field             | Type     | Required | Notes                                    |
|-------------------|----------|----------|------------------------------------------|
| `planId`          | string   | No       | Associated plan ID                       |
| `mealFingerprint` | string   | Yes      | Unique meal identifier                   |
| `mealName`        | string   | Yes      |                                          |
| `cuisineTag`      | string   | Yes      |                                          |
| `feedback`        | string   | Yes      | `"like"`, `"dislike"`, or `"neutral"`    |
| `ingredients`     | string[] | No       | Meal ingredients for preference learning |

---

### GET /api/feedback/plan/:planId

Get feedback map for all meals in a plan.

**Response (200):**

```json
{
  "greek-yogurt-bowl-mediterranean": "like",
  "chicken-stir-fry-asian": "dislike"
}
```

---

### GET /api/preferences

Get aggregated meal and ingredient preferences.

**Response (200):**

```json
{
  "likedMeals": [{ "name": "Greek Yogurt Bowl", "cuisineTag": "mediterranean" }],
  "dislikedMeals": [{ "name": "Liver Pate", "cuisineTag": "french" }],
  "avoidIngredients": ["cilantro"],
  "preferIngredients": ["avocado"]
}
```

---

### DELETE /api/preferences/meal/:id

Remove a meal feedback preference by ID.

**Response (200):** `{ "ok": true }`

---

### DELETE /api/preferences/ingredient/:id

Remove an ingredient preference by ID.

**Response (200):** `{ "ok": true }`

---

## Workout Plans

> **Protected** — requires `Authorization: Bearer <accessToken>`

Workout plans use the same [async generation pattern](#async-plan-generation-pattern) as meal plans.

### POST /api/workout

Create a new 7-day workout plan.

**Request:**

```json
{
  "preferences": {
    "goal": "muscle_gain",
    "location": "gym",
    "trainingMode": "strength",
    "focusAreas": ["chest", "back", "legs"],
    "daysOfWeek": ["Mon", "Wed", "Fri", "Sat"],
    "sessionLength": 45,
    "experienceLevel": "intermediate",
    "limitations": "mild lower back tightness",
    "equipmentAvailable": ["barbell", "dumbbell", "cable_machine"]
  },
  "idempotencyKey": "workout-key-456",
  "startDate": "2026-03-01"
}
```

**Workout Preferences:**

| Field               | Type     | Required | Notes                                                     |
|---------------------|----------|----------|------------------------------------------------------------|
| `goal`              | string   | Yes      | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"` |
| `location`          | string   | Yes      | `"gym"`, `"home"`, `"outdoors"`                            |
| `trainingMode`      | string   | Yes      | `"strength"`, `"cardio"`, `"both"`                         |
| `focusAreas`        | string[] | Yes      | At least one. e.g. `["chest", "back", "legs", "core"]`     |
| `daysOfWeek`        | string[] | Yes      | At least one. e.g. `["Mon", "Wed", "Fri"]`                 |
| `sessionLength`     | integer  | Yes      | `20`, `30`, `45`, or `60` minutes                          |
| `experienceLevel`   | string   | Yes      | `"beginner"`, `"intermediate"`, `"advanced"`               |
| `limitations`       | string   | No       | Free-text description of physical limitations              |
| `equipmentAvailable`| string[] | No       | Available equipment list                                   |

**Response (200):**

```json
{
  "id": "workout-uuid-...",
  "status": "pending"
}
```

---

### GET /api/workout/:id

Get full workout plan.

**Response (200):** Workout plan object with `planJson` containing:

```json
{
  "id": "...",
  "status": "ready",
  "planJson": {
    "title": "Strength Building Program",
    "summary": "...",
    "days": [
      {
        "dayIndex": 1,
        "dayName": "Monday",
        "isWorkoutDay": true,
        "session": {
          "mode": "strength",
          "focus": "Upper Body Push",
          "durationMinutes": 45,
          "intensity": "moderate",
          "warmup": ["5 min light cardio", "Arm circles"],
          "main": [
            {
              "name": "Bench Press",
              "type": "strength",
              "sets": 4,
              "reps": "8-10",
              "restSeconds": 90,
              "notes": "Focus on controlled eccentric"
            }
          ],
          "finisher": ["3x12 Cable Flyes"],
          "cooldown": ["Chest stretch 30s each side"],
          "coachingCues": ["Keep shoulder blades retracted"]
        }
      },
      {
        "dayIndex": 2,
        "dayName": "Tuesday",
        "isWorkoutDay": false,
        "session": null
      }
    ],
    "progressionNotes": ["Increase weight by 2.5-5 lbs when..."]
  }
}
```

---

### GET /api/workout/:id/status

Poll workout plan generation status.

**Response (200):**

```json
{
  "status": "ready",
  "errorMessage": null
}
```

---

### GET /api/workouts

Get all of the current user's workout plans (excludes soft-deleted).

**Response (200):** Array of workout plan objects.

---

### POST /api/workout/:id/start-date

Set or update the workout plan's start date.

**Request:**

```json
{
  "startDate": "2026-03-01"
}
```

---

### DELETE /api/workouts/:id

Soft-delete a workout plan.

**Response (200):** `{ "ok": true }`

---

### POST /api/workout/:id/regenerate-session

Regenerate a single workout session for a specific day.

**Request:**

```json
{
  "dayIndex": 3
}
```

**Response (200):** Updated workout plan object.

---

## Workout Feedback

> **Protected** — requires `Authorization: Bearer <accessToken>`

### POST /api/feedback/workout

Submit feedback for a workout session.

**Request:**

```json
{
  "workoutPlanId": "workout-uuid-...",
  "dayIndex": 1,
  "sessionKey": "upper-body-push-monday",
  "feedback": "like"
}
```

| Field           | Type    | Required | Notes                                 |
|-----------------|---------|----------|---------------------------------------|
| `workoutPlanId` | string  | No       | Associated workout plan ID            |
| `dayIndex`      | integer | Yes      |                                       |
| `sessionKey`    | string  | Yes      | Unique session identifier             |
| `feedback`      | string  | Yes      | `"like"`, `"dislike"`, or `"neutral"` |

---

### GET /api/feedback/workout/:planId

Get feedback map for all sessions in a workout plan.

**Response (200):**

```json
{
  "upper-body-push-monday": "like",
  "leg-day-wednesday": "dislike"
}
```

---

## Exercise Preferences

> **Protected** — requires `Authorization: Bearer <accessToken>`

### GET /api/preferences/exercise

Get exercise preferences.

**Response (200):**

```json
{
  "liked": [{ "id": "...", "exerciseKey": "bench-press", "exerciseName": "Bench Press", "status": "liked" }],
  "disliked": [...],
  "avoided": [...]
}
```

---

### POST /api/preferences/exercise

Add or update an exercise preference.

**Request:**

```json
{
  "exerciseKey": "bench-press",
  "exerciseName": "Bench Press",
  "status": "liked"
}
```

| Field          | Type   | Required | Notes                                     |
|----------------|--------|----------|-------------------------------------------|
| `exerciseKey`  | string | Yes      | Normalized exercise identifier            |
| `exerciseName` | string | Yes      | Display name                              |
| `status`       | string | Yes      | `"liked"`, `"disliked"`, or `"avoided"`   |

---

### DELETE /api/preferences/exercise/:id

Remove an exercise preference by ID.

---

### DELETE /api/preferences/exercise/key/:key

Remove an exercise preference by exercise key.

---

## Goal Plans

> **Protected** — requires `Authorization: Bearer <accessToken>`

Goal plans combine meal and workout plans into a unified goal with coordinated scheduling.

### POST /api/goal-plans

Create a goal plan (draft).

**Request:**

```json
{
  "goalType": "weight_loss",
  "planTypes": "both",
  "startDate": "2026-03-01"
}
```

| Field      | Type   | Required | Notes                                                                          |
|------------|--------|----------|--------------------------------------------------------------------------------|
| `goalType` | string | Yes      | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"`, `"energy"`, `"general_fitness"`, `"mobility"`, `"endurance"`, `"strength"` |
| `planTypes`| string | Yes      | `"meals"`, `"workouts"`, or `"both"`                                           |
| `startDate`| string | No       | `YYYY-MM-DD` format                                                            |

---

### POST /api/goal-plans/generate

Generate meal and/or workout plans for a goal. Uses [async generation](#async-plan-generation-pattern).

**Request:**

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
  "mealPreferences": { ... },
  "workoutPreferences": { ... }
}
```

| Field               | Type   | Required | Notes                                     |
|---------------------|--------|----------|-------------------------------------------|
| `goalType`          | string | Yes      |                                           |
| `planType`          | string | No       | `"meal"`, `"workout"`, or `"both"`. Default: `"both"` |
| `startDate`         | string | No       | `YYYY-MM-DD`                              |
| `pace`              | string | No       | e.g. `"slow"`, `"moderate"`, `"aggressive"` |
| `globalInputs`      | object | No       | Age, weight info                          |
| `mealPreferences`   | object | No       | Same fields as meal plan preferences      |
| `workoutPreferences` | object | No       | Same fields as workout plan preferences   |

**Response (200):**

```json
{
  "goalPlanId": "goal-uuid-...",
  "mealPlanId": "meal-uuid-...",
  "workoutPlanId": "workout-uuid-..."
}
```

---

### GET /api/goal-plans/:id/generation-status

Poll goal plan generation progress.

**Response (200):**

```json
{
  "goalPlanId": "goal-uuid-...",
  "status": "generating",
  "progress": {
    "stage": "NUTRITION",
    "stageStatuses": {
      "TRAINING": "DONE",
      "NUTRITION": "RUNNING",
      "SCHEDULING": "PENDING",
      "FINALIZING": "PENDING"
    }
  },
  "planType": "both",
  "mealPlan": { "id": "...", "status": "generating" },
  "workoutPlan": { "id": "...", "status": "ready" }
}
```

Stage status values: `"PENDING"`, `"RUNNING"`, `"DONE"`, `"FAILED"`, `"SKIPPED"`

---

### GET /api/goal-plans

Get all goal plans for the current user.

**Response (200):** Array of goal plan objects.

---

### GET /api/goal-plans/:id

Get a single goal plan.

---

### PATCH /api/goal-plans/:id

Update a goal plan.

**Request:**

```json
{
  "startDate": "2026-03-08",
  "mealPlanId": "meal-uuid-...",
  "workoutPlanId": "workout-uuid-..."
}
```

All fields are optional.

---

### DELETE /api/goal-plans/:id

Soft-delete a goal plan.

**Response (200):** `{ "ok": true }`

---

### GET /api/goal-plans/conflicts

Check for date conflicts before scheduling a goal plan.

**Response (200):**

```json
{
  "occupiedDates": ["2026-03-01", "2026-03-02", "2026-03-03"]
}
```

---

## Calendar

> **Protected** — requires `Authorization: Bearer <accessToken>`

### GET /api/calendar/all

Get the full calendar with all scheduled meals across all active plans.

**Response (200):**

```json
{
  "mealSlots": ["breakfast", "lunch", "dinner"],
  "days": [...]
}
```

---

### GET /api/calendar/occupied-dates?excludePlanId=

Get dates that already have meal plans scheduled. Use `excludePlanId` to exclude a specific plan (useful when rescheduling).

**Response (200):**

```json
{
  "occupiedDates": ["2026-03-01", "2026-03-02"]
}
```

---

### GET /api/calendar/workout-occupied-dates?excludePlanId=

Get dates that already have workout plans scheduled.

**Response (200):**

```json
{
  "occupiedDates": ["2026-03-01", "2026-03-03"]
}
```

---

### GET /api/calendar/workouts

Get the workout calendar.

**Response (200):**

```json
{
  "days": [...]
}
```

---

### GET /api/plan/:id/calendar

Get the calendar view for a specific meal plan.

**Response (200):**

```json
{
  "planId": "...",
  "startDate": "2026-03-01",
  "mealSlots": ["breakfast", "lunch", "dinner"],
  "days": [...]
}
```

---

### GET /api/availability?excludeGoalId=

Get available and occupied dates for scheduling.

**Response (200):**

```json
{
  "mealDates": ["2026-03-01", "2026-03-02"],
  "workoutDates": ["2026-03-01"],
  "allDates": ["2026-03-01", "2026-03-02"]
}
```

---

## Ingredient Proposals

> **Protected** — requires `Authorization: Bearer <accessToken>`

When a user dislikes a meal, the system may propose specific ingredients to avoid in future plans.

### GET /api/ingredient-proposals

Get all unresolved ingredient proposals.

**Response (200):** Array of proposal objects.

---

### POST /api/ingredient-proposals/:id/resolve

Resolve an ingredient proposal.

**Request:**

```json
{
  "chosenIngredients": ["cilantro", "fish sauce"],
  "action": "accepted"
}
```

| Field               | Type     | Required | Notes                          |
|---------------------|----------|----------|--------------------------------|
| `chosenIngredients`  | string[] | Yes      | Ingredients selected to avoid  |
| `action`            | string   | Yes      | `"accepted"` or `"declined"`  |

---

## Check-ins

> **Protected** — requires `Authorization: Bearer <accessToken>`

Weekly check-ins track progress for goal plans.

### POST /api/check-ins

Submit a weekly check-in.

**Request:**

```json
{
  "goalPlanId": "goal-uuid-...",
  "weekStartDate": "2026-03-01",
  "weightStart": 180,
  "weightEnd": 178.5,
  "energyRating": 4,
  "complianceMeals": 85,
  "complianceWorkouts": 100,
  "notes": "Felt great this week"
}
```

| Field                | Type    | Required | Notes                              |
|----------------------|---------|----------|------------------------------------|
| `goalPlanId`         | string  | No       | Associated goal plan               |
| `weekStartDate`      | string  | Yes      | `YYYY-MM-DD` format                |
| `weightStart`        | number  | No       |                                    |
| `weightEnd`          | number  | No       |                                    |
| `energyRating`       | integer | No       | 1–5                                |
| `complianceMeals`    | integer | No       | 0–100 percentage                   |
| `complianceWorkouts` | integer | No       | 0–100 percentage                   |
| `notes`              | string  | No       | Free-text notes                    |

---

### GET /api/check-ins?goalPlanId=

Get check-ins, optionally filtered by goal plan.

**Response (200):** Array of check-in objects.

---

## Performance

> **Protected** — requires `Authorization: Bearer <accessToken>`

### GET /api/performance/latest

Get the most recent performance summary.

**Response (200):** Performance summary object or `null`.

---

### GET /api/performance?from=&to=

Get performance summaries within a date range. If no range is provided, returns the last 10 summaries.

| Query Param | Type   | Required | Notes           |
|-------------|--------|----------|-----------------|
| `from`      | string | No       | `YYYY-MM-DD`    |
| `to`        | string | No       | `YYYY-MM-DD`    |

**Response (200):** Array of performance summary objects.

---

## Weekly Adaptation

> **Protected** — requires `Authorization: Bearer <accessToken>`

The adaptive engine adjusts future plans based on user behavior and check-in data.

### POST /api/weekly-adaptation/compute

Trigger computation of the weekly adaptation record.

**Response (200):** Adaptation record object.

---

### GET /api/weekly-adaptation/latest

Get the most recent adaptation record.

**Response (200):** Adaptation object or `null`.

---

## Daily Planning

> **Protected** — requires `Authorization: Bearer <accessToken>`

Daily plans generate single-day meals or workouts on demand. They use the [async generation pattern](#async-plan-generation-pattern).

### POST /api/daily-meal

Generate a daily meal plan.

**Request:**

```json
{
  "date": "2026-03-15",
  "mealsPerDay": 3
}
```

| Field        | Type    | Required | Notes                  |
|--------------|---------|----------|------------------------|
| `date`       | string  | Yes      | `YYYY-MM-DD` format    |
| `mealsPerDay`| integer | Yes      | `2` or `3`             |

**Response (200):**

```json
{
  "id": "daily-meal-uuid-...",
  "status": "pending"
}
```

---

### GET /api/daily-meal/:date

Get a daily meal plan by date (`YYYY-MM-DD`).

**Response (200):** Daily meal object.

**Errors:** `404` no daily meal for that date.

---

### GET /api/daily-meals?start=&end=

Get daily meals within a date range.

| Query Param | Type   | Required | Notes        |
|-------------|--------|----------|--------------|
| `start`     | string | Yes      | `YYYY-MM-DD` |
| `end`       | string | Yes      | `YYYY-MM-DD` |

**Response (200):** Array of daily meal objects.

---

### POST /api/daily-meal/:date/regenerate

Regenerate a daily meal plan for the specified date.

**Response (200):**

```json
{
  "id": "daily-meal-uuid-...",
  "status": "pending"
}
```

---

### POST /api/daily-workout

Generate a daily workout.

**Request:**

```json
{
  "date": "2026-03-15"
}
```

**Response (200):**

```json
{
  "id": "daily-workout-uuid-...",
  "status": "pending"
}
```

---

### GET /api/daily-workout/:date

Get a daily workout by date.

**Errors:** `404` no daily workout for that date.

---

### GET /api/daily-workouts?start=&end=

Get daily workouts within a date range.

---

### POST /api/daily-workout/:date/regenerate

Regenerate a daily workout for the specified date.

---

### GET /api/daily-coverage?start=&end=

Check which dates have daily meal and/or workout coverage.

**Response (200):**

```json
{
  "2026-03-15": { "meal": true, "workout": true },
  "2026-03-16": { "meal": true, "workout": false }
}
```

---

## Completions

> **Protected** — requires `Authorization: Bearer <accessToken>`

Track meal and workout completion for adherence scoring.

### GET /api/completions?date=&sourceType=

Get completions, optionally filtered by date and source type.

| Query Param  | Type   | Required | Notes                    |
|--------------|--------|----------|--------------------------|
| `date`       | string | No       | `YYYY-MM-DD`             |
| `sourceType` | string | No       | Filter by source type    |

**Response (200):** Array of completion objects.

---

### POST /api/completions/toggle

Toggle the completion status of a meal or workout item.

**Request:**

```json
{
  "date": "2026-03-15",
  "itemType": "meal",
  "sourceType": "plan",
  "sourceId": "plan-uuid-...",
  "itemId": "breakfast-day1"
}
```

| Field       | Type   | Required | Notes                              |
|-------------|--------|----------|------------------------------------|
| `date`      | string | Yes      | `YYYY-MM-DD`                       |
| `itemType`  | string | Yes      | e.g. `"meal"`, `"workout"`         |
| `sourceType`| string | Yes      | e.g. `"plan"`, `"daily"`           |
| `sourceId`  | string | Yes      | ID of the plan or daily plan       |
| `itemId`    | string | Yes      | Specific item within the plan      |

---

### GET /api/completions/adherence?start=&end=

Get adherence data for a date range.

| Query Param | Type   | Required | Notes        |
|-------------|--------|----------|--------------|
| `start`     | string | Yes      | `YYYY-MM-DD` |
| `end`       | string | Yes      | `YYYY-MM-DD` |

**Response (200):** Adherence data object.

---

## Async Plan Generation Pattern

Meal plans, workout plans, goal plans, and daily plans all use asynchronous generation. The client flow is:

```
1. POST  →  Create the plan (returns immediately with status "pending")
2. Poll  →  GET .../status every 2-3 seconds
3. Ready →  When status === "ready", GET the full plan data
4. Error →  If status === "failed", show error and allow retry
```

**Example flow for a meal plan:**

```
POST /api/plan
  → 200 { id: "abc", status: "pending", ... }

GET /api/plan/abc/status     (poll every 2-3s)
  → 200 { id: "abc", status: "generating" }

GET /api/plan/abc/status     (poll again)
  → 200 { id: "abc", status: "ready" }

GET /api/plan/abc            (fetch full plan)
  → 200 { id: "abc", status: "ready", planJson: { ... }, ... }
```

**Status values:**
- `"pending"` — Plan creation accepted, generation not yet started
- `"generating"` — AI generation in progress
- `"ready"` — Generation complete, full data available
- `"failed"` — Generation failed (check `errorMessage`)

**Goal plan generation** adds multi-stage progress tracking:
- Stages: `TRAINING` → `NUTRITION` → `SCHEDULING` → `FINALIZING`
- Each stage has its own status: `PENDING`, `RUNNING`, `DONE`, `FAILED`, `SKIPPED`

---

## Rate Limits

| Resource             | Limit                          | Scope     | Status Code |
|----------------------|--------------------------------|-----------|-------------|
| AI generation calls  | 10 per day                     | Per user  | `429`       |
| Meal swaps           | Unlimited                      | —         | —           |
| Day regenerations    | Unlimited                      | —         | —           |
| Workout session regens | Unlimited                    | —         | —           |

Swaps and regenerations have no budget or allowance limits. Only the global daily AI call limit applies.

---

## Common Error Responses

All error responses follow the format:

```json
{
  "message": "Human-readable error description",
  "errors": []
}
```

| Status | Meaning                | Notes                                    |
|--------|------------------------|------------------------------------------|
| `400`  | Bad Request            | Validation error. May include `errors` array with field-level details. |
| `401`  | Unauthorized           | Missing, invalid, or expired auth token. |
| `403`  | Forbidden              | Action not allowed (e.g., swap limit reached). |
| `404`  | Not Found              | Resource does not exist or is soft-deleted. |
| `409`  | Conflict               | Resource already exists (e.g., duplicate profile). |
| `429`  | Too Many Requests      | Rate limit exceeded. Retry after the reset period. |
| `500`  | Internal Server Error  | Unexpected server error. |

---

## Authorization Header

For all protected endpoints, include the access token:

```
Authorization: Bearer eyJhbGciOi...
```

When the access token expires (401 response), use `POST /api/auth/refresh` with the stored refresh token to obtain a new access token. Implement automatic token refresh in your HTTP client layer.
