# iOS App — Daily Meals & Daily Workouts Complete Guide

This document explains everything about the **Daily Planning** feature — single-day meal and workout generation. This is separate from the 7-day plans. Daily plans are quick, one-off generations for a specific date, fully auto-populated from the user's profile.

---

## Table of Contents

- [Concept: Daily Plans vs 7-Day Plans](#concept-daily-plans-vs-7-day-plans)
- [How Daily Plans Are Triggered](#how-daily-plans-are-triggered)
- [Profile Auto-Population](#profile-auto-population)
- [Daily Meal — Full Flow](#daily-meal--full-flow)
- [Daily Workout — Full Flow](#daily-workout--full-flow)
- [Regeneration](#regeneration)
- [Completion Tracking](#completion-tracking)
- [Feedback System](#feedback-system)
- [Daily Coverage API](#daily-coverage-api)
- [planJson Structures](#planjson-structures)
- [API Reference](#api-reference)
- [UI Rendering Guide](#ui-rendering-guide)
- [Error Handling](#error-handling)

---

## Concept: Daily Plans vs 7-Day Plans

| Feature | 7-Day Plans | Daily Plans |
|---------|-------------|-------------|
| Scope | 7 consecutive days | 1 specific date |
| User input | Full form with many options | Minimal: just date + mealsPerDay |
| Profile fields used | Some auto-populated, rest from form | **ALL auto-populated from profile** |
| Navigation | Plans list → Plan detail | Dashboard day → "Plan This Day" dialog → Detail view |
| Creation endpoint | `POST /api/plan` or `POST /api/workout` | `POST /api/daily-meal` or `POST /api/daily-workout` |
| Storage | `meal_plans` / `workout_plans` tables | `daily_meals` / `daily_workouts` tables |
| One per date? | No (multiple allowed) | YES (one per user per date, unique constraint) |
| Calendar blocking | Yes (7 dates blocked) | No blocking needed |
| Scheduling | Optional start date | Date is required and the plan IS that date |

**Key insight:** Daily plans require NO creation form. The user taps a date, chooses "Generate Meals" or "Generate Workout", and the backend uses their profile to generate everything automatically.

---

## How Daily Plans Are Triggered

### Step 1: User selects a day on the dashboard

The dashboard shows a week view. When the user taps a date, a "Plan This Day" dialog/bottom sheet appears.

### Step 2: "Plan This Day" dialog

This dialog checks what already exists for the selected date:

```
┌──────────────────────────────────────┐
│ Plan Monday, March 16                │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 🍽 Daily Meals                    │ │
│ │ AI-generated meals for this day  │ │
│ │                                  │ │
│ │ Meals per day:                   │ │
│ │ ○ 3 meals   ○ 2 meals           │ │  ← only choice user makes
│ │                                  │ │
│ │ [✨ Generate Meals]              │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 💪 Daily Workout                 │ │
│ │ AI-generated workout for this day│ │
│ │                                  │ │
│ │ [✨ Generate Workout]            │ │  ← no choices at all
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**States for each section:**

| State | Meal Section | Workout Section |
|-------|-------------|----------------|
| Not yet created | Shows meals-per-day radio (2 or 3, default 3) + "Generate Meals" button | Shows "Generate Workout" button |
| Already exists (ready) | Shows "Ready" badge + "View Meals" button | Shows "Ready" badge + "View Workout" button |
| Past date | Both buttons disabled + notice: "Past days are view-only. You can only create plans for today or future dates." | Same |

### Step 3: User taps Generate

The app sends the POST request and immediately navigates to the detail view (which shows a generating screen with polling).

---

## Profile Auto-Population

**This is the critical difference from 7-day plans.** Daily plans have NO creation form — the backend pulls EVERYTHING from the user's profile.

### Daily Meal — What Gets Auto-Populated from Profile

```
POST /api/daily-meal
Body: { "date": "2026-03-16", "mealsPerDay": 3 }
```

The server reads the user's profile and uses these fields:

| Profile Field | How It's Used | Fallback |
|---|---|---|
| `primaryGoal` | Sets the meal goal (e.g., weight_loss, muscle_gain) | `"maintenance"` |
| `foodsToAvoid` | HARD constraint — AI never includes these foods | `[]` |
| `allergiesIntolerances` | HARD constraint — AI never includes these | `[]` |
| `spicePreference` | Controls spice level of recipes | `"medium"` |
| `age` | Adjusts language (under 18: no "diet"/"restrict" language) | Not sent |
| `weightKg` | Used for calorie/macro calculations | Not sent |
| `targetWeightKg` | Used for calorie/macro calculations | Not sent |
| `unitSystem` | Determines if weight is shown as kg or lb | `"lb"` |
| `favoriteMealsText` | Soft constraint — AI tries to include | From profile |
| `appetiteLevel` | Influences portion sizes | From profile |
| `bodyContext` | HIGH PRIORITY body notes | From profile |
| `healthConstraints` | Safety constraints for the AI | From profile |
| `sleepHours`, `stressLevel` | Influences meal complexity | From profile |
| `activityLevel` | Influences calorie targets | From profile |
| `trainingDaysOfWeek` | Influences nutrition (more carbs on workout days) | From profile |

Additionally:
- **Adaptive Engine modifiers** are computed from check-in history and injected
- **Learned preferences** (liked/disliked meals, avoided ingredients) are fetched and injected

### Daily Workout — What Gets Auto-Populated from Profile

```
POST /api/daily-workout
Body: { "date": "2026-03-16" }
```

The server reads the user's profile and uses:

| Profile Field | How It's Used | Fallback |
|---|---|---|
| `primaryGoal` | Sets workout goal | `"maintenance"` |
| `workoutLocationDefault` | Determines available exercises | `"gym"` |
| `trainingExperience` | Sets difficulty level | `"intermediate"` |
| `sessionDurationMinutes` | Target session length | `45` |
| `healthConstraints` | Injuries/limitations the AI avoids | `[]` |
| `equipmentAvailable` | Equipment the AI can use | From profile |
| `equipmentOtherNotes` | Extra equipment context | From profile |
| `bodyContext` | HIGH PRIORITY body notes | From profile |

**Hardcoded defaults** (not from profile):
- `trainingMode`: `"both"` (strength + cardio)
- `focusAreas`: `["full_body"]`

Additionally:
- **Exercise preferences** (avoided/disliked exercises) are fetched and the AI is told to never/deprioritize them
- **Adaptive Engine modifiers** are applied (e.g., deload week, volume adjustments)

### Why Profile Completeness Matters

If the user's profile is missing key fields, the daily plans will use generic fallbacks:
- No `primaryGoal` → defaults to `"maintenance"` (generic balanced plan)
- No `workoutLocationDefault` → defaults to `"gym"` (may suggest unavailable equipment)
- No `sessionDurationMinutes` → defaults to `45` minutes
- No `healthConstraints` → no safety accommodations

**The app should encourage profile completion before daily planning.** If the profile doesn't exist at all, the server returns `400` with `{ profileRequired: true }`.

---

## Daily Meal — Full Flow

### Creation

```
POST /api/daily-meal
Authorization: Bearer {accessToken}
Body: {
  "date": "2026-03-16",
  "mealsPerDay": 3              // 2 or 3 only
}

Response (immediate):
{
  "id": "uuid",
  "status": "generating"
}
```

### Polling (built into the detail view)

The detail view for daily meals uses **automatic polling via refetchInterval**. When the status is `"generating"`, the view re-fetches `GET /api/daily-meal/{date}` every 2 seconds automatically.

```
GET /api/daily-meal/{date}
Authorization: Bearer {accessToken}

Response (while generating):
{
  "id": "uuid",
  "date": "2026-03-16",
  "status": "generating",
  "mealsPerDay": 3,
  "generatedTitle": null,
  "planJson": null,
  "groceryJson": null,
  "adaptiveSnapshot": null
}

Response (when ready):
{
  "id": "uuid",
  "date": "2026-03-16",
  "status": "ready",
  "mealsPerDay": 3,
  "generatedTitle": "Daily Meal — Monday, March 16",
  "planJson": { ... },          // The actual meals
  "groceryJson": { ... },       // Ingredient list
  "adaptiveSnapshot": { ... }   // Adaptive engine state
}
```

**Unlike 7-day plans, there is NO separate `/status` endpoint for daily plans.** The full object is fetched every time (it's small enough).

### Navigate and Display

```
iOS Navigation:
1. User taps "Generate Meals" → POST /api/daily-meal
2. Navigate to /daily-meal/{date} screen
3. Screen shows generating spinner (polls every 2s)
4. When status === "ready" → render meal cards
5. When status === "failed" → show error message
```

---

## Daily Workout — Full Flow

### Creation

```
POST /api/daily-workout
Authorization: Bearer {accessToken}
Body: {
  "date": "2026-03-16"          // That's it! No other fields needed.
}

Response (immediate):
{
  "id": "uuid",
  "status": "generating"
}
```

### Polling

Same pattern — the detail view polls `GET /api/daily-workout/{date}` every 2 seconds while generating.

```
GET /api/daily-workout/{date}
Authorization: Bearer {accessToken}

Response (when ready):
{
  "id": "uuid",
  "date": "2026-03-16",
  "status": "ready",
  "generatedTitle": "Daily Workout — Monday, March 16",
  "planJson": { ... },          // The workout session
  "adaptiveSnapshot": { ... }
}
```

---

## Regeneration

Both daily meals and workouts can be regenerated. This creates a completely new plan for the same date, replacing the existing one.

### Daily Meal Regeneration

```
POST /api/daily-meal/{date}/regenerate
Authorization: Bearer {accessToken}
Body: {}

Response:
{ "id": "existing-uuid", "status": "generating" }
```

The existing record is set back to `"generating"` status. The view polls until it becomes `"ready"` again with new content.

**Regeneration uses the same profile data as initial creation.** It re-reads the profile, re-computes adaptive modifiers, and generates fresh meals. The `mealsPerDay` is preserved from the original creation.

### Daily Workout Regeneration

```
POST /api/daily-workout/{date}/regenerate
Authorization: Bearer {accessToken}
Body: {}

Response:
{ "id": "existing-uuid", "status": "generating" }
```

Same pattern — existing record goes back to `"generating"`, new workout is generated.

### UI for Regenerate

Both detail views show a "Regenerate" button in the header:
- Icon: refresh/rotate icon
- Shows spinner while the POST is in flight
- After success: toast notification + poll for new content
- The regenerated content will be different from the original (AI randomization)

---

## Completion Tracking

Users can mark individual daily meals and the daily workout as complete.

### Daily Meal Completions

Each meal slot (breakfast, lunch, dinner) has its own completion checkbox. Tapping the meal row toggles completion.

```
POST /api/completions
Body: {
  "date": "2026-03-16",
  "itemType": "meal",
  "sourceType": "daily_meal",
  "sourceId": "{daily-meal-id}",
  "itemKey": "breakfast",        // or "lunch" or "dinner"
  "completed": true
}
```

Completed meals show with reduced opacity (60%).

### Daily Workout Completions

The entire workout has a single completion checkbox in the header.

```
POST /api/completions
Body: {
  "date": "2026-03-16",
  "itemType": "workout",
  "sourceType": "daily_workout",
  "sourceId": "{daily-workout-id}",
  "itemKey": "workout",
  "completed": true
}
```

Completed workouts show with reduced opacity (60%).

### Reading Completions

```
GET /api/completions?sourceType=daily_meal&sourceId={id}
GET /api/completions?sourceType=daily_workout&sourceId={id}
```

Returns an array of completion records for that source.

---

## Feedback System

### Meal Feedback (Thumbs Up / Down)

Each daily meal card has like/dislike buttons. This is the same feedback system used in 7-day plans.

```
POST /api/feedback/meal
Body: {
  "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
  "mealName": "Greek Veggie Omelet",
  "cuisineTag": "Mediterranean",
  "feedback": "like" | "dislike" | "neutral",
  "ingredients": ["eggs", "spinach", "feta cheese"]
}
```

**Fingerprint generation** (must match server-side logic):
```swift
func generateMealFingerprint(name: String, cuisineTag: String, ingredients: [String]) -> String {
    let slugify = { (s: String) -> String in
        s.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
    let namePart = slugify(name)
    let cuisinePart = slugify(cuisineTag)
    let keyIngredients = ["chicken", "beef", "pork", "fish", "salmon", "tuna", 
        "shrimp", "turkey", "lamb", "tofu", "tempeh", "egg", "eggs", "beans", 
        "lentils", "chickpeas", "milk", "cheese", "yogurt", "cream", "rice", 
        "pasta", "bread", "quinoa", "oats", "avocado", "mushroom", "mushrooms"]
    var proteinPart = "none"
    let combined = ingredients.joined(separator: " ").lowercased()
    for key in keyIngredients {
        if combined.contains(key) { proteinPart = key; break }
    }
    return "\(namePart)|\(cuisinePart)|\(proteinPart)"
}
```

**Feedback states:**
- No feedback: both buttons are default/muted color
- Liked: thumbs-up button is green-tinted
- Disliked: thumbs-down button is red-tinted
- Tapping the active button sends `"neutral"` to clear the feedback (toggle behavior)

**Optimistic updates:** The UI should immediately reflect the feedback state without waiting for the server response.

### Exercise Feedback (Thumbs Up / Down)

Each exercise in the daily workout has like/dislike buttons.

```
POST /api/feedback/workout
Body: {
  "dayIndex": 0,               // always 0 for daily workouts
  "sessionKey": "barbell-bench-press",   // slugified exercise name
  "feedback": "like" | "dislike" | "neutral"
}
```

The `sessionKey` is the exercise name lowercased with non-alphanumeric characters replaced by hyphens:
```swift
let sessionKey = exerciseName.lowercased()
    .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
```

---

## Daily Coverage API

This endpoint lets the app check which dates have daily plans without fetching full plan data.

```
GET /api/daily-coverage?start=2026-03-15&end=2026-03-21
Authorization: Bearer {accessToken}

Response:
{
  "2026-03-15": { "meal": true, "workout": false },
  "2026-03-16": { "meal": true, "workout": true },
  "2026-03-18": { "meal": false, "workout": true }
}
```

Dates with no daily plans at all are NOT included in the response. Only dates with at least one ready plan appear. `true` means status is `"ready"`, `false` means it exists but isn't ready.

This is useful for:
- Showing indicators on calendar dates
- Showing the "Ready" badge in the "Plan This Day" dialog
- Dashboard week view showing which days have daily plans

### Batch Fetch by Date Range

For displaying multiple daily plans at once (e.g., in a week view):

```
GET /api/daily-meals?start=2026-03-15&end=2026-03-21
→ Array of DailyMeal objects for that range

GET /api/daily-workouts?start=2026-03-15&end=2026-03-21
→ Array of DailyWorkout objects for that range
```

---

## planJson Structures

### Daily Meal planJson

Different from the 7-day plan structure. This is a SINGLE day, not wrapped in a `days` array.

```json
{
  "title": "Daily Meal — Monday, March 16",
  "date": "2026-03-16",
  "meals": {
    "breakfast": {
      "name": "Protein Overnight Oats",
      "cuisineTag": "American",
      "prepTimeMinutes": 10,
      "servings": 1,
      "ingredients": [
        "1/2 cup rolled oats",
        "1 scoop vanilla protein powder",
        "3/4 cup almond milk",
        "1 tbsp chia seeds",
        "1/2 cup mixed berries"
      ],
      "steps": [
        "Combine oats, protein powder, and chia seeds in a jar.",
        "Pour in almond milk and stir well.",
        "Top with mixed berries.",
        "Refrigerate overnight or at least 4 hours.",
        "Serve cold or heat for 2 minutes."
      ],
      "nutritionEstimateRange": {
        "calories": "380-420",
        "protein_g": "30-35",
        "carbs_g": "45-50",
        "fat_g": "10-14"
      },
      "whyItHelpsGoal": "High protein start supports muscle recovery and keeps you full through morning."
    },
    "lunch": { ... },
    "dinner": { ... }
  },
  "nutritionSummary": {
    "calories": "1800-2000",
    "protein_g": "140-160",
    "carbs_g": "180-200",
    "fat_g": "60-70"
  }
}
```

**Key differences from 7-day meal plan structure:**
- No `days` array — `meals` is at the top level
- Ingredients are simple strings (not `{ item, amount }` objects)
- Instructions are called `steps` (not `instructions`)
- Nutrition values are called `nutritionEstimateRange` (not `macros`)
- Has `whyItHelpsGoal` field explaining how each meal supports the goal
- Has a `nutritionSummary` for the whole day

**Meal slots present depend on `mealsPerDay`:**
- `mealsPerDay: 3` → `breakfast`, `lunch`, `dinner`
- `mealsPerDay: 2` → `lunch`, `dinner`

### Daily Meal groceryJson

```json
{
  "sections": [
    {
      "name": "Ingredients",
      "items": [
        { "item": "1/2 cup rolled oats", "quantity": "1/2 cup rolled oats" },
        { "item": "1 scoop vanilla protein powder", "quantity": "1 scoop vanilla protein powder" },
        ...
      ]
    }
  ]
}
```

A flat list of all ingredients across all meals for the day.

### Daily Workout planJson

This is a single session object — NOT wrapped in days.

```json
{
  "mode": "mixed",
  "focus": "Full Body Strength & Conditioning",
  "durationMinutes": 45,
  "intensity": "moderate",
  "warmup": [
    "Jumping jacks — 30 seconds",
    "Arm circles — 20 seconds each direction",
    "Bodyweight squats — 10 reps",
    "Hip circles — 10 each direction"
  ],
  "main": [
    {
      "name": "Barbell Back Squat",
      "type": "strength",
      "sets": 4,
      "reps": "8-10",
      "time": null,
      "restSeconds": 90,
      "notes": "Focus on depth and controlled descent"
    },
    {
      "name": "Dumbbell Row",
      "type": "strength",
      "sets": 3,
      "reps": "10-12 each side",
      "time": null,
      "restSeconds": 60,
      "notes": null
    },
    {
      "name": "Battle Ropes",
      "type": "cardio",
      "sets": null,
      "reps": null,
      "time": "30 seconds on, 30 seconds off × 4",
      "restSeconds": null,
      "notes": "Keep core tight"
    }
  ],
  "finisher": [
    "Plank hold — 45 seconds × 2"
  ],
  "cooldown": [
    "Standing quad stretch — 30 seconds each side",
    "Seated hamstring stretch — 30 seconds each side",
    "Child's pose — 45 seconds"
  ],
  "coachingCues": [
    "Breathe through each rep, exhale on exertion",
    "If any exercise causes pain, stop and substitute"
  ]
}
```

**Key differences from 7-day workout plan structure:**
- NOT nested in a `days[].session` — the planJson IS the session directly
- Exercises are in `main` array (not `exercises`)
- Exercises can be `"strength"`, `"cardio"`, or `"mobility"` type
- Some exercises use `time` instead of `sets`/`reps` (especially cardio)
- Has `finisher` section (optional) — short intense exercises at the end
- Has `coachingCues` (optional) — motivational/safety tips
- `warmup`, `finisher`, `cooldown` are arrays of strings (not objects)
- Has `mode` (`"strength"`, `"cardio"`, `"mixed"`)
- Has `intensity` (`"easy"`, `"moderate"`, `"hard"`)

---

## API Reference

| Action | Method | Endpoint | Body | Response |
|--------|--------|----------|------|----------|
| Create daily meal | POST | `/api/daily-meal` | `{ date, mealsPerDay }` | `{ id, status: "generating" }` |
| Get daily meal by date | GET | `/api/daily-meal/{date}` | — | Full DailyMeal object |
| List daily meals in range | GET | `/api/daily-meals?start=X&end=Y` | — | Array of DailyMeal |
| Regenerate daily meal | POST | `/api/daily-meal/{date}/regenerate` | `{}` | `{ id, status: "generating" }` |
| Create daily workout | POST | `/api/daily-workout` | `{ date }` | `{ id, status: "generating" }` |
| Get daily workout by date | GET | `/api/daily-workout/{date}` | — | Full DailyWorkout object |
| List daily workouts in range | GET | `/api/daily-workouts?start=X&end=Y` | — | Array of DailyWorkout |
| Regenerate daily workout | POST | `/api/daily-workout/{date}/regenerate` | `{}` | `{ id, status: "generating" }` |
| Check coverage | GET | `/api/daily-coverage?start=X&end=Y` | — | `{ "date": { meal, workout } }` |
| Submit meal feedback | POST | `/api/feedback/meal` | See feedback section | `{ ok: true }` |
| Submit exercise feedback | POST | `/api/feedback/workout` | See feedback section | `{ ok: true }` |
| Toggle completion | POST | `/api/completions` | See completion section | Completion record |

---

## UI Rendering Guide

### Daily Meal Detail Screen

```
┌──────────────────────────────────────┐
│ ← Back                              │
│                                      │
│ 🍽 Daily Meal — Mon, Mar 16   [🔄]  │  ← generatedTitle + Regenerate btn
│    3 meals                           │
│                                      │
│ ┌─ Adaptive Insights (if any) ─────┐ │  ← shows if adaptiveSnapshot exists
│ │ "Slightly higher carbs this..."  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Daily Nutrition Summary ────────┐ │  ← planJson.nutritionSummary
│ │ 1850 cal  148g protein  190g     │ │
│ │           carbs     65g fat      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ☐  BREAKFAST                     │ │  ← completion checkbox + slot label
│ │    Protein Overnight Oats        │ │  ← meal.name
│ │    American  ⏱ 10 min            │ │  ← cuisineTag + prepTimeMinutes
│ │    380-420 cal  P:30-35g ...     │ │  ← nutritionEstimateRange
│ │    👍 👎                     ▼   │ │  ← feedback + expand chevron
│ │                                  │ │
│ │  ▼ EXPANDED:                     │ │
│ │  "High protein start supports…"  │ │  ← whyItHelpsGoal (italic)
│ │                                  │ │
│ │  Ingredients:                    │ │
│ │  • 1/2 cup rolled oats          │ │
│ │  • 1 scoop protein powder       │ │
│ │                                  │ │
│ │  Steps:                          │ │
│ │  1. Combine oats, protein...    │ │
│ │  2. Pour in almond milk...      │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ☐  LUNCH                         │ │
│ │    ...                           │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ ☐  DINNER                        │ │
│ │    ...                           │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Ingredients Needed ─────────────┐ │  ← groceryJson
│ │ Ingredients                      │ │
│ │ [1/2 cup oats] [protein pwd] .. │ │  ← badge chips
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Meal card behavior:**
- Tapping the meal row toggles its completion (checkbox)
- The expand chevron (▼) opens the detail section with `whyItHelpsGoal`, ingredients, and steps
- Like/dislike buttons are always visible (not inside the expandable)
- Completed meals show at 60% opacity

### Daily Workout Detail Screen

```
┌──────────────────────────────────────┐
│ ← Back                              │
│                                      │
│ 💪 Daily Workout — Mon, Mar 16      │  ← generatedTitle
│    Full Body Strength & Cond.   ☐   │  ← focus + completion checkbox
│    [Recovery]  [Progression]    [🔄] │  ← optional badges + Regenerate
│                                      │
│ ┌─ Adaptive Insights (if any) ─────┐ │
│ └──────────────────────────────────┘ │
│                                      │
│ [mixed]  [⚡ moderate]  [⏱ 45 min]  │  ← mode, intensity, duration badges
│                                      │
│ ┌─ Warm-up ────────────────────────┐ │  ← session.warmup (string array)
│ │ • Jumping jacks — 30 seconds     │ │
│ │ • Arm circles — 20s each dir     │ │
│ │ • Bodyweight squats — 10 reps    │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Exercises ──────────────────────┐ │  ← session.main (object array)
│ │ Barbell Back Squat               │ │
│ │ [strength]                       │ │  ← type badge
│ │ 💡 Focus on depth and controlled │ │  ← notes (if present)
│ │              4 × 8-10  ⏱ 90s    │ │  ← sets × reps + rest
│ │                          👍  👎  │ │  ← feedback buttons
│ │ ─────────────────────────────── │ │
│ │ Dumbbell Row                     │ │
│ │ [strength]                       │ │
│ │              3 × 10-12  ⏱ 60s   │ │
│ │                          👍  👎  │ │
│ │ ─────────────────────────────── │ │
│ │ Battle Ropes                     │ │
│ │ [cardio]                         │ │
│ │   30s on, 30s off × 4           │ │  ← uses "time" not sets/reps
│ │ 💡 Keep core tight               │ │
│ │                          👍  👎  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Finisher ───────────────────────┐ │  ← session.finisher (optional)
│ │ • Plank hold — 45 seconds × 2   │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Cool-down ──────────────────────┐ │  ← session.cooldown
│ │ • Standing quad stretch — 30s    │ │
│ │ • Seated hamstring stretch — 30s │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ┌─ Coaching Cues ──────────────────┐ │  ← session.coachingCues (optional)
│ │ "Breathe through each rep..."    │ │  ← italic text
│ │ "If any exercise causes pain..." │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Exercise display logic:**
- If exercise has `sets` and `reps`: show "4 × 8-10"
- If exercise has `time` but NOT `sets`: show the time string directly
- If exercise has `restSeconds`: show "⏱ 90s rest"
- If exercise has `notes`: show as hint text
- `type` badge: capitalize (`"strength"` → "Strength")

**Adaptive badges:**
- If `adaptiveSnapshot.modifiers.deloadWeek` is true: show "Recovery" badge
- If `adaptiveSnapshot.modifiers.volumeMultiplier > 1.05` AND NOT deload: show "Progression" badge
- These are mutually exclusive

**Workout completion:**
- Single checkbox in the header next to the title
- When completed, the entire exercise list shows at 60% opacity

---

## Error Handling

### Profile Required (400)
```json
{ "message": "Profile required", "profileRequired": true }
```
Navigate user to profile setup screen.

### Date Validation (400)
```json
{ "message": "Valid date (YYYY-MM-DD) is required" }
{ "message": "Cannot create plans for past dates" }
```

### Already Exists (409)
```json
{ "message": "A daily meal already exists for this date", "existing": { ...fullRecord } }
```
This means a daily plan already exists for this date. The web app handles this by navigating directly to the existing plan's detail view. The `existing` field contains the full record, so the iOS app can use it directly.

### Meals Per Day Validation (400)
```json
{ "message": "mealsPerDay must be 2 or 3" }
```

### Generation Failed
When the `status` field returns `"failed"` from the GET endpoint, show:
- "Meal generation failed. Please try again." with a back button
- "Workout generation failed. Please try again." with a back button
- The Regenerate button on existing plans lets users retry

---

## Integration with Dashboard / Week View

The dashboard uses `GET /api/week-data?weekStart=YYYY-MM-DD&weekStartsOn=0|1` which returns daily plans embedded in each day:

```json
{
  "days": [
    {
      "date": "2026-03-16",
      "dailyMeal": {
        "id": "uuid",
        "planJson": { ... },
        "generatedTitle": "Daily Meal — Monday, March 16"
      },
      "dailyWorkout": {
        "id": "uuid",
        "planJson": { ... },
        "generatedTitle": "Daily Workout — Monday, March 16"
      },
      "planIds": [...],
      "workoutPlanId": null,
      ...
    }
  ]
}
```

The dashboard shows a summary card for each daily plan:
- Daily Meal card: shows meal slot names and calorie info, tappable to navigate to `/daily-meal/{date}`
- Daily Workout card: shows session title and duration, tappable to navigate to `/daily-workout/{date}`

If no daily plans exist for the selected date, the dashboard shows the "Plan This Day" trigger.
