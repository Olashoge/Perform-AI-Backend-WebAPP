# iOS Guide: How the Workout Regen Counter Works and Updates

This document explains the exact mechanics of the regen counter system — how it increments, what checks run before each regen, how daily resets work, how the cooldown triggers, and how bonuses/penalties are earned. This is everything you need to keep the iOS app's counter in perfect sync with the web app.

---

## The Three Regen Counters

There are three separate counters that interact:

| Counter | Scope | Resets | Default Limit |
|:--------|:------|:-------|:-------------|
| `mealRegensUsedToday` | Per day | Midnight UTC | 1/day |
| `workoutRegensUsedToday` | Per day | Midnight UTC | 1/day |
| `regensUsedTotal` | Per plan (lifetime) | Never | 5 total |

All three are checked **before** allowing a regen. A regen is blocked if ANY of these conditions is true:

1. **Cooldown is active** (6-hour lock after 3 regens in 24 hours)
2. **Daily limit reached** (e.g., 1 meal regen already used today)
3. **Plan lifetime limit reached** (e.g., 5 total regens used across the plan)

---

## How Each Counter Updates

### When a Meal Day Regen Happens

Server calls `recordMealRegen()`:

```
mealRegensUsedToday    += 1
regensUsedTotal        += 1
```

Then checks: if 3 or more regens happened in the last 24 hours → sets `regenCooldownUntil = now + 6 hours`.

### When a Workout Session Regen Happens

Server calls `recordWorkoutRegen()`:

```
mealRegensUsedToday    += 1    ← YES, this increments too (shared daily pool)
workoutRegensUsedToday += 1
regensUsedTotal        += 1
```

**Important detail:** Workout regens increment BOTH `mealRegensUsedToday` AND `workoutRegensUsedToday`. This means meal regens and workout regens **share** the daily regen pool on the meal side. If you do 1 workout regen, the daily meal regen counter also goes up by 1.

Then checks: if 3 or more regens happened in the last 24 hours → sets `regenCooldownUntil = now + 6 hours`.

### When a Meal Swap Happens

Server calls `recordMealSwap()`:

```
mealSwapsUsedToday += 1
```

Swaps do NOT affect regen counters or cooldowns.

---

## The Pre-Check Flow (Server-Side)

Before any regen endpoint processes the AI call, it runs this check sequence:

### For Meal Day Regen (`POST /api/plan/:id/regenerate-day`)

```
1. Is there an allowance record? 
   → No: Use legacy limit (regenDayCount < 1 on the plan itself)
   → Yes: Continue to allowance checks

2. Is cooldown active? (regenCooldownUntil > now)
   → Yes: Return 403 { "message": "Regen cooldown active. Available in X minutes.", "cooldownMinutesRemaining": X }

3. Is daily meal regen limit reached? (mealRegensUsedToday >= limit)
   → Yes: Return 403 { "message": "You've used your 1 daily meal regen. Resets at midnight UTC.", "nextResetAt": "..." }

4. Is plan-total regen limit reached? (regensUsedTotal >= planLimit)
   → Yes: Return 403 { "message": "You've used all 5 regens for this wellness plan." }

5. All checks pass → Proceed with AI generation
```

### For Workout Session Regen (`POST /api/workout/:id/regenerate-session`)

Identical flow but uses `resolveAllowanceForWorkoutPlan()` to find the allowance via the workout plan's parent goal plan.

---

## The Daily Reset Mechanism

Every time the allowance is accessed (by any endpoint), the server calls `resetDailyIfNeeded()`:

```
if (lastDailyResetAt is NOT today in UTC):
    mealSwapsUsedToday     = 0
    workoutSwapsUsedToday  = 0
    mealRegensUsedToday    = 0
    workoutRegensUsedToday = 0
    lastDailyResetAt       = now
```

**Key behavior:**
- Reset happens lazily (on next access), not at a scheduled time
- Reset is based on UTC date comparison
- `regensUsedTotal` is NOT reset — it's permanent for the plan's lifetime
- `regenCooldownUntil` is NOT reset by daily reset — cooldown expires on its own timestamp

