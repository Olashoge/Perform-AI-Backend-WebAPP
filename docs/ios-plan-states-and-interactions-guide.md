# iOS Guide: Plan States & Like/Dislike Behavior

This document covers two critical systems for iOS feature parity:
1. **Plan Lifecycle States** — How plans are categorized as Active, Scheduled, Draft (Unscheduled), or Completed
2. **Like & Dislike** — How feedback buttons work across all plan types

> **⚠️ Deprecation Notice:** All meal swap, meal day regeneration, workout session regeneration, and allowance/budget features have been **intentionally removed** for launch simplification. Any references to swap, regeneration, or allowance below are outdated and should be ignored. These features may return in a future release.

---

## Part 1: Plan Lifecycle States

### Overview

Plans do **not** have an explicit "lifecycle status" column in the database. The state is **derived client-side** from the relationship between today's date and the plan's `planStartDate` (or `startDate` for goal plans).

There are 4 states:

| State | Condition | Badge Color | Icon |
|:------|:----------|:------------|:-----|
| **Draft** (Unscheduled) | `planStartDate` is `null` | Gray | Clock |
| **Scheduled** | `planStartDate` is in the future | Blue | CalendarCheck |
| **Active** | Today falls within the 7-day window `[startDate, startDate + 6 days]` | Green | Activity |
| **Completed** | The 7-day window has passed (today ≥ startDate + 7 days) | Gray | CheckCircle2 |

### The Derivation Function

This is the exact logic used on the web. Implement this identically on iOS:

```
function derivePlanStatus(startDate: string | null | undefined):
  if startDate is null or undefined → return "draft"
  
  start = parseDate(startDate + "T00:00:00")
  today = todayAtMidnight()  // current date with time zeroed
  end = start + 7 days
  
  if today < start → return "scheduled"
  if today < end → return "active"
  return "completed"
```

### Which Database Field Determines State

| Plan Type | Page Name | API Endpoint | Date Field in Response |
|:----------|:----------|:-------------|:-----------------------|
| Meal Plan | Nutrition | `GET /api/plans` | `planStartDate` (string `"YYYY-MM-DD"` or `null`) |
| Workout Plan | Training | `GET /api/workouts` | `planStartDate` (string `"YYYY-MM-DD"` or `null`) |
| Goal Plan | Wellness | `GET /api/goal-plans` | `startDate` (string `"YYYY-MM-DD"` or `null`) |

### Important: The `status` Field Is NOT Lifecycle Status

Each plan also has a `status` field, but this tracks **AI generation state**, not lifecycle:
- `"generating"` — AI is still creating the plan (show spinner)
- `"ready"` — Plan is fully generated (derive lifecycle from date)
- `"failed"` — AI generation failed (show error badge)

Only derive the lifecycle state (draft/scheduled/active/completed) when `status === "ready"`.

### Scheduling a Plan (Setting the Start Date)

A plan starts as "Draft" (no start date). The user schedules it by setting a start date:

**Meal Plans:**
```
PATCH /api/plan/:id/start-date
Body: { "startDate": "2026-03-01" }

To unschedule (revert to Draft):
Body: { "startDate": null }
```

**Workout Plans:**
```
POST /api/workout/:id/start-date
Body: { "startDate": "2026-03-01" }

To unschedule:
Body: { "startDate": null }
```

**Goal Plans:**
```
PATCH /api/goal-plans/:id
Body: { "startDate": "2026-03-01" }

To unschedule:
Body: { "startDate": null }
```

A start date can also be provided at plan creation time. If the user picks a date during the generation flow, it's sent in the creation request body and the plan starts as Scheduled (or Active if the date is today).

### List Page Display Rules

On the Nutrition and Training list pages:
1. All plans (regardless of state) appear in a single flat list
2. The section header always reads "Active Plans" (this is a legacy label — it shows all plans)
3. Plans with a start date are sorted by date (ascending or descending, toggled by sort button)
4. Plans without a start date (Drafts) sort to the bottom, ordered by `createdAt` descending
5. Each plan card shows a status badge (Draft/Scheduled/Active/Completed) next to the title
6. Date range is displayed as "Mar 1 – Mar 7, 2026" for scheduled/active/completed plans
7. Draft plans show "Created: Mar 1, 2026" instead of a date range
8. Plans with `status === "generating"` show a spinning "Generating" badge instead of lifecycle badge
9. Plans with `status === "failed"` show a red "Failed" badge

### Soft Deletion

