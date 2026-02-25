# iOS Guide: Workout Regeneration — Every Regenerate Button Explained

This document covers every workout regeneration action in the app, where each regenerate button appears, what it does, the exact API calls, the data structures returned, and how to replicate the full web app behavior on iOS.

---

## Two Types of Workout Plans

The app has two distinct workout plan types, each with its own regenerate button:

| Type | How It's Created | Where Regen Button Appears | Regen Endpoint |
|:-----|:----------------|:---------------------------|:---------------|
| **7-Day Workout Plan** | Part of a Wellness Plan or standalone workout generation | On each workout session card (per day) | `POST /api/workout/:id/regenerate-session` |
| **Daily Workout** | One-off single-day workout from the daily planning screen | In the daily workout view header | `POST /api/daily-workout/:date/regenerate` |

---

## 1. Regenerating a Session in a 7-Day Workout Plan

### Where the Button Appears

On the 7-day workout plan view page, each day that has a workout session shows a collapsible card. In the top-right corner of each session card, there are three buttons in a row:

```
┌──────────────────────────────────────────────────────┐
│ DAY 2 — Monday, Mar 2, 2026                         │
│ Upper Body Push + Core                               │
│ 🟡 moderate  💪 strength  ⏱ 45 min  6 exercises     │
│                                                      │
│                            [👍]  [👎]  [⚡ Regen]  ▼  │
└──────────────────────────────────────────────────────┘
```

- **👍 Like** — Likes this session (toggleable)
- **👎 Dislike** — Dislikes this session (toggleable)
- **⚡ Regen** — Regenerates this session with a new AI-generated one
- **▼ Expand** — Shows exercises, warmup, cooldown details

**Rest days do NOT show the regen button.** They display as a simple card:
```
┌──────────────────────────────────────────────────────┐
│ 🔘 DAY 4 — Wednesday, Mar 4, 2026                   │
│    Rest Day                                          │
└──────────────────────────────────────────────────────┘
```

The web app identifies rest days by checking `day.isWorkoutDay === false || day.session === null`.

### Button State

The regen button is disabled when:
- A regeneration is already in progress (shows a spinner)
- The session regen request is pending

The regen button does NOT check the allowance budget in the UI — it lets the server respond with a 403 if the budget is exhausted. The web app shows the error message from the 403 in a toast notification.

### API Call

```
POST /api/workout/:workoutPlanId/regenerate-session
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "dayIndex": 2
}
```

| Field | Type | Required | Valid Values |
|:------|:-----|:---------|:-------------|
| `dayIndex` | number | **YES** | `1` through `7` |

### Behavior: Synchronous

This endpoint is **synchronous**. The AI generates the new workout session during the request. It typically takes 5-15 seconds. The response includes the **full updated workout plan** with the new session already in place.

### Success Response (HTTP 200)

Returns the complete workout plan object. The structure is:

```json
{
  "id": "workout-plan-uuid",
  "userId": "user-uuid",
  "goalPlanId": "goal-plan-uuid",
  "status": "ready",
  "planStartDate": "2026-03-01",
  "planEndDate": "2026-03-07",
  "preferencesJson": { ... },
  "planJson": {
    "title": "Balanced Strength & Conditioning",
    "summary": "A 7-day plan focusing on...",
    "preferencesEcho": { ... },
    "days": [
      {
        "dayIndex": 1,
        "dayName": "Day 1",
        "isWorkoutDay": true,
        "session": {
          "mode": "strength",
          "focus": "Upper Body Push + Core",
          "durationMinutes": 45,
          "intensity": "moderate",
          "warmup": [
            "5 min light cardio",
            "Arm circles - 30 seconds each direction",
            "Band pull-aparts - 15 reps"
          ],
          "main": [
            {
              "name": "Barbell Bench Press",
              "type": "strength",
              "sets": 4,
              "reps": "8-10",
              "time": null,
              "restSeconds": 90,
              "notes": "Focus on controlled eccentric"
            },
            {
              "name": "Dumbbell Shoulder Press",
              "type": "strength",
              "sets": 3,
              "reps": "10-12",
              "time": null,
              "restSeconds": 60,
              "notes": null
            },
            {
              "name": "Cable Flyes",
              "type": "strength",
              "sets": 3,
              "reps": "12-15",
              "time": null,
              "restSeconds": 45,
              "notes": null
            }
          ],
          "finisher": [
            "30 second plank hold x 3"
          ],
          "cooldown": [
            "Chest stretch - 30 seconds each side",
            "Shoulder stretch - 30 seconds each side",
            "Deep breathing - 1 minute"
          ],
          "coachingCues": [
            "Keep core braced during all pressing movements",
            "Don't lock out elbows fully on flyes"
          ]
        }
      },
      {
        "dayIndex": 2,
        "dayName": "Day 2",
        "isWorkoutDay": false,
        "session": null
      }
    ],
    "progressionNotes": [
      "Increase bench press weight by 5 lbs when you can complete all 4 sets of 10 reps",
      "Aim to reduce rest periods by 5 seconds each week"
    ]
  },
  "createdAt": "2026-03-01T12:00:00.000Z",
  "deletedAt": null
}
```

