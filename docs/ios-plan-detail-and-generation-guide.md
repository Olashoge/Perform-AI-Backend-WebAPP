# iOS App — Plan Detail Views & Async Generation Guide

This document explains exactly how the iOS app must fetch, display, and interact with meal plans, workout plans, and goal plans. It addresses two critical issues:

1. **Plans show names but aren't tappable / don't show content** — the app must fetch the full plan object (including `planJson`) and render the day-by-day detail view.
2. **Plan generation appears instant** — the app must implement async polling. Generation takes 15–60 seconds on the server; the POST only creates a "generating" placeholder.

---

## Table of Contents

- [Critical Architecture Concept](#critical-architecture-concept)
- [Issue 1: Viewing Plan Details](#issue-1-viewing-plan-details)
- [Issue 2: Async Plan Generation with Polling](#issue-2-async-plan-generation-with-polling)
- [Full Flow: Create → Poll → View (Meal Plan)](#full-flow-create--poll--view-meal-plan)
- [Full Flow: Create → Poll → View (Workout Plan)](#full-flow-create--poll--view-workout-plan)
- [Goal Plan Detail View](#goal-plan-detail-view)
- [Plan JSON Structures (What to Render)](#plan-json-structures-what-to-render)
- [UI Rendering Guide: Meal Plan Detail](#ui-rendering-guide-meal-plan-detail)
- [UI Rendering Guide: Workout Plan Detail](#ui-rendering-guide-workout-plan-detail)
- [Error Handling](#error-handling)

---

## Critical Architecture Concept

**The plan's actual content (meals, recipes, workouts, exercises) lives in the `planJson` field of the full plan object.** The list endpoints and status endpoints do NOT return `planJson` — you must fetch the individual plan by ID to get the content.

```
GET /api/plans          → list of plans (has title, status, dates — NO planJson)
GET /api/plan/:id       → single plan (has EVERYTHING including planJson)
GET /api/plan/:id/status → just { id, status, pricingStatus } (for polling only)
```

---

## Issue 1: Viewing Plan Details

### The Problem
The iOS app fetches goal plans or plan lists and shows the plan title/name, but when the user taps a plan, nothing happens or there's no detail view. This is because:
1. The list data does NOT contain the plan content (`planJson`)
2. The app needs to make a **separate API call** to fetch the full plan with its content
3. The app needs a detail view screen that parses and renders the `planJson`

### Solution: Navigation Flow

```
Plans List Screen                    Plan Detail Screen
┌──────────────────┐                ┌──────────────────┐
│ My Meal Plans    │                │ Mediterranean    │
│                  │   tap plan     │ Lean Week        │
│ ┌──────────────┐ │ ──────────►   │                  │
│ │ Med. Lean Wk │ │               │ Day 1  Day 2 ... │
│ │ Ready · 7 day│ │               │ ┌──────────────┐ │
│ └──────────────┘ │               │ │ Breakfast    │ │
│ ┌──────────────┐ │               │ │ Greek Omelet │ │
│ │ Muscle Gain  │ │               │ │ 450 cal      │ │
│ │ Generating...│ │               │ └──────────────┘ │
│ └──────────────┘ │               │ ┌──────────────┐ │
└──────────────────┘               │ │ Lunch        │ │
                                   │ │ Grilled Chkn │ │
                                   └──────────────────┘
```

### API Calls for Detail Views

**Meal Plan Detail:**
```
GET /api/plan/{planId}
Authorization: Bearer {accessToken}

Response: Full MealPlan object including:
{
  "id": "uuid",
  "userId": "uuid",
  "status": "ready",           // "generating" | "ready" | "failed"
  "planJson": { ... },         // THE ACTUAL CONTENT — 7 days of meals
  "preferencesJson": { ... },  // What the user selected on the form
  "planStartDate": "2026-03-15",
  "pricingStatus": "ready",
  "swapCount": 0,
  "regenDayCount": 0,
  "createdAt": "...",
  "idempotencyKey": "..."
}
```

**Workout Plan Detail:**
```
GET /api/workout/{workoutPlanId}
Authorization: Bearer {accessToken}

Response: Full WorkoutPlan object including:
{
  "id": "uuid",
  "userId": "uuid",
  "status": "ready",
  "planJson": { ... },         // THE ACTUAL CONTENT — 7 days of workouts
  "preferencesJson": { ... },
  "planStartDate": "2026-03-15",
  "errorMessage": null,
  "createdAt": "..."
}
```

### When a Plan is Tapped

```swift
// Pseudocode for plan tap handler
func onPlanTapped(plan: PlanListItem) {
    switch plan.status {
    case "ready":
        // Navigate to detail view, fetch full plan
        navigateTo(.planDetail(planId: plan.id))
        
    case "generating":
        // Navigate to generating/polling screen
        navigateTo(.planGenerating(planId: plan.id))
        
    case "failed":
        // Show error with option to retry
        navigateTo(.planFailed(planId: plan.id, error: plan.errorMessage))
    }
}
```

### Detail Screen Data Fetch

```swift
// On the detail screen, fetch the FULL plan object
// This is the call that returns planJson with all the content

// For meal plans:
let mealPlan = await api.get("/api/plan/\(planId)")
let planContent = mealPlan.planJson  // This has the 7 days of meals!

// For workout plans:
let workoutPlan = await api.get("/api/workout/\(planId)")
let planContent = workoutPlan.planJson  // This has the 7 days of workouts!
```

### Important: Check Status on Detail Screen Too

Even when navigating to a detail screen, always check the plan's `status` field:

```swift
if fullPlan.status == "generating" {
    // Redirect to generating screen with poll
    showGeneratingUI(planId: fullPlan.id)
} else if fullPlan.status == "failed" {
    // Show error state
    showFailedUI(error: fullPlan.errorMessage)
} else if fullPlan.status == "ready" {
    // Parse planJson and render the day-by-day view
    renderPlanDetail(planJson: fullPlan.planJson)
}
```

---

## Issue 2: Async Plan Generation with Polling

### The Problem
When the user taps "Generate Plan," the iOS app immediately shows the plan as complete. This is wrong. Here's what actually happens:

1. `POST /api/plan` returns **immediately** (~200ms) with a placeholder plan that has `status: "generating"`
2. The server starts generating the plan in the **background** (takes 15–60 seconds)
3. The client must **poll** the status endpoint every 2–3 seconds until status changes to `"ready"` or `"failed"`

### The POST Response is NOT the Final Plan

```json
// POST /api/plan response — this is just the placeholder!
{
  "id": "abc-123",
  "status": "generating",    // <-- NOT ready yet!
  "planJson": null,           // <-- NO content yet!
  "userId": "...",
  "createdAt": "..."
}
```

The `planJson` field is `null` because the AI hasn't generated it yet. The plan title/name won't exist until generation completes.

### Correct Polling Implementation

```swift
// STEP 1: POST to create the plan (returns immediately)
let response = await api.post("/api/plan", body: [
    "goal": selectedGoal,
    "dietStyles": selectedDietStyles,
    "mealsPerDay": mealsPerDay,
    // ... other form fields
    "idempotencyKey": UUID().uuidString,
    "startDate": selectedStartDate  // optional
])

let planId = response.id
// response.status == "generating" at this point
// response.planJson == null at this point

// STEP 2: Navigate to "Generating" screen
navigateTo(.planGenerating(planId: planId))

// STEP 3: Poll every 2-3 seconds on the generating screen
func startPolling(planId: String) {
    timer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { _ in
        Task {
            // Use the lightweight status endpoint (NOT the full plan endpoint)
            let status = await api.get("/api/plan/\(planId)/status")
            // status response: { "id": "abc-123", "status": "ready", "pricingStatus": "ready" }
            
            switch status.status {
            case "ready":
                timer.invalidate()
                // NOW navigate to the detail view
                navigateTo(.planDetail(planId: planId))
                
            case "failed":
                timer.invalidate()
                showError("Plan generation failed. Please try again.")
                
            case "generating":
                // Keep polling, update UI progress indicator
                updateProgressUI()  // e.g., "Generating your plan..."
            }
        }
    }
}
```

### Workout Plan Polling (Slightly Different Endpoint)

```swift
// POST /api/workout — note the body structure differs (preferences is nested)
let response = await api.post("/api/workout", body: [
    "preferences": [
        "goal": selectedGoal,
        "location": selectedLocation,
        "daysOfWeek": selectedDays,
        "sessionLength": selectedSessionLength,
        // ... other workout form fields
    ],
    "idempotencyKey": UUID().uuidString,
    "startDate": selectedStartDate  // optional
])

let planId = response.id
// response.status == "generating"

// Poll workout status endpoint
func pollWorkoutStatus(planId: String) {
    // Use workout-specific status endpoint
    let status = await api.get("/api/workout/\(planId)/status")
    // Response: { "status": "ready" | "generating" | "failed", "errorMessage": null }
}
```

### Generating Screen UI

While polling, show a generating screen with:
- Animated progress indicator (spinner/pulse animation)
- Message like "Creating your personalized plan..."
- Optional: cycle through helpful tips
- Cancel/back button (the plan will still generate server-side; it won't be wasted)

---

## Full Flow: Create → Poll → View (Meal Plan)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: User fills out meal plan form                       │
│         (goal, diet styles, meals per day, etc.)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: POST /api/plan                                      │
│         Body: { goal, dietStyles, mealsPerDay, ...,         │
│                 idempotencyKey: "uuid", startDate: "..." }  │
│         Response: { id: "abc", status: "generating",        │
│                     planJson: null }                         │
│         ⚠️  planJson is NULL here — plan not ready yet!     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Navigate to Generating Screen                       │
│         Show spinner + "Creating your personalized plan..." │
│                                                             │
│         Poll every 2.5 seconds:                             │
│         GET /api/plan/{id}/status                           │
│         → { id, status: "generating", pricingStatus }       │
│         → { id, status: "generating", pricingStatus }       │
│         → { id, status: "ready", pricingStatus: "ready" }   │  ← typically 15-60s
└─────────────────────┬───────────────────────────────────────┘
                      │ status == "ready"
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Fetch full plan                                     │
│         GET /api/plan/{id}                                  │
│         Response includes planJson with all 7 days of meals │
│                                                             │
│         Navigate to Plan Detail Screen                      │
│         Parse planJson and render day-by-day view           │
└─────────────────────────────────────────────────────────────┘
```

## Full Flow: Create → Poll → View (Workout Plan)

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: POST /api/workout                                   │
│         Body: { preferences: { goal, location, daysOfWeek,  │
│                 sessionLength, ... },                       │
│                 idempotencyKey: "uuid", startDate: "..." }  │
│         Response: { id: "xyz", status: "generating" }       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Poll: GET /api/workout/{id}/status                  │
│         → { status: "generating" }                          │
│         → { status: "ready" }                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ status == "ready"
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Fetch: GET /api/workout/{id}                        │
│         Response includes planJson with all 7 days          │
│         Navigate to Workout Detail Screen                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Goal Plan Detail View

Goal plans are containers that link a meal plan and workout plan together. When the user taps a goal plan, the app needs to fetch the goal plan AND its linked plans separately.

### Fetching a Goal Plan's Content

```swift
// Step 1: Get the goal plan
let goalPlan = await api.get("/api/goal-plans/\(goalPlanId)")
// goalPlan has: id, goalType, title, startDate, mealPlanId, workoutPlanId, status

// Step 2: Fetch linked plans (if they exist)
var mealPlan: MealPlan? = nil
var workoutPlan: WorkoutPlan? = nil

if let mealPlanId = goalPlan.mealPlanId {
    mealPlan = await api.get("/api/plan/\(mealPlanId)")
    // mealPlan.planJson has the 7 days of meals
}

if let workoutPlanId = goalPlan.workoutPlanId {
    workoutPlan = await api.get("/api/workout/\(workoutPlanId)")
    // workoutPlan.planJson has the 7 days of workouts
}

// Step 3: Render goal plan detail with both sub-plans
renderGoalPlanDetail(goalPlan, mealPlan, workoutPlan)
```

### Goal Plan Generation Status Polling

When a goal plan is being generated, use the dedicated generation-status endpoint:

```
GET /api/goal-plans/{id}/generation-status

Response:
{
  "goalPlanId": "uuid",
  "status": "generating",       // overall goal plan status
  "progress": { ... },          // optional progress info
  "planType": "both",           // "meal" | "workout" | "both"
  "mealPlan": {                 // only if mealPlanId exists
    "id": "uuid",
    "status": "generating",     // individual plan status
    "errorMessage": null
  },
  "workoutPlan": {              // only if workoutPlanId exists
    "id": "uuid",
    "status": "ready",          // can be ready before meal plan
    "errorMessage": null
  }
}
```

This allows showing independent progress for each sub-plan:
- "Workout plan ready ✓ — Meal plan generating..."
- "Both plans ready! ✓"

---

## Plan JSON Structures (What to Render)

### Meal Plan `planJson` Structure

This is what you get inside `planJson` when you call `GET /api/plan/{id}` and the plan status is `"ready"`:

```json
{
  "title": "Mediterranean Lean Week",
  "summary": "A 7-day plan focused on lean proteins and vegetables...",
  "nutritionNotes": {
    "dailyMacroTargetsRange": {
      "calories": "1800-2000",
      "protein_g": "140-160",
      "carbs_g": "180-220",
      "fat_g": "60-75"
    }
  },
  "days": [
    {
      "dayIndex": 1,
      "meals": {
        "breakfast": {
          "name": "Greek Veggie Omelet",
          "cuisineTag": "Mediterranean",
          "description": "Fluffy egg omelet with...",
          "prepTime": "5 min",
          "cookTime": "10 min",
          "servings": 1,
          "calories": 420,
          "macros": {
            "protein_g": 32,
            "carbs_g": 12,
            "fat_g": 28,
            "fiber_g": 3
          },
          "ingredients": [
            { "item": "eggs", "amount": "3 large" },
            { "item": "spinach", "amount": "1 cup" },
            { "item": "feta cheese", "amount": "30g" },
            { "item": "cherry tomatoes", "amount": "4" },
            { "item": "olive oil", "amount": "1 tsp" }
          ],
          "instructions": [
            "Whisk eggs in a bowl with salt and pepper.",
            "Heat olive oil in a non-stick pan over medium heat.",
            "Add spinach and tomatoes, cook 1 minute.",
            "Pour in eggs, cook until set, add feta, fold."
          ],
          "mealFingerprint": "greek-veggie-omelet|mediterranean|egg"
        },
        "lunch": { ... },
        "dinner": { ... }
      }
    },
    { "dayIndex": 2, "meals": { ... } },
    { "dayIndex": 3, "meals": { ... } },
    { "dayIndex": 4, "meals": { ... } },
    { "dayIndex": 5, "meals": { ... } },
    { "dayIndex": 6, "meals": { ... } },
    { "dayIndex": 7, "meals": { ... } }
  ],
  "groceryList": [
    { "item": "Eggs", "quantity": "18 large", "estimatedPrice": 4.99 },
    { "item": "Spinach", "quantity": "2 bags (10 oz)", "estimatedPrice": 5.98 },
    { "item": "Feta Cheese", "quantity": "200g", "estimatedPrice": 4.49 }
  ]
}
```

**Key points:**
- `days` is always an array of 7 objects
- Each day has a `meals` object with keys matching the meal slots the user chose
- If the user chose 2 meals (e.g., lunch + dinner), `breakfast` won't exist in that day
- The possible meal slot keys are: `"breakfast"`, `"lunch"`, `"dinner"`, `"snack"`
- Each meal has `name`, `calories`, `macros`, `ingredients`, `instructions`
- `mealFingerprint` is used for feedback tracking (like/dislike)

### Workout Plan `planJson` Structure

```json
{
  "title": "Strength Builder Program",
  "summary": "A 7-day program focused on progressive overload...",
  "days": [
    {
      "dayIndex": 1,
      "dayLabel": "Monday",
      "isWorkoutDay": true,
      "session": {
        "sessionTitle": "Upper Body Push",
        "focus": "Chest, Shoulders, Triceps",
        "durationMinutes": 45,
        "warmup": {
          "exercises": [
            { "name": "Arm Circles", "duration": "30 seconds" },
            { "name": "Band Pull-Aparts", "sets": 2, "reps": 15 }
          ]
        },
        "exercises": [
          {
            "name": "Barbell Bench Press",
            "sets": 4,
            "reps": "8-10",
            "restSeconds": 90,
            "notes": "Focus on controlled eccentric",
            "exerciseFingerprint": "barbell-bench-press"
          },
          {
            "name": "Overhead Press",
            "sets": 3,
            "reps": "10-12",
            "restSeconds": 60,
            "exerciseFingerprint": "overhead-press"
          },
          {
            "name": "Incline Dumbbell Fly",
            "sets": 3,
            "reps": "12-15",
            "restSeconds": 60,
            "exerciseFingerprint": "incline-dumbbell-fly"
          }
        ],
        "cooldown": {
          "exercises": [
            { "name": "Chest Stretch", "duration": "30 seconds each side" },
            { "name": "Shoulder Stretch", "duration": "30 seconds each side" }
          ]
        }
      }
    },
    {
      "dayIndex": 2,
      "dayLabel": "Tuesday",
      "isWorkoutDay": false,
      "session": null
    }
  ]
}
```

**Key points:**
- `days` is always an array of 7 objects
- `isWorkoutDay: false` means rest day — `session` will be `null`
- `isWorkoutDay: true` means workout day — `session` contains the full workout
- Each exercise has `name`, `sets`, `reps`, `restSeconds`
- `exerciseFingerprint` is used for feedback tracking
- Warmup and cooldown may or may not be present

---

## UI Rendering Guide: Meal Plan Detail

### Screen Layout

```
┌──────────────────────────────────────┐
│ ← Back                    ⋮ (menu)  │
│                                      │
│ Mediterranean Lean Week              │  ← planJson.title
│ Mar 15 – Mar 21, 2026               │  ← calculated from planStartDate
│ 🔥 Weight Loss                       │  ← from preferencesJson.goal
│                                      │
│ Daily Target: 1800-2000 cal          │  ← nutritionNotes
│ P: 140-160g  C: 180-220g  F: 60-75g │
│                                      │
│ ┌─Day 1─┬─Day 2─┬─Day 3─┬─Day 4─┐  │  ← horizontal scrollable tabs
│                                      │
│ ═══════════════════════════════════   │
│                                      │
│ ☀️ BREAKFAST                          │
│ ┌──────────────────────────────────┐ │
│ │ Greek Veggie Omelet         420c │ │  ← meal.name, meal.calories
│ │ Mediterranean                    │ │  ← meal.cuisineTag
│ │ P: 32g  C: 12g  F: 28g         │ │  ← meal.macros
│ │ ⏱ 15 min  🍽 1 serving          │ │  ← prepTime+cookTime, servings
│ │                                  │ │
│ │ ▶ Ingredients (5)               │ │  ← collapsible
│ │ ▶ Instructions (4 steps)        │ │  ← collapsible
│ │                                  │ │
│ │ 👍  👎  🔄 Swap                  │ │  ← feedback + swap button
│ └──────────────────────────────────┘ │
│                                      │
│ 🌤 LUNCH                             │
│ ┌──────────────────────────────────┐ │
│ │ ...                              │ │
│ └──────────────────────────────────┘ │
│                                      │
│ 🌙 DINNER                            │
│ ┌──────────────────────────────────┐ │
│ │ ...                              │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

### Data Mapping

```swift
// After fetching: GET /api/plan/{planId}
let plan = response  // Full MealPlan object

// Access the content
guard let planJson = plan.planJson else {
    // planJson is null — plan might still be generating
    return
}

// Header info
let title = planJson.title           // "Mediterranean Lean Week"
let summary = planJson.summary       // "A 7-day plan focused on..."
let macroRange = planJson.nutritionNotes?.dailyMacroTargetsRange

// Day tabs — always 7 days
let days = planJson.days  // Array of 7 day objects

// For each day
let day = days[selectedDayIndex]
let meals = day.meals  // Dictionary: { "breakfast": Meal, "lunch": Meal, "dinner": Meal }

// For each meal
let breakfast = meals["breakfast"]  // May not exist if user chose 2 meals
let lunch = meals["lunch"]
let dinner = meals["dinner"]

// Meal card data
let mealName = breakfast.name
let calories = breakfast.calories
let protein = breakfast.macros.protein_g
let carbs = breakfast.macros.carbs_g
let fat = breakfast.macros.fat_g
let ingredients = breakfast.ingredients  // [{ item: "eggs", amount: "3 large" }]
let instructions = breakfast.instructions  // ["Step 1...", "Step 2..."]
```

---

## UI Rendering Guide: Workout Plan Detail

### Screen Layout

```
┌──────────────────────────────────────┐
│ ← Back                    ⋮ (menu)  │
│                                      │
│ Strength Builder Program             │  ← planJson.title
│ Mar 15 – Mar 21, 2026               │
│ 💪 Muscle Gain                       │
│                                      │
│ ┌─Day 1─┬─Day 2─┬─Day 3─┬─Day 4─┐  │
│                                      │
│ ═══════════════════════════════════   │
│                                      │
│ UPPER BODY PUSH                      │  ← session.sessionTitle
│ Focus: Chest, Shoulders, Triceps     │  ← session.focus
│ ⏱ 45 min                            │  ← session.durationMinutes
│                                      │
│ WARMUP                               │
│ • Arm Circles — 30 seconds           │
│ • Band Pull-Aparts — 2×15           │
│                                      │
│ EXERCISES                            │
│ ┌──────────────────────────────────┐ │
│ │ 1. Barbell Bench Press           │ │
│ │    4 sets × 8-10 reps            │ │
│ │    Rest: 90s                     │ │
│ │    💡 Focus on controlled        │ │  ← notes
│ │       eccentric                  │ │
│ │    👍  👎                         │ │  ← feedback
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ 2. Overhead Press                │ │
│ │    3 sets × 10-12 reps           │ │
│ │    Rest: 60s                     │ │
│ └──────────────────────────────────┘ │
│                                      │
│ COOLDOWN                             │
│ • Chest Stretch — 30s each side      │
│ • Shoulder Stretch — 30s each side   │
└──────────────────────────────────────┘

For REST DAYS (isWorkoutDay == false):

┌──────────────────────────────────────┐
│ Day 2 — Tuesday                      │
│                                      │
│        😴 Rest Day                   │
│   Recovery and recuperation          │
│                                      │
└──────────────────────────────────────┘
```

### Data Mapping

```swift
// After fetching: GET /api/workout/{planId}
let plan = response  // Full WorkoutPlan object

guard let planJson = plan.planJson else { return }

let title = planJson.title
let days = planJson.days  // Array of 7

let day = days[selectedDayIndex]

if day.isWorkoutDay, let session = day.session {
    // Workout day — render session
    let sessionTitle = session.sessionTitle
    let focus = session.focus
    let duration = session.durationMinutes
    let warmup = session.warmup?.exercises
    let exercises = session.exercises
    let cooldown = session.cooldown?.exercises
    
    // Each exercise
    for exercise in exercises {
        let name = exercise.name
        let sets = exercise.sets
        let reps = exercise.reps        // can be "8-10" (string) or a number
        let rest = exercise.restSeconds
        let notes = exercise.notes       // optional tips
    }
} else {
    // Rest day — show rest day UI
    showRestDayView(dayLabel: day.dayLabel)
}
```

---

## Error Handling

### Rate Limiting (HTTP 429)
```json
{ "message": "Daily AI call limit reached (10/day). Try again tomorrow." }
```
Show a user-friendly message that they've hit their daily limit.

### Profile Required (HTTP 400)
```json
{ "message": "Please complete your Performance Blueprint...", "profileRequired": true }
```
When `profileRequired: true`, navigate the user to the profile setup screen.

### Constraint Blocked (HTTP 400)
```json
{
  "message": "Plan blocked by safety constraints.",
  "blocked": true,
  "violations": [
    { "ruleKey": "age_min", "severity": "BLOCK", "message": "...", "category": "safety" }
  ]
}
```
Display the violation messages to the user.

### Generation Failed (status: "failed")
When polling returns `status: "failed"`, the `errorMessage` field explains why. Show this to the user with a "Try Again" button that navigates back to the creation form.

### Idempotency
Always send a `idempotencyKey` (UUID) with creation requests. If the user double-taps or the network retries, the server returns the existing plan instead of creating a duplicate. Generate a new UUID each time the user intentionally submits the form.

---

## Summary of Key API Calls

| Action | Endpoint | Returns |
|--------|----------|---------|
| List meal plans | `GET /api/plans` | Array of plans (no planJson) |
| List workout plans | `GET /api/workouts` | Array of plans (no planJson) |
| List goal plans | `GET /api/goal-plans` | Array of goal plans |
| Get meal plan detail | `GET /api/plan/{id}` | Full plan WITH planJson |
| Get workout plan detail | `GET /api/workout/{id}` | Full plan WITH planJson |
| Get goal plan detail | `GET /api/goal-plans/{id}` | Goal plan (then fetch linked plans separately) |
| Poll meal plan status | `GET /api/plan/{id}/status` | `{ id, status, pricingStatus }` |
| Poll workout status | `GET /api/workout/{id}/status` | `{ status, errorMessage }` |
| Poll goal plan status | `GET /api/goal-plans/{id}/generation-status` | Combined status of both sub-plans |
| Create meal plan | `POST /api/plan` | Placeholder with status "generating" |
| Create workout plan | `POST /api/workout` | `{ id, status: "generating" }` |
| Get grocery list | `GET /api/plan/{id}/grocery` | Grocery items with pricing |