Plans are soft-deleted (set `deletedAt` timestamp, not removed from DB). The API filters them out automatically — deleted plans never appear in list responses.

```
DELETE /api/plans/:id        (meal plan)
DELETE /api/workouts/:id     (workout plan)
DELETE /api/goal-plans/:id   (goal plan)
```

---

## Part 2: Like, Dislike & Regenerate

### 2A. Meal Feedback (Like/Dislike for Meals)

Applies to: **7-day meal plans** and **daily meal plans**

**API Endpoint:** `POST /api/feedback/meal`

**Request Body:**
```json
{
  "planId": "plan-uuid-here",
  "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
  "mealName": "Greek Veggie Omelet",
  "cuisineTag": "Mediterranean",
  "feedback": "like",
  "ingredients": ["egg", "spinach", "feta cheese", "olive oil", "tomato"]
}
```

**Fields:**
- `planId` — The meal plan ID (required)
- `mealFingerprint` — Unique identifier: `slugifiedName|slugifiedCuisine|firstKeyIngredient`. Slugify = lowercase, replace non-alphanumeric with hyphens
- `mealName` — Human-readable name
- `cuisineTag` — Cuisine category
- `feedback` — One of: `"like"`, `"dislike"`, `"neutral"`
- `ingredients` — Array of ingredient strings from the meal

**What Happens on the Backend:**

1. **Upsert:** Feedback is saved/updated in `meal_feedback` table (keyed by `userId + mealFingerprint`)

2. **If "like":** Key ingredients are automatically extracted and saved as `"prefer"` in `ingredient_preferences` (labeled as `"derived"`)

3. **If "dislike":** The backend creates an **Ingredient Proposal** — a record containing the meal's key ingredients. The response includes:
   ```json
   {
     "record": { ... },
     "feedback": "dislike",
     "proposalId": "proposal-uuid",
     "proposalIngredients": ["egg", "feta cheese", "olive oil"]
   }
   ```
   The iOS app should then show a modal asking "Which ingredients didn't you like?" with the `proposalIngredients` as checkboxes.

**Resolving an Ingredient Proposal (after dislike):**
```
POST /api/ingredient-proposals/:proposalId/resolve
Body: {
  "chosenIngredients": ["feta cheese"],
  "action": "accepted"
}
```
- `action: "accepted"` — Selected ingredients are saved as `"avoid"` in `ingredient_preferences`
- `action: "dismissed"` — No ingredients are avoided, proposal is just closed

**Fetching Existing Feedback (for restoring button states):**
```
GET /api/preferences
```
Response:
```json
{
  "likedMeals": [{ "id": "...", "mealFingerprint": "...", "mealName": "...", "feedback": "like" }],
  "dislikedMeals": [{ "id": "...", "mealFingerprint": "...", "mealName": "...", "feedback": "dislike" }],
  "avoidIngredients": [{ "id": "...", "ingredientName": "feta cheese", "preference": "avoid" }],
  "preferIngredients": [{ "id": "...", "ingredientName": "egg", "preference": "prefer" }]
}
```

**Removing Meal Feedback:**
```
DELETE /api/preferences/meal/:feedbackId
```

**Removing Ingredient Preference:**
```
DELETE /api/preferences/ingredient/:preferenceId
```

### 2B. Workout Session Feedback (Like/Dislike for Workout Days)

Applies to: **7-day workout plans** (whole session level, e.g., "Push Day")

**API Endpoint:** `POST /api/feedback/workout`

**Request Body:**
```json
{
  "workoutPlanId": "plan-uuid",
  "sessionKey": "day_1",
  "feedback": "like"
}
```

- `sessionKey` format: `"day_1"` through `"day_7"`
- `feedback`: `"like"` or `"dislike"`

**Fetching Existing Session Feedback:**
```
GET /api/feedback/workout/:planId
```
Response (map of session key → feedback):
```json
{
  "day_1": "like",
  "day_3": "dislike"
}
```

### 2C. Exercise Feedback (Like/Dislike for Individual Exercises)

Applies to: **7-day workout plans** and **daily workout plans** (per-exercise level)

**API Endpoint:** `POST /api/preferences/exercise`

**Request Body:**
```json
{
  "exerciseKey": "barbell_back_squat",
  "exerciseName": "Barbell Back Squat",
  "status": "liked"
}
```

**Exercise Key Format (CRITICAL):**
```
exerciseName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
```
Example: `"Barbell Back Squat"` → `"barbell_back_squat"` (underscores, NOT hyphens)

