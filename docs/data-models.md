# Perform AI — Data Models Reference

> **Purpose**: Canonical TypeScript type definitions for every entity in the Perform AI platform.
> The React Native / Swift mobile app should replicate these types.
>
> **Source of truth**: `shared/schema.ts` (Drizzle ORM + Zod schemas)
>
> **Last updated**: 2026-02-22

---

## Table of Contents

1. [Conventions](#conventions)
2. [Auth](#auth)
3. [Profile](#profile)
4. [Meal Plans](#meal-plans)
5. [Workouts](#workouts)
6. [Goals](#goals)
7. [Daily Planning](#daily-planning)
8. [Calendar & Completions](#calendar--completions)
9. [Performance & Adaptation](#performance--adaptation)
10. [Feedback & Preferences](#feedback--preferences)
11. [Allowances & Economy](#allowances--economy)
12. [Adaptive Engine](#adaptive-engine)

---

## Conventions

| Convention | Meaning |
|---|---|
| `field: T \| null` | Column is **nullable** — the field is always present in the JSON but its value may be `null`. |
| `field?: T` | Field is **optional** — it may be omitted entirely from the JSON payload. |
| `// JSON` | The column is stored as `jsonb` in Postgres. The typed shape describes its runtime structure. |
| `// auto` | Value is server-generated (UUID default, timestamp default). Clients never send it. |
| `// YYYY-MM-DD` | String formatted as an ISO date (no time component). |
| `Date` | ISO-8601 timestamp string when serialized over JSON (`string` in Swift). |

---

## Auth

### User

Database table: `users`

```ts
interface User {
  id: string;                  // auto — UUID
  email: string;
  passwordHash: string;        // NEVER sent to client
  createdAt: Date;             // auto
}
```

### RefreshToken

Database table: `refresh_tokens`

```ts
interface RefreshToken {
  id: string;                  // auto — UUID
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;             // auto
  lastUsedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
}
```

### Auth Request Schemas

```ts
interface SignupInput {
  email: string;               // valid email
  password: string;            // min 6 characters
}

interface LoginInput {
  email: string;               // valid email
  password: string;            // min 1 character
}
```

---

## Profile

### UserProfile

Database table: `user_profiles`

```ts
interface UserProfile {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id (unique)
  unitSystem: "imperial" | "metric";                   // default: "imperial"
  age: number;                                         // int, min 13
  sex: string | null;
  heightCm: number | null;                             // int, cm
  weightKg: number;                                    // float, kg
  targetWeightKg: number | null;                       // float, kg
  primaryGoal: string;                                 // e.g. "weight_loss", "muscle_gain"
  trainingExperience: "beginner" | "intermediate" | "advanced";

  // Health & medical
  injuries: string[];                                  // JSON
  mobilityLimitations: string[];                       // JSON
  chronicConditions: string[];                         // JSON
  healthConstraints: string[];                         // JSON

  // Wellness signals
  sleepHours: number | null;                           // float, 0–24
  stressLevel: "low" | "moderate" | "high" | null;
  activityLevel: "sedentary" | "moderate" | "active" | null;

  // Training schedule
  trainingDaysOfWeek: string[];                        // JSON — e.g. ["mon","tue","wed"]
  sessionDurationMinutes: number | null;               // int, 10–180

  // Dietary restrictions
  allergies: string[];                                 // JSON
  intolerances: string[];                              // JSON
  religiousRestrictions: string[];                     // JSON
  allergiesIntolerances: string[];                     // JSON (combined legacy field)
  foodsToAvoid: string[];                              // JSON
  foodsToAvoidNotes: string | null;                    // max 500 chars

  // Taste preferences
  appetiteLevel: "low" | "normal" | "high" | null;
  spicePreference: "mild" | "medium" | "spicy" | null;
  bodyContext: string;                                 // free-text, default ""
  favoriteMealsText: string;                           // free-text, default ""

  // Workout defaults
  workoutLocationDefault: "gym" | "home" | "outdoors" | null;
  equipmentAvailable: string[];                        // JSON
  equipmentOtherNotes: string;                         // default ""

  // Adaptive
  nextWeekPlanBias: string | null;

  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

---

## Meal Plans

### MealPlan

Database table: `meal_plans`

```ts
interface MealPlan {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  idempotencyKey: string | null;
  status: "pending" | "generating" | "ready" | "failed";  // default: "ready"
  pricingStatus: "pending" | "ready" | "failed";       // default: "pending"
  createdAt: Date;                                     // auto
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  preferencesJson: Preferences;                        // JSON — see below
  planJson: PlanOutput | null;                         // JSON — see below
  swapCount: number;                                   // default: 0
  regenDayCount: number;                               // default: 0
  groceryPricingJson: GroceryPricing | null;           // JSON — see below
  profileSnapshot: object | null;                      // JSON — frozen profile at generation time
  adaptiveSnapshot: object | null;                     // JSON — frozen adaptive state
  planStartDate: string | null;                        // YYYY-MM-DD
  deletedAt: Date | null;
}
```

### Preferences (Meal plan creation input)

Stored in `MealPlan.preferencesJson`.

```ts
interface Preferences {
  goal: "weight_loss" | "muscle_gain" | "energy" | "maintenance" | "performance";
  dietStyles: string[];                                // min 1
  foodsToAvoid: string[];                              // default: []
  householdSize: number;                               // int, 1–8
  prepStyle: "cook_daily" | "batch_2day" | "batch_3to4day";
  budgetMode: "normal" | "budget_friendly";
  cookingTime: "quick" | "normal";
  mealsPerDay: 2 | 3;                                  // default: 3
  mealSlots?: ("breakfast" | "lunch" | "dinner")[];    // required when mealsPerDay = 2
  allergies?: string;
  age?: number;                                        // int, 1–120
  currentWeight?: number;                              // 1–1000
  targetWeight?: number;                               // 1–1000
  weightUnit: "lb" | "kg";                             // default: "lb"
  workoutDaysPerWeek?: number;                         // int, 0–7
  workoutDays?: string[];                              // e.g. ["Sun","Mon",…]
  spiceLevel: "none" | "mild" | "medium" | "hot";      // default: "medium"
  authenticityMode: "traditional" | "weeknight" | "mixed"; // default: "mixed"
}
```

### PlanOutput

Stored in `MealPlan.planJson`. This is the AI-generated meal plan.

```ts
interface PlanOutput {
  title: string;
  summary: string;
  preferencesEcho: Record<string, any>;
  days: Day[];                                         // always length 7
  groceryList: {
    sections: GrocerySection[];
  };
  batchPrepPlan?: {
    prepDay: string;
    steps: string[];
    storageTips: string[];
  };
  nutritionNotes: {
    dailyMacroTargetsRange: NutritionEstimate;
    howThisSupportsGoal: string[];
  };
}
```

### Day

```ts
interface Day {
  dayIndex: number;                                    // 1–7
  dayName: string;                                     // e.g. "Monday"
  meals: {
    breakfast?: Meal;
    lunch?: Meal;
    dinner?: Meal;
  };
}
```

### Meal

```ts
interface Meal {
  name: string;
  cuisineTag: string;
  prepTimeMinutes: number;
  servings: number;
  ingredients: string[];
  steps: string[];
  nutritionEstimateRange: NutritionEstimate;
  whyItHelpsGoal: string;
}
```

### NutritionEstimate

```ts
interface NutritionEstimate {
  calories: string;                                    // e.g. "400–500"
  protein_g: string;                                   // e.g. "30–35"
  carbs_g: string;
  fat_g: string;
}
```

### GrocerySection

```ts
interface GrocerySection {
  name: string;                                        // e.g. "Produce", "Dairy"
  items: GroceryItem[];
}
```

### GroceryItem

```ts
interface GroceryItem {
  item: string;
  quantity: string;
  notes?: string;
}
```

### GroceryPricing

Stored in `MealPlan.groceryPricingJson`.

```ts
interface GroceryPricing {
  currency: string;                                    // e.g. "USD"
  assumptions: {
    region: string;
    pricingType: string;
    note: string;
  };
  items: GroceryPricingItem[];
}
```

### GroceryPricingItem

```ts
interface GroceryPricingItem {
  itemKey: string;
  displayName: string;
  unitHint: string;
  estimatedRange: {
    min: number;
    max: number;
  };
  confidence: "low" | "medium" | "high";
}
```

---

## Workouts

### WorkoutPlan

Database table: `workout_plans`

```ts
interface WorkoutPlan {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  idempotencyKey: string | null;
  status: "pending" | "generating" | "ready" | "failed";  // default: "ready"
  createdAt: Date;                                     // auto
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  preferencesJson: WorkoutPreferences;                 // JSON — see below
  planJson: WorkoutPlanOutput | null;                  // JSON — see below
  profileSnapshot: object | null;                      // JSON
  adaptiveSnapshot: object | null;                     // JSON
  planStartDate: string | null;                        // YYYY-MM-DD
  deletedAt: Date | null;
}
```

### WorkoutPreferences (Workout plan creation input)

Stored in `WorkoutPlan.preferencesJson`.

```ts
interface WorkoutPreferences {
  goal: "weight_loss" | "muscle_gain" | "performance" | "maintenance";
  location: "gym" | "home" | "outdoors";
  trainingMode: "strength" | "cardio" | "both";
  focusAreas: string[];                                // min 1
  daysOfWeek: string[];                                // e.g. ["Mon","Wed","Fri"], min 1
  sessionLength: 20 | 30 | 45 | 60;
  experienceLevel: "beginner" | "intermediate" | "advanced";
  limitations?: string;
  equipmentAvailable?: string[];
}
```

### WorkoutPlanOutput

Stored in `WorkoutPlan.planJson`. This is the AI-generated workout plan.

```ts
interface WorkoutPlanOutput {
  title: string;
  summary: string;
  preferencesEcho: Record<string, any>;
  days: WorkoutDay[];                                  // always length 7
  progressionNotes?: string[];
}
```

### WorkoutDay

```ts
interface WorkoutDay {
  dayIndex: number;                                    // 1–7
  dayName: string;
  isWorkoutDay: boolean;
  session: WorkoutSession | null;                      // null on rest days
}
```

### WorkoutSession

```ts
interface WorkoutSession {
  mode: "strength" | "cardio" | "mixed";
  focus: string;                                       // e.g. "Upper Body Push"
  durationMinutes: number;
  intensity: "easy" | "moderate" | "hard";
  warmup: string[];
  main: WorkoutExercise[];
  finisher?: string[];
  cooldown: string[];
  coachingCues?: string[];
}
```

### WorkoutExercise

```ts
interface WorkoutExercise {
  name: string;
  type: "strength" | "cardio" | "mobility";
  sets: number | null;
  reps: string | null;                                 // e.g. "8–12"
  time: string | null;                                 // e.g. "30s"
  restSeconds: number | null;
  notes: string | null;
}
```

---

## Goals

### GoalPlan

Database table: `goal_plans`

```ts
interface GoalPlan {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalType: string;                                    // e.g. "weight_loss", "muscle_gain"
  planType: "meal" | "workout" | "both";               // default: "both"
  startDate: string | null;                            // YYYY-MM-DD
  endDate: string | null;                              // YYYY-MM-DD
  pace: string | null;
  title: string | null;
  globalInputs: object | null;                         // JSON
  nutritionInputs: object | null;                      // JSON
  trainingInputs: object | null;                       // JSON
  status: "draft" | "generating" | "ready" | "failed"; // default: "draft"
  progress: GoalProgress | null;                       // JSON — see below
  profileSnapshot: object | null;                      // JSON
  adaptiveSnapshot: object | null;                     // JSON
  mealPlanId: string | null;                           // FK → meal_plans.id
  workoutPlanId: string | null;                        // FK → workout_plans.id
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
  deletedAt: Date | null;
}
```

### GoalProgress

Stored in `GoalPlan.progress`. Tracks multi-stage generation pipeline.

```ts
type StageStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

interface GoalProgress {
  stage: "TRAINING" | "NUTRITION" | "SCHEDULING" | "FINALIZING";
  stageStatuses: {
    TRAINING: StageStatus;
    NUTRITION: StageStatus;
    SCHEDULING: StageStatus;
    FINALIZING: StageStatus;
  };
  errorMessage?: string;
}
```

### GoalGenerateInput

```ts
interface GoalGenerateInput {
  goalType: string;
  planType: "meal" | "workout" | "both";               // default: "both"
  startDate?: string;                                  // YYYY-MM-DD
  pace?: string;
  globalInputs?: {
    age?: number;
    currentWeight?: number;
    targetWeight?: number;
    weightUnit: "lb" | "kg";                           // default: "lb"
  };
  mealPreferences?: any;
  workoutPreferences?: any;
}
```

---

## Daily Planning

### DailyMeal

Database table: `daily_meals`  
Unique constraint: `(userId, date)`

```ts
interface DailyMeal {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  date: string;                                        // YYYY-MM-DD
  mealsPerDay: number;                                 // default: 3
  generatedTitle: string | null;
  planJson: object | null;                             // JSON — same shape as PlanOutput for a single day
  groceryJson: object | null;                          // JSON
  profileSnapshot: object | null;                      // JSON
  adaptiveSnapshot: object | null;                     // JSON
  status: "generating" | "ready" | "failed";           // default: "ready"
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

### DailyWorkout

Database table: `daily_workouts`  
Unique constraint: `(userId, date)`

```ts
interface DailyWorkout {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  date: string;                                        // YYYY-MM-DD
  generatedTitle: string | null;
  planJson: object | null;                             // JSON — same shape as WorkoutPlanOutput for a single day
  profileSnapshot: object | null;                      // JSON
  adaptiveSnapshot: object | null;                     // JSON
  status: "generating" | "ready" | "failed";           // default: "ready"
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

---

## Calendar & Completions

### ActivityCompletion

Database table: `activity_completions`  
Unique constraint: `(userId, date, itemType, sourceType, sourceId, itemKey)`

```ts
interface ActivityCompletion {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  date: string;                                        // YYYY-MM-DD
  itemType: "meal" | "workout";
  sourceType: "meal_plan" | "workout_plan" | "daily_meal" | "daily_workout";
  sourceId: string;                                    // FK to the source plan/daily record
  itemKey: string;                                     // identifies the specific item within the plan
  completed: boolean;                                  // default: false
  completedAt: Date | null;
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

### ToggleCompletionInput

```ts
interface ToggleCompletionInput {
  date: string;                                        // YYYY-MM-DD
  itemType: "meal" | "workout";
  sourceType: "meal_plan" | "workout_plan" | "daily_meal" | "daily_workout";
  sourceId: string;
  itemKey: string;
  completed: boolean;
}
```

---

## Performance & Adaptation

### WeeklyCheckIn

Database table: `weekly_check_ins`

```ts
interface WeeklyCheckIn {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalPlanId: string | null;                           // FK → goal_plans.id
  weekStartDate: string;                               // YYYY-MM-DD
  weightStart: number | null;                          // float
  weightEnd: number | null;                            // float
  energyRating: number | null;                         // int, 1–5
  complianceMeals: number | null;                      // int, 0–100 (percentage)
  complianceWorkouts: number | null;                   // int, 0–100 (percentage)
  notes: string | null;
  createdAt: Date;                                     // auto
}
```

### PerformanceSummary

Database table: `performance_summaries`  
Unique constraint: `(userId, weekStartDate)`

```ts
interface PerformanceSummary {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  weekStartDate: string;                               // YYYY-MM-DD
  weekEndDate: string;                                 // YYYY-MM-DD
  mealAdherencePct: number | null;                     // float, 0–100
  workoutAdherencePct: number | null;                  // float, 0–100
  energyAvg: number | null;                            // float
  weightDeltaKg: number | null;                        // float (positive = gained)
  adherenceScore: number;                              // int
  momentumState: string;                               // e.g. "rising", "steady", "declining"
  insights: string[];                                  // JSON
  adjustmentAction: string;                            // e.g. "maintain", "increase_volume"
  adjustmentStatement: string;                         // human-readable summary
  economyDelta: object;                                // JSON — bonus/penalty adjustments
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

### WeeklyAdaptation

Database table: `weekly_adaptations`  
Unique constraint: `(userId, weekStartDate)`

```ts
interface WeeklyAdaptation {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  weekStartDate: string;                               // YYYY-MM-DD
  computedSignals: object;                             // JSON — raw signal data
  adaptationParams: object;                            // JSON — modifier parameters
  summaryText: string;                                 // human-readable summary
  createdAt: Date;                                     // auto
}
```

---

## Feedback & Preferences

### MealFeedback

Database table: `meal_feedback`  
Unique constraint: `(userId, mealFingerprint)`

```ts
interface MealFeedbackRecord {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  mealPlanId: string | null;
  mealFingerprint: string;                             // deterministic hash of meal
  mealName: string;
  cuisineTag: string;
  feedback: "like" | "dislike" | "neutral";
  createdAt: Date;                                     // auto
}
```

### MealFeedbackInput

```ts
interface MealFeedbackInput {
  planId?: string;
  dayIndex?: number;
  mealType?: string;
  mealFingerprint: string;
  mealName: string;
  cuisineTag: string;
  feedback: "like" | "dislike" | "neutral";
  ingredients?: string[];
}
```

### WorkoutFeedback

Database table: `workout_feedback`  
Unique constraint: `(userId, sessionKey)`

```ts
interface WorkoutFeedbackRecord {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  workoutPlanId: string | null;
  dayIndex: number;
  sessionKey: string;
  feedback: "like" | "dislike" | "neutral";
  createdAt: Date;                                     // auto
}
```

### WorkoutFeedbackInput

```ts
interface WorkoutFeedbackInput {
  workoutPlanId?: string;
  dayIndex: number;
  sessionKey: string;
  feedback: "like" | "dislike" | "neutral";
}
```

### ExercisePreference

Database table: `exercise_preferences`  
Unique constraint: `(userId, exerciseKey)`

```ts
interface ExercisePreferenceRecord {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  exerciseKey: string;
  exerciseName: string;
  status: "liked" | "disliked" | "avoided";
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

### IngredientPreference

Database table: `ingredient_preferences`  
Unique constraint: `(userId, ingredientKey)`

```ts
interface IngredientPreferenceRecord {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  ingredientKey: string;
  preference: string;                                  // e.g. "avoid", "prefer"
  source: string;                                      // default: "derived"
  createdAt: Date;                                     // auto
}
```

### IngredientAvoidProposal

Database table: `ingredient_avoid_proposals`

```ts
interface IngredientAvoidProposal {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  mealKey: string;
  mealName: string;
  ingredients: string[];                               // JSON — proposed ingredients to avoid
  chosenIngredients: string[] | null;                  // JSON — user's selection
  action: string | null;                               // "accepted" | "declined"
  createdAt: Date;                                     // auto
  resolvedAt: Date | null;
}
```

### UserPreferenceContext

Aggregated view used by the AI prompt builder (not a DB table).

```ts
interface UserPreferenceContext {
  likedMeals: { name: string; cuisineTag: string }[];
  dislikedMeals: { name: string; cuisineTag: string }[];
  avoidIngredients: string[];
  preferIngredients: string[];
  avoidedExercises: string[];
  dislikedExercises: string[];
}
```

---

## Allowances & Economy

### PlanAllowance

Database table: `plan_allowances`

```ts
interface PlanAllowance {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalPlanId: string;                                  // FK → goal_plans.id
  startDate: string | null;                            // YYYY-MM-DD
  endDate: string | null;                              // YYYY-MM-DD

  // Base limits (per day unless noted)
  baseMealSwapsPerDay: number;                         // default: 2
  baseWorkoutSwapsPerDay: number;                      // default: 2
  baseMealDayRegensPerDay: number;                     // default: 1
  baseWorkoutDayRegensPerDay: number;                  // default: 1
  basePlanRegensTotal: number;                         // default: 5 (lifetime of the plan)

  // Bonus (earned via good adherence)
  bonusMealSwapsPerDay: number;                        // default: 0
  bonusWorkoutSwapsPerDay: number;                     // default: 0
  bonusPlanRegensTotal: number;                        // default: 0

  // Penalty (deducted for poor adherence)
  penaltyPlanRegensTotal: number;                      // default: 0

  // Usage counters (reset daily)
  mealSwapsUsedToday: number;                          // default: 0
  workoutSwapsUsedToday: number;                       // default: 0
  mealRegensUsedToday: number;                         // default: 0
  workoutRegensUsedToday: number;                      // default: 0
  regensUsedTotal: number;                             // default: 0 (cumulative)

  lastDailyResetAt: Date;                              // auto
  regenCooldownUntil: Date | null;
  createdAt: Date;                                     // auto
  updatedAt: Date;                                     // auto
}
```

### PlanUsageEvent

Database table: `plan_usage_events`

```ts
interface PlanUsageEvent {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalPlanId: string;                                  // FK → goal_plans.id
  domain: string;                                      // "meal" | "workout"
  actionType: string;                                  // "swap" | "regen"
  scope: string;                                       // "day" | "plan"
  occurredAt: Date;                                    // auto
  metadataJson: object | null;                         // JSON
}
```

### FlexToken

Database table: `flex_tokens`

```ts
interface FlexToken {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalPlanId: string;                                  // FK → goal_plans.id
  tokenType: string;                                   // default: "EXTRA_REGEN"
  quantity: number;                                     // default: 1
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;                                     // auto
}
```

### PlanBehaviorSummary

Database table: `plan_behavior_summaries`

```ts
interface PlanBehaviorSummary {
  id: string;                                          // auto — UUID
  userId: string;                                      // FK → users.id
  goalPlanId: string;                                  // FK → goal_plans.id
  mealAdherenceAvg: number | null;                     // float
  workoutAdherenceAvg: number | null;                  // float
  combinedAdherence: number | null;                    // float
  regenRate: number | null;                            // float
  dislikedRateMeals: number | null;                    // float
  dislikedRateWorkouts: number | null;                 // float
  avoidedIngredientsCount: number | null;              // int
  avoidedExercisesCount: number | null;                // int
  streakDays: number | null;                           // int
  resultingBonusJson: object | null;                   // JSON
  resultingPenaltyJson: object | null;                 // JSON
  computedAt: Date;                                    // auto
}
```

---

## Adaptive Engine

These types power the adaptive plan intelligence system. They are computed server-side and stored as JSON snapshots on plans.

### AdaptiveModifiers

```ts
interface AdaptiveModifiers {
  volumeMultiplier: number;
  intensityCapRPE: number;
  cardioBias: "lower" | "normal" | "higher";
  recoveryBias: "normal" | "higher";
  complexityLevel: "simple" | "standard" | "advanced";
  nutritionCalorieDeltaKcal: number;
  trainingDayCarbBias: "lower" | "normal" | "higher";
  simplifyMeals: boolean;
  deloadWeek: boolean;
}
```

### AdaptiveDecision

```ts
interface AdaptiveDecision {
  code: string;                                        // machine-readable key
  severity: "info" | "adjust";
  message: string;                                     // human-readable explanation
}
```

### AdaptiveSnapshot

Stored in `profileSnapshot` / `adaptiveSnapshot` fields across plans.

```ts
interface AdaptiveSnapshot {
  modifiers: AdaptiveModifiers;
  decisions: AdaptiveDecision[];
  inputsMeta: {
    summaryIdsUsed: string[];
    computedAt: string;                                // ISO timestamp
  };
}
```

---

## Safety & Constraints (Internal)

These tables are internal to the server and are not exposed to clients, but are documented for completeness.

### ConstraintViolation

Database table: `constraint_violations`

```ts
interface ConstraintViolation {
  id: string;                                          // auto — UUID
  userId: string;
  planType: string;                                    // "meal" | "workout"
  planId: string | null;
  goalPlanId: string | null;
  stage: string;                                       // "pre" | "post"
  ruleKey: string;
  severity: string;                                    // "warn" | "block"
  message: string;
  metaJson: object | null;                             // JSON
  createdAt: Date;                                     // auto
}
```

### WellnessPlanSpec

Database table: `wellness_plan_specs`

```ts
interface WellnessPlanSpec {
  id: string;                                          // auto — UUID
  userId: string;
  planType: string;
  planId: string | null;
  goalPlanId: string | null;
  safeSpecJson: object;                                // JSON — safe parameter ranges
  createdAt: Date;                                     // auto
}
```

### AuditLog

Database table: `audit_logs`

```ts
interface AuditLog {
  id: string;                                          // auto — UUID
  userId: string;
  action: string;
  createdAt: Date;                                     // auto
  metaJson: object | null;                             // JSON
}
```

### OwnedGroceryItem

Database table: `owned_grocery_items`  
Unique constraint: `(userId, mealPlanId, itemKey)`

```ts
interface OwnedGroceryItem {
  id: string;                                          // auto — UUID
  userId: string;
  mealPlanId: string;
  itemKey: string;
  isOwned: number;                                     // 0 or 1
  updatedAt: Date;                                     // auto
}
```
