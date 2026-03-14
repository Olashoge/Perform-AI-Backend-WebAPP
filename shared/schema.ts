import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, uniqueIndex, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const mealPlans = pgTable("meal_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  idempotencyKey: varchar("idempotency_key"),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  preferencesJson: jsonb("preferences_json").notNull(),
  planJson: jsonb("plan_json"),
  profileSnapshot: jsonb("profile_snapshot"),
  adaptiveSnapshot: jsonb("adaptive_snapshot"),
  planStartDate: varchar("plan_start_date", { length: 10 }),
  parentGoalPlanId: varchar("parent_goal_plan_id"),
  deletedAt: timestamp("deleted_at"),
});

export const ownedGroceryItems = pgTable("owned_grocery_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  mealPlanId: varchar("meal_plan_id").notNull().references(() => mealPlans.id),
  itemKey: varchar("item_key").notNull(),
  isOwned: integer("is_owned").notNull().default(1),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("owned_grocery_user_plan_item_idx").on(table.userId, table.mealPlanId, table.itemKey),
]);

export const mealFeedback = pgTable("meal_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  mealPlanId: varchar("meal_plan_id"),
  mealFingerprint: varchar("meal_fingerprint").notNull(),
  mealName: text("meal_name").notNull(),
  cuisineTag: text("cuisine_tag").notNull(),
  feedback: varchar("feedback", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("meal_feedback_user_fingerprint_idx").on(table.userId, table.mealFingerprint),
]);

export const ingredientPreferences = pgTable("ingredient_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  ingredientKey: varchar("ingredient_key").notNull(),
  preference: varchar("preference", { length: 10 }).notNull(),
  source: varchar("source", { length: 10 }).notNull().default("derived"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ingredient_pref_user_key_idx").on(table.userId, table.ingredientKey),
]);

export const workoutPlans = pgTable("workout_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  idempotencyKey: varchar("idempotency_key"),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  preferencesJson: jsonb("preferences_json").notNull(),
  planJson: jsonb("plan_json"),
  profileSnapshot: jsonb("profile_snapshot"),
  adaptiveSnapshot: jsonb("adaptive_snapshot"),
  planStartDate: varchar("plan_start_date", { length: 10 }),
  parentGoalPlanId: varchar("parent_goal_plan_id"),
  deletedAt: timestamp("deleted_at"),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  metaJson: jsonb("meta_json"),
});

