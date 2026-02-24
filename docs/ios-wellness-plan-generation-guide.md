# iOS Guide: Wellness Plan Generation — Step-by-Step Implementation

This document is specifically for debugging and implementing Wellness Plan (Goal Plan) generation from the iOS app. If your forms fill correctly but the plan doesn't generate, this guide will help you find the exact issue.

---

## The Complete Flow (Overview)

```
1. iOS form collects data across 4 steps
2. POST /api/goal-plans/generate with the full body
3. Server returns { goalPlanId, mealPlanId: null, workoutPlanId: null }
4. Navigate to a "generating" screen
5. Poll GET /api/goal-plans/:goalPlanId/generation-status every 2 seconds
6. When status === "ready", navigate to the plan view
```

---

## Step 1: The Exact Request Body

```
POST /api/goal-plans/generate
Content-Type: application/json
Authorization: Bearer <accessToken>
```

Here is a **complete example** of a "both" (meal + workout) generation request — this is the exact shape the web app sends:

```json
{
  "goalType": "weight_loss",
  "planType": "both",
  "startDate": "2026-03-01",
  "pace": "steady",
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
    "cookingTime": "normal",
    "mealsPerDay": 3,
    "allergies": "",
    "spiceLevel": "medium",
    "authenticityMode": "mixed",
    "weightUnit": "lb"
  },
  "workoutPreferences": {
    "goal": "weight_loss",
    "location": "gym",
    "trainingMode": "both",
    "focusAreas": ["Full Body"],
    "daysOfWeek": ["Mon", "Wed", "Fri"],
    "sessionLength": 45,
    "experienceLevel": "intermediate",
    "limitations": "",
    "equipmentAvailable": ["Dumbbells", "Barbell", "Bench"]
  }
}
```

---

## Step 2: Field-by-Field Reference

### Top-Level Fields

| Field | Type | Required | Valid Values | Notes |
|:------|:-----|:---------|:-------------|:------|
| `goalType` | string | **YES** | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"`, `"energy"`, `"general_fitness"`, `"mobility"`, `"endurance"`, `"strength"` | This is the user's primary wellness goal. |
| `planType` | string | No | `"both"` (default), `"meal"`, `"workout"` | Determines which sub-plans get generated. |
| `startDate` | string | No | `"YYYY-MM-DD"` or omit entirely | If omitted, plan starts as Draft (unscheduled). |
| `pace` | string | No | `"gentle"`, `"steady"`, `"aggressive"` or omit | Influences AI intensity. |
| `globalInputs` | object | No | See below | Physical stats, pre-filled from profile. |
| `mealPreferences` | object | **YES if planType includes "meal"** | See below | Full meal plan configuration. |
| `workoutPreferences` | object | **YES if planType includes "workout"** | See below | Full workout plan configuration. |

### `globalInputs` Object (Optional)

| Field | Type | Notes |
|:------|:-----|:------|
| `age` | number | Integer, from profile |
| `currentWeight` | number | From profile |
| `targetWeight` | number | From profile |
| `weightUnit` | string | `"lb"` or `"kg"`, default `"lb"` |

### `mealPreferences` Object

**Every field listed here that is marked Required MUST be present.** Missing required fields cause silent validation failures on the backend.

| Field | Type | Required | Valid Values | Default |
|:------|:-----|:---------|:-------------|:--------|
| `goal` | string | **YES** | `"weight_loss"`, `"muscle_gain"`, `"energy"`, `"maintenance"`, `"performance"` | — |
| `dietStyles` | string[] | **YES (min 1)** | Any strings. e.g. `["Mediterranean"]`, `["No Preference"]` | — |
| `foodsToAvoid` | string[] | No | Any strings | `[]` |
| `householdSize` | number | **YES** | Integer 1–8 | — |
| `prepStyle` | string | **YES** | `"cook_daily"`, `"batch_2day"`, `"batch_3to4day"` | — |
| `budgetMode` | string | **YES** | `"normal"`, `"budget_friendly"` | — |
| `cookingTime` | string | **YES** | `"quick"`, `"normal"` | — |
| `mealsPerDay` | number | **YES** | `2` or `3` | `3` |
| `mealSlots` | string[] | **YES if mealsPerDay is 2** | Exactly 2 from: `["breakfast", "lunch", "dinner"]` | Omit if mealsPerDay is 3 |
| `allergies` | string | No | Free text | `""` |
| `spiceLevel` | string | No | `"none"`, `"mild"`, `"medium"`, `"hot"` | `"medium"` |
| `authenticityMode` | string | No | `"traditional"`, `"weeknight"`, `"mixed"` | `"mixed"` |
| `weightUnit` | string | No | `"lb"`, `"kg"` | `"lb"` |
| `age` | number | No | 1–120 | From profile |
| `currentWeight` | number | No | | From profile |
| `targetWeight` | number | No | | From profile |
| `workoutDaysPerWeek` | number | No | 0–7 | Auto-set from workoutPreferences.daysOfWeek.length |
| `workoutDays` | string[] | No | `["Mon", "Wed", "Fri"]` etc. | Same as workoutPreferences.daysOfWeek |

