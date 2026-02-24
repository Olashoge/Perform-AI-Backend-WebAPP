# iOS App — Feedback, Preferences & Regeneration Complete Guide

This document explains exactly how Like/Dislike buttons, Regenerate/Swap buttons, and the Meal Preferences & Exercise Preferences screens work in the web app, so the iOS app can replicate them as an exact replica.

---

## Table of Contents

- [Overview: The Feedback & Preferences System](#overview-the-feedback--preferences-system)
- [PART 1: Meal Feedback (Like / Dislike)](#part-1-meal-feedback-like--dislike)
  - [Where Feedback Buttons Appear](#where-meal-feedback-buttons-appear)
  - [Meal Fingerprint Generation](#meal-fingerprint-generation)
  - [Button States and Toggle Behavior](#meal-button-states-and-toggle-behavior)
  - [Optimistic UI Updates](#meal-optimistic-ui-updates)
  - [API Call on Feedback](#meal-feedback-api-call)
  - [Side Effects of Liking a Meal](#side-effects-of-liking-a-meal)
  - [Side Effects of Disliking a Meal (Ingredient Proposal)](#side-effects-of-disliking-a-meal)
  - [Ingredient Proposal Modal Flow](#ingredient-proposal-modal-flow)
  - [Loading Existing Feedback for a Plan](#loading-existing-feedback-for-a-plan)
- [PART 2: Exercise Feedback (Like / Dislike on Workout Sessions)](#part-2-exercise-feedback-like--dislike-on-workout-sessions)
  - [Where Exercise Session Feedback Appears](#where-exercise-session-feedback-appears)
  - [Session Key Generation](#session-key-generation)
  - [API Call for Session Feedback](#api-call-for-session-feedback)
  - [Loading Existing Workout Feedback](#loading-existing-workout-feedback)
- [PART 3: Individual Exercise Preferences (Like / Dislike on Exercises)](#part-3-individual-exercise-preferences)
  - [Where Exercise Preference Buttons Appear](#where-exercise-preference-buttons-appear)
  - [Exercise Key Generation](#exercise-key-generation)
  - [The "Avoid" Modal for Exercises](#the-avoid-modal-for-exercises)
  - [API Calls for Exercise Preferences](#api-calls-for-exercise-preferences)
  - [Exercise Preference States](#exercise-preference-states)
- [PART 4: Meal Swap (7-Day Plans Only)](#part-4-meal-swap)
  - [Swap Button Behavior](#swap-button-behavior)
  - [Swap API Call](#swap-api-call)
  - [Swap Limits](#swap-limits)
- [PART 5: Day Regeneration (7-Day Meal Plans)](#part-5-day-regeneration-7-day-meal-plans)
  - [Regenerate Day Button](#regenerate-day-button)
  - [Regen Day API Call](#regen-day-api-call)
  - [Regen Limits](#regen-limits)
- [PART 6: Session Regeneration (7-Day Workout Plans)](#part-6-session-regeneration-7-day-workout-plans)
  - [Regenerate Session Button](#regenerate-session-button)
  - [Regen Session API Call](#regen-session-api-call)
- [PART 7: Daily Plan Regeneration](#part-7-daily-plan-regeneration)
  - [Daily Meal Regeneration](#daily-meal-regeneration)
  - [Daily Workout Regeneration](#daily-workout-regeneration)
- [PART 8: Meal Preferences Screen](#part-8-meal-preferences-screen)
  - [API Endpoint](#meal-preferences-api-endpoint)
  - [Response Structure](#meal-preferences-response-structure)
  - [Tab Layout](#meal-preferences-tab-layout)
  - [Liked Meals Tab](#liked-meals-tab)
  - [Disliked Meals Tab](#disliked-meals-tab)
  - [Avoided Ingredients Tab](#avoided-ingredients-tab)
  - [Pending Ingredient Proposals Section](#pending-ingredient-proposals-section)
  - [Removing Items](#removing-meal-preference-items)
- [PART 9: Exercise Preferences Screen](#part-9-exercise-preferences-screen)
  - [API Endpoint](#exercise-preferences-api-endpoint)
  - [Response Structure](#exercise-preferences-response-structure)
  - [Tab Layout](#exercise-preferences-tab-layout)
  - [Liked Exercises Tab](#liked-exercises-tab)
  - [Disliked Exercises Tab](#disliked-exercises-tab)
  - [Avoided Exercises Tab](#avoided-exercises-tab)
  - [Removing Items](#removing-exercise-preference-items)
- [PART 10: How Preferences Influence AI Generation](#part-10-how-preferences-influence-ai-generation)
- [Complete API Reference](#complete-api-reference)

---

## Overview: The Feedback & Preferences System

The app has a learning system that gets smarter over time. Users give feedback on meals and exercises, and this feedback:

1. **Persists as preferences** — stored in the database permanently
2. **Influences future AI generation** — the AI avoids disliked items and favors liked ones
3. **Is viewable and manageable** — users can see and remove their preferences

There are **two separate feedback systems**:

| System | What It Tracks | Where Buttons Appear | Preferences Screen |
|--------|---------------|---------------------|-------------------|
| **Meal Feedback** | Liked/disliked meals + avoided ingredients | Each meal card in plan view and daily meal view | Settings → Food Preferences (`/preferences`) |
| **Exercise Feedback** | Liked/disliked/avoided exercises + session-level feedback | Each exercise row + session header in workout views | Settings → Exercise Preferences (`/preferences/exercise`) |

---

## PART 1: Meal Feedback (Like / Dislike)

### Where Meal Feedback Buttons Appear

Meal feedback buttons (thumbs up / thumbs down) appear on **every meal card** across:

1. **7-Day Meal Plan Detail** (`/plan/:id`) — each meal (breakfast/lunch/dinner) per day has like/dislike buttons
2. **Daily Meal View** (`/daily-meal/:date`) — each meal slot has like/dislike buttons

The buttons are always visible (not hidden behind an expand/collapse), positioned in the top-right area of the meal card.

### Meal Fingerprint Generation

Every meal gets a unique fingerprint used to track feedback. **The iOS app MUST generate this fingerprint identically** to match server-side records.

```swift
func generateMealFingerprint(name: String, cuisineTag: String, ingredients: [String]) -> String {
    let slugify = { (str: String) -> String in
        str.lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "^-|-$", with: "", options: .regularExpression)
    }
    
    let namePart = slugify(name)
    let cuisinePart = slugify(cuisineTag)
    
    let keyIngredients = [
        "chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb",
        "tofu", "tempeh", "egg", "eggs",
        "beans", "lentils", "chickpeas",
        "milk", "cheese", "yogurt", "cream",
        "rice", "pasta", "bread", "quinoa", "oats",
        "avocado", "mushroom", "mushrooms"
    ]
    
    var proteinPart = "none"
    let combined = ingredients.joined(separator: " ").lowercased()
    for key in keyIngredients {
        if combined.contains(key) {
            proteinPart = key
            break  // IMPORTANT: first match wins, ordered by priority
        }
    }
    
    return "\(namePart)|\(cuisinePart)|\(proteinPart)"
}
```

**Example:**
- Meal name: "Greek Veggie Omelet"
- Cuisine tag: "Mediterranean"  
- Ingredients: ["eggs", "spinach", "feta cheese", "bell pepper"]
- Fingerprint: `"greek-veggie-omelet|mediterranean|egg"`

**Important notes:**
- The key ingredient list is ordered — the FIRST match in the combined ingredient text wins
- `"eggs"` and `"egg"` are both in the list — if ingredients contain "eggs", it matches "egg" first (since "egg" appears first as a substring of "eggs")
- If no key ingredient is found in the ingredients, the protein part is `"none"`

### Meal Button States and Toggle Behavior

Each meal has TWO buttons: Like (thumbs up) and Dislike (thumbs down).

| Current State | Tap Like | Tap Dislike |
|---------------|----------|-------------|
| **No feedback** (both neutral) | → Send `"like"` | → Send `"dislike"` |
| **Liked** (like is active) | → Send `"neutral"` (removes like) | → Send `"dislike"` (switches) |
| **Disliked** (dislike is active) | → Send `"like"` (switches) | → Send `"neutral"` (removes dislike) |

**Visual states:**

| State | Like Button | Dislike Button |
|-------|------------|---------------|
| No feedback | Muted/gray icon | Muted/gray icon |
| Liked | Green background tint + green icon (`emerald-50 text-emerald-600` / `emerald-950/30 text-emerald-400` dark) | Muted/gray icon |
| Disliked | Muted/gray icon | Rose/red background tint + red icon (`rose-50 text-rose-600` / `rose-950/30 text-rose-400` dark) |

### Meal Optimistic UI Updates

The web app uses **optimistic updates** for instant feedback:

1. User taps like/dislike
2. **Immediately** update the UI to show the new state (don't wait for server)
3. Send the API request in the background
4. If the API request fails, revert (though the web app currently doesn't revert — it relies on cache invalidation)

The pattern:
```
State: optimisticFeedback = { [fingerprint]: "like" | "dislike" | null }
Merged with: serverFeedbackMap = { [fingerprint]: "like" | "dislike" } (from GET endpoint)
Display: mergedFeedback = { ...serverMap, ...optimisticOverrides }
```

### Meal Feedback API Call

```
POST /api/feedback/meal
Authorization: Bearer {accessToken}
Content-Type: application/json

{
    "planId": "uuid-optional",              // 7-day plan ID (optional, null for daily meals)
    "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
    "mealName": "Greek Veggie Omelet",
    "cuisineTag": "Mediterranean",
    "feedback": "like" | "dislike" | "neutral",
    "ingredients": ["eggs", "spinach", "feta cheese", "bell pepper"]   // optional but recommended
}
```

**Response:**
```json
{
    "record": {
        "id": "uuid",
        "userId": "uuid",
        "mealPlanId": "uuid-or-null",
        "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
        "mealName": "Greek Veggie Omelet",
        "cuisineTag": "Mediterranean",
        "feedback": "like",
        "createdAt": "2026-03-16T..."
    },
    "feedback": "like",
    "proposalId": null,
    "proposalIngredients": []
}
```

**Key behaviors:**
- This is an **upsert** — if feedback already exists for this fingerprint+user, it updates; otherwise it creates
- Sending `"neutral"` effectively removes the feedback
- The `planId` field is optional and is used for organizing feedback by plan but doesn't affect the fingerprint

### Side Effects of Liking a Meal

When a user **likes** a meal and `ingredients` are provided:

1. The server calls `extractKeyIngredients(ingredients)` to find key ingredients (chicken, beef, eggs, etc.)
2. For each key ingredient found, it creates/updates an ingredient preference with `preference: "prefer"` and `source: "derived"`
3. These preferred ingredients are shown in the Meal Preferences screen under a "Preferred" category

This means liking a "Chicken Caesar Salad" automatically adds "chicken" to preferred ingredients.

### Side Effects of Disliking a Meal

When a user **dislikes** a meal and `ingredients` are provided:

1. The server calls `extractKeyIngredients(ingredients)` to find key ingredients
2. If key ingredients are found, it creates an **Ingredient Proposal** — a pending suggestion asking the user which specific ingredients they want to avoid
3. The proposal ID and ingredients are returned in the response: `{ proposalId: "uuid", proposalIngredients: ["chicken", "cream"] }`
4. The client shows a modal asking the user to choose which ingredients to avoid

### Ingredient Proposal Modal Flow

When the user dislikes a meal and the server returns a proposal, the web app immediately shows a modal:

```
┌────────────────────────────────────────┐
│ Which ingredients would you like       │
│ to avoid in future plans?              │
│                                        │
│ From: Greek Veggie Omelet              │
│ Select ingredients to avoid:           │
│                                        │
│ ☐ egg                                  │
│ ☐ cheese                               │
│                                        │
│              [Dismiss]  [Avoid Selected]│
└────────────────────────────────────────┘
```

**User choices:**
- **Dismiss** → `POST /api/ingredient-proposals/{id}/resolve` with `{ action: "declined", chosenIngredients: [] }`
- **Select some + "Avoid Selected"** → `POST /api/ingredient-proposals/{id}/resolve` with `{ action: "accepted", chosenIngredients: ["egg"] }`

When accepted, each chosen ingredient gets saved with `preference: "avoid"` and `source: "derived"`, and appears in the Meal Preferences "Avoided" tab.

**Resolve API:**
```
POST /api/ingredient-proposals/{proposalId}/resolve
Authorization: Bearer {accessToken}

{
    "chosenIngredients": ["egg", "cheese"],    // empty array if declining
    "action": "accepted" | "declined"
}
```

**Alternative: If NO proposal is returned** (no key ingredients found), the dislike is simply recorded without showing any modal.

### Loading Existing Feedback for a Plan

To show the correct button states when opening a plan detail view, the app fetches existing feedback:

**For 7-Day Meal Plans:**
```
GET /api/feedback/plan/{planId}
Authorization: Bearer {accessToken}

Response:
{
    "greek-veggie-omelet|mediterranean|egg": "like",
    "grilled-chicken-salad|american|chicken": "dislike"
}
```

Returns a map of `fingerprint → feedback` for all meals the user has given feedback on within that plan.

**For Daily Meals:**
The daily meal view does NOT have a plan-specific feedback endpoint. It uses optimistic state only (starting from empty). This means:
- When the user opens a daily meal view, all buttons start neutral
- Previous feedback on the same meal (by fingerprint) exists in the database but isn't loaded per-view
- The feedback still persists and affects future AI generation

---

## PART 2: Exercise Feedback (Like / Dislike on Workout Sessions)

### Where Exercise Session Feedback Appears

Session-level feedback appears on the **session card header** (not on individual exercises) in:

1. **7-Day Workout Plan Detail** (`/workout/:id`) — each day's session has like/dislike in the header
2. **Daily Workout View** (`/daily-workout/:date`) — the session has like/dislike in the header

### Session Key Generation

The session key identifies which workout session is being rated:

**For 7-Day Workout Plans:**
```swift
let sessionKey = "day\(dayIndex)_\(session.focus.lowercased().replacingOccurrences(of: " +", with: "_", options: .regularExpression))"
// Example: "day1_upper_body_strength" for Day 1 with focus "Upper Body Strength"
```

Where `dayIndex` is the day number (1-7) from the plan.

**For Daily Workouts:**
```swift
let sessionKey = "day0_\(session.focus.lowercased().replacingOccurrences(of: " +", with: "_", options: .regularExpression))"
// dayIndex is always 0 for daily workouts
```

### API Call for Session Feedback

```
POST /api/feedback/workout
Authorization: Bearer {accessToken}

{
    "workoutPlanId": "uuid-optional",       // 7-day plan ID, optional for daily
    "dayIndex": 1,                          // day number (0 for daily workouts)
    "sessionKey": "day1_upper_body_strength",
    "feedback": "like" | "dislike" | "neutral"
}
```

**Response:**
```json
{
    "record": { "id": "uuid", ... },
    "feedback": "like"
}
```

Same toggle behavior as meals — tapping the active button sends `"neutral"` to clear it.

Same optimistic UI pattern — immediately update state, then send API call.

### Loading Existing Workout Feedback

```
GET /api/feedback/workout/{workoutPlanId}
Authorization: Bearer {accessToken}

Response:
{
    "day1_upper_body_strength": "like",
    "day3_lower_body_power": "dislike"
}
```

Returns a map of `sessionKey → feedback`.

---

## PART 3: Individual Exercise Preferences

### Where Exercise Preference Buttons Appear

Individual exercise like/dislike buttons appear on **each exercise row** within a workout session card:

1. **7-Day Workout Plan Detail** — each exercise in each session has its own like/dislike
2. **Daily Workout View** — each exercise has like/dislike

These are SEPARATE from session-level feedback. Session feedback rates the overall session, exercise preferences rate individual exercises.

### Exercise Key Generation

The exercise key is a slugified version of the exercise name:

```swift
let exerciseKey = exerciseName.lowercased()
    .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
// Example: "Barbell Back Squat" → "barbell-back-squat"
```

### The "Avoid" Modal for Exercises

When the user taps the **dislike** button on an exercise, the web app does NOT immediately save a "disliked" preference. Instead, it shows a confirmation modal:

```
┌────────────────────────────────────────┐
│ Avoid this exercise?                    │
│                                        │
│ You disliked Barbell Back Squat.       │
│ Would you like to completely avoid     │
│ it in future workout plans?            │
│                                        │
│         [Just Dislike]  [🚫 Avoid      │
│                          Completely]   │
└────────────────────────────────────────┘
```

**Two choices:**

| Button | What It Does | Saved Status |
|--------|-------------|-------------|
| **"Just Dislike"** | Deprioritizes the exercise in future plans (AI tries to use less) | `"disliked"` |
| **"Avoid Completely"** | Hard-blocks the exercise from all future plans + shows toast | `"avoided"` |

**This modal ONLY appears when disliking.** Liking an exercise saves immediately without any modal.

**Removing a dislike (tapping active dislike button):** Sends a DELETE request, no modal shown.

### API Calls for Exercise Preferences

**Save a preference (like, dislike, or avoid):**
```
POST /api/preferences/exercise
Authorization: Bearer {accessToken}

{
    "exerciseKey": "barbell-back-squat",
    "exerciseName": "Barbell Back Squat",
    "status": "liked" | "disliked" | "avoided"
}

Response: { "id": "uuid", "exerciseKey": "...", "exerciseName": "...", "status": "liked", "createdAt": "...", "updatedAt": "..." }
```

This is an upsert — if a preference already exists for this `exerciseKey`, it updates the status.

**Remove a preference (when toggling off):**
```
DELETE /api/preferences/exercise/key/{exerciseKey}
Authorization: Bearer {accessToken}

Response: { "ok": true }
```

The key must be URL-encoded: `DELETE /api/preferences/exercise/key/barbell-back-squat`

### Exercise Preference States

Each exercise can be in one of four states:

| State | Like Button | Dislike Button | Badge |
|-------|------------|---------------|-------|
| No preference | Gray/muted | Gray/muted | None |
| Liked | Green + elevated | Gray/muted | None |
| Disliked | Gray/muted | Red + elevated | None |
| Avoided | Gray/muted | Red + elevated | Shows "Avoided" badge next to name |

**Visual styles:**
- Liked: `toggle-elevated text-green-600 dark:text-green-400`
- Disliked/Avoided: `toggle-elevated text-red-600 dark:text-red-400`
- The "Avoided" badge only appears when status is `"avoided"`, not `"disliked"`

---

## PART 4: Meal Swap

### Swap Button Behavior

Each meal card in a **7-Day Meal Plan** has a swap button (refresh icon) alongside the like/dislike buttons. **Daily meals do NOT have swap buttons.**

The swap replaces a single meal with a new AI-generated alternative that fits the same slot and plan preferences.

**Button states:**
- Active: Shows refresh icon, tappable
- Loading: Shows spinner
- Disabled: When `swapCount >= 3` (limit reached). Title shows "No swaps remaining"

### Swap API Call

```
POST /api/plan/{planId}/swap
Authorization: Bearer {accessToken}

{
    "dayIndex": 0,              // 0-based day index within the 7-day plan
    "mealType": "breakfast"     // "breakfast" | "lunch" | "dinner"
}

Response: Updated plan JSON with the new meal in place
```

### Swap Limits

- **3 swaps per plan** (total across all days and meal types)
- Tracked by `plan.swapCount` field
- The counter is displayed in the plan view: "Swaps remaining: 2/3"
- When exhausted, swap buttons are disabled

---

## PART 5: Day Regeneration (7-Day Meal Plans)

### Regenerate Day Button

Each day card in a **7-Day Meal Plan** has a "Regenerate Day" button. This replaces ALL meals for that day with fresh AI-generated alternatives.

**Button shows:**
```
[🔄 Regenerate Day]
```

### Regen Day API Call

```
POST /api/plan/{planId}/regenerate-day
Authorization: Bearer {accessToken}

{
    "dayIndex": 0               // 0-based day index
}

Response: Updated plan with all meals for that day replaced
```

### Regen Limits

- **1 day regeneration per plan** (total)
- Tracked by `plan.regenDayCount` field
- Displayed: "Day regens remaining: 0/1"
- When exhausted, regenerate buttons are disabled
- Returns 403 when limit exceeded

---

## PART 6: Session Regeneration (7-Day Workout Plans)

### Regenerate Session Button

Each workout session card in a **7-Day Workout Plan** has a regenerate button (lightning bolt icon). This replaces the entire session with a new AI-generated workout.

**Button shows:** Zap/lightning icon, positioned in the session header next to like/dislike buttons.

### Regen Session API Call

```
POST /api/workout/{workoutPlanId}/regenerate-session
Authorization: Bearer {accessToken}

{
    "dayIndex": 1               // 1-based day index for workout plans
}

Response: Updated workout plan with new session content
```

**While regenerating:**
- The button shows a spinner
- State tracked by `regeneratingDay` — only one session can be regenerating at a time
- After success: invalidates the workout plan query to refresh the view

---

## PART 7: Daily Plan Regeneration

### Daily Meal Regeneration

Daily meals have a regenerate button in the header area. This replaces ALL meals for that date.

```
POST /api/daily-meal/{date}/regenerate
Authorization: Bearer {accessToken}
Body: {}

Response: { "id": "uuid", "status": "generating" }
```

After the POST:
1. Show toast: "Regenerating meals — Creating new meals for this day..."
2. The view polls `GET /api/daily-meal/{date}` every 2 seconds (the query has `refetchInterval` that activates when status is "generating")
3. When status becomes "ready", new meals appear

### Daily Workout Regeneration

Same pattern:

```
POST /api/daily-workout/{date}/regenerate
Authorization: Bearer {accessToken}
Body: {}

Response: { "id": "uuid", "status": "generating" }
```

After the POST:
1. Show toast: "Regenerating workout — Creating a new workout for this day..."
2. Poll `GET /api/daily-workout/{date}` every 2 seconds
3. New workout appears when ready

**Key difference from 7-day plan regen:** Daily plan regeneration sets the plan status back to `"generating"`, which requires polling. 7-day plan swaps/regens return the updated content immediately.

---

## PART 8: Meal Preferences Screen

This screen is accessible from **Settings → Food Preferences** (navigates to `/preferences`).

### Meal Preferences API Endpoint

```
GET /api/preferences
Authorization: Bearer {accessToken}
```

### Meal Preferences Response Structure

```json
{
    "likedMeals": [
        {
            "id": "uuid",
            "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
            "mealName": "Greek Veggie Omelet",
            "cuisineTag": "Mediterranean",
            "feedback": "like",
            "createdAt": "2026-03-10T14:30:00Z"
        }
    ],
    "dislikedMeals": [
        {
            "id": "uuid",
            "mealFingerprint": "beef-stew|american|beef",
            "mealName": "Hearty Beef Stew",
            "cuisineTag": "American",
            "feedback": "dislike",
            "createdAt": "2026-03-11T09:15:00Z"
        }
    ],
    "avoidIngredients": [
        {
            "id": "uuid",
            "ingredientKey": "cream",
            "preference": "avoid",
            "source": "derived",
            "createdAt": "2026-03-11T09:16:00Z"
        }
    ],
    "preferIngredients": [
        {
            "id": "uuid",
            "ingredientKey": "chicken",
            "preference": "prefer",
            "source": "derived",
            "createdAt": "2026-03-10T14:31:00Z"
        }
    ]
}
```

### Meal Preferences Tab Layout

The screen uses a **3-tab layout**:

```
┌─────────────────────────────────────────────────┐
│ Meal Preferences                                 │
│ Manage your liked and disliked meals and         │
│ ingredient preferences. These are used to        │
│ personalize your future meal plans.              │
│                                                   │
│ ┌─ Pending Ingredient Reviews (if any) ────────┐ │
│ │ (shown ABOVE tabs, only when proposals exist) │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ [👍 Liked (3)] [👎 Disliked (2)] [🚫 Avoided (1)]│
│                                                   │
│ ── LIKED TAB ──                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🍽  Greek Veggie Omelet          [🗑]          │ │
│ │    Mediterranean                               │ │
│ ├───────────────────────────────────────────────┤ │
│ │ 🍽  Teriyaki Salmon Bowl         [🗑]          │ │
│ │    Japanese                                    │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ── DISLIKED TAB ──                                │
│ │ Same card layout as Liked                      │ │
│                                                   │
│ ── AVOIDED TAB ──                                 │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🚫  cream                        [🗑]          │ │
│ │    derived                                     │ │
│ ├───────────────────────────────────────────────┤ │
│ │ 🚫  pork                         [🗑]          │ │
│ │    derived                                     │ │
│ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Liked Meals Tab

- Shows list of meals the user has liked
- Each item shows: meal icon + meal name + cuisine tag badge + trash button
- **Empty state:** "No liked meals yet. Like meals in your plans to improve future suggestions."

### Disliked Meals Tab

- Same layout as Liked tab but for disliked meals
- **Empty state:** "No disliked meals yet. Dislike meals to avoid similar suggestions."

### Avoided Ingredients Tab

- Shows list of ingredients the user has chosen to avoid
- Each item shows: ban icon + ingredient name (capitalized) + source badge ("derived") + trash button
- **Empty state:** "No avoided ingredients yet. These are derived from your disliked meals."

### Pending Ingredient Proposals Section

This section appears **above the tabs** ONLY when there are pending proposals (from disliking meals).

```
┌─────────────────────────────────────────┐
│ ⚠ Pending Ingredient Reviews (2)        │
│   Choose which ingredients to avoid      │
│   in future plans.                       │
│                                          │
│ ┌──────────────────────────────────────┐ │
│ │ From: Hearty Beef Stew               │ │
│ │ Select ingredients to avoid           │ │
│ │                                      │ │
│ │ ☐ beef                               │ │
│ │ ☐ cream                              │ │
│ │                                      │ │
│ │            [✕ Dismiss] [✓ Avoid Sel.]│ │
│ └──────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**API to fetch proposals:**
```
GET /api/ingredient-proposals
Authorization: Bearer {accessToken}

Response: [
    {
        "id": "uuid",
        "mealName": "Hearty Beef Stew",
        "proposedIngredients": ["beef", "cream"],
        "status": "pending",
        "createdAt": "2026-03-11T09:15:00Z"
    }
]
```

Only proposals with `status: "pending"` are returned.

### Removing Meal Preference Items

**Remove a liked/disliked meal:**
```
DELETE /api/preferences/meal/{feedbackId}
Authorization: Bearer {accessToken}

Response: { "ok": true }
```

**Remove an avoided ingredient:**
```
DELETE /api/preferences/ingredient/{ingredientPrefId}
Authorization: Bearer {accessToken}

Response: { "ok": true }
```

After removing, invalidate the `/api/preferences` query to refresh the list.

---

## PART 9: Exercise Preferences Screen

This screen is accessible from **Settings → Exercise Preferences** (navigates to `/preferences/exercise`).

### Exercise Preferences API Endpoint

```
GET /api/preferences/exercise
Authorization: Bearer {accessToken}
```

### Exercise Preferences Response Structure

```json
{
    "liked": [
        {
            "id": "uuid",
            "exerciseKey": "barbell-back-squat",
            "exerciseName": "Barbell Back Squat",
            "status": "liked",
            "createdAt": "2026-03-10T14:30:00Z",
            "updatedAt": "2026-03-10T14:30:00Z"
        }
    ],
    "disliked": [
        {
            "id": "uuid",
            "exerciseKey": "burpees",
            "exerciseName": "Burpees",
            "status": "disliked",
            "createdAt": "2026-03-11T09:15:00Z",
            "updatedAt": "2026-03-11T09:15:00Z"
        }
    ],
    "avoided": [
        {
            "id": "uuid",
            "exerciseKey": "box-jumps",
            "exerciseName": "Box Jumps",
            "status": "avoided",
            "createdAt": "2026-03-12T11:00:00Z",
            "updatedAt": "2026-03-12T11:00:00Z"
        }
    ]
}
```

### Exercise Preferences Tab Layout

Same 3-tab pattern as Meal Preferences:

```
┌─────────────────────────────────────────────────┐
│ Exercise Preferences                             │
│ Manage what you like, dislike, and want to       │
│ avoid in future workouts.                        │
│                                                   │
│ [👍 Liked (2)] [👎 Disliked (1)] [🚫 Avoided (1)]│
│                                                   │
│ ── LIKED TAB ──                                   │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🏋  Barbell Back Squat           [🗑]          │ │
│ │    Liked                                       │ │
│ ├───────────────────────────────────────────────┤ │
│ │ 🏋  Deadlift                     [🗑]          │ │
│ │    Liked                                       │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ── DISLIKED TAB ──                                │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🏋  Burpees                      [🗑]          │ │
│ │    Disliked                                    │ │
│ └───────────────────────────────────────────────┘ │
│                                                   │
│ ── AVOIDED TAB ──                                 │
│ ┌───────────────────────────────────────────────┐ │
│ │ 🏋  Box Jumps                    [🗑]          │ │
│ │    Avoided                                     │ │
│ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Liked Exercises Tab

- Each item: dumbbell icon + exercise name + "Liked" badge + trash button
- **Empty state:** "No liked exercises yet. Like exercises in your workout plans to improve future suggestions."

### Disliked Exercises Tab

- Same layout with "Disliked" badge
- **Empty state:** "No disliked exercises yet. Dislike exercises to deprioritize them in future plans."

### Avoided Exercises Tab

- Same layout with "Avoided" badge
- **Empty state:** "No avoided exercises yet. Avoid exercises you never want to see in future plans."

### Removing Exercise Preference Items

```
DELETE /api/preferences/exercise/{preferenceId}
Authorization: Bearer {accessToken}

Response: { "ok": true }
```

After removing, invalidate the `/api/preferences/exercise` query.

---

## PART 10: How Preferences Influence AI Generation

All accumulated preferences feed into future AI plan generation:

### Meal Generation
The server reads:
- **Liked meals** → AI is told "the user likes these types of meals, include similar ones"
- **Disliked meals** → AI is told "the user dislikes these meals, avoid similar ones"
- **Avoided ingredients** → AI is told "NEVER use these ingredients" (hard constraint)
- **Preferred ingredients** → AI is told "the user prefers these ingredients, include them when possible" (soft constraint)
- **Profile `foodsToAvoid`** → Combined with avoided ingredients from feedback
- **Profile `allergiesIntolerances`** → Hard constraint, separate from feedback system
- **Profile `favoriteMealsText`** → Soft constraint from profile

### Workout Generation
The server reads:
- **Avoided exercises** → AI is told "NEVER include these exercises" (hard constraint)
- **Disliked exercises** → AI is told "deprioritize these exercises, use alternatives when possible"
- **Liked exercises** → AI is told "include these exercises when appropriate"
- **Profile `healthConstraints`** → Injuries/limitations the AI avoids

### When Preferences Are Read
Preferences are read at generation time — meaning if a user likes a meal today, the next plan they generate will consider that preference. It does NOT retroactively change existing plans.

---

## Complete API Reference

### Meal Feedback
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Submit meal feedback | POST | `/api/feedback/meal` | `{ planId?, mealFingerprint, mealName, cuisineTag, feedback, ingredients? }` |
| Get feedback for a plan | GET | `/api/feedback/plan/{planId}` | — |

### Meal Preferences
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Get all meal preferences | GET | `/api/preferences` | — |
| Remove liked/disliked meal | DELETE | `/api/preferences/meal/{id}` | — |
| Remove avoided ingredient | DELETE | `/api/preferences/ingredient/{id}` | — |

### Ingredient Proposals
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Get pending proposals | GET | `/api/ingredient-proposals` | — |
| Resolve a proposal | POST | `/api/ingredient-proposals/{id}/resolve` | `{ chosenIngredients, action }` |

### Workout/Session Feedback
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Submit session feedback | POST | `/api/feedback/workout` | `{ workoutPlanId?, dayIndex, sessionKey, feedback }` |
| Get feedback for a workout | GET | `/api/feedback/workout/{planId}` | — |

### Exercise Preferences
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Get all exercise preferences | GET | `/api/preferences/exercise` | — |
| Save exercise preference | POST | `/api/preferences/exercise` | `{ exerciseKey, exerciseName, status }` |
| Remove by ID | DELETE | `/api/preferences/exercise/{id}` | — |
| Remove by key | DELETE | `/api/preferences/exercise/key/{key}` | — |

### Meal Swap (7-Day Plans Only)
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Swap a meal | POST | `/api/plan/{planId}/swap` | `{ dayIndex, mealType }` |

### Day/Session Regeneration (7-Day Plans)
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Regenerate a meal day | POST | `/api/plan/{planId}/regenerate-day` | `{ dayIndex }` |
| Regenerate a workout session | POST | `/api/workout/{planId}/regenerate-session` | `{ dayIndex }` |

### Daily Plan Regeneration
| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Regenerate daily meals | POST | `/api/daily-meal/{date}/regenerate` | `{}` |
| Regenerate daily workout | POST | `/api/daily-workout/{date}/regenerate` | `{}` |