---

## The 6-Hour Cooldown

### How It Triggers

After each regen (meal or workout), the server counts recent regen events:

```
recentRegens = count of regen events in the last 24 hours for this goal plan
if recentRegens >= 3:
    regenCooldownUntil = now + 6 hours
```

### How It's Checked

```
if regenCooldownUntil exists AND regenCooldownUntil > now:
    → Blocked: "Regen cooldown active. Available in X minutes."
    → cooldownMinutesRemaining = ceil((regenCooldownUntil - now) / 60000)
```

### How It Expires

The cooldown expires naturally when the current time passes `regenCooldownUntil`. There's no explicit "clear cooldown" action. The next time the allowance is checked and the timestamp is in the past, the cooldown is treated as inactive.

---

## How Limits Are Calculated

### Daily Meal Swap Limit

```
limit = baseMealSwapsPerDay + bonusMealSwapsPerDay
default = 2 + 0 = 2
```

### Daily Workout Swap Limit

```
limit = baseWorkoutSwapsPerDay + bonusWorkoutSwapsPerDay
default = 2 + 0 = 2
```

### Daily Meal Regen Limit

```
limit = baseMealDayRegensPerDay
default = 1
```

### Daily Workout Regen Limit

```
limit = baseWorkoutDayRegensPerDay
default = 1
```

### Plan Total Regen Limit

```
limit = max(3, basePlanRegensTotal + bonusPlanRegensTotal - penaltyPlanRegensTotal)
default = max(3, 5 + 0 - 0) = 5
minimum = 3 (always, even with penalties)
```

---

## How Bonuses and Penalties Are Earned

Bonuses/penalties are computed from the user's behavior on their PREVIOUS plan and applied when a new allowance is created for a new goal plan.

### Bonus Rules

| Condition | Bonus |
|:----------|:------|
| Combined adherence ≥ 80% | +1 plan regen (max +2) |
| Combined adherence ≥ 90% | +1 meal swap/day, +1 workout swap/day (max +2 each) |
| Meal dislike rate > 25% | +1 meal swap/day (max +2) |
| Workout dislike rate > 25% | +1 workout swap/day (max +2) |
| Check-in streak ≥ 7 days | Earns a Flex Token (redeemable for +1 regen) |

### Penalty Rules

| Condition | Penalty |
|:----------|:-------|
| Regen usage > 80% of limit AND adherence < 60% | -1 plan regen |

### Performance Core Bonuses

Additionally, the Performance Core system (triggered by weekly check-ins) can award:
- `regenBonus`: Added to `bonusPlanRegensTotal`
- `swapBonus`: Added to both `bonusMealSwapsPerDay` and `bonusWorkoutSwapsPerDay`
- `regenPenalty`: Added to `penaltyPlanRegensTotal`

---

## Flex Tokens

### What They Do

A flex token, when redeemed, gives back 1 meal regen for today:

```
mealRegensUsedToday = max(0, mealRegensUsedToday - 1)
```

### How They're Earned

Earned when the user has a check-in streak of 7+ days on a goal plan. The token expires after 7 days.

### Redeeming

```
POST /api/allowance/redeem-flex-token
```

No body needed. Returns `{ success: true, message: "..." }` or `{ success: false, message: "No flex tokens available." }`.

---

## Fetching the Current Counter State

```
GET /api/allowance/current?mealPlanId=<optional>
Authorization: Bearer <accessToken>
```

### Response

```json
{
  "goalPlanId": "uuid",
  "allowanceId": "uuid",
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
  "coachInsight": "You earned +1 regen from 85% adherence."
}
```

### When `null` Is Returned

If the user has no active goal plan (and therefore no allowance), this endpoint returns `null`. In that case, the iOS app should either:
- Hide the budget panel entirely
- Show a simplified counter using the legacy `swapCount` / `regenDayCount` fields from the plan object itself