### `workoutPreferences` Object

| Field | Type | Required | Valid Values | Default |
|:------|:-----|:---------|:-------------|:--------|
| `goal` | string | **YES** | `"weight_loss"`, `"muscle_gain"`, `"performance"`, `"maintenance"` | — |
| `location` | string | **YES** | `"gym"`, `"home"`, `"outdoors"`, or `""` (empty string) | `""` |
| `trainingMode` | string | **YES** | `"strength"`, `"cardio"`, `"both"` | — |
| `focusAreas` | string[] | **YES (min 1)** | e.g. `["Full Body"]`, `["Upper Body", "Core"]` | — |
| `daysOfWeek` | string[] | **YES (min 1)** | `["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]` | — |
| `sessionLength` | number | **YES** | `20`, `30`, `45`, or `60` | — |
| `experienceLevel` | string | **YES** | `"beginner"`, `"intermediate"`, `"advanced"` | — |
| `limitations` | string | No | Free text | `""` |
| `equipmentAvailable` | string[] | No | Any strings | `[]` |

---

## Step 3: Goal Type Mapping (CRITICAL)

The top-level `goalType` has 9 possible values, but `mealPreferences.goal` only accepts 5 and `workoutPreferences.goal` only accepts 4. **You MUST map the goal before sending.**

### Mapping for `mealPreferences.goal`

```
"weight_loss"     → "weight_loss"
"muscle_gain"     → "muscle_gain"
"performance"     → "performance"
"maintenance"     → "maintenance"
"energy"          → "energy"
"general_fitness" → "maintenance"
"mobility"        → "maintenance"
"endurance"       → "performance"
"strength"        → "muscle_gain"
```

### Mapping for `workoutPreferences.goal`

```
"weight_loss"     → "weight_loss"
"muscle_gain"     → "muscle_gain"
"performance"     → "performance"
"maintenance"     → "maintenance"
"energy"          → "maintenance"
"general_fitness" → "maintenance"
"mobility"        → "maintenance"
"endurance"       → "performance"
"strength"        → "muscle_gain"
```

**If you send `goalType: "energy"` as the `workoutPreferences.goal`, it will fail validation** because the workout schema only accepts 4 values.

---

## Step 4: Handle the POST Response

### Success (HTTP 200)

```json
{
  "goalPlanId": "uuid-string-here",
  "mealPlanId": null,
  "workoutPlanId": null
}
```

**The plan is NOT ready.** `mealPlanId` and `workoutPlanId` are null at this point. You must navigate to a generating/loading screen and start polling.

### Error Responses

**Missing goalType (HTTP 400):**
```json
{ "message": "goalType is required" }
```

**Profile not set up (HTTP 400):**
```json
{ "message": "Profile is required before creating a plan. Please set up your Performance Blueprint first." }
```

**Safety constraint blocked (HTTP 400):**
```json
{
  "message": "Plan generation blocked by safety constraints.",
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

**AI rate limit (HTTP 429):**
```json
{ "message": "Daily AI call limit reached (10/day). Try again tomorrow." }
```

**Validation failure (HTTP 400):**
```json
{ "message": "Invalid workout preferences", "errors": { ... } }
```
This happens when `mealPreferences` or `workoutPreferences` fields are wrong.

---

## Step 5: Polling for Completion

After receiving the `goalPlanId`, poll this endpoint:

```
GET /api/goal-plans/:goalPlanId/generation-status
Authorization: Bearer <accessToken>
```

### Poll every 2 seconds. Timeout after 3 minutes.

### Response Shape

```json
{
  "goalPlanId": "uuid",
  "status": "generating",
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
  "mealPlan": {
    "id": "meal-uuid",
    "status": "generating",
    "errorMessage": null
  },
  "workoutPlan": {
    "id": "workout-uuid",
    "status": "ready",
    "errorMessage": null
  }
}
```

### Stage Progression (typical "both" plan)

```
Poll 1:  TRAINING=RUNNING,  NUTRITION=PENDING,   SCHEDULING=PENDING,  FINALIZING=PENDING
Poll 5:  TRAINING=DONE,     NUTRITION=RUNNING,   SCHEDULING=PENDING,  FINALIZING=PENDING
Poll 10: TRAINING=DONE,     NUTRITION=DONE,      SCHEDULING=RUNNING,  FINALIZING=PENDING
Poll 12: TRAINING=DONE,     NUTRITION=DONE,      SCHEDULING=DONE,     FINALIZING=RUNNING
Poll 13: TRAINING=DONE,     NUTRITION=DONE,      SCHEDULING=DONE,     FINALIZING=DONE
         status = "ready"  ← STOP POLLING, navigate to plan view