### Error Responses

| Code | Body | Meaning |
|:-----|:-----|:--------|
| 403 | `{ "message": "Regen cooldown active. Available in X minutes.", "cooldownMinutesRemaining": X }` | 6-hour cooldown triggered by 3 regens in 24 hours |
| 403 | `{ "message": "You've used your 1 daily regen. Resets at midnight UTC.", "nextResetAt": "..." }` | Daily workout regen limit reached |
| 403 | `{ "message": "You've used all X regens for this wellness plan." }` | Total plan regen budget exhausted |
| 429 | `{ "message": "Daily AI call limit reached" }` | 10 AI calls/day limit |
| 400 | `{ "message": "Invalid dayIndex (1-7)" }` | Bad input |
| 400 | `{ "message": "No workout session exists for this day" }` | Tried to regen a rest day |
| 404 | `{ "message": "Workout plan not found" }` | Invalid plan ID or not owned by user |

### After Successful Regen

1. Replace your local workout plan data with the response
2. Refetch the allowance state (`GET /api/allowance/current`) to update the budget display
3. Clear any cached feedback state for that day's session (the new session won't have feedback yet)

---

## 2. Regenerating a Daily Workout

### Where the Button Appears

On the daily workout view page (viewing a single standalone day's workout), the regenerate button appears in the page header next to the title:

```
┌──────────────────────────────────────────────────────┐
│ ← Back                                              │
│                                                      │
│ 🏋️ Daily Workout — Monday, Mar 2    ☑️ [🔄 Regen]   │
│   Upper Body Focus                                   │
│                                                      │
│ [Adaptive Insights Card if available]                │
│                                                      │
│ ┌─ Warmup ─────────────────────────┐                │
│ │ • 5 min light cardio             │                │
│ │ • Arm circles                    │                │
│ └──────────────────────────────────┘                │
│                                                      │
│ ┌─ Exercises ──────────────────────┐                │
│ │ 1. Bench Press [👍][👎]          │                │
│ │ 2. Shoulder Press [👍][👎]       │                │
│ └──────────────────────────────────┘                │
└──────────────────────────────────────────────────────┘
```

The **☑️** is a completion checkbox and the **🔄 Regenerate** button is always visible and only disabled while a regeneration is in progress.

### Button State

- Disabled only while `regenerateMutation.isPending` (shows spinner)
- No budget/allowance system for daily workouts — they only count against the global 10 AI calls/day limit

### API Call

```
POST /api/daily-workout/:date/regenerate
Authorization: Bearer <accessToken>
```

**No request body.** The date is in the URL path as `YYYY-MM-DD` (e.g., `2026-03-02`).

### Behavior: Asynchronous

This endpoint is **asynchronous**. It returns immediately and the AI generates the workout in the background.

### Immediate Response (HTTP 200)

```json
{
  "id": "daily-workout-record-uuid",
  "status": "generating"
}
```

### After Receiving the Response

1. Show a "Generating your workout..." loading state
2. Invalidate/refetch `GET /api/daily-workout/:date` — the web app does this by invalidating the query key
3. The polling happens automatically because the web app's `useQuery` for the daily workout data has a `refetchInterval` or is invalidated which triggers a re-fetch

### Polling for Completion

```
GET /api/daily-workout/:date
Authorization: Bearer <accessToken>
```

Poll every 2 seconds. The response will transition through these states:

**While generating:**
```json
{
  "id": "uuid",
  "date": "2026-03-02",
  "status": "generating",
  "planJson": null,
  "generatedTitle": null
}
```

**When ready:**
```json
{
  "id": "uuid",
  "date": "2026-03-02",
  "status": "ready",
  "generatedTitle": "Daily Workout — Monday, March 2",
  "planJson": {
    "mode": "strength",
    "focus": "Upper Body Push + Core",
    "durationMinutes": 45,
    "intensity": "moderate",
    "warmup": ["5 min light cardio", "Arm circles"],
    "main": [
      {
        "name": "Barbell Bench Press",
        "type": "strength",
        "sets": 4,
        "reps": "8-10",
        "time": null,
        "restSeconds": 90,
        "notes": "Focus on controlled eccentric"
      }
    ],
    "finisher": ["30 second plank hold x 3"],
    "cooldown": ["Chest stretch - 30 seconds each side"],
    "coachingCues": ["Keep core braced during pressing"]
  },
  "adaptiveSnapshot": { ... }
}
```

**If failed:**
```json
{
  "id": "uuid",
  "date": "2026-03-02",
  "status": "failed",
  "planJson": null
}
```

### The "Generating" Screen

While `status === "generating"`, the web app shows:
- A back button
- A centered card with a spinning loader
- Title: "Generating your workout..."
- Subtitle: "Creating a personalized workout for {date}. This usually takes 15-30 seconds."

### Error Responses on the POST

| Code | Body |
|:-----|:-----|
| 400 | `{ "message": "Profile required", "profileRequired": true }` |
| 404 | `{ "message": "No daily workout found for this date" }` |

---

## Data Structures for iOS

### WorkoutExercise

```swift
struct WorkoutExercise: Codable, Identifiable {
    let name: String
    let type: String               // "strength", "cardio", "mobility"
    let sets: Int?
    let reps: String?              // "8-10", "12", "AMRAP", etc.
    let time: String?              // "30 seconds", "2 minutes", etc.
    let restSeconds: Int?
    let notes: String?
    
    var id: String { name }
}
```

### WorkoutSession

```swift
struct WorkoutSession: Codable {
    let mode: String               // "strength", "cardio", "mixed"
    let focus: String              // "Upper Body Push + Core"
    let durationMinutes: Int
    let intensity: String          // "easy", "moderate", "hard"
    let warmup: [String]
    let main: [WorkoutExercise]
    let finisher: [String]?
    let cooldown: [String]
    let coachingCues: [String]?
}
```

### WorkoutDay

```swift
struct WorkoutDay: Codable, Identifiable {
    let dayIndex: Int              // 1-7
    let dayName: String            // "Day 1", "Day 2", etc.
    let isWorkoutDay: Bool
    let session: WorkoutSession?   // null for rest days
    
    var id: Int { dayIndex }
}
```

### WorkoutPlanOutput

```swift
struct WorkoutPlanOutput: Codable {
    let title: String
    let summary: String
    let preferencesEcho: [String: AnyCodable]
    let days: [WorkoutDay]         // Always exactly 7 elements
    let progressionNotes: [String]?
}
```

### WorkoutPlan (full API response)

```swift
struct WorkoutPlan: Codable, Identifiable {
    let id: String
    let userId: String
    let goalPlanId: String?
    let status: String             // "generating", "ready", "failed"
    let planStartDate: String?     // "YYYY-MM-DD" or null (draft)
    let planEndDate: String?
    let preferencesJson: WorkoutPreferences?
    let planJson: WorkoutPlanOutput?
    let createdAt: String
    let deletedAt: String?
}
```

### DailyWorkout (full API response)

```swift
struct DailyWorkout: Codable, Identifiable {
    let id: String
    let date: String               // "YYYY-MM-DD"
    let status: String             // "generating", "ready", "failed"
    let generatedTitle: String?
    let planJson: WorkoutSession?  // Note: This is a single session, NOT WorkoutPlanOutput
    let adaptiveSnapshot: AdaptiveSnapshot?
}
```

**Important difference:** A daily workout's `planJson` is a single `WorkoutSession` object (one day's workout). A 7-day workout plan's `planJson` is a `WorkoutPlanOutput` with 7 days.