export const goalPlans = pgTable("goal_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  goalType: varchar("goal_type", { length: 30 }).notNull(),
  planType: varchar("plan_type", { length: 20 }).default("both"),
  startDate: varchar("start_date", { length: 10 }),
  endDate: varchar("end_date", { length: 10 }),
  pace: varchar("pace", { length: 20 }),
  title: text("title"),
  globalInputs: jsonb("global_inputs"),
  nutritionInputs: jsonb("nutrition_inputs"),
  trainingInputs: jsonb("training_inputs"),
  status: varchar("status", { length: 20 }).default("draft"),
  progress: jsonb("progress"),
  profileSnapshot: jsonb("profile_snapshot"),
  adaptiveSnapshot: jsonb("adaptive_snapshot"),
  mealPlanId: varchar("meal_plan_id"),
  workoutPlanId: varchar("workout_plan_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const workoutFeedback = pgTable("workout_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  workoutPlanId: varchar("workout_plan_id"),
  dayIndex: integer("day_index").notNull(),
  sessionKey: varchar("session_key").notNull(),
  feedback: varchar("feedback", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("workout_feedback_user_session_idx").on(table.userId, table.sessionKey),
]);

export const ingredientAvoidProposals = pgTable("ingredient_avoid_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  mealKey: varchar("meal_key").notNull(),
  mealName: text("meal_name").notNull(),
  ingredients: jsonb("ingredients").notNull(),
  chosenIngredients: jsonb("chosen_ingredients"),
  action: varchar("action", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const exercisePreferences = pgTable("exercise_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  exerciseKey: varchar("exercise_key").notNull(),
  exerciseName: text("exercise_name").notNull(),
  status: varchar("status", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("exercise_pref_user_key_idx").on(table.userId, table.exerciseKey),
]);

export const weeklyCheckIns = pgTable("weekly_check_ins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  goalPlanId: varchar("goal_plan_id"),
  weekStartDate: varchar("week_start_date", { length: 10 }).notNull(),
  weightStart: real("weight_start"),
  weightEnd: real("weight_end"),
  energyRating: integer("energy_rating"),
  complianceMeals: integer("compliance_meals"),
  complianceWorkouts: integer("compliance_workouts"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name is too long").trim(),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const updateAccountSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name is too long").trim().optional(),
  email: z.string().email("Please enter a valid email").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

const mealSlotEnum = z.enum(["breakfast", "lunch", "dinner"]);

export const preferencesSchema = z.object({
  goal: z.enum(["weight_loss", "muscle_gain", "body_recomposition", "general_fitness", "athletic_performance", "energy", "maintenance", "performance"]),
  dietStyles: z.array(z.string()).min(1, "Select at least one diet/cuisine style"),
  foodsToAvoid: z.array(z.string()).default([]),
  householdSize: z.number().int().min(1).max(8),
  prepStyle: z.enum(["cook_daily", "batch_2day", "batch_3to4day"]),
  budgetMode: z.enum(["normal", "budget_friendly"]),
  cookingTime: z.enum(["quick", "normal"]),
  mealsPerDay: z.union([z.literal(2), z.literal(3)]).default(3),
  mealSlots: z.array(mealSlotEnum).optional(),
  allergies: z.string().optional(),
  age: z.number().int().min(1).max(120).optional(),
  currentWeight: z.number().min(1).max(1000).optional(),
  targetWeight: z.number().min(1).max(1000).optional(),
  weightUnit: z.enum(["lb", "kg"]).default("lb"),
  workoutDaysPerWeek: z.number().int().min(0).max(7).optional(),
  workoutDays: z.array(z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).optional(),
  spiceLevel: z.enum(["none", "mild", "medium", "hot"]).default("medium"),
  authenticityMode: z.enum(["traditional", "weeknight", "mixed"]).default("mixed"),
}).refine((data) => {
  if (data.mealsPerDay === 2 && data.mealSlots) {
    return data.mealSlots.length === 2;
  }
  return true;
}, { message: "Select exactly 2 meal slots when choosing 2 meals per day", path: ["mealSlots"] });

export const nutritionEstimateSchema = z.object({
  calories: z.string(),
  protein_g: z.string(),
  carbs_g: z.string(),
  fat_g: z.string(),
});

export const mealSchema = z.object({
  name: z.string(),
  cuisineTag: z.string(),
  prepTimeMinutes: z.coerce.number(),
  servings: z.coerce.number(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  nutritionEstimateRange: nutritionEstimateSchema,
  whyItHelpsGoal: z.string(),
});

export const groceryItemSchema = z.object({
  item: z.string(),
  quantity: z.string(),
  notes: z.string().optional(),
});

export const grocerySectionSchema = z.object({
  name: z.string(),
  items: z.array(groceryItemSchema),
});

export const daySchema = z.object({
  dayIndex: z.coerce.number(),
  dayName: z.string(),
  meals: z.object({
    breakfast: mealSchema.optional(),
    lunch: mealSchema.optional(),
    dinner: mealSchema.optional(),
  }),
});

export const planOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(daySchema).length(7),
  groceryList: z.object({
    sections: z.array(grocerySectionSchema),
  }),
  batchPrepPlan: z.object({
    prepDay: z.string(),
    steps: z.array(z.string()),
    storageTips: z.array(z.string()),
  }).optional(),
  nutritionNotes: z.object({
    dailyMacroTargetsRange: nutritionEstimateSchema,
    howThisSupportsGoal: z.array(z.string()),
  }),
});

export const workoutPreferencesSchema = z.object({
  goal: z.enum(["weight_loss", "muscle_gain", "body_recomposition", "general_fitness", "athletic_performance", "performance", "maintenance"]),
  location: z.enum(["gym", "home", "outdoors"]).or(z.literal("")),
  trainingMode: z.enum(["strength", "cardio", "both"]),
  focusAreas: z.array(z.string()).min(1, "Select at least one focus area"),
  daysOfWeek: z.array(z.enum(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])).min(1, "Select at least one day"),
  sessionLength: z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  limitations: z.string().optional(),
  equipmentAvailable: z.array(z.string()).optional(),
});

export const workoutExerciseSchema = z.object({
  name: z.string(),
  type: z.enum(["strength", "cardio", "mobility"]),
  sets: z.coerce.number().nullable().optional(),
  reps: z.string().nullable().optional(),
  time: z.string().nullable().optional(),
  restSeconds: z.coerce.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const workoutSessionSchema = z.object({
  mode: z.enum(["strength", "cardio", "mixed"]),
  focus: z.string(),
  durationMinutes: z.coerce.number(),
  intensity: z.enum(["easy", "moderate", "hard"]),
  warmup: z.array(z.string()),
  main: z.array(workoutExerciseSchema),
  finisher: z.array(z.string()).optional(),
  cooldown: z.array(z.string()),
  coachingCues: z.array(z.string()).optional(),
});

export const workoutDaySchema = z.object({
  dayIndex: z.coerce.number(),
  dayName: z.string(),
  isWorkoutDay: z.boolean(),
  session: workoutSessionSchema.nullable(),
});

export const workoutPlanOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(workoutDaySchema).length(7),
  progressionNotes: z.array(z.string()).optional(),
});

export const mealFeedbackSchema = z.object({
  planId: z.string().optional(),
  dayIndex: z.number().optional(),
  mealType: z.string().optional(),
  mealFingerprint: z.string(),
  mealName: z.string(),
  cuisineTag: z.string(),
  feedback: z.enum(["like", "dislike", "neutral"]),
  ingredients: z.array(z.string()).optional(),
});

export const workoutFeedbackSchema = z.object({
  workoutPlanId: z.string().optional(),
  dayIndex: z.number(),
  sessionKey: z.string(),
  feedback: z.enum(["like", "dislike", "neutral"]),
});

export const goalPlanCreateSchema = z.object({
  goalType: z.enum(["weight_loss", "muscle_gain", "body_recomposition", "general_fitness", "athletic_performance", "performance", "maintenance", "energy", "mobility", "endurance", "strength"]),
  planTypes: z.enum(["meals", "workouts", "both"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const goalProgressStageSchema = z.object({
  stage: z.enum(["TRAINING", "NUTRITION", "SCHEDULING", "FINALIZING"]),
  stageStatuses: z.object({
    TRAINING: z.enum(["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED"]),
    NUTRITION: z.enum(["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED"]),
    SCHEDULING: z.enum(["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED"]),
    FINALIZING: z.enum(["PENDING", "RUNNING", "DONE", "FAILED", "SKIPPED"]),
  }),
  errorMessage: z.string().optional(),
});

export type GoalProgress = z.infer<typeof goalProgressStageSchema>;

export const goalGenerateInputSchema = z.object({
  goalType: z.string(),
  planType: z.enum(["meal", "workout", "both"]).default("both"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pace: z.string().optional(),
  globalInputs: z.object({
    age: z.number().optional(),
    currentWeight: z.number().optional(),
    targetWeight: z.number().optional(),
    weightUnit: z.enum(["lb", "kg"]).default("lb"),
  }).optional(),
  mealPreferences: z.any().optional(),
  workoutPreferences: z.any().optional(),
});

export const weeklyCheckInSchema = z.object({
  goalPlanId: z.string().optional(),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightStart: z.number().optional(),
  weightEnd: z.number().optional(),
  energyRating: z.number().int().min(1).max(5).optional(),
  complianceMeals: z.number().int().min(0).max(100).optional(),
  complianceWorkouts: z.number().int().min(0).max(100).optional(),
  notes: z.string().optional(),
});

export const ingredientProposalResolveSchema = z.object({
  chosenIngredients: z.array(z.string()),
  action: z.enum(["accepted", "declined"]),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type MealPlan = typeof mealPlans.$inferSelect;
export type MealFeedbackRecord = typeof mealFeedback.$inferSelect;
export type IngredientPreferenceRecord = typeof ingredientPreferences.$inferSelect;
export type OwnedGroceryItem = typeof ownedGroceryItems.$inferSelect;
export type Preferences = z.infer<typeof preferencesSchema>;
export type PlanOutput = z.infer<typeof planOutputSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type Day = z.infer<typeof daySchema>;
export type GrocerySection = z.infer<typeof grocerySectionSchema>;
export type GroceryItem = z.infer<typeof groceryItemSchema>;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type WorkoutPreferences = z.infer<typeof workoutPreferencesSchema>;
export type WorkoutPlanOutput = z.infer<typeof workoutPlanOutputSchema>;
export type WorkoutDay = z.infer<typeof workoutDaySchema>;
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export type GoalPlan = typeof goalPlans.$inferSelect;
export type WorkoutFeedbackRecord = typeof workoutFeedback.$inferSelect;
export type IngredientAvoidProposal = typeof ingredientAvoidProposals.$inferSelect;
export type WeeklyCheckIn = typeof weeklyCheckIns.$inferSelect;
export type ExercisePreferenceRecord = typeof exercisePreferences.$inferSelect;

export interface UserPreferenceContext {
  likedMeals: { name: string; cuisineTag: string }[];
  dislikedMeals: { name: string; cuisineTag: string }[];
  avoidIngredients: string[];
  preferIngredients: string[];
  avoidedExercises: string[];
  dislikedExercises: string[];
}

export const exercisePreferenceSchema = z.object({
  exerciseKey: z.string(),
  exerciseName: z.string(),
  status: z.enum(["liked", "disliked", "avoided"]),
});

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  unitSystem: varchar("unit_system", { length: 10 }).default("imperial").notNull(),
  age: integer("age").notNull(),
  sex: varchar("sex", { length: 20 }),
  heightCm: integer("height_cm"),
  weightKg: real("weight_kg").notNull(),
  targetWeightKg: real("target_weight_kg"),
  primaryGoal: varchar("primary_goal", { length: 40 }).notNull(),
  secondaryFocus: varchar("secondary_focus", { length: 30 }),
  trainingExperience: varchar("training_experience", { length: 20 }).notNull(),
  injuries: jsonb("injuries").default([]),
  mobilityLimitations: jsonb("mobility_limitations").default([]),
  chronicConditions: jsonb("chronic_conditions").default([]),
  healthConstraints: jsonb("health_constraints").default([]),
  sleepHours: real("sleep_hours"),
  stressLevel: varchar("stress_level", { length: 20 }),
  activityLevel: varchar("activity_level", { length: 20 }),
  trainingDaysOfWeek: jsonb("training_days_of_week").default([]).notNull(),
  sessionDurationMinutes: integer("session_duration_minutes"),
  allergies: jsonb("allergies").default([]),
  intolerances: jsonb("intolerances").default([]),
  religiousRestrictions: jsonb("religious_restrictions").default([]),
  allergiesIntolerances: jsonb("allergies_intolerances").default([]),
  foodsToAvoid: jsonb("foods_to_avoid").default([]),
  foodsToAvoidNotes: varchar("foods_to_avoid_notes", { length: 500 }),
  appetiteLevel: varchar("appetite_level", { length: 20 }),
  spicePreference: varchar("spice_preference", { length: 20 }),
  bodyContext: text("body_context").default(""),
  favoriteMealsText: text("favorite_meals_text").default(""),
  workoutLocationDefault: varchar("workout_location_default", { length: 20 }).default("gym"),
  equipmentAvailable: jsonb("equipment_available").default([]),
  equipmentOtherNotes: text("equipment_other_notes").default(""),
  nextWeekPlanBias: varchar("next_week_plan_bias", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  unitSystem: z.enum(["imperial", "metric"]).default("imperial"),
  age: z.coerce.number().int().min(13, "You must be at least 13 years old"),
  weightKg: z.coerce.number().positive("Weight is required"),
  primaryGoal: z.enum(["weight_loss", "muscle_gain", "body_recomposition", "general_fitness", "athletic_performance"], { errorMap: () => ({ message: "Invalid primary goal" }) }),
  secondaryFocus: z.enum(["strength", "endurance", "mobility", "energy_focus", "recovery"]).nullable().optional(),
  trainingExperience: z.enum(["beginner", "intermediate", "advanced"]),
  sex: z.string().nullable().optional(),
  heightCm: z.coerce.number().int().positive().nullable().optional(),
  targetWeightKg: z.coerce.number().positive().nullable().optional(),
  sleepHours: z.coerce.number().min(0).max(24).nullable().optional(),
  stressLevel: z.enum(["low", "moderate", "high"]).nullable().optional(),
  activityLevel: z.enum(["sedentary", "moderate", "active"]).nullable().optional(),
  trainingDaysOfWeek: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).min(1, "Select at least 1 training day").default([]),
  sessionDurationMinutes: z.coerce.number().int().min(10).max(180).nullable().optional(),
  appetiteLevel: z.enum(["low", "normal", "high"]).nullable().optional(),
  spicePreference: z.enum(["mild", "medium", "spicy"]).nullable().optional(),
  injuries: z.array(z.string()).default([]),
  mobilityLimitations: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
  healthConstraints: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  intolerances: z.array(z.string()).default([]),
  religiousRestrictions: z.array(z.string()).default([]),
  allergiesIntolerances: z.array(z.string()).default([]),
  foodsToAvoid: z.array(z.string()).default([]),
  foodsToAvoidNotes: z.string().nullable().optional(),
  bodyContext: z.string().default(""),
  favoriteMealsText: z.string().default(""),
  workoutLocationDefault: z.enum(["gym", "home", "outdoors"]).nullable().optional(),
  equipmentAvailable: z.array(z.string()).default([]),
  equipmentOtherNotes: z.string().default(""),
});

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export const constraintViolations = pgTable("constraint_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  planType: varchar("plan_type", { length: 20 }).notNull(),
  planId: varchar("plan_id"),
  goalPlanId: varchar("goal_plan_id"),
  stage: varchar("stage", { length: 10 }).notNull(),
  ruleKey: varchar("rule_key", { length: 30 }).notNull(),
  severity: varchar("severity", { length: 10 }).notNull(),
  message: text("message").notNull(),
  metaJson: jsonb("meta_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const wellnessPlanSpecs = pgTable("wellness_plan_specs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  planType: varchar("plan_type", { length: 20 }).notNull(),
  planId: varchar("plan_id"),
  goalPlanId: varchar("goal_plan_id"),
  safeSpecJson: jsonb("safe_spec_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ConstraintViolation = typeof constraintViolations.$inferSelect;
export type WellnessPlanSpec = typeof wellnessPlanSpecs.$inferSelect;

export const performanceSummaries = pgTable("performance_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  weekStartDate: varchar("week_start_date", { length: 10 }).notNull(),
  weekEndDate: varchar("week_end_date", { length: 10 }).notNull(),
  mealAdherencePct: real("meal_adherence_pct"),
  workoutAdherencePct: real("workout_adherence_pct"),
  energyAvg: real("energy_avg"),
  weightDeltaKg: real("weight_delta_kg"),
  adherenceScore: integer("adherence_score").notNull(),
  momentumState: varchar("momentum_state", { length: 20 }).notNull(),
  insights: jsonb("insights").notNull().default([]),
  adjustmentAction: varchar("adjustment_action", { length: 30 }).notNull(),
  adjustmentStatement: text("adjustment_statement").notNull(),
  economyDelta: jsonb("economy_delta").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("perf_summary_user_week_idx").on(table.userId, table.weekStartDate),
]);

export type PerformanceSummary = typeof performanceSummaries.$inferSelect;

export const weeklyAdaptations = pgTable("weekly_adaptations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  weekStartDate: varchar("week_start_date", { length: 10 }).notNull(),
  computedSignals: jsonb("computed_signals").notNull().default({}),
  adaptationParams: jsonb("adaptation_params").notNull().default({}),
  summaryText: text("summary_text").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("weekly_adapt_user_week_idx").on(table.userId, table.weekStartDate),
]);

export type WeeklyAdaptation = typeof weeklyAdaptations.$inferSelect;

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
});

export type RefreshToken = typeof refreshTokens.$inferSelect;

export const dailyMeals = pgTable("daily_meals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: varchar("date", { length: 10 }).notNull(),
  mealsPerDay: integer("meals_per_day").notNull().default(3),
  generatedTitle: text("generated_title"),
  planJson: jsonb("plan_json"),
  groceryJson: jsonb("grocery_json"),
  profileSnapshot: jsonb("profile_snapshot"),
  adaptiveSnapshot: jsonb("adaptive_snapshot"),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("daily_meals_user_date_idx").on(table.userId, table.date),
]);

export const dailyWorkouts = pgTable("daily_workouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: varchar("date", { length: 10 }).notNull(),
  generatedTitle: text("generated_title"),
  planJson: jsonb("plan_json"),
  profileSnapshot: jsonb("profile_snapshot"),
  adaptiveSnapshot: jsonb("adaptive_snapshot"),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("daily_workouts_user_date_idx").on(table.userId, table.date),
]);

export const insertDailyMealSchema = createInsertSchema(dailyMeals).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDailyWorkoutSchema = createInsertSchema(dailyWorkouts).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const dailyMealCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  mealsPerDay: z.union([z.literal(2), z.literal(3)]).default(3),
});

export const dailyWorkoutCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export type DailyMeal = typeof dailyMeals.$inferSelect;
export type DailyWorkout = typeof dailyWorkouts.$inferSelect;
export type InsertDailyMeal = z.infer<typeof insertDailyMealSchema>;
export type InsertDailyWorkout = z.infer<typeof insertDailyWorkoutSchema>;

export const activityCompletions = pgTable("activity_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: varchar("date", { length: 10 }).notNull(),
  itemType: varchar("item_type", { length: 10 }).notNull(),
  sourceType: varchar("source_type", { length: 20 }).notNull(),
  sourceId: varchar("source_id").notNull(),
  itemKey: varchar("item_key", { length: 30 }).notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("activity_comp_unique_idx").on(table.userId, table.date, table.itemType, table.sourceType, table.sourceId, table.itemKey),
]);

export const insertActivityCompletionSchema = createInsertSchema(activityCompletions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const toggleCompletionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itemType: z.enum(["meal", "workout"]),
  sourceType: z.enum(["meal_plan", "workout_plan", "daily_meal", "daily_workout"]),
  sourceId: z.string().min(1),
  itemKey: z.string().min(1),
  completed: z.boolean(),
});