```

### For "meal" only plan:
```
TRAINING=SKIPPED, NUTRITION=RUNNING → DONE, SCHEDULING → DONE, FINALIZING → DONE
```

### For "workout" only plan:
```
TRAINING=RUNNING → DONE, NUTRITION=SKIPPED, SCHEDULING → DONE, FINALIZING → DONE
```

### Stage Status Values

| Value | Meaning |
|:------|:--------|
| `"PENDING"` | Not started yet |
| `"RUNNING"` | Currently generating |
| `"DONE"` | Completed successfully |
| `"FAILED"` | Generation failed |
| `"SKIPPED"` | Not needed for this plan type |

### Completion Detection

```
if (response.status === "ready") → Navigate to plan view
if (response.status === "failed") → Show error from progress.errorMessage
if (any stageStatus === "FAILED") → Show error
```

---

## Step 6: Fetch the Completed Plan

Once `status === "ready"`:

```
GET /api/goal-plans/:goalPlanId
```

The response includes `mealPlanId` and `workoutPlanId`. Fetch each sub-plan:

```
GET /api/plan/:mealPlanId       → Full 7-day meal plan with recipes
GET /api/workout/:workoutPlanId → Full 7-day workout plan with exercises
```

---

## Debugging Checklist: "Why Won't My Wellness Plan Generate?"

Check these in order:

### 1. Is the HTTP response status 200?
If you get a 400, 429, or 500, read the `message` field — it tells you exactly what's wrong.

### 2. Are you reading the response correctly?
The POST returns `{ goalPlanId: "..." }`. **Not** `{ id: "..." }`. Make sure you're extracting `goalPlanId` from the response, not `id`.

### 3. Do you have `Content-Type: application/json`?
Missing this header means the server can't parse your body.

### 4. Is `goalType` present at the top level?
This is the first thing the server checks. If missing → instant 400.

### 5. Did you map the goal correctly for sub-preferences?
If `goalType` is `"energy"`, then `workoutPreferences.goal` must be `"maintenance"` (not `"energy"`). See the mapping table in Step 3.

### 6. Does `mealPreferences` have all required fields?
The most common failures:
- `dietStyles` is empty `[]` → must have at least 1 item (use `["No Preference"]` as fallback)
- `householdSize` is missing or 0 → must be 1–8
- `prepStyle` is missing → must be one of the 3 values
- `budgetMode` is missing → must be `"normal"` or `"budget_friendly"`
- `cookingTime` is missing → must be `"quick"` or `"normal"`
- `mealsPerDay` is missing → must be 2 or 3

### 7. Does `workoutPreferences` have all required fields?
Common failures:
- `focusAreas` is empty `[]` → must have at least 1 item
- `daysOfWeek` is empty `[]` → must have at least 1 day
- `sessionLength` is not one of `[20, 30, 45, 60]` → must be exactly one of these
- `location` is missing → can be `""` (empty string) but must be present

### 8. Are you polling after the POST?
The POST only starts generation. If you don't poll `GET /api/goal-plans/:goalPlanId/generation-status`, you'll never see the result.

### 9. Are you using the right polling endpoint?
Must be `/api/goal-plans/:goalPlanId/generation-status` (NOT `/api/goal-plans/:id/status` or `/api/goal-plans/:id`).

### 10. Is the profile set up?
Call `GET /api/profile` first. If it returns 404, the user needs to complete their Performance Blueprint before any plan can be generated.

---

## Minimal Working Example

If you want to test with the absolute minimum fields:

```json
{
  "goalType": "maintenance",
  "planType": "meal",
  "mealPreferences": {
    "goal": "maintenance",
    "dietStyles": ["No Preference"],
    "householdSize": 1,
    "prepStyle": "cook_daily",
    "budgetMode": "normal",
    "cookingTime": "normal",
    "mealsPerDay": 3,
    "spiceLevel": "medium",
    "authenticityMode": "mixed"
  }
}
```

This is the smallest possible valid body for a meal-only wellness plan. If this works but your full form doesn't, add fields back one at a time to find which one is causing the validation failure.

---

## Workout-Only Minimal Example

```json
{
  "goalType": "maintenance",
  "planType": "workout",
  "workoutPreferences": {
    "goal": "maintenance",
    "location": "gym",
    "trainingMode": "both",
    "focusAreas": ["Full Body"],
    "daysOfWeek": ["Mon", "Wed", "Fri"],
    "sessionLength": 45,
    "experienceLevel": "intermediate"
  }
}
```

---

## Both (Meal + Workout) Minimal Example

```json
{
  "goalType": "maintenance",
  "planType": "both",
  "mealPreferences": {
    "goal": "maintenance",
    "dietStyles": ["No Preference"],
    "householdSize": 1,
    "prepStyle": "cook_daily",
    "budgetMode": "normal",
    "cookingTime": "normal",
    "mealsPerDay": 3,
    "spiceLevel": "medium",
    "authenticityMode": "mixed"
  },
  "workoutPreferences": {
    "goal": "maintenance",
    "location": "gym",
    "trainingMode": "both",
    "focusAreas": ["Full Body"],
    "daysOfWeek": ["Mon", "Wed", "Fri"],
    "sessionLength": 45,
    "experienceLevel": "intermediate"
  }
}
```
