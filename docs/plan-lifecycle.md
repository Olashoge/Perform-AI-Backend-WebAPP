# Perform AI — Plan Lifecycle Guide (iOS Feature Parity)

This document describes how wellness plans (GoalPlans, MealPlans, WorkoutPlans) are created, stored, viewed, scheduled, mutated, and deleted. Use it to replicate the web app's behavior in the iOS client.

> **Companion docs:** [api-reference.md](./api-reference.md) for endpoint details, [data-models.md](./data-models.md) for type definitions.

---

## Table of Contents

- [Entity Hierarchy](#entity-hierarchy)
- [Plan Status Lifecycle](#plan-status-lifecycle)
- [GoalPlan CRUD](#goalplan-crud)
- [MealPlan CRUD](#mealplan-crud)
- [WorkoutPlan CRUD](#workoutplan-crud)
- [Scheduling & Rescheduling](#scheduling--rescheduling)
- [Calendar Integration](#calendar-integration)
- [Soft Deletion](#soft-deletion)
- [Completion Tracking](#completion-tracking)
- [Feedback & Preference Learning](#feedback--preference-learning)
- [Allowance System (Swaps & Regens)](#allowance-system-swaps--regens)
- [Meal Swap Flow](#meal-swap-flow)
- [Workout Session Regeneration](#workout-session-regeneration)
- [Grocery List](#grocery-list)
- [iOS Implementation Notes](#ios-implementation-notes)

---

## Entity Hierarchy

```
GoalPlan (container)
├── mealPlanId → MealPlan (nullable, linked/unlinked freely)
├── workoutPlanId → WorkoutPlan (nullable, linked/unlinked freely)
├── startDate (YYYY-MM-DD, nullable — defines the 7-day window)
└── goalType (weight_loss | muscle_gain | performance | maintenance | energy | general_fitness | ...)

MealPlan (standalone or linked to a GoalPlan)
├── planJson → { title, summary, nutritionNotes, days[], groceryList }
├── preferencesJson → user preferences at generation time
├── planStartDate (YYYY-MM-DD, nullable — independent of GoalPlan.startDate)
├── status: "generating" | "ready" | "failed"
├── swapCount, regenDayCount (mutation counters)
└── deletedAt (soft delete timestamp)

WorkoutPlan (standalone or linked to a GoalPlan)
├── planJson → { title, summary, days[] with sessions }
├── preferencesJson → workout preferences at generation time
├── planStartDate (YYYY-MM-DD, nullable)
├── status: "generating" | "ready" | "failed"
└── deletedAt (soft delete timestamp)
```

Key relationships:
- GoalPlan references MealPlan and WorkoutPlan by ID (nullable foreign keys)
- MealPlan and WorkoutPlan can exist independently without a GoalPlan
- Linking/unlinking is a simple PATCH on the GoalPlan — it does not cascade to the child plans
- Each plan type has its own `planStartDate` which is set independently

---

## Plan Status Lifecycle

Status is **derived client-side** from `planStartDate` (not stored in the DB as a lifecycle field). The DB `status` field only tracks generation state.

### Generation Status (DB field: `status`)

```
"generating" → "ready" | "failed"
```

- `generating`: AI is building the plan (poll every 2-3s)
- `ready`: Plan JSON is populated and viewable
- `failed`: Generation encountered an error

### Lifecycle Status (computed client-side from `planStartDate`)

```swift
enum PlanLifecycleStatus {
    case draft       // planStartDate is nil
    case scheduled   // planStartDate is in the future
    case active      // today falls within the 7-day window [startDate, startDate+6]
    case completed   // the 7-day window has passed
}

func deriveStatus(startDate: String?) -> PlanLifecycleStatus {
    guard let startDate = startDate else { return .draft }
    let start = parseDate(startDate) // "YYYY-MM-DD" → Date at midnight local
    let today = Calendar.current.startOfDay(for: Date())
    let end = Calendar.current.date(byAdding: .day, value: 7, to: start)!
    if today < start { return .scheduled }
    if today < end { return .active }
    return .completed
}
```

### Status Badge UI Config

| Status | Label | Color (Light) | Color (Dark) | Icon |
|--------|-------|---------------|--------------|------|
| draft | Draft | gray bg/text | gray bg/text | Clock |
| scheduled | Scheduled | blue-100/blue-800 | blue-900/30/blue-300 | CalendarCheck |
| active | Active | green-100/green-800 | green-900/30/green-300 | Activity |
| completed | Completed | gray bg/text | gray bg/text | CheckCircle |

---

## GoalPlan CRUD

### List Goals
```
GET /api/goal-plans
→ GoalPlan[]
```
Returns all non-deleted goal plans for the user. Sorted client-side.

### Get Single Goal
```
GET /api/goal-plans/:id
→ GoalPlan
```
Returns 404 if deleted or not owned.

### Create Goal (via wizard)
```
POST /api/goal-plans/generate
Body: { goalType, planTypes, mealPreferences?, workoutPreferences? }
→ GoalPlan (with status tracking for async generation)
```
Generation is async — poll `GET /api/goal-plans/:id/generation-status` every 2-3s.

### Update Goal (link/unlink plans, set start date)
```
PATCH /api/goal-plans/:id
Body: { startDate?, mealPlanId?, workoutPlanId? }
→ GoalPlan (updated)
```
- Set `mealPlanId: null` to unlink a meal plan
- Set `workoutPlanId: null` to unlink a workout plan
- Set `startDate: "YYYY-MM-DD"` to schedule
- Set `startDate: null` to unschedule

### Delete Goal
```
DELETE /api/goal-plans/:id
→ { ok: true }
```
Soft deletes the GoalPlan. Does NOT cascade-delete linked MealPlan/WorkoutPlan.

### Goal Title Generation (client-side)

Titles are generated from goal type + start date:

```
GOAL_TITLE_PREFIXES = {
    weight_loss: ["Lean Start", "Cut Phase", "Slim Down"],
    muscle_gain: ["Strength Sprint", "Build Phase", "Gain Mode"],
    performance: ["Peak Performance", "Level Up", "Go Mode"],
    maintenance: ["Steady State", "Stay Strong", "Balance"],
    energy: ["Energy Boost", "Power Up", "Recharge"],
    general_fitness: ["Fresh Start", "New Chapter", "Kickoff"],
    ...
}

// Pattern: "{prefix} · {date}" or just "{prefix}" if no startDate
// Example: "Lean Start · Mar 15"
```

### Goal Card UI

Each goal card shows:
- Goal icon (by goalType: Flame, Dumbbell, Trophy, Heart, Zap, Target)
- Generated title
- Status badge (derived from startDate)
- Date range (if scheduled): "Mar 15 – Mar 21, 2026"
- Linked meal plan title (with link/unlink button)
- Linked workout plan title (with link/unlink button)
- Delete button

### Linking Dialog

When user taps "Link" on a goal card:
1. Show a dialog listing available plans (filtered to `status === "ready"` and `deletedAt === null`)
2. Each option shows the plan title
3. Selecting a plan calls `PATCH /api/goal-plans/:id` with `{ mealPlanId: planId }` or `{ workoutPlanId: planId }`

---

## MealPlan CRUD

### List Meal Plans
```
GET /api/plans
→ MealPlan[]
```
Returns all non-deleted meal plans. Filtered client-side to exclude `deletedAt !== null`.

### Get Single Meal Plan
```
GET /api/plan/:id
→ MealPlan
```

### MealPlan JSON Structure (`planJson`)

```typescript
interface PlanOutput {
    title: string;
    summary: string;
    nutritionNotes: {
        dailyMacroTargetsRange: {
            calories: string;   // e.g. "1800-2000"
            protein_g: string;  // e.g. "140-160"
            carbs_g: string;
            fat_g: string;
        };
    };
    days: Array<{
        dayIndex: number;  // 1-7
        meals: {
            breakfast?: MealEntry;  // absent if mealsPerDay=2 and slot not selected
            lunch?: MealEntry;
            dinner?: MealEntry;
        };
    }>;
    groceryList: GroceryItem[];
    adaptiveSnapshot?: AdaptiveSnapshot;  // present when adaptive engine is active
}

interface MealEntry {
    name: string;
    cuisineTag: string;
    description: string;
    prepTime: string;
    cookTime: string;
    servings: number;
    calories: number;
    macros: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
    ingredients: Array<{ item: string; amount: string }>;
    instructions: string[];
    mealFingerprint: string;  // unique ID for feedback
}

interface GroceryItem {
    item: string;
    quantity: string;
    estimatedPrice: number;  // USD
    owned?: boolean;
}
```

### Preferences JSON (`preferencesJson`)

```typescript
interface Preferences {
    goal: string;              // weight_loss, muscle_gain, etc.
    dietStyles: string[];      // ["Mediterranean", "Asian"]
    mealsPerDay: 2 | 3;
    mealSlots?: string[];      // when mealsPerDay=2: e.g. ["lunch","dinner"]
    householdSize: number;
    prepStyle: "cook_daily" | "batch_2day" | "batch_3_4day";
    budgetMode: "normal" | "budget_friendly";
    foodsToAvoid: string[];
    spiceLevel?: string;
    authenticityMode?: string;
    age?: number;
    currentWeight?: number;
    targetWeight?: number;
    weightUnit?: string;
    workoutDaysPerWeek?: number;
}
```

### Meal Plan Card (List View)

Each card shows:
- Meal icon (UtensilsCrossed, amber-colored)
- Plan title (from `planJson.title`)
- Status badge (derived from `planStartDate`)
- Date range or "Created: {date}" if draft
- Daily calorie target
- Daily protein target
- Delete button (inline, stops propagation)

### Meal Plan Detail View

Header section:
- Title, summary, nutrition notes (daily macro targets)
- "Plan Settings" collapsible showing all generation preferences
- Schedule info: "Scheduled: Monday, Mar 15, 2026" (if planStartDate set)

Per-day section (7 cards, one per day):
- Day header: "Day {n} · {dayName}" (e.g. "Day 1 · Monday")
- Each meal slot card shows:
  - Meal name, cuisine tag badge
  - Prep/cook time, servings, calories
  - Macros bar (protein, carbs, fat)
  - Expandable ingredients list
  - Expandable instructions
  - Feedback buttons (thumbs up/down)
  - Completion checkbox (if plan is scheduled)
  - Swap button (replaces this meal via AI)

Actions menu (three-dot dropdown):
- "Add to calendar" / "Move start date" / "Remove from calendar"
- "Delete plan"

---

## WorkoutPlan CRUD

### List Workout Plans
```
GET /api/workouts
→ WorkoutPlan[]
```

### Get Single Workout Plan
```
GET /api/workout/:id
→ WorkoutPlan
```

### WorkoutPlan JSON Structure (`planJson`)

```typescript
interface WorkoutPlanOutput {
    title: string;
    summary: string;
    days: Array<{
        dayIndex: number;      // 1-7
        dayLabel: string;      // "Monday", "Tuesday", etc.
        isWorkoutDay: boolean; // false = rest day
        session: WorkoutSession | null;  // null on rest days
    }>;
    adaptiveSnapshot?: AdaptiveSnapshot;
}

interface WorkoutSession {
    sessionTitle: string;    // e.g. "Upper Body Push"
    focus: string;           // e.g. "Chest, Shoulders, Triceps"
    durationMinutes: number;
    warmup: WarmupBlock;
    exercises: ExerciseEntry[];
    cooldown: CooldownBlock;
}

interface ExerciseEntry {
    name: string;
    sets: number;
    reps: string;         // "8-12" or "30s" (for timed)
    restSeconds: number;
    notes?: string;
    exerciseFingerprint: string;  // for feedback
}
```

### Workout Detail View

Header:
- Title, summary
- Schedule info (if scheduled)

Per-day:
- Rest days: simple "Rest Day" card with recovery icon
- Workout days: session card with:
  - Session title, focus area, duration
  - Warmup block
  - Exercise list (name, sets × reps, rest period)
  - Cooldown block
  - Regenerate session button
  - Session-level feedback (like/dislike)
  - Per-exercise feedback (like/dislike)
  - Completion checkboxes (if scheduled)

### Schedule Workout
```
POST /api/workout/:id/start-date
Body: { startDate: "YYYY-MM-DD" }  // or { startDate: null } to unschedule
→ WorkoutPlan (updated)
```

### Delete Workout
```
DELETE /api/workouts/:id
→ { success: true }
```
Soft delete via `deletedAt` timestamp.

---

## Scheduling & Rescheduling

### How scheduling works

1. User opens the actions menu on a plan detail view
2. If unscheduled → "Add to calendar" opens a date picker
3. If scheduled → "Move start date" opens a date picker, "Remove from calendar" clears the date

### Conflict detection

Before showing the date picker, the app fetches occupied dates:

```
GET /api/calendar/occupied-dates?excludePlanId={currentPlanId}
→ { occupiedDates: ["2026-03-15", "2026-03-16", ...] }
```

The date picker disables dates that are already occupied by another plan's 7-day window. The `excludePlanId` parameter ensures the current plan's own dates aren't blocked (important for "Move start date").

### Overlap check (client-side)

When a user selects a start date, the client checks if ANY of the 7 days in the range overlap with occupied dates:

```swift
func isDateOccupied(startDate: Date, occupiedDates: Set<String>, planDays: Int = 7) -> Bool {
    for i in 0..<planDays {
        let day = Calendar.current.date(byAdding: .day, value: i, to: startDate)!
        let dayStr = formatDate(day) // YYYY-MM-DD
        if occupiedDates.contains(dayStr) { return true }
    }
    return false
}
```

### Meal plan scheduling
```
PATCH /api/plan/:id/start-date
Body: { startDate: "YYYY-MM-DD" }  // or { startDate: null }
→ MealPlan (updated)
```

### Workout plan scheduling
```
POST /api/workout/:id/start-date
Body: { startDate: "YYYY-MM-DD" }  // or { startDate: null }
→ WorkoutPlan (updated)
```

### Cache invalidation after scheduling

After any schedule change, invalidate these queries:
- The plan itself: `["/api/plan", planId]` or `["/api/workout", planId]`
- Calendar data: `["/api/calendar/occupied-dates"]`, `["/api/calendar/all"]`
- Week data: any key starting with `/api/week-data` or `/api/weekly-summary`

---

## Calendar Integration

### Unified calendar view
```
GET /api/calendar/all
→ {
    mealSlots: ["breakfast", "lunch", "dinner"],  // sorted by slot order
    days: [
        {
            date: "2026-03-15",
            meals: {
                breakfast: { name, calories, ... },
                lunch: { name, calories, ... },
                dinner: { name, calories, ... }
            },
            planIds: ["uuid-1"]  // which plan(s) cover this date
        },
        ...
    ]
}
```

The calendar merges all scheduled meal plans into a unified day-by-day view. If two plans overlap (shouldn't happen if conflict detection works), the first plan's meals take priority.

### Workout calendar
```
GET /api/calendar/workouts
→ WorkoutPlan[] (only scheduled ones)
```

---

## Soft Deletion

All deletions are soft deletes — the record stays in the DB with a `deletedAt` timestamp.

| Entity | Endpoint | Backend Method |
|--------|----------|----------------|
| MealPlan | `DELETE /api/plans/:id` | `storage.softDeletePlan(id)` |
| WorkoutPlan | `DELETE /api/workouts/:id` | `storage.softDeleteWorkoutPlan(id)` |
| GoalPlan | `DELETE /api/goal-plans/:id` | `storage.softDeleteGoalPlan(id)` |

Important behaviors:
- All GET endpoints filter out records where `deletedAt` is not null
- Deleting a GoalPlan does NOT cascade to its linked MealPlan/WorkoutPlan
- Deleting a MealPlan/WorkoutPlan does NOT automatically unlink it from GoalPlans
- After deletion, navigate back to the list view and invalidate relevant queries

### Delete Confirmation UI

Both plan detail views show a confirmation dialog before deletion:
- Title: "Delete this plan?"
- Message: "This will remove the plan from your list and calendar. This action cannot be undone."
- Actions: Cancel / Delete (destructive styling)

---

## Completion Tracking

Completions track whether individual meals/workouts have been marked as done.

### Data Model

```typescript
// Toggle a completion
POST /api/completions/toggle
Body: {
    date: "2026-03-15",       // the specific day
    itemType: "meal" | "workout",
    sourceType: "plan" | "daily",   // "plan" for 7-day plans, "daily" for single-day plans
    sourceId: "uuid-of-plan",
    itemKey: "day3-lunch" | "day3-session"  // unique within the plan
}
→ { completed: true }  // new state after toggle

// Query completions for a date range
GET /api/completions?start=2026-03-15&end=2026-03-21
→ Array<{ date, itemType, sourceType, sourceId, itemKey }>
```

### Item Key Format

For meal plans: `day{dayIndex}-{slot}` → e.g. `day1-breakfast`, `day3-dinner`
For workout plans: `day{dayIndex}-session` → e.g. `day2-session`

### Completion State Management (client-side)

The web app uses a `useCompletions` hook that:
1. Fetches all completions for the plan's date range
2. Returns an `isCompleted(date, itemType, sourceType, sourceId, itemKey)` function
3. Returns a `toggle(date, itemType, sourceType, sourceId, itemKey)` function with optimistic updates
4. Completions are only shown when the plan has a `planStartDate`

---

## Feedback & Preference Learning

### Meal Feedback
```
POST /api/feedback/meal
Body: {
    planId: "uuid",
    mealFingerprint: "fp_abc123",    // unique meal identifier
    mealName: "Grilled Chicken Salad",
    cuisineTag: "Mediterranean",
    feedback: "like" | "dislike" | "neutral",
    ingredients: ["chicken", "lettuce", ...]
}
```

When disliking a meal, the API may return an ingredient proposal:
```json
{
    "proposalId": "uuid",
    "proposalIngredients": ["cilantro", "raw onion", "blue cheese"]
}
```

The iOS app should show a dialog: "Which ingredients didn't you like?" with checkboxes for each proposal ingredient. Then resolve:

```
POST /api/ingredient-proposals/:id/resolve
Body: {
    chosenIngredients: ["cilantro"],   // ingredients the user wants to avoid
    action: "accepted" | "declined"
}
```

### Feedback State

Feedback is stored per meal fingerprint. The web app fetches the map:
```
GET /api/feedback/plan/:planId
→ { "fp_abc123": "like", "fp_def456": "dislike" }
```

Feedback UI uses tri-state toggle: neutral → like → dislike → neutral. Tapping the current state returns to neutral ("unlike"/"un-dislike").

### Workout Session Feedback
```
POST /api/feedback/workout
Body: {
    planId: "uuid",
    dayIndex: 1,
    sessionTitle: "Upper Body Push",
    feedback: "like" | "dislike"
}
```

### Exercise Feedback
```
POST /api/feedback/exercise
Body: {
    exerciseFingerprint: "fp_xyz",
    exerciseName: "Bench Press",
    feedback: "like" | "dislike" | "avoid"
}
```

"Avoid" adds the exercise to a permanent blocklist — AI will never include it again.

---

## Allowance System (Swaps & Regens)

The allowance system controls how many swaps (meals) and regenerations (workouts) a user can perform.

### Check Current Allowance
```
GET /api/allowance/current?mealPlanId={planId}
→ {
    mealSwapsRemaining: 2,
    workoutRegensRemaining: 1,
    flexTokensAvailable: 3,
    cooldownMinutesRemaining: 0,
    nextResetAt: "2026-03-16T00:00:00.000Z",
    dailyBudget: { mealSwaps: 3, workoutRegens: 2 }
} | null (if no allowance record exists)
```

### Redeem Flex Token
```
POST /api/allowance/redeem-flex-token
→ { success: true, message: "..." }
```
Flex tokens provide extra swaps/regens beyond the daily budget.

### Rate Limiting
All AI-powered operations (swaps, regens, plan generation) count toward a daily limit of 10 AI calls per user.
```
When limit reached → 429 { message: "Daily AI call limit reached" }
```

---

## Meal Swap Flow

1. User taps swap button on a specific meal
2. Client checks allowance: `GET /api/allowance/current?mealPlanId={planId}`
3. If allowed, calls:
```
POST /api/plan/:id/swap
Body: {
    dayIndex: 3,        // 1-7
    mealSlot: "lunch"   // breakfast | lunch | dinner
}
→ MealPlan (updated with new meal in that slot)
```
4. If not allowed due to budget exhaustion → show "No swaps remaining" with option to redeem a flex token
5. If not allowed due to cooldown → show remaining cooldown time
6. On success, invalidate the plan query and show the new meal

Legacy fallback: If no allowance record exists, the swap count on the plan itself is checked (`plan.swapCount >= 3` blocks the swap).

---

## Workout Session Regeneration

1. User taps regenerate on a workout session
2. Client checks allowance
3. If allowed:
```
POST /api/workout/:id/regenerate-session
Body: { dayIndex: 3 }   // 1-7, must be a workout day (not rest day)
→ WorkoutPlan (updated with new session for that day)
```
4. The new session respects exercise preferences (avoided/disliked exercises are excluded)
5. On success, invalidate the workout plan query

---

## Grocery List

Grocery data lives inside `planJson.groceryList`:

```typescript
interface GroceryItem {
    item: string;           // "Chicken breast"
    quantity: string;       // "2 lbs"
    estimatedPrice: number; // 8.99
    owned?: boolean;        // user marks items they already have
}
```

### Update owned status
```
PATCH /api/plan/:id/grocery
Body: { groceryList: GroceryItem[] }  // full replacement
→ MealPlan (updated)
```

### Grocery summary
The web app shows total estimated cost with a breakdown, highlighting owned items in a different style (struck-through or dimmed).

---

## iOS Implementation Notes

### Sorting

Plans lists support ascending/descending sort toggle:
- Scheduled plans sort by `planStartDate` (ascending or descending)
- Unscheduled (draft) plans sort to the end, ordered by `createdAt` descending
- Plans with start dates always appear before drafts

### Navigation After Actions

| Action | Navigate To |
|--------|------------|
| Delete meal plan | `/plans` (meal plans list) |
| Delete workout plan | `/training` (workout plans list) |
| Delete goal plan | `/goals` (goals list) |
| Schedule/unschedule | Stay on current detail view |
| Swap meal | Stay on plan detail (meal updates in place) |
| Regen workout session | Stay on workout detail (session updates in place) |

### Optimistic Updates

The web app uses optimistic updates for:
- Feedback toggles (immediate UI update, mutation in background)
- Completion toggles (immediate checkbox state, server sync in background)

### Query Invalidation Patterns

After mutations, invalidate related queries to keep data fresh:

```
Plan scheduled → invalidate plan, calendar/all, calendar/occupied-dates, week-data, weekly-summary
Plan deleted → invalidate plans list, calendar/all, calendar/occupied-dates, week-data, weekly-summary
Meal swapped → invalidate plan, allowance/current
Feedback given → invalidate feedback/plan/{planId}, preferences
Completion toggled → invalidate completions query for date range
Goal plan updated → invalidate goal-plans
```

### Plan Detail Loading States

- `isLoading`: Show skeleton (7 day cards with placeholder content)
- `status === "generating"`: Redirect to generating screen (poll every 2-3s)
- `status === "failed"`: Show error card with "Try Again" button
- `status === "ready"`: Show full plan content

### Scroll-to-Day

The web app supports deep linking to a specific day: `/plan/:id?scrollTo=day-3`. The iOS app should support similar navigation, scrolling to the specified day card on load.

### Date Formatting

All dates in the API use `YYYY-MM-DD` format. When displaying dates:
- Plan range: "Mar 15 – Mar 21, 2026"
- Schedule info: "Monday, Mar 15, 2026"
- Goal title: "Lean Start · Mar 15"

Always parse dates as local time by appending `T00:00:00` to the date string before creating a Date object. This prevents timezone-related off-by-one errors.