### Refetch Cadence

The web app refetches this endpoint:
- **Every 60 seconds** (automatic polling via `refetchInterval: 60000`)
- **After every swap** (invalidates the query cache)
- **After every regen** (invalidates the query cache)
- **After redeeming a flex token** (invalidates the query cache)

---

## What the Web App's Budget Panel Shows

The AllowancePanel component renders this layout:

```
┌──────────────────────────────────────────┐
│ 🟢 Today's Budget           ⏱ Cooldown  │
│                              342m        │
│ ┌────────────┐ ┌────────────┐           │
│ │ 🔄 Meal    │ │ ↩ Day      │           │
│ │ Swaps      │ │ Regens     │           │
│ │ 1/2        │ │ 1/1        │           │
│ │ ████░░░░░░ │ │ ██████████ │           │
│ └────────────┘ └────────────┘           │
│                                          │
│ ─────────────────────────────────        │
│ ✨ Plan Regens         3/5               │
│                                          │
│ ─────────────────────────────────        │
│ 🎁 1 Flex Token              [Redeem]   │
│                                          │
│ ─────────────────────────────────        │
│ ℹ️ You earned +1 regen from 85%          │
│    adherence.                            │
└──────────────────────────────────────────┘
```

### Counter Display Format

Each counter shows `remaining/limit` (NOT used/limit):

```swift
let remaining = max(0, limit - used)
// Display: "\(remaining)/\(limit)"
```

### Progress Bar Color Logic

```swift
let ratio = limit > 0 ? Double(used) / Double(limit) : 0
let barColor: Color = {
    if ratio >= 1.0 { return .red }        // Fully used
    if ratio >= 0.75 { return .amber }     // Running low
    return .green                          // Healthy
}()
```

The bar fills from left to right based on `ratio * 100%`.

### Sections in Order

1. **Header**: "Today's Budget" + cooldown badge (if active)
2. **Daily counters grid** (2 columns):
   - Meal Swaps: `remaining/limit` + progress bar
   - Day Regens: `remaining/limit` + progress bar
3. **Divider**
4. **Plan Regens**: `remaining/limit` (no progress bar, just text)
5. **Divider** (only if flex tokens > 0)
6. **Flex Tokens**: count + Redeem button (only if > 0)
7. **Divider** (only if coach insight exists)
8. **Coach Insight**: text message (only if non-null)

### Where the Panel Appears