---

## Exercise Key Format (Critical for Feedback)

When sending exercise preferences (like/dislike/avoid), the exercise key is derived from the exercise name:

```swift
func exerciseToKey(_ name: String) -> String {
    return name
        .lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: "_", options: .regularExpression)
        .trimmingCharacters(in: CharacterSet(charactersIn: "_"))
}

// Examples:
// "Barbell Bench Press" → "barbell_bench_press"
// "Cable Flyes" → "cable_flyes"
// "30-Second Plank Hold" → "30_second_plank_hold"
```

**Uses underscores, NOT hyphens.**

---

## Session Key Format (for Session-Level Feedback)

Session-level like/dislike feedback uses a session key:

```swift
func sessionKey(dayIndex: Int, focus: String) -> String {
    let focusSlug = focus.lowercased().replacingOccurrences(of: "\\s+", with: "_", options: .regularExpression)
    return "day\(dayIndex)_\(focusSlug)"
}

// Example: dayIndex=2, focus="Upper Body Push + Core"
// → "day2_upper_body_push_+_core"
```

---

## Comparison: 7-Day Session Regen vs Daily Workout Regen

| Aspect | 7-Day Session Regen | Daily Workout Regen |
|:-------|:-------------------|:-------------------|
| **Endpoint** | `POST /api/workout/:id/regenerate-session` | `POST /api/daily-workout/:date/regenerate` |
| **Request Body** | `{ "dayIndex": N }` | None (date in URL) |
| **Sync/Async** | **Synchronous** (waits for AI) | **Asynchronous** (returns immediately) |
| **Response** | Full updated workout plan | `{ id, status: "generating" }` |
| **Need to Poll?** | No | Yes — poll `GET /api/daily-workout/:date` |
| **Wait Time** | 5-15 seconds (request hangs) | Return instant, poll 15-30 seconds |
| **Budget** | Allowance system (daily limit + plan total) | No budget (only global AI limit) |
| **Regenerates** | One session within a 7-day plan | The entire single-day workout |
| **After Success** | Update plan data from response | Poll until status === "ready" |
| **Button Location** | Per session card (⚡ icon) | Page header (🔄 Regenerate text button) |

