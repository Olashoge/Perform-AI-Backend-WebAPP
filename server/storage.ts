import { eq, desc, and, gte, isNull } from "drizzle-orm";
import { db } from "./db";
import { users, mealPlans, workoutPlans, auditLogs, mealFeedback, ingredientPreferences, ownedGroceryItems, type User, type MealPlan, type WorkoutPlan, type MealFeedbackRecord, type IngredientPreferenceRecord, type OwnedGroceryItem, type UserPreferenceContext, type GroceryPricing } from "@shared/schema";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(email: string, passwordHash: string): Promise<User>;
  createMealPlan(userId: string, preferencesJson: any, planJson: any): Promise<MealPlan>;
  createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any, startDate?: string): Promise<MealPlan>;
  getMealPlan(id: string): Promise<MealPlan | undefined>;
  getMealPlansByUser(userId: string): Promise<MealPlan[]>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<MealPlan | undefined>;
  findGeneratingPlan(userId: string): Promise<MealPlan | undefined>;
  updatePlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<MealPlan | undefined>;
  updateMealPlanJson(id: string, planJson: any): Promise<MealPlan | undefined>;
  incrementSwapCount(id: string): Promise<MealPlan | undefined>;
  incrementRegenDayCount(id: string): Promise<MealPlan | undefined>;
  logAction(userId: string, action: string, meta?: any): Promise<void>;
  getAiCallCountToday(userId: string): Promise<number>;
  updateGroceryPricing(id: string, pricingJson: GroceryPricing | null): Promise<MealPlan | undefined>;
  updatePricingStatus(id: string, status: string): Promise<MealPlan | undefined>;
  getOwnedGroceryItems(userId: string, mealPlanId: string): Promise<OwnedGroceryItem[]>;
  upsertOwnedGroceryItem(userId: string, mealPlanId: string, itemKey: string, isOwned: boolean): Promise<OwnedGroceryItem>;
  upsertMealFeedback(userId: string, data: { mealPlanId?: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike" }): Promise<MealFeedbackRecord>;
  getMealFeedbackForPlan(userId: string, planId: string): Promise<MealFeedbackRecord[]>;
  upsertIngredientPreference(userId: string, ingredientKey: string, preference: "avoid" | "prefer", source: "user" | "derived"): Promise<void>;
  getUserPreferenceContext(userId: string): Promise<UserPreferenceContext>;
  getAllMealFeedback(userId: string): Promise<MealFeedbackRecord[]>;
  getAllIngredientPreferences(userId: string): Promise<IngredientPreferenceRecord[]>;
  deleteMealFeedback(id: string, userId: string): Promise<boolean>;
  deleteIngredientPreference(id: string, userId: string): Promise<boolean>;
  updatePlanStartDate(id: string, startDate: string | null): Promise<MealPlan | undefined>;
  getScheduledPlans(userId: string): Promise<MealPlan[]>;
  softDeletePlan(id: string): Promise<MealPlan | undefined>;
  createPendingWorkoutPlan(userId: string, idempotencyKey: string | null, preferencesJson: any): Promise<WorkoutPlan>;
  getWorkoutPlan(id: string): Promise<WorkoutPlan | undefined>;
  getWorkoutPlansByUser(userId: string): Promise<WorkoutPlan[]>;
  updateWorkoutPlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<WorkoutPlan | undefined>;
  updateWorkoutStartDate(id: string, startDate: string | null): Promise<WorkoutPlan | undefined>;
  softDeleteWorkoutPlan(id: string): Promise<WorkoutPlan | undefined>;
  getScheduledWorkoutPlans(userId: string): Promise<WorkoutPlan[]>;
  findByIdempotencyKeyWorkout(userId: string, idempotencyKey: string): Promise<WorkoutPlan | undefined>;
  findGeneratingWorkoutPlan(userId: string): Promise<WorkoutPlan | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async createUser(email: string, passwordHash: string): Promise<User> {
    const [user] = await db.insert(users).values({ email, passwordHash }).returning();
    return user;
  }

  async createMealPlan(userId: string, preferencesJson: any, planJson: any): Promise<MealPlan> {
    const [plan] = await db.insert(mealPlans).values({
      userId,
      preferencesJson,
      planJson,
      status: "ready",
    }).returning();
    return plan;
  }

  async createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any, startDate?: string): Promise<MealPlan> {
    const [plan] = await db.insert(mealPlans).values({
      userId,
      idempotencyKey,
      preferencesJson,
      planJson: null,
      status: "generating",
      startedAt: new Date(),
      planStartDate: startDate || null,
    }).returning();
    return plan;
  }

  async getMealPlan(id: string): Promise<MealPlan | undefined> {
    const [plan] = await db.select().from(mealPlans).where(eq(mealPlans.id, id)).limit(1);
    return plan;
  }

  async getMealPlansByUser(userId: string): Promise<MealPlan[]> {
    return db.select().from(mealPlans).where(and(eq(mealPlans.userId, userId), isNull(mealPlans.deletedAt))).orderBy(desc(mealPlans.createdAt));
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<MealPlan | undefined> {
    const [plan] = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.userId, userId), eq(mealPlans.idempotencyKey, idempotencyKey)))
      .limit(1);
    return plan;
  }

  async findGeneratingPlan(userId: string): Promise<MealPlan | undefined> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [plan] = await db.select().from(mealPlans)
      .where(and(
        eq(mealPlans.userId, userId),
        eq(mealPlans.status, "generating"),
        gte(mealPlans.createdAt, fiveMinAgo),
      ))
      .orderBy(desc(mealPlans.createdAt))
      .limit(1);
    return plan;
  }

  async updatePlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<MealPlan | undefined> {
    const updates: any = { status, completedAt: new Date() };
    if (planJson !== undefined) {
      updates.planJson = planJson;
    }
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    const [plan] = await db.update(mealPlans)
      .set(updates)
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async updateMealPlanJson(id: string, planJson: any): Promise<MealPlan | undefined> {
    const [plan] = await db.update(mealPlans)
      .set({ planJson })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async incrementSwapCount(id: string): Promise<MealPlan | undefined> {
    const existing = await this.getMealPlan(id);
    if (!existing) return undefined;
    const [plan] = await db.update(mealPlans)
      .set({ swapCount: existing.swapCount + 1 })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async incrementRegenDayCount(id: string): Promise<MealPlan | undefined> {
    const existing = await this.getMealPlan(id);
    if (!existing) return undefined;
    const [plan] = await db.update(mealPlans)
      .set({ regenDayCount: existing.regenDayCount + 1 })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async logAction(userId: string, action: string, meta?: any): Promise<void> {
    await db.insert(auditLogs).values({
      userId,
      action,
      metaJson: meta || null,
    });
  }

  async getAiCallCountToday(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const logs = await db.select().from(auditLogs)
      .where(eq(auditLogs.userId, userId));
    return logs.filter(l =>
      l.action.startsWith("ai_call") && new Date(l.createdAt) >= today
    ).length;
  }

  async updateGroceryPricing(id: string, pricingJson: GroceryPricing | null): Promise<MealPlan | undefined> {
    const updates: any = { groceryPricingJson: pricingJson };
    if (pricingJson) {
      updates.pricingStatus = "ready";
    } else {
      updates.pricingStatus = "pending";
    }
    const [plan] = await db.update(mealPlans)
      .set(updates)
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async updatePricingStatus(id: string, status: string): Promise<MealPlan | undefined> {
    const [plan] = await db.update(mealPlans)
      .set({ pricingStatus: status })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async getOwnedGroceryItems(userId: string, mealPlanId: string): Promise<OwnedGroceryItem[]> {
    return db.select().from(ownedGroceryItems)
      .where(and(eq(ownedGroceryItems.userId, userId), eq(ownedGroceryItems.mealPlanId, mealPlanId)));
  }

  async upsertOwnedGroceryItem(userId: string, mealPlanId: string, itemKey: string, isOwned: boolean): Promise<OwnedGroceryItem> {
    const existing = await db.select().from(ownedGroceryItems)
      .where(and(
        eq(ownedGroceryItems.userId, userId),
        eq(ownedGroceryItems.mealPlanId, mealPlanId),
        eq(ownedGroceryItems.itemKey, itemKey),
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(ownedGroceryItems)
        .set({ isOwned: isOwned ? 1 : 0, updatedAt: new Date() })
        .where(eq(ownedGroceryItems.id, existing[0].id))
        .returning();
      return updated;
    }

    const [record] = await db.insert(ownedGroceryItems).values({
      userId,
      mealPlanId,
      itemKey,
      isOwned: isOwned ? 1 : 0,
    }).returning();
    return record;
  }

  async upsertMealFeedback(userId: string, data: { mealPlanId?: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike" }): Promise<MealFeedbackRecord> {
    const existing = await db.select().from(mealFeedback)
      .where(and(eq(mealFeedback.userId, userId), eq(mealFeedback.mealFingerprint, data.mealFingerprint)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(mealFeedback)
        .set({ feedback: data.feedback, mealPlanId: data.mealPlanId || null, createdAt: new Date() })
        .where(eq(mealFeedback.id, existing[0].id))
        .returning();
      return updated;
    }

    const [record] = await db.insert(mealFeedback).values({
      userId,
      mealPlanId: data.mealPlanId || null,
      mealFingerprint: data.mealFingerprint,
      mealName: data.mealName,
      cuisineTag: data.cuisineTag,
      feedback: data.feedback,
    }).returning();
    return record;
  }

  async getMealFeedbackForPlan(userId: string, planId: string): Promise<MealFeedbackRecord[]> {
    return db.select().from(mealFeedback)
      .where(eq(mealFeedback.userId, userId));
  }

  async upsertIngredientPreference(userId: string, ingredientKey: string, preference: "avoid" | "prefer", source: "user" | "derived"): Promise<void> {
    const existing = await db.select().from(ingredientPreferences)
      .where(and(eq(ingredientPreferences.userId, userId), eq(ingredientPreferences.ingredientKey, ingredientKey)))
      .limit(1);

    if (existing.length > 0) {
      await db.update(ingredientPreferences)
        .set({ preference, source, createdAt: new Date() })
        .where(eq(ingredientPreferences.id, existing[0].id));
    } else {
      await db.insert(ingredientPreferences).values({
        userId,
        ingredientKey,
        preference,
        source,
      });
    }
  }

  async getUserPreferenceContext(userId: string): Promise<UserPreferenceContext> {
    const allFeedback = await db.select().from(mealFeedback)
      .where(eq(mealFeedback.userId, userId))
      .orderBy(desc(mealFeedback.createdAt));

    const likedMeals = allFeedback
      .filter(f => f.feedback === "like")
      .slice(0, 10)
      .map(f => ({ name: f.mealName, cuisineTag: f.cuisineTag }));

    const dislikedMeals = allFeedback
      .filter(f => f.feedback === "dislike")
      .slice(0, 20)
      .map(f => ({ name: f.mealName, cuisineTag: f.cuisineTag }));

    const allIngPrefs = await db.select().from(ingredientPreferences)
      .where(eq(ingredientPreferences.userId, userId));

    const avoidIngredients = allIngPrefs.filter(p => p.preference === "avoid").map(p => p.ingredientKey);
    const preferIngredients = allIngPrefs.filter(p => p.preference === "prefer").map(p => p.ingredientKey);

    return { likedMeals, dislikedMeals, avoidIngredients, preferIngredients };
  }

  async getAllMealFeedback(userId: string): Promise<MealFeedbackRecord[]> {
    return db.select().from(mealFeedback)
      .where(eq(mealFeedback.userId, userId))
      .orderBy(desc(mealFeedback.createdAt));
  }

  async getAllIngredientPreferences(userId: string): Promise<IngredientPreferenceRecord[]> {
    return db.select().from(ingredientPreferences)
      .where(eq(ingredientPreferences.userId, userId));
  }

  async deleteMealFeedback(id: string, userId: string): Promise<boolean> {
    const [record] = await db.select().from(mealFeedback)
      .where(and(eq(mealFeedback.id, id), eq(mealFeedback.userId, userId)))
      .limit(1);
    if (!record) return false;
    await db.delete(mealFeedback).where(eq(mealFeedback.id, id));
    return true;
  }

  async deleteIngredientPreference(id: string, userId: string): Promise<boolean> {
    const [record] = await db.select().from(ingredientPreferences)
      .where(and(eq(ingredientPreferences.id, id), eq(ingredientPreferences.userId, userId)))
      .limit(1);
    if (!record) return false;
    await db.delete(ingredientPreferences).where(eq(ingredientPreferences.id, id));
    return true;
  }

  async updatePlanStartDate(id: string, startDate: string | null): Promise<MealPlan | undefined> {
    const [plan] = await db.update(mealPlans)
      .set({ planStartDate: startDate })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async getScheduledPlans(userId: string): Promise<MealPlan[]> {
    const allPlans = await db.select().from(mealPlans)
      .where(and(eq(mealPlans.userId, userId), eq(mealPlans.status, "ready"), isNull(mealPlans.deletedAt)))
      .orderBy(desc(mealPlans.createdAt));
    return allPlans.filter(p => p.planStartDate && p.planJson);
  }

  async softDeletePlan(id: string): Promise<MealPlan | undefined> {
    const [plan] = await db.update(mealPlans)
      .set({ deletedAt: new Date(), planStartDate: null })
      .where(eq(mealPlans.id, id))
      .returning();
    return plan;
  }

  async createPendingWorkoutPlan(userId: string, idempotencyKey: string | null, preferencesJson: any): Promise<WorkoutPlan> {
    const [plan] = await db.insert(workoutPlans).values({
      userId,
      idempotencyKey,
      preferencesJson,
      planJson: null,
      status: "generating",
      startedAt: new Date(),
    }).returning();
    return plan;
  }

  async getWorkoutPlan(id: string): Promise<WorkoutPlan | undefined> {
    const [plan] = await db.select().from(workoutPlans).where(eq(workoutPlans.id, id)).limit(1);
    return plan;
  }

  async getWorkoutPlansByUser(userId: string): Promise<WorkoutPlan[]> {
    return db.select().from(workoutPlans).where(and(eq(workoutPlans.userId, userId), isNull(workoutPlans.deletedAt))).orderBy(desc(workoutPlans.createdAt));
  }

  async updateWorkoutPlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<WorkoutPlan | undefined> {
    const updates: any = { status, completedAt: new Date() };
    if (planJson !== undefined) updates.planJson = planJson;
    if (errorMessage !== undefined) updates.errorMessage = errorMessage;
    const [plan] = await db.update(workoutPlans).set(updates).where(eq(workoutPlans.id, id)).returning();
    return plan;
  }

  async updateWorkoutStartDate(id: string, startDate: string | null): Promise<WorkoutPlan | undefined> {
    const [plan] = await db.update(workoutPlans).set({ planStartDate: startDate }).where(eq(workoutPlans.id, id)).returning();
    return plan;
  }

  async softDeleteWorkoutPlan(id: string): Promise<WorkoutPlan | undefined> {
    const [plan] = await db.update(workoutPlans).set({ deletedAt: new Date(), planStartDate: null }).where(eq(workoutPlans.id, id)).returning();
    return plan;
  }

  async getScheduledWorkoutPlans(userId: string): Promise<WorkoutPlan[]> {
    const allPlans = await db.select().from(workoutPlans)
      .where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.status, "ready"), isNull(workoutPlans.deletedAt)))
      .orderBy(desc(workoutPlans.createdAt));
    return allPlans.filter(p => p.planStartDate && p.planJson);
  }

  async findByIdempotencyKeyWorkout(userId: string, idempotencyKey: string): Promise<WorkoutPlan | undefined> {
    const [plan] = await db.select().from(workoutPlans)
      .where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.idempotencyKey, idempotencyKey)))
      .limit(1);
    return plan;
  }

  async findGeneratingWorkoutPlan(userId: string): Promise<WorkoutPlan | undefined> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [plan] = await db.select().from(workoutPlans)
      .where(and(
        eq(workoutPlans.userId, userId),
        eq(workoutPlans.status, "generating"),
        gte(workoutPlans.createdAt, fiveMinAgo),
      ))
      .orderBy(desc(workoutPlans.createdAt))
      .limit(1);
    return plan;
  }
}

export const storage = new DatabaseStorage();