**Status Values:**
- `"liked"` — User likes this exercise
- `"disliked"` — User dislikes (but doesn't want to fully avoid)
- `"avoided"` — User never wants to see this exercise again

**Dislike Flow (Avoid Modal):**
When the user taps dislike on an exercise, show a modal with two options:
1. **"Just Dislike"** → Save with `status: "disliked"`
2. **"Avoid Completely"** → Save with `status: "avoided"`

**Fetching Existing Exercise Preferences:**
```
GET /api/preferences/exercise
```
Response:
```json
{
  "liked": [{ "id": "...", "exerciseKey": "barbell_back_squat", "exerciseName": "Barbell Back Squat", "status": "liked" }],
  "disliked": [{ "id": "...", "exerciseKey": "burpees", "exerciseName": "Burpees", "status": "disliked" }],
  "avoided": [{ "id": "...", "exerciseKey": "box_jumps", "exerciseName": "Box Jumps", "status": "avoided" }]
}
```

**Removing Exercise Preference:**
```
DELETE /api/preferences/exercise/:id          (by record ID)
DELETE /api/preferences/exercise/key/:key     (by exercise key string)
```

**Toggle Behavior:**
- Tap Like when neutral → save as `"liked"`
- Tap Like when already liked → DELETE the preference (returns to neutral)
- Tap Dislike when neutral → show Avoid modal → save as `"disliked"` or `"avoided"`
- Tap Dislike when already disliked/avoided → DELETE the preference (returns to neutral)
- Tap Like when disliked → overwrite to `"liked"` (POST upserts)
- Tap Dislike when liked → show Avoid modal → overwrite to `"disliked"` or `"avoided"`

### 2D. Meal Swap (Replace One Meal)

Applies to: **7-day meal plans only**

**API Endpoint:** `POST /api/plan/:planId/swap`

**Request Body:**
```json
{
  "dayIndex": 1,
  "mealType": "lunch"
}
```

- `dayIndex`: 1–7
- `mealType`: `"breakfast"`, `"lunch"`, or `"dinner"`

**Response:** Updated full meal plan JSON (the swapped meal is already replaced in the response)

**Backend behavior:**
1. Checks allowance budget (see §2F below)
2. Falls back to legacy limit: max 3 swaps per plan if no allowance system
3. Checks daily AI call limit (10/day)
4. Calls AI to generate a replacement meal (using existing meal as negative reference)
5. Updates plan JSON in-place
6. Increments `swapCount` on the plan
7. Triggers async grocery re-pricing

### 2E. Regenerate Day/Session

**Meal Plan — Regenerate Full Day:**
```
POST /api/plan/:planId/regenerate-day
Body: { "dayIndex": 3 }
```
- Replaces ALL meals for that day with fresh AI-generated meals
- `dayIndex`: 1–7
- Legacy fallback limit: 1 day regen per plan (if no allowance system)
- Triggers async grocery re-pricing
- Response: Updated full meal plan JSON

**Workout Plan — Regenerate Session:**
```
POST /api/workout/:planId/regenerate-session
Body: { "dayIndex": 2 }
```
- Replaces the workout session for that day
- `dayIndex`: 1–7
- Passes avoided/disliked exercises to AI so they won't appear in the new session
- Response: Updated full workout plan JSON

**Daily Meal — Regenerate:**
```
POST /api/daily-meal/:date/regenerate
```
- Regenerates the daily meal plan for the given date (YYYY-MM-DD)
- Sets status to `"generating"` — must poll `GET /api/daily-meal/:date` until `status === "ready"`

**Daily Workout — Regenerate:**
```
POST /api/daily-workout/:date/regenerate
```
- Regenerates the daily workout for the given date (YYYY-MM-DD)
- Sets status to `"generating"` — must poll `GET /api/daily-workout/:date` until `status === "ready"`

### 2F. Allowance System (Swap/Regen Budget)

The allowance system governs how many swaps and regens a user can perform. It's tied to the user's active goal plan.

**Fetching Current Allowance State:**
```
GET /api/allowance
```
Response:
```json
{
  "goalPlanId": "goal-uuid",
  "allowanceId": "allowance-uuid",
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
    "regensUsed": 2,
    "regensLimit": 5
  },
  "cooldown": {
    "active": false,
    "minutesRemaining": 0
  },
  "flexTokensAvailable": 1,
  "coachInsight": "Great consistency this week!"
}
```

**Default Limits:**

| Limit | Default | Scope |
|:------|:--------|:------|
| Meal swaps per day | 2 | Resets daily at midnight UTC |
| Workout swaps per day | 2 | Resets daily at midnight UTC |
| Meal regens per day | 1 | Resets daily at midnight UTC |
| Workout regens per day | 1 | Resets daily at midnight UTC |
| Total regens per plan | 5 | Lifetime of the goal plan (minimum 3) |

**Cooldown:**
- If a user regenerates 3+ times within 24 hours, a **6-hour cooldown** is triggered
- During cooldown, all regen requests are rejected with `403` and `cooldownMinutesRemaining`
- Swaps are NOT affected by cooldown

**Error Responses When Budget Exceeded:**
```json
// Daily limit hit
{ "message": "Daily meal swap limit reached (2/2)", "nextResetAt": "2026-02-25T00:00:00Z" }

// Cooldown active
{ "message": "Regeneration cooldown active", "cooldownMinutesRemaining": 47 }

// Plan lifetime limit hit
{ "message": "Plan regeneration limit reached (5/5)" }

// AI daily limit
{ "message": "Daily AI call limit reached (10/day). Try again tomorrow." }
```
HTTP status: `403` for budget/cooldown, `429` for AI rate limit

**Flex Tokens:**
Users earn flex tokens via 7-day streaks. They can redeem them for extra regens:
```
POST /api/flex-tokens/:tokenId/redeem
```
This decrements `mealRegensUsedToday` by 1, effectively granting one extra regen.

### 2G. Impact on AI Generation

All feedback flows directly into future AI plan generation:

**Meal Preferences** → `getUserPreferenceContext()` returns liked/disliked meals and avoid/prefer ingredients, injected into AI prompts for:
- New 7-day meal plan generation
- Meal swaps (negative reference + preference context)
- Day regeneration
- Daily meal generation

**Exercise Preferences** → Avoided and disliked exercises are passed to:
- Workout session regeneration (`avoidedExercises`, `dislikedExercises`)
- New workout plan generation
- Daily workout generation

This creates a learning loop: the more feedback a user gives, the more personalized their future plans become.

---

## Quick Reference: All Feedback & Interaction Endpoints

| Action | Method | Endpoint | Body |
|:-------|:-------|:---------|:-----|
| Like/Dislike meal | POST | `/api/feedback/meal` | `{planId, mealFingerprint, mealName, cuisineTag, feedback, ingredients}` |
| Resolve ingredient proposal | POST | `/api/ingredient-proposals/:id/resolve` | `{chosenIngredients, action}` |
| Like/Dislike workout session | POST | `/api/feedback/workout` | `{workoutPlanId, sessionKey, feedback}` |
| Like/Dislike/Avoid exercise | POST | `/api/preferences/exercise` | `{exerciseKey, exerciseName, status}` |
| Swap single meal | POST | `/api/plan/:id/swap` | `{dayIndex, mealType}` |
| Regen meal day | POST | `/api/plan/:id/regenerate-day` | `{dayIndex}` |
| Regen workout session | POST | `/api/workout/:id/regenerate-session` | `{dayIndex}` |
| Regen daily meal | POST | `/api/daily-meal/:date/regenerate` | — |
| Regen daily workout | POST | `/api/daily-workout/:date/regenerate` | — |
| Schedule meal plan | PATCH | `/api/plan/:id/start-date` | `{startDate}` |
| Schedule workout plan | POST | `/api/workout/:id/start-date` | `{startDate}` |
| Schedule goal plan | PATCH | `/api/goal-plans/:id` | `{startDate}` |
| Delete meal plan | DELETE | `/api/plans/:id` | — |
| Delete workout plan | DELETE | `/api/workouts/:id` | — |
| Delete goal plan | DELETE | `/api/goal-plans/:id` | — |
| Get allowance state | GET | `/api/allowance` | — |
| Redeem flex token | POST | `/api/flex-tokens/:tokenId/redeem` | — |
| Get all preferences | GET | `/api/preferences` | — |
| Get exercise preferences | GET | `/api/preferences/exercise` | — |
| Get workout session feedback | GET | `/api/feedback/workout/:planId` | — |
| Remove meal feedback | DELETE | `/api/preferences/meal/:id` | — |
| Remove ingredient pref | DELETE | `/api/preferences/ingredient/:id` | — |
| Remove exercise pref (by ID) | DELETE | `/api/preferences/exercise/:id` | — |
| Remove exercise pref (by key) | DELETE | `/api/preferences/exercise/key/:key` | — |