---

## iOS Implementation Checklist

### For 7-Day Workout Session Regen

1. Show the ⚡ regen button on each `SessionCard` where `day.isWorkoutDay == true && day.session != null`
2. Do NOT show the button on rest days (`isWorkoutDay == false || session == null`)
3. On tap: show spinner on that specific day's button, call `POST /api/workout/:id/regenerate-session` with `{ dayIndex }`
4. On success (200): replace local plan data with the full response, clear session feedback for that day, refetch allowance
5. On error (403): show the error `message` to the user (budget exceeded / cooldown active)
6. On error (429): show "Daily AI call limit reached"
7. On error (400 "No workout session exists"): this shouldn't happen if you're hiding the button on rest days

### For Daily Workout Regen

1. Show the 🔄 Regenerate button in the page header (always visible when status === "ready")
2. On tap: show spinner in button, call `POST /api/daily-workout/:date/regenerate`
3. On success (200): transition to the "generating" loading screen
4. Poll `GET /api/daily-workout/:date` every 2 seconds
5. When `status === "ready"`: show the new workout
6. When `status === "failed"`: show error message with option to try again
7. On error (400 "Profile required"): navigate to profile setup
8. On error (404): show "No daily workout found for this date"

### Loading States

**7-Day Session Regen (synchronous):**
```
Tap → Button shows spinner → 5-15 seconds → New session appears
```
Only that one day's button spins. Other session cards remain interactive.

**Daily Workout Regen (asynchronous):**
```
Tap → Button shows spinner → Immediate response → Full-screen generating state → Poll → New workout appears
```
The entire page transitions to a generating state with a centered spinner.
