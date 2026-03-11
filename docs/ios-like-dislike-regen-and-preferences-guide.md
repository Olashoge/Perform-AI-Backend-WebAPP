# iOS Guide: Like, Dislike & Preferences — Complete Implementation Reference

This document is the definitive guide for implementing the Like/Dislike button behaviors and the Meal Preferences and Exercise Preferences screens in the iOS app. It traces every user action from button tap through API call through preference storage.

> **Note:** Meal swap, meal day regeneration, workout session regeneration, and daily plan regeneration features have been intentionally removed to simplify the launch product. These may be reintroduced in a future release.

---

## Table of Contents

1. [Meal Like/Dislike (7-Day & Daily Plans)](#1-meal-likedislike)
2. [Ingredient Proposal Flow (After Meal Dislike)](#2-ingredient-proposal-flow)
3. [Workout Session Like/Dislike](#3-workout-session-likedislike)
4. [Exercise Like/Dislike (Individual Exercises)](#4-exercise-likedislike)
5. [Exercise Avoid Modal (After Exercise Dislike)](#5-exercise-avoid-modal)
6. [Meal Preferences Page](#6-meal-preferences-page)
7. [Exercise Preferences Page](#7-exercise-preferences-page)
8. [How Preferences Feed Into AI Generation](#8-how-preferences-feed-into-ai)
9. [Complete API Reference Table](#9-complete-api-reference)

---

## 1. Meal Like/Dislike

### Where It Appears
- **7-day meal plan view** — each MealCard has thumbs-up and thumbs-down buttons
- **Daily meal plan view** — same buttons per meal

### Meal Fingerprint (Critical)

Every meal is uniquely identified by a **fingerprint** string. This must be computed identically on iOS:

```
func generateMealFingerprint(mealName: String, cuisineTag: String, ingredients: [String]?) -> String {
    func slugify(_ str: String) -> String {
        str.lowercased()
           .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
           .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
    
    let keyIngredients = [
        "chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb",
        "tofu", "tempeh", "egg", "eggs",
        "beans", "lentils", "chickpeas",
        "milk", "cheese", "yogurt", "cream",
        "rice", "pasta", "bread", "quinoa", "oats",
        "avocado", "mushroom", "mushrooms"
    ]
    
    let namePart = slugify(mealName)
    let cuisinePart = slugify(cuisineTag)
    var proteinPart = "none"
    
    if let ingredients = ingredients, !ingredients.isEmpty {
        let combined = ingredients.joined(separator: " ").lowercased()
        for key in keyIngredients {
            if combined.contains(key) {
                proteinPart = key
                break  // first match wins
            }
        }
    }
    
    return "\(namePart)|\(cuisinePart)|\(proteinPart)"
}
```

**Example:** `"Greek Veggie Omelet"` + `"Mediterranean"` + `["egg", "spinach", "feta"]` → `"greek-veggie-omelet|mediterranean|egg"`

### Button Tap Logic

```
On Like tap:
  if currentState == "like"  → send feedback "neutral" (un-like)
  if currentState == nil     → send feedback "like"
  if currentState == "dislike" → send feedback "like" (overwrite)

On Dislike tap:
  if currentState == "dislike" → send feedback "neutral" (un-dislike)
  if currentState == nil       → send feedback "dislike"
  if currentState == "like"    → send feedback "dislike" (overwrite)
```

### API Call

```
POST /api/feedback/meal

Body:
{
  "planId": "plan-uuid",
  "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
  "mealName": "Greek Veggie Omelet",
  "cuisineTag": "Mediterranean",
  "feedback": "like" | "dislike" | "neutral",
  "ingredients": ["egg", "spinach", "feta cheese", "olive oil", "tomato"]
}
```

**Where each field comes from:**
- `planId` — The meal plan's ID (from the plan object)
- `mealFingerprint` — Computed using the function above
- `mealName` — `meal.name` from the plan JSON
- `cuisineTag` — `meal.cuisineTag` from the plan JSON
- `feedback` — The new state being sent
- `ingredients` — `meal.ingredients` array from the plan JSON

### Response

```json
{
  "record": {
    "id": "feedback-uuid",
    "userId": "...",
    "mealPlanId": "plan-uuid",
    "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
    "mealName": "Greek Veggie Omelet",
    "cuisineTag": "Mediterranean",
    "feedback": "like"
  },
  "feedback": "like",
  "proposalId": null,
  "proposalIngredients": []
}
```

**When feedback is "like":**
- Backend automatically extracts key ingredients and saves them as `"prefer"` in `ingredient_preferences`
- No additional UI action needed

**When feedback is "dislike":**
- Backend creates an ingredient proposal and returns `proposalId` + `proposalIngredients`
- iOS must show the Ingredient Proposal Modal (see §2)

**When feedback is "neutral":**
- Record is updated to neutral (effectively removing the preference)
- No modal needed

### Loading Existing Feedback (Restoring Button States)

When viewing a meal plan, load existing feedback to set initial button states:

```
GET /api/feedback/plan/:planId
```

Response — a map of fingerprint → feedback:
```json
{
  "greek-veggie-omelet|mediterranean|egg": "like",
  "grilled-chicken-salad|american|chicken": "dislike"
}
```

Use this to set the initial state of each meal's like/dislike buttons.

### Optimistic UI Pattern

The web app uses optimistic updates for instant feedback:
1. Maintain a local state dictionary of `[fingerprint: feedbackState]`
2. On button tap, immediately update local state
3. Fire the API call
4. On API success, invalidate/refetch the feedback query
5. Merge server state with optimistic state (optimistic takes priority until server responds)

### Visual States

| State | Like Button | Dislike Button |
|:------|:------------|:---------------|
| Neutral | Gray/muted | Gray/muted |
| Liked | Green (emerald-600) | Gray/muted |
| Disliked | Gray/muted | Red (rose-600) |

---

## 2. Ingredient Proposal Flow

This flow triggers **only** after a meal dislike.

### Step 1: Detect Proposal in Response

After `POST /api/feedback/meal` with `feedback: "dislike"`, check the response:

```json
{
  "proposalId": "proposal-uuid",
  "proposalIngredients": ["egg", "feta cheese", "olive oil"]
}
```

If `proposalId` is non-null AND `proposalIngredients` has items, show the modal.

### Step 2: Show Ingredient Selection Modal

Display a modal with:
- Title: **"Avoid ingredients from this meal?"**
- Description: "You disliked **{mealName}**. Would you like to avoid any of these ingredients in future plans?"
- A checkbox list of `proposalIngredients`
- Two buttons:
  - **"Skip"** — closes modal without avoiding anything
  - **"Avoid Selected"** — disabled until at least 1 checkbox is checked

### Step 3: Resolve the Proposal

**If user taps "Avoid Selected":**
```
POST /api/ingredient-proposals/:proposalId/resolve

Body:
{
  "chosenIngredients": ["feta cheese"],
  "action": "accepted"
}
```
Backend saves each chosen ingredient as `preference: "avoid"` in `ingredient_preferences`.

**If user taps "Skip":**
```
POST /api/ingredient-proposals/:proposalId/resolve

Body:
{
  "chosenIngredients": [],
  "action": "declined"
}
```
Proposal is marked as declined, no ingredients are avoided.

### Step 4: After Resolution

Close the modal. The avoided ingredients now appear on the Meal Preferences page's "Avoided" tab and influence all future AI-generated plans.

### Pending Proposals

If a user dismisses the app before resolving, pending proposals can be fetched later:
```
GET /api/ingredient-proposals
```
The Meal Preferences page shows these as a "Pending Ingredient Review" card at the top.

---

## 3. Workout Session Like/Dislike

### Where It Appears
- **7-day workout plan view only** — each SessionCard has thumbs-up/thumbs-down
- NOT on daily workout view (daily workouts don't have session-level feedback)

### Session Key Format
```
day{dayIndex}_{session.focus.toLowerCase().replaceAll(" ", "_")}
```
Example: Day 1 with focus "Push Day" → `"day1_push_day"`

### Button Tap Logic
Same toggle pattern as meal feedback: like → neutral, neutral → like, like ↔ dislike.

### API Call
```
POST /api/feedback/workout

Body:
{
  "workoutPlanId": "plan-uuid",
  "sessionKey": "day1_push_day",
  "feedback": "like" | "dislike"
}
```

### Loading Existing Feedback
```
GET /api/feedback/workout/:planId
```

Response — map of session key → feedback:
```json
{
  "day1_push_day": "like",
  "day3_legs": "dislike"
}
```

### Notes
- Session feedback is stored in `workout_feedback` table
- It's used for tracking and future adaptation but does NOT trigger a modal
- It's separate from exercise-level preferences

---

## 4. Exercise Like/Dislike (Individual Exercises)

### Where It Appears
- **7-day workout plan view** — each ExerciseRow has thumbs-up/thumbs-down
- **Daily workout view** — same buttons per exercise

### Exercise Key Format (CRITICAL — Must Match Exactly)

```
func exerciseToKey(_ name: String) -> String {
    name.lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
}
```

**Uses UNDERSCORES, not hyphens.** This is different from meal fingerprint slugification.

Examples:
- `"Barbell Back Squat"` → `"barbell_back_squat"`
- `"Dumbbell Curl (21s)"` → `"dumbbell_curl_21s"`
- `"Push-Up"` → `"push_up"`

### Button Tap Logic

```
On Like tap:
  if currentState == "liked"           → DELETE preference (return to neutral)
  if currentState == nil               → POST with status "liked"
  if currentState == "disliked"        → POST with status "liked" (upsert overwrite)
  if currentState == "avoided"         → POST with status "liked" (upsert overwrite)

On Dislike tap:
  if currentState == "disliked"        → DELETE preference (return to neutral)
  if currentState == "avoided"         → DELETE preference (return to neutral)
  if currentState == nil               → Show Avoid Modal (see §7)
  if currentState == "liked"           → Show Avoid Modal (see §7)
```

### API Calls

**Save preference (like, dislike, or avoid):**
```
POST /api/preferences/exercise

Body:
{
  "exerciseKey": "barbell_back_squat",
  "exerciseName": "Barbell Back Squat",
  "status": "liked" | "disliked" | "avoided"
}
```
This is an upsert — if a preference already exists for this key, it's updated.

**Remove preference (return to neutral):**
```
DELETE /api/preferences/exercise/key/:exerciseKey
```
Example: `DELETE /api/preferences/exercise/key/barbell_back_squat`

### Loading Existing Preferences (Restoring Button States)

```
GET /api/preferences/exercise
```

Response:
```json
{
  "liked": [
    { "id": "uuid", "exerciseKey": "barbell_back_squat", "exerciseName": "Barbell Back Squat", "status": "liked", "createdAt": "...", "updatedAt": "..." }
  ],
  "disliked": [
    { "id": "uuid", "exerciseKey": "burpees", "exerciseName": "Burpees", "status": "disliked", "createdAt": "...", "updatedAt": "..." }
  ],
  "avoided": [
    { "id": "uuid", "exerciseKey": "box_jumps", "exerciseName": "Box Jumps", "status": "avoided", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

Build a local lookup dictionary: `[exerciseKey: status]` by iterating all three arrays. Use this to set the initial state of each exercise's like/dislike buttons.

### Visual States

| State | Like Button | Dislike Button | Extra |
|:------|:------------|:---------------|:------|
| Neutral | Gray/muted | Gray/muted | — |
| Liked | Green (green-600) | Gray/muted | — |
| Disliked | Gray/muted | Red (red-600) | — |
| Avoided | Gray/muted | Red (red-600) | Show "Avoided" badge next to exercise name |

---

## 5. Exercise Avoid Modal

This modal appears when a user taps the dislike button on an exercise that is currently neutral or liked.

### Modal Content
- Title: **"Avoid this exercise?"**
- Description: "You disliked **{exerciseName}**. Would you like to completely avoid it in future workout plans?"
- Two buttons:
  - **"Just Dislike"** (outline/secondary style)
  - **"Avoid Completely"** (primary style, with Ban icon)

### "Just Dislike" Action
```
POST /api/preferences/exercise
Body: { "exerciseKey": "burpees", "exerciseName": "Burpees", "status": "disliked" }
```
- Exercise still may appear in future plans but AI is told the user dislikes it
- Close modal

### "Avoid Completely" Action
```
POST /api/preferences/exercise
Body: { "exerciseKey": "burpees", "exerciseName": "Burpees", "status": "avoided" }
```
- Exercise is explicitly excluded from all future AI-generated workout plans
- Show toast: "{exerciseName} will be avoided in future plans"
- Close modal

---

## 6. Meal Preferences Page

### What It Is
A dedicated page showing all accumulated meal feedback and ingredient preferences. This is the central hub where users can see and manage everything they've liked, disliked, and chosen to avoid.

### Data Source
```
GET /api/preferences
```

Response shape:
```json
{
  "likedMeals": [
    {
      "id": "uuid",
      "mealFingerprint": "greek-veggie-omelet|mediterranean|egg",
      "mealName": "Greek Veggie Omelet",
      "cuisineTag": "Mediterranean",
      "feedback": "like",
      "createdAt": "2026-02-20T10:00:00Z"
    }
  ],
  "dislikedMeals": [
    {
      "id": "uuid",
      "mealFingerprint": "mushroom-risotto|italian|mushroom",
      "mealName": "Mushroom Risotto",
      "cuisineTag": "Italian",
      "feedback": "dislike",
      "createdAt": "2026-02-19T15:00:00Z"
    }
  ],
  "avoidIngredients": [
    {
      "id": "uuid",
      "ingredientKey": "feta cheese",
      "preference": "avoid",
      "source": "derived",
      "createdAt": "2026-02-19T15:01:00Z"
    }
  ],
  "preferIngredients": [
    {
      "id": "uuid",
      "ingredientKey": "chicken",
      "preference": "prefer",
      "source": "derived",
      "createdAt": "2026-02-20T10:01:00Z"
    }
  ]
}
```

### UI Structure — Three Tabs

**Tab 1: "Liked" (ThumbsUp icon)**
- Lists all `likedMeals`
- Each item shows: meal name, cuisine tag badge, trash button
- Empty state: "No liked meals yet. Like meals in your plans to help personalize future recommendations."

**Tab 2: "Disliked" (ThumbsDown icon)**
- Lists all `dislikedMeals`
- Same card layout as liked
- Empty state: "No disliked meals. Dislike meals to help us avoid similar options."

**Tab 3: "Avoided" (Ban icon)**
- Lists all `avoidIngredients`
- Each item shows: ingredient name with Ban icon, "derived" source badge, trash button
- Empty state: "No avoided ingredients. When you dislike a meal, you'll be asked which ingredients to avoid."

### Pending Ingredient Proposals

At the top of the page (above tabs), show any pending proposals:

```
GET /api/ingredient-proposals
```

Response:
```json
[
  {
    "id": "proposal-uuid",
    "mealName": "Mushroom Risotto",
    "proposedIngredients": ["mushroom", "cheese", "cream"],
    "status": "pending",
    "createdAt": "2026-02-19T15:00:00Z"
  }
]
```

Display as a highlighted card: "You disliked **Mushroom Risotto** — select ingredients to avoid" with checkboxes. Uses the same resolve flow as §2.

### Deletion

**Remove a meal feedback:**
```
DELETE /api/preferences/meal/:feedbackId
```

**Remove an ingredient preference:**
```
DELETE /api/preferences/ingredient/:preferenceId
```

After deletion, refresh the `/api/preferences` query. Show toast: "Preference removed."

### How Data Gets Here

| Source Action | What Gets Stored | Where It Appears |
|:-------------|:-----------------|:-----------------|
| Like a meal | `meal_feedback` record (like) | Liked tab |
| Like a meal | Auto-derived `ingredient_preferences` (prefer) for key ingredients | Preferred ingredients (not in a separate tab, used by AI) |
| Dislike a meal | `meal_feedback` record (dislike) | Disliked tab |
| Resolve proposal (accept) | `ingredient_preferences` (avoid) for chosen ingredients | Avoided tab |
| Resolve proposal (decline) | Nothing | — |

---

## 7. Exercise Preferences Page

### What It Is
A dedicated page showing all accumulated exercise preferences (liked, disliked, avoided).

### Data Source
```
GET /api/preferences/exercise
```

Response shape:
```json
{
  "liked": [
    {
      "id": "uuid",
      "exerciseKey": "barbell_back_squat",
      "exerciseName": "Barbell Back Squat",
      "status": "liked",
      "createdAt": "2026-02-20T10:00:00Z",
      "updatedAt": "2026-02-20T10:00:00Z"
    }
  ],
  "disliked": [
    {
      "id": "uuid",
      "exerciseKey": "burpees",
      "exerciseName": "Burpees",
      "status": "disliked",
      "createdAt": "2026-02-19T15:00:00Z",
      "updatedAt": "2026-02-19T15:00:00Z"
    }
  ],
  "avoided": [
    {
      "id": "uuid",
      "exerciseKey": "box_jumps",
      "exerciseName": "Box Jumps",
      "status": "avoided",
      "createdAt": "2026-02-18T12:00:00Z",
      "updatedAt": "2026-02-18T12:00:00Z"
    }
  ]
}
```

### UI Structure — Three Tabs

**Tab 1: "Liked" (ThumbsUp icon)**
- Lists all `liked` exercises
- Each item shows: Dumbbell icon, exercise name, "Liked" badge, trash button
- Empty state: "No liked exercises yet. Like exercises in your workout plans to personalize future workouts."

**Tab 2: "Disliked" (ThumbsDown icon)**
- Lists all `disliked` exercises
- Same card layout, "Disliked" badge
- Empty state: "No disliked exercises."

**Tab 3: "Avoided" (Ban icon)**
- Lists all `avoided` exercises
- Same card layout, "Avoided" badge
- Empty state: "No avoided exercises. Exercises you choose to avoid will never appear in future plans."

### Deletion

**Remove an exercise preference (by record ID):**
```
DELETE /api/preferences/exercise/:id
```

After deletion, refresh the `/api/preferences/exercise` query. Show toast: "Preference removed."

### How Data Gets Here

| Source Action | What Gets Stored | Where It Appears |
|:-------------|:-----------------|:-----------------|
| Like an exercise | `exercise_preferences` record (liked) | Liked tab |
| Dislike → "Just Dislike" | `exercise_preferences` record (disliked) | Disliked tab |
| Dislike → "Avoid Completely" | `exercise_preferences` record (avoided) | Avoided tab |
| Un-like / Un-dislike | Record deleted | Disappears from all tabs |

---

## 8. How Preferences Feed Into AI Generation

All preferences are fetched by the backend before every AI generation call via `storage.getUserPreferenceContext(userId)`. This returns:

```typescript
{
  likedMeals: string[],        // fingerprints of liked meals
  dislikedMeals: string[],     // fingerprints of disliked meals
  avoidIngredients: string[],  // ingredient names to avoid
  preferIngredients: string[], // ingredient names to prefer
  avoidedExercises: string[],  // exercise names to exclude
  dislikedExercises: string[], // exercise names AI should minimize
}
```

This context is injected into AI prompts for:
- New 7-day meal plan generation
- Meal swaps (existing meal used as negative reference + preference context)
- Day regeneration
- Daily meal generation
- New workout plan generation
- Workout session regeneration
- Daily workout generation

**The learning loop:** More feedback → better preference data → more personalized plans → better user experience.

---

## 9. Complete API Reference

### Meal Feedback

| Action | Method | Endpoint | Body | Notes |
|:-------|:-------|:---------|:-----|:------|
| Like/Dislike meal | POST | `/api/feedback/meal` | `{planId, mealFingerprint, mealName, cuisineTag, feedback, ingredients}` | Upsert; returns proposal on dislike |
| Get feedback for plan | GET | `/api/feedback/plan/:planId` | — | Returns `{fingerprint: "like"/"dislike"}` map |
| Get all meal prefs | GET | `/api/preferences` | — | Returns liked/disliked meals + ingredients |
| Remove meal feedback | DELETE | `/api/preferences/meal/:id` | — | |
| Remove ingredient pref | DELETE | `/api/preferences/ingredient/:id` | — | |
| Get pending proposals | GET | `/api/ingredient-proposals` | — | |
| Resolve proposal | POST | `/api/ingredient-proposals/:id/resolve` | `{chosenIngredients, action}` | action: "accepted"/"declined" |

### Exercise Feedback

| Action | Method | Endpoint | Body | Notes |
|:-------|:-------|:---------|:-----|:------|
| Like/Dislike/Avoid exercise | POST | `/api/preferences/exercise` | `{exerciseKey, exerciseName, status}` | Upsert; status: liked/disliked/avoided |
| Get all exercise prefs | GET | `/api/preferences/exercise` | — | Returns `{liked, disliked, avoided}` arrays |
| Remove by record ID | DELETE | `/api/preferences/exercise/:id` | — | |
| Remove by exercise key | DELETE | `/api/preferences/exercise/key/:key` | — | |

### Workout Session Feedback

| Action | Method | Endpoint | Body | Notes |
|:-------|:-------|:---------|:-----|:------|
| Like/Dislike session | POST | `/api/feedback/workout` | `{workoutPlanId, sessionKey, feedback}` | Upsert |
| Get feedback for plan | GET | `/api/feedback/workout/:planId` | — | Returns `{sessionKey: "like"/"dislike"}` map |

### Swap & Regeneration (Removed)

> Swap, regeneration, and allowance endpoints have been intentionally removed for launch simplification. These features may return in a future release.