export type ActivityCompletion = typeof activityCompletions.$inferSelect;
export type InsertActivityCompletion = z.infer<typeof insertActivityCompletionSchema>;
export type ToggleCompletionInput = z.infer<typeof toggleCompletionSchema>;

export interface AdaptiveModifiers {
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

export interface AdaptiveDecision {
  code: string;
  severity: "info" | "adjust";
  message: string;
}

export interface AdaptiveSnapshot {
  modifiers: AdaptiveModifiers;
  decisions: AdaptiveDecision[];
  inputsMeta: {
    summaryIdsUsed: string[];
    computedAt: string;
  };
}

// ——— Normalized Wellness Plan Overview Contract ———
// Response-layer computed object returned by GET /api/goal-plans/:id.
// Sourced from top-level goal plan metadata plus embedded child plan JSON.
// Not persisted; not tied to globalInputs / nutritionInputs / trainingInputs.

export const goalPlanOverviewIdentitySchema = z.object({
  title: z.string(),
  status: z.string(),
  goalType: z.string().nullable(),
  planType: z.enum(["meal", "workout", "both"]).nullable(),
  pace: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});

export const goalPlanOverviewWeeklyStructureSchema = z.object({
  totalDays: z.number(),
  workoutDays: z.number(),
  restDays: z.number(),
  workoutPattern: z.array(z.boolean()),
});

export const goalPlanOverviewNutritionSchema = z.object({
  calories: z.string().nullable(),
  protein_g: z.string().nullable(),
  carbs_g: z.string().nullable(),
  fat_g: z.string().nullable(),
  howThisSupportsGoal: z.array(z.string()),
});

export const goalPlanOverviewTrainingSchema = z.object({
  frequencyPerWeek: z.number().nullable(),
  focusModes: z.array(z.string()),
  avgDurationMinutes: z.number().nullable(),
});

export const goalPlanOverviewSchema = z.object({
  identity: goalPlanOverviewIdentitySchema,
  weeklyStructure: goalPlanOverviewWeeklyStructureSchema.nullable(),
  nutrition: goalPlanOverviewNutritionSchema.nullable(),
  training: goalPlanOverviewTrainingSchema.nullable(),
});

export type GoalPlanOverviewIdentity = z.infer<typeof goalPlanOverviewIdentitySchema>;
export type GoalPlanOverviewWeeklyStructure = z.infer<typeof goalPlanOverviewWeeklyStructureSchema>;
export type GoalPlanOverviewNutrition = z.infer<typeof goalPlanOverviewNutritionSchema>;
export type GoalPlanOverviewTraining = z.infer<typeof goalPlanOverviewTrainingSchema>;
export type GoalPlanOverview = z.infer<typeof goalPlanOverviewSchema>;