- On the **meal plan view page** (passed the `planId` prop for resolving the correct allowance)
- On the **workout plan view page** (no `planId` prop, uses the user's most recent allowance)

---

## iOS Implementation: Keeping Counters In Sync

### Step 1: Fetch on Plan Load

When the user opens a meal or workout plan view, fetch the current allowance:

```swift
// For meal plan views
GET /api/allowance/current?mealPlanId=\(mealPlanId)

// For workout plan views (no mealPlanId available)
GET /api/allowance/current
```

### Step 2: Refetch After Every Mutation

After any swap, regen, or flex token redemption completes, immediately refetch the allowance. Don't try to update it locally — let the server be the source of truth.

```swift
func onRegenSuccess() {
    // 1. Update plan data from response
    // 2. Refetch allowance
    Task { await fetchAllowance() }
}
```

### Step 3: Periodic Refresh

Set up a timer to refetch every 60 seconds while the plan view is visible. This catches daily resets and cooldown expiration.

### Step 4: Disable Buttons Based on State

```swift
var canRegenMealDay: Bool {
    guard let a = allowanceState else { return true }
    if a.cooldown.active { return false }
    if a.today.mealRegensUsed >= a.today.mealRegensLimit { return false }
    if a.plan.regensUsed >= a.plan.regensLimit { return false }
    return true
}

var canRegenWorkoutSession: Bool {
    guard let a = allowanceState else { return true }
    if a.cooldown.active { return false }
    if a.today.workoutRegensUsed >= a.today.workoutRegensLimit { return false }
    if a.plan.regensUsed >= a.plan.regensLimit { return false }
    return true
}

var canSwapMeal: Bool {
    guard let a = allowanceState else { return true }
    return a.today.mealSwapsUsed < a.today.mealSwapsLimit
}
```

### Step 5: Handle 403 Errors Gracefully

Even if your UI checks disable buttons, the server does its own check. If you get a 403:

```swift
func handleRegenError(_ response: HTTPURLResponse, _ data: Data) {
    let body = try? JSONDecoder().decode(RegenErrorResponse.self, from: data)
    
    if response.statusCode == 403 {
        if let cooldown = body?.cooldownMinutesRemaining, cooldown > 0 {
            showAlert("Cooldown Active", "Regen available in \(cooldown) minutes.")
        } else if let nextReset = body?.nextResetAt {
            showAlert("Daily Limit Reached", body?.message ?? "Resets at midnight UTC.")
        } else {
            showAlert("Budget Exhausted", body?.message ?? "No regens remaining for this plan.")
        }
        // Refetch allowance to sync UI
        Task { await fetchAllowance() }
    }
}
```

---

## Complete Counter Lifecycle Example

Here's a play-by-play of how counters change across a typical user session:

```
=== Plan Created ===
mealSwapsUsedToday: 0, mealRegensUsedToday: 0, workoutRegensUsedToday: 0, regensUsedTotal: 0
Limits: swaps=2/day, regens=1/day, planTotal=5

=== User swaps breakfast on Day 3 ===
mealSwapsUsedToday: 1   (0→1)
Everything else unchanged
Display: "Meal Swaps: 1/2"

=== User regens Day 5 meals ===
mealRegensUsedToday: 1   (0→1)
regensUsedTotal: 1       (0→1)
Display: "Day Regens: 0/1" (1 used of 1 limit = 0 remaining)
Display: "Plan Regens: 4/5"

=== User tries to regen Day 2 meals ===
→ 403: "You've used your 1 daily meal regen. Resets at midnight UTC."

=== Midnight UTC passes, user opens plan again ===
Server resets: mealSwapsUsedToday=0, mealRegensUsedToday=0, workoutRegensUsedToday=0
regensUsedTotal stays at 1 (NOT reset)
Display: "Meal Swaps: 2/2", "Day Regens: 1/1", "Plan Regens: 4/5"

=== User regens workout session Day 1 ===
mealRegensUsedToday: 1   (0→1, shared pool)
workoutRegensUsedToday: 1 (0→1)
regensUsedTotal: 2        (1→2)
Display: "Day Regens: 0/1", "Plan Regens: 3/5"

=== Next day, user regens workout session Day 4 ===
(After daily reset)
mealRegensUsedToday: 1    (0→1)
workoutRegensUsedToday: 1  (0→1)
regensUsedTotal: 3         (2→3)
This is the 3rd regen in 24 hours → COOLDOWN TRIGGERS
regenCooldownUntil = now + 6 hours
Display: "⏱ Cooldown 360m"

=== User tries to regen anything ===
→ 403: "Regen cooldown active. Available in 359 minutes."

=== 6 hours later, cooldown expires ===
regenCooldownUntil is in the past → cooldown inactive
User can regen again (if daily/plan limits allow)
```

---

## Legacy Plans (No Allowance)

Standalone meal or workout plans that are NOT under a goal plan use a simpler system:

- The plan object itself has `swapCount` and `regenDayCount` fields
- `swapCount` is limited to 3 (hard-coded)
- `regenDayCount` is limited to 1 (hard-coded)
- No daily reset, no cooldown, no bonuses/penalties
- The allowance endpoint returns `null`

```swift
// For legacy plans (no allowance)
var canSwapLegacy: Bool { plan.swapCount < 3 }
var canRegenDayLegacy: Bool { plan.regenDayCount < 1 }
```

On iOS, check if the allowance is `null`. If so, fall back to these legacy counters from the plan object.
