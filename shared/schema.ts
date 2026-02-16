import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mealPlans = pgTable("meal_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  idempotencyKey: varchar("idempotency_key"),
  status: varchar("status", { length: 20 }).notNull().default("ready"),
  pricingStatus: varchar("pricing_status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  preferencesJson: jsonb("preferences_json").notNull(),
  planJson: jsonb("plan_json"),
  swapCount: integer("swap_count").default(0).notNull(),
  regenDayCount: integer("regen_day_count").default(0).notNull(),
  groceryPricingJson: jsonb("grocery_pricing_json"),
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

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  metaJson: jsonb("meta_json"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const signupSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const mealSlotEnum = z.enum(["breakfast", "lunch", "dinner"]);

export const preferencesSchema = z.object({
  goal: z.enum(["weight_loss", "muscle_gain", "energy", "maintenance", "performance"]),
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
  prepTimeMinutes: z.number(),
  servings: z.number(),
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
  dayIndex: z.number(),
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
  preferencesEcho: z.record(z.any()),
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

export const groceryPricingItemSchema = z.object({
  itemKey: z.string(),
  displayName: z.string(),
  unitHint: z.string(),
  estimatedRange: z.object({ min: z.number(), max: z.number() }),
  confidence: z.enum(["low", "medium", "high"]),
});

export const groceryPricingSchema = z.object({
  currency: z.string(),
  assumptions: z.object({
    region: z.string(),
    pricingType: z.string(),
    note: z.string(),
  }),
  items: z.array(groceryPricingItemSchema),
});

export const mealFeedbackSchema = z.object({
  planId: z.string().optional(),
  dayIndex: z.number().optional(),
  mealType: z.string().optional(),
  mealFingerprint: z.string(),
  mealName: z.string(),
  cuisineTag: z.string(),
  feedback: z.enum(["like", "dislike"]),
  ingredients: z.array(z.string()).optional(),
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
export type GroceryPricing = z.infer<typeof groceryPricingSchema>;
export type GroceryPricingItem = z.infer<typeof groceryPricingItemSchema>;

export interface UserPreferenceContext {
  likedMeals: { name: string; cuisineTag: string }[];
  dislikedMeals: { name: string; cuisineTag: string }[];
  avoidIngredients: string[];
  preferIngredients: string[];
}
