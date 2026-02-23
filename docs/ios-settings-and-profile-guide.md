# iOS App — Settings & Profile (Performance Blueprint) Complete Guide

This document describes every section, field, behavior, validation rule, and API interaction on the **Settings page** and the **Profile (Performance Blueprint) page**, so the iOS app can replicate them exactly.

The web app has two distinct screens:
1. **Settings** (`/settings`) — a hub page with links to sub-pages, appearance toggle, week-start preference, and logout
2. **Profile / Performance Blueprint** (`/profile`) — the comprehensive user profile form that feeds all AI plan generation

---

## Table of Contents

- [Settings Page](#settings-page)
  - [Section 1: Profile Card](#section-1-profile-card)
  - [Section 2: Active Wellness Plan](#section-2-active-wellness-plan)
  - [Section 3: Food Preferences](#section-3-food-preferences-navigation)
  - [Section 4: Exercise Preferences](#section-4-exercise-preferences-navigation)
  - [Section 5: Week Starts On](#section-5-week-starts-on)
  - [Section 6: Appearance (Theme)](#section-6-appearance-theme)
  - [Section 7: Sign Out](#section-7-sign-out)
- [Profile Page (Performance Blueprint)](#profile-page-performance-blueprint)
  - [API Endpoints](#profile-api-endpoints)
  - [Card 1: Physical Stats & Goals](#card-1-physical-stats--goals)
  - [Card 2: Health & Medical](#card-2-health--medical)
  - [Card 3: Training Capacity](#card-3-training-capacity)
  - [Card 4: Workout Location & Equipment](#card-4-workout-location--equipment)
  - [Card 5: Nutrition & Lifestyle](#card-5-nutrition--lifestyle)
  - [Save Button Behavior](#save-button-behavior)
  - [Submission Data Normalization](#submission-data-normalization)
- [Food Preferences Page](#food-preferences-page)
- [Exercise Preferences Page](#exercise-preferences-page)
- [How Profile Data Flows Into Plan Generation](#how-profile-data-flows-into-plan-generation)

---

## Settings Page

The Settings page is a simple hub with cards. It does NOT contain the profile form — it links to it. The page title is "Settings" with subtitle "Manage your profile and preferences".

### API Dependencies

```
GET /api/goal-plans    → fetch goal plans to show active wellness plan
```

### Section 1: Profile Card

A read-only card showing the user's email address.

| Element | Details |
|---------|---------|
| Icon | User icon |
| Title | "Profile" |
| Content | Label "Email" + the user's email from auth state |
| Action | None (read-only display) |

### Section 2: Active Wellness Plan

Shows the user's current active goal plan, or prompts to create one.

| State | Display |
|-------|---------|
| Has active goal (first non-deleted goal plan) | Goal type label (e.g., "Weight Loss") + "Weekly Check-in" button → navigates to `/check-ins` |
| No active goal | "No active goal set" message + "Create Wellness Plan" button → navigates to `/goals` (goal wizard) |

**Goal type labels map:**
```
weight_loss    → "Weight Loss"
muscle_gain    → "Muscle Gain"
performance    → "Performance"
maintenance    → "Maintenance"
energy         → "Energy & Focus"
general_fitness → "General Fitness"
```

### Section 3: Food Preferences (Navigation)

A tappable card that navigates to the Food Preferences page (`/preferences`).

| Element | Details |
|---------|---------|
| Icon | Heart icon |
| Title | "Food Preferences" |
| Subtitle | "Liked meals, avoided ingredients" |
| Action | Tap → navigate to Food Preferences screen |
| Right accessory | Chevron right arrow |

### Section 4: Exercise Preferences (Navigation)

A tappable card that navigates to the Exercise Preferences page (`/preferences/exercise`).

| Element | Details |
|---------|---------|
| Icon | Dumbbell icon |
| Title | "Exercise Preferences" |
| Subtitle | "Liked, disliked, and avoided exercises" |
| Action | Tap → navigate to Exercise Preferences screen |
| Right accessory | Chevron right arrow |

### Section 5: Week Starts On

A local-only preference that controls which day the calendar and dashboard views start on. This is NOT stored on the server — it is stored in local device storage only.

| Element | Details |
|---------|---------|
| Icon | Calendar icon |
| Title | "Week Starts On" |
| Options | **Sunday** (value: `0`) or **Monday** (value: `1`) |
| Default | Sunday (`0`) |
| Storage | iOS `UserDefaults` key: `cal_weekStart`, value: `"0"` or `"1"` |
| Hint text | "Controls the calendar and dashboard week views." |

**Behavior:**
- Two side-by-side buttons, one highlighted when selected
- Selected state: primary border, primary/5 background
- The selected value is read from UserDefaults on app launch
- When changed, immediately persist to UserDefaults
- This value is sent as a query parameter to weekly data endpoints: `?weekStartsOn=0` or `?weekStartsOn=1`

### Section 6: Appearance (Theme)

Controls the app's visual theme. Stored locally, not on the server.

| Element | Details |
|---------|---------|
| Icon | Sun icon |
| Title | "Appearance" |
| Options | **Light** (Sun icon), **Dark** (Moon icon), **System** (Monitor icon) |
| Default | System |
| Storage | iOS `UserDefaults` key: `themePreference`, value: `"light"`, `"dark"`, or `"system"` |

**Behavior:**
- Three side-by-side buttons with icons and labels
- "System" matches the device's appearance setting
- When "System" is selected, show hint text: "Matches your device settings."
- On iOS, this should map to `UIUserInterfaceStyle` / `@Environment(\.colorScheme)`

### Section 7: Sign Out

A full-width outlined button at the bottom.

| Element | Details |
|---------|---------|
| Icon | LogOut icon |
| Label | "Sign Out" |
| Action | Call logout endpoint, then navigate to landing/login screen |

**Logout for JWT auth:**
```
POST /api/auth/token-logout
Authorization: Bearer {accessToken}
Body: { "refreshToken": "{stored_refresh_token}" }
```
Then clear stored access token, refresh token, and any cached user data.

---

## Profile Page (Performance Blueprint)

This is the most important page in the app. Every field here directly influences AI-generated meal and workout plans. The page title is "Performance Blueprint".

**Subtitle (contextual):**
- New profile: "Set up your profile to unlock personalized plans"
- Existing profile: "Review and update your personal data for better plan accuracy"

### Profile API Endpoints

```
GET  /api/profile   → Returns the full profile object, or null if none exists
POST /api/profile   → Create a new profile (returns 409 if one already exists)
PUT  /api/profile   → Update existing profile (creates one if none exists)
```

**Request body** for POST and PUT is identical — the full profile object. The server validates it using the `insertUserProfileSchema`.

**Response** is the saved profile object with server-generated fields (`id`, `userId`, `createdAt`, `updatedAt`).

---

### Card 1: Physical Stats & Goals

Section icon: Ruler. Title: "Physical Stats & Goals".

This card has a **unit system toggle** (Imperial / Metric) in the card header. The toggle affects how weight and height fields are displayed and entered.

#### Unit System Toggle

| Element | Details |
|---------|---------|
| Type | Two-button segmented control |
| Options | "Imperial" or "Metric" |
| Default | Imperial |
| Storage | Stored as `unitSystem` field in profile: `"imperial"` or `"metric"` |
| Behavior | Switching units converts displayed values but the API always stores metric (kg, cm) |

**Conversion constants:**
```
1 kg = 2.2046226218 lbs
1 inch = 2.54 cm
```

**Conversion functions:**
```swift
func kgToLbs(_ kg: Double) -> Double { (kg * 2.2046226218 * 10).rounded() / 10 }
func lbsToKg(_ lbs: Double) -> Double { (lbs / 2.2046226218 * 10).rounded() / 10 }
func cmToFtIn(_ cm: Int) -> (feet: Int, inches: Int) {
    let totalInches = Double(cm) / 2.54
    var feet = Int(totalInches / 12)
    var inches = Int(totalInches.truncatingRemainder(dividingBy: 12).rounded())
    if inches == 12 { inches = 0; feet += 1 }
    return (feet, inches)
}
func ftInToCm(_ feet: Int, _ inches: Int) -> Int {
    Int(((Double(feet) * 12 + Double(inches)) * 2.54).rounded())
}
```

#### Fields

| Field | API Key | Type | Required | Validation | UI (Imperial) | UI (Metric) |
|-------|---------|------|----------|------------|---------------|-------------|
| Age | `age` | integer | YES | min 13 ("You must be at least 13 years old") | Number input | Number input |
| Sex | `sex` | string \| null | No | enum: "male", "female", "other" | Select picker | Select picker |
| Height | `heightCm` | integer \| null | No | positive integer | Two inputs: feet (0-9) + inches (0-11) | Single input: cm |
| Weight | `weightKg` | float | YES | positive number | Input in lbs (step 0.1) | Input in kg (step 0.1) |
| Target Weight | `targetWeightKg` | float \| null | No | positive number | Input in lbs (step 0.1) | Input in kg (step 0.1) |
| Primary Goal | `primaryGoal` | string | YES | min 1 char | Select picker | Select picker |
| Training Experience | `trainingExperience` | string | YES | enum | Select picker | Select picker |
| Body & Goals Notes | `bodyContext` | string | No | free text | Multi-line text area | Multi-line text area |

**Primary Goal options:**
```
weight_loss      → "Weight Loss"
muscle_gain      → "Muscle Gain"
performance      → "Performance"
maintenance      → "Maintenance"
energy           → "Energy & Focus"
general_fitness  → "General Fitness"
```

**Training Experience options:**
```
beginner      → "Beginner"
intermediate  → "Intermediate"
advanced      → "Advanced"
```

**Sex options:**
```
male    → "Male"
female  → "Female"
other   → "Other"
```

**Body & Goals Notes (`bodyContext`):**
- Placeholder: "Share body goals, body type, challenges, or anything important for your plan."
- This is a HIGH-PRIORITY field for AI generation — the text is injected into prompts as "IMPORTANT USER BODY CONTEXT"
- Users write things like "I carry weight in my midsection", "I'm an ectomorph trying to bulk", "I have a desk job and sit 10+ hours"

**Important behavior — Imperial mode conversions:**
- When the user types in lbs, the app converts to kg and stores `weightKg`
- When the user types ft/in, the app converts to cm and stores `heightCm`
- When loading an existing profile in imperial mode, convert kg→lbs and cm→ft/in for display
- The API **always** receives and returns metric values (`weightKg`, `heightCm`)

---

### Card 2: Health & Medical

Section icon: Heart. Title: "Health & Medical".

| Field | API Key | Type | Required | Validation | UI Component |
|-------|---------|------|----------|------------|--------------|
| Health Constraints | `healthConstraints` | string[] | No | array of strings | Tag input (type + enter/add button, shows badges with X to remove) |
| Sleep Hours | `sleepHours` | float \| null | No | 0-24, step 0.5 | Number input |
| Stress Level | `stressLevel` | string \| null | No | enum | Select picker |

**Health Constraints (`healthConstraints`):**
- Tag input component: text field + "+" add button
- User types a condition and presses Enter or taps Add
- Each added item appears as a badge/chip with an X to remove
- Placeholder: "e.g. torn ACL, limited shoulder ROM, asthma, diabetes"
- These are injected into AI prompts and also map to workout plan limitation fields
- Common entries: "bad knees", "lower back pain", "asthma", "high blood pressure", "diabetes"

**Sleep Hours (`sleepHours`):**
- Icon: Moon
- Label: "Sleep (hrs/night)"
- Number input with step 0.5
- Null if empty

**Stress Level (`stressLevel`):**
- Icon: Brain
- Options: `"low"` → "Low", `"moderate"` → "Moderate", `"high"` → "High"
- Null if not selected
- Influences AI to adjust plan intensity (high stress → simpler meals, lighter workouts)

---

### Card 3: Training Capacity

Section icon: Dumbbell. Title: "Training Capacity".

| Field | API Key | Type | Required | Validation | UI Component |
|-------|---------|------|----------|------------|--------------|
| Activity Level | `activityLevel` | string \| null | No | enum | Select picker |
| Training Days | `trainingDaysOfWeek` | string[] | YES | min 1, enum values | 7 toggle buttons (Mon-Sun) |
| Session Duration | `sessionDurationMinutes` | integer \| null | No | 10-180 | Number input |

**Activity Level (`activityLevel`):**
- Icon: Activity
- Options: `"sedentary"` → "Sedentary", `"moderate"` → "Moderately Active", `"active"` → "Very Active"
- Influences calorie calculations in meal plans

**Training Days of Week (`trainingDaysOfWeek`):**
- Icon: Flame
- Label: "Training Days (X/week)" where X is the count of selected days
- Seven toggle buttons in a row: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- Values are **lowercase**: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
- Minimum 1 day must be selected
- Selected state: primary variant button with elevated style
- Unselected state: outline variant button
- These directly pre-fill the workout plan creation form's `daysOfWeek` field (after capitalization)

**Session Duration (`sessionDurationMinutes`):**
- Icon: Clock
- Label: "Session Duration (minutes)"
- Number input, min 10, max 180
- Null if empty
- Pre-fills the workout plan creation form's `sessionLength` (snapped to nearest option: 20, 30, 45, 60)

---

### Card 4: Workout Location & Equipment

Section icon: MapPin. Title: "Workout Location & Equipment".

| Field | API Key | Type | Required | Validation | UI Component |
|-------|---------|------|----------|------------|--------------|
| Workout Location | `workoutLocationDefault` | string \| null | No | enum | Select picker |
| Equipment Available | `equipmentAvailable` | string[] | No | array of strings | Accordion with toggle badges |
| Equipment Notes | `equipmentOtherNotes` | string | No | free text | Text area |

**Workout Location (`workoutLocationDefault`):**
- Options: `"gym"` → "Gym", `"home"` → "Home", `"outdoors"` → "Outdoors"
- **Critical behavior:** When the user changes the location, the equipment list auto-populates with preset items for that location

**Equipment auto-population presets:**

When location changes to **Gym**, set `equipmentAvailable` to:
```json
["Treadmill", "Stationary bike", "Rowing machine", "Elliptical",
 "Dumbbells", "Barbells", "EZ bar", "Kettlebells", "Weight plates",
 "Bench (flat)", "Bench (adjustable)",
 "Squat rack", "Power rack", "Smith machine", "Pull-up bar",
 "Dip station", "Resistance bands", "Cable attachments",
 "Cable machine / functional trainer", "Leg press", "Leg extension",
 "Leg curl", "Lat pulldown", "Seated row", "Chest press machine",
 "Pec deck", "Shoulder press machine", "Calf raise machine",
 "Yoga mat", "Foam roller"]
```

When location changes to **Home**, set `equipmentAvailable` to:
```json
["Dumbbells", "Resistance bands", "Yoga mat", "Foam roller",
 "Jump rope", "Kettlebells", "Pull-up bar"]
```

When location changes to **Outdoors**, set `equipmentAvailable` to:
```json
["Track access", "Hills/stairs", "Field", "Jump rope"]
```

**Equipment Available (`equipmentAvailable`) — Accordion UI:**

Equipment is organized in 6 collapsible accordion categories. Each category shows a count badge of selected items. Tapping the category header expands/collapses it.

Categories and their items:

**Cardio:**
Treadmill, Stationary bike, Spin bike, Rowing machine, Elliptical, Stair climber, Ski erg, Assault/air bike, Jump rope

**Free weights:**
Dumbbells, Adjustable dumbbells, Barbells, EZ bar, Kettlebells, Weight plates, Bench (flat), Bench (adjustable)

**Racks & accessories:**
Squat rack, Power rack, Smith machine, Pull-up bar, Dip station, Resistance bands, Cable attachments

**Machines:**
Cable machine / functional trainer, Leg press, Hack squat, Leg extension, Leg curl, Lat pulldown, Seated row, Chest press machine, Pec deck, Shoulder press machine, Calf raise machine, Hip thrust machine, Glute bridge machine, Ab machine

**Home / bodyweight / mobility:**
Yoga mat, Foam roller, Medicine ball, Slam ball, Stability ball, TRX / suspension trainer, Plyo box, Step platform

**Outdoors:**
Track access, Hills/stairs, Field, Pool access

Each item is a toggle badge:
- Selected: filled/default badge style
- Unselected: outline badge style
- Tap to toggle

**Equipment Other Notes (`equipmentOtherNotes`):**
- Label: "Other Equipment Notes"
- Placeholder: "Any other equipment or notes not listed above..."
- Multi-line text area
- For items like "I have a doorway pull-up bar" or "adjustable bench only goes to 60 degrees"

---

### Card 5: Nutrition & Lifestyle

Section icon: UtensilsCrossed. Title: "Nutrition & Lifestyle".

| Field | API Key | Type | Required | Validation | UI Component |
|-------|---------|------|----------|------------|--------------|
| Allergies & Intolerances | `allergiesIntolerances` | string[] | No | array of strings | Tag input |
| Foods to Avoid | `foodsToAvoid` | string[] | No | array of strings | Common badges + tag input for custom |
| Foods to Avoid Notes | `foodsToAvoidNotes` | string \| null | No | free text | Single-line text input |
| Appetite Level | `appetiteLevel` | string \| null | No | enum | Select picker |
| Spice Preference | `spicePreference` | string \| null | No | enum | Select picker |
| Favorite Meals | `favoriteMealsText` | string | No | free text | Multi-line text area |

**Allergies & Intolerances (`allergiesIntolerances`):**
- Tag input (same component as health constraints)
- Placeholder: "e.g. peanuts, shellfish, lactose, gluten"
- These are **HARD CONSTRAINTS** in AI generation — the AI is told "NEVER include these"
- Pre-fills the meal plan creation form's allergies field

**Foods to Avoid (`foodsToAvoid`):**
- Two-part UI:
  1. **Common foods grid** — 14 predefined toggle badges:
     ```
     Pork, Shellfish, Dairy, Gluten, Soy, Eggs, Nuts, Red Meat,
     Fish, Mushrooms, Chicken, Beans/Legumes, Spicy Foods, Garlic/Onion
     ```
  2. **Custom foods** — Tag input below for additional items not in the common list
- Selected badges use filled/default style, unselected use outline
- These are **HARD CONSTRAINTS** in AI generation — the AI is told "NEVER include these"
- Pre-fills the meal plan creation form's foods-to-avoid checkboxes

**Foods to Avoid Notes (`foodsToAvoidNotes`):**
- Single-line text input
- Placeholder: "e.g. allergic to tree nuts but not peanuts"
- For nuance that a simple tag list can't capture

**Appetite Level (`appetiteLevel`):**
- Options: `"low"` → "Low", `"normal"` → "Normal", `"high"` → "High"
- Influences portion sizes in generated meal plans

**Spice Preference (`spicePreference`):**
- Options: `"mild"` → "Mild", `"medium"` → "Medium", `"spicy"` → "Spicy"
- Maps to the meal plan form's spice level (mild→mild, medium→medium, spicy→hot)

**Favorite Meals (`favoriteMealsText`):**
- Icon: Flame
- Label: "Favorite Meals (optional)"
- Multi-line text area
- Placeholder: "e.g. chicken stir-fry, overnight oats, grilled salmon with veggies, Greek yogurt bowls"
- Hint text below: "AI will include healthier versions of your favorites when possible."
- This text is injected into AI prompts as: "FAVORITE MEALS (soft constraint — include at least 1 per day as a healthier version)"
- The AI tries to incorporate these meals but will adjust ingredients to comply with allergies/avoidances

---

### Save Button Behavior

The save button appears at the bottom right of the form.

| State | Label | Icon |
|-------|-------|------|
| New profile, idle | "Create Profile" | Save icon |
| Existing profile, idle | "Update Profile" | Check icon |
| Saving | "Saving..." | Spinner |

**API Call:**
- New profile: `POST /api/profile` with full form data
- Existing profile: `PUT /api/profile` with full form data

**Success:** Toast notification "Profile saved" with description "Your performance blueprint has been updated."
**Error:** Toast notification with error message, destructive variant.

### Submission Data Normalization

**Important:** Before sending to the API, the form data is normalized. Several legacy fields are populated from the unified fields:

```swift
// The actual submission maps unified fields to legacy database columns
submissionData.allergies = submissionData.allergiesIntolerances
submissionData.intolerances = submissionData.allergiesIntolerances
submissionData.religiousRestrictions = []
submissionData.injuries = submissionData.healthConstraints
submissionData.mobilityLimitations = submissionData.healthConstraints
submissionData.chronicConditions = submissionData.healthConstraints
```

This means:
- `allergiesIntolerances` is the source of truth — copy its value to both `allergies` and `intolerances`
- `healthConstraints` is the source of truth — copy its value to `injuries`, `mobilityLimitations`, and `chronicConditions`
- `religiousRestrictions` is always sent as an empty array

The iOS app must perform this same normalization before sending the PUT/POST request.

---

## Food Preferences Page

This page shows learned preferences from meal plan feedback. Users do NOT add items here directly — items appear automatically when users give feedback (thumbs up/down) on meals and ingredients within plan detail views.

### API Endpoints

```
GET    /api/preferences                           → { likedMeals, dislikedMeals, avoidIngredients, preferIngredients }
DELETE /api/preferences/meal/{id}                  → Remove a meal feedback entry
DELETE /api/preferences/ingredient/{id}            → Remove an ingredient preference
GET    /api/ingredient-proposals                   → Pending ingredient avoid proposals
POST   /api/ingredient-proposals/{id}/resolve      → Accept/decline a proposal
```

### Structure

The page has a **tabbed interface** with 4 tabs:

**Tab 1: Liked Meals**
- List of meals the user has liked (thumbs-up) from plan detail views
- Each item shows: meal name, cuisine tag badge
- Removable via trash icon button
- Empty state: "No liked meals yet. Like meals in your meal plans to improve future suggestions."

**Tab 2: Disliked Meals**
- List of meals the user has disliked (thumbs-down)
- Same display as liked meals
- Empty state: "No disliked meals yet. Dislike meals to deprioritize them in future plans."

**Tab 3: Avoid Ingredients**
- List of ingredients the user wants to avoid
- Each item shows: ingredient name (capitalized), source badge
- Source indicates how it was added (e.g., "dislike" if auto-proposed after disliking a meal)
- Empty state: "No avoided ingredients yet."

**Tab 4: Prefer Ingredients**
- List of ingredients the user prefers
- Same display as avoid ingredients
- Empty state: "No preferred ingredients yet."

### Ingredient Proposals

When a user dislikes a meal, the system may propose specific ingredients from that meal to avoid in the future. These appear as pending proposals at the top of the page.

Each proposal shows:
- The meal name that was disliked
- Checkboxes for each ingredient from that meal
- Two action buttons: Accept (saves selected ingredients as "avoid") or Decline (dismisses proposal)

```
POST /api/ingredient-proposals/{id}/resolve
Body: { 
  "chosenIngredients": ["shellfish", "cream"],  // selected ingredients to avoid
  "action": "accepted" | "declined"
}
```

---

## Exercise Preferences Page

Similar to food preferences, this shows learned exercise preferences from workout plan feedback.

### API Endpoints

```
GET    /api/preferences/exercise           → { liked, disliked, avoided }
POST   /api/preferences/exercise           → Add a new exercise preference
DELETE /api/preferences/exercise/{id}      → Remove by ID
DELETE /api/preferences/exercise/key/{key} → Remove by exercise key
```

### Structure

Tabbed interface with 3 tabs:

**Tab 1: Liked**
- Exercises the user has liked (thumbs-up) in workout plan detail views
- Each shows: exercise name, "Liked" badge
- Removable via trash icon
- Empty state: "No liked exercises yet. Like exercises in your workout plans to improve future suggestions."

**Tab 2: Disliked**
- Exercises the user has disliked
- "Disliked" badge
- AI deprioritizes these in future plans
- Empty state: "No disliked exercises yet. Dislike exercises to deprioritize them in future plans."

**Tab 3: Avoided**
- Exercises the user never wants to see
- "Avoided" badge
- AI will NOT include these in future plans
- Empty state: "No avoided exercises yet. Avoid exercises you never want to see in future plans."

### Exercise Preference Data Shape

```json
{
  "id": "uuid",
  "exerciseKey": "barbell-bench-press",
  "exerciseName": "Barbell Bench Press",
  "status": "liked" | "disliked" | "avoided",
  "createdAt": "2026-02-20T...",
  "updatedAt": "2026-02-20T..."
}
```

---

## How Profile Data Flows Into Plan Generation

Understanding this is essential for the iOS app to provide the same experience.

### Pre-filling the Meal Plan Creation Form

When the user opens the meal plan creation form, the app fetches `GET /api/profile` and maps:

| Profile Field | Meal Form Field | Mapping |
|---|---|---|
| `primaryGoal` | `goal` | `general_fitness`/`mobility` → `maintenance`; `endurance`/`strength` → `performance`; others pass through |
| `foodsToAvoid` | Foods to Avoid checkboxes | Direct array mapping |
| `allergiesIntolerances` | `allergies` text field | Array joined with ", " |
| `trainingDaysOfWeek` | `workoutDays` | Passed directly; count becomes `workoutDaysPerWeek` |
| `spicePreference` | `spiceLevel` | `mild`→`mild`, `medium`→`medium`, `spicy`→`hot` |

### Pre-filling the Workout Plan Creation Form

| Profile Field | Workout Form Field | Mapping |
|---|---|---|
| `primaryGoal` | `goal` | `general_fitness`/`energy`/`mobility` → `maintenance`; `endurance` → `performance`; `strength` → `muscle_gain`; others pass through |
| `trainingDaysOfWeek` | `daysOfWeek` | Lowercase to capitalized: `"mon"` → `"Mon"` |
| `trainingExperience` | `experienceLevel` | Direct mapping |
| `sessionDurationMinutes` | `sessionLength` | Snap to nearest: 20, 30, 45, or 60 |
| `healthConstraints` | `limitations` text | Array joined with ", " |
| `workoutLocationDefault` | `location` | `"gym"` → `"gym"`, `"home"` → `"home_equipment"`, `"outdoors"` → `"outdoor"` |
| `equipmentAvailable` | `equipmentAvailable` | Direct array mapping (if non-empty) |

### During AI Generation

The profile data is extracted into a structured context by the server's `context-builder.ts`. This context includes:

- **Demographics**: age, sex
- **Measurements**: height, weight, target weight, unit system
- **Goals**: primary goal, pace/bias
- **Training**: experience, training days, session duration, activity level
- **Health**: health constraints, sleep hours, stress level
- **Nutrition**: allergies (HARD constraint), foods to avoid (HARD constraint), appetite level, spice preference, favorite meals (soft constraint)
- **Equipment**: workout location, equipment list, equipment notes
- **Body context**: free-text body notes (HIGH PRIORITY in prompt)

The AI is instructed to NEVER include items from allergies or foods-to-avoid lists. Favorite meals are treated as soft constraints (include at least 1 per day as a healthier version if possible).

---

## Summary of All API Endpoints

| Action | Method | Endpoint | Notes |
|--------|--------|----------|-------|
| Get profile | GET | `/api/profile` | Returns profile or `null` |
| Create profile | POST | `/api/profile` | Returns 409 if exists |
| Update profile | PUT | `/api/profile` | Creates if not exists |
| Get food preferences | GET | `/api/preferences` | Liked/disliked meals + ingredients |
| Remove meal feedback | DELETE | `/api/preferences/meal/{id}` | |
| Remove ingredient pref | DELETE | `/api/preferences/ingredient/{id}` | |
| Get ingredient proposals | GET | `/api/ingredient-proposals` | Pending proposals |
| Resolve proposal | POST | `/api/ingredient-proposals/{id}/resolve` | Accept/decline |
| Get exercise preferences | GET | `/api/preferences/exercise` | Liked/disliked/avoided |
| Add exercise preference | POST | `/api/preferences/exercise` | |
| Remove exercise pref by ID | DELETE | `/api/preferences/exercise/{id}` | |
| Remove exercise pref by key | DELETE | `/api/preferences/exercise/key/{key}` | |
| Get goal plans | GET | `/api/goal-plans` | For active wellness plan display |
| Logout (JWT) | POST | `/api/auth/token-logout` | Body: `{ refreshToken }` |

---

## Default Values for New Profiles

When creating a brand new profile, use these defaults:

```json
{
  "unitSystem": "imperial",
  "age": 25,
  "sex": null,
  "heightCm": null,
  "weightKg": 70,
  "targetWeightKg": null,
  "primaryGoal": "general_fitness",
  "trainingExperience": "beginner",
  "injuries": [],
  "mobilityLimitations": [],
  "chronicConditions": [],
  "healthConstraints": [],
  "sleepHours": null,
  "stressLevel": null,
  "activityLevel": null,
  "trainingDaysOfWeek": [],
  "sessionDurationMinutes": null,
  "allergies": [],
  "intolerances": [],
  "religiousRestrictions": [],
  "allergiesIntolerances": [],
  "foodsToAvoid": [],
  "foodsToAvoidNotes": null,
  "appetiteLevel": null,
  "spicePreference": null,
  "bodyContext": "",
  "favoriteMealsText": "",
  "workoutLocationDefault": null,
  "equipmentAvailable": [],
  "equipmentOtherNotes": ""
}
```
