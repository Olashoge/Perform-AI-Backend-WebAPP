import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  preferencesJson: jsonb("preferences_json").notNull(),
  planJson: jsonb("plan_json"),
  swapCount: integer("swap_count").default(0).notNull(),
  regenDayCount: integer("regen_day_count").default(0).notNull(),
});

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

export const preferencesSchema = z.object({
  goal: z.enum(["fat_loss", "muscle_gain", "energy", "maintenance", "performance"]),
  dietStyle: z.string().min(1, "Diet style is required"),
  foodsToAvoid: z.array(z.string()).default([]),
  householdSize: z.number().int().min(1).max(8),
  prepStyle: z.enum(["cook_daily", "batch_2day", "batch_3to4day"]),
  budgetMode: z.enum(["normal", "budget_friendly"]),
  cookingTime: z.enum(["quick", "normal"]),
  allergies: z.string().optional(),
});

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
    breakfast: mealSchema,
    lunch: mealSchema,
    dinner: mealSchema,
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type MealPlan = typeof mealPlans.$inferSelect;
export type Preferences = z.infer<typeof preferencesSchema>;
export type PlanOutput = z.infer<typeof planOutputSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type Day = z.infer<typeof daySchema>;
export type GrocerySection = z.infer<typeof grocerySectionSchema>;
export type GroceryItem = z.infer<typeof groceryItemSchema>;
