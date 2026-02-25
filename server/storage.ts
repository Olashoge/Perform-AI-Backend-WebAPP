import { eq, desc, and, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "./db";
import { users, mealPlans, workoutPlans, auditLogs, mealFeedback, ingredientPreferences, ownedGroceryItems, goalPlans, workoutFeedback, ingredientAvoidProposals, weeklyCheckIns, exercisePreferences, userProfiles, constraintViolations, wellnessPlanSpecs, performanceSummaries, dailyMeals, dailyWorkouts, activityCompletions, weeklyAdaptations, refreshTokens, type User, type MealPlan, type WorkoutPlan, type MealFeedbackRecord, type IngredientPreferenceRecord, type OwnedGroceryItem, type UserPreferenceContext, type GoalPlan, type WorkoutFeedbackRecord, type IngredientAvoidProposal, type WeeklyCheckIn, type ExercisePreferenceRecord, type UserProfile, type InsertUserProfile, type ConstraintViolation, type WellnessPlanSpec, type PerformanceSummary, type DailyMeal, type DailyWorkout, type ActivityCompletion, type WeeklyAdaptation, type RefreshToken } from "@shared/schema";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(email: string, passwordHash: string): Promise<User>;
  createMealPlan(userId: string, preferencesJson: any, planJson: any): Promise<MealPlan>;
  createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any, startDate?: string, profileSnapshot?: any, adaptiveSnapshot?: any): Promise<MealPlan>;
  getMealPlan(id: string): Promise<MealPlan | undefined>;
  getMealPlansByUser(userId: string): Promise<MealPlan[]>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<MealPlan | undefined>;
  findGeneratingPlan(userId: string): Promise<MealPlan | undefined>;
  updatePlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<MealPlan | undefined>;
  updateMealPlanJson(id: string, planJson: any): Promise<MealPlan | undefined>;
  logAction(userId: string, action: string, meta?: any): Promise<void>;
  getAiCallCountToday(userId: string): Promise<number>;
  getOwnedGroceryItems(userId: string, mealPlanId: string): Promise<OwnedGroceryItem[]>;
  upsertOwnedGroceryItem(userId: string, mealPlanId: string, itemKey: string, isOwned: boolean): Promise<OwnedGroceryItem>;
  upsertMealFeedback(userId: string, data: { mealPlanId?: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike" | "neutral" }): Promise<MealFeedbackRecord | null>;
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
  createPendingWorkoutPlan(userId: string, idempotencyKey: string | null, preferencesJson: any, startDate?: string, profileSnapshot?: any, adaptiveSnapshot?: any): Promise<WorkoutPlan>;
  getWorkoutPlan(id: string): Promise<WorkoutPlan | undefined>;
  getWorkoutPlansByUser(userId: string): Promise<WorkoutPlan[]>;
  updateWorkoutPlanStatus(id: string, status: string, planJson?: any, errorMessage?: string): Promise<WorkoutPlan | undefined>;
  updateWorkoutStartDate(id: string, startDate: string | null): Promise<WorkoutPlan | undefined>;
  softDeleteWorkoutPlan(id: string): Promise<WorkoutPlan | undefined>;
  getScheduledWorkoutPlans(userId: string): Promise<WorkoutPlan[]>;
  findByIdempotencyKeyWorkout(userId: string, idempotencyKey: string): Promise<WorkoutPlan | undefined>;
  findGeneratingWorkoutPlan(userId: string): Promise<WorkoutPlan | undefined>;
  createGoalPlan(userId: string, goalType: string, startDate?: string, mealPlanId?: string, workoutPlanId?: string): Promise<GoalPlan>;
  createGoalPlanFull(userId: string, data: { goalType: string; planType?: string; startDate?: string; endDate?: string; pace?: string; title?: string; globalInputs?: any; nutritionInputs?: any; trainingInputs?: any; status?: string; progress?: any; profileSnapshot?: any; adaptiveSnapshot?: any }): Promise<GoalPlan>;
  getGoalPlan(id: string): Promise<GoalPlan | undefined>;
  getGoalPlansByUser(userId: string): Promise<GoalPlan[]>;
  updateGoalPlan(id: string, updates: Partial<{ startDate: string | null; endDate: string | null; mealPlanId: string | null; workoutPlanId: string | null; status: string; progress: any; title: string | null; planType: string | null }>): Promise<GoalPlan | undefined>;
  softDeleteGoalPlan(id: string): Promise<GoalPlan | undefined>;
  upsertWorkoutFeedback(userId: string, data: { workoutPlanId?: string; dayIndex: number; sessionKey: string; feedback: "like" | "dislike" | "neutral" }): Promise<WorkoutFeedbackRecord | null>;
  getWorkoutFeedbackForPlan(userId: string, planId: string): Promise<WorkoutFeedbackRecord[]>;
  getAllWorkoutFeedback(userId: string): Promise<WorkoutFeedbackRecord[]>;
  deleteWorkoutFeedback(id: string, userId: string): Promise<boolean>;
  createIngredientProposal(userId: string, mealKey: string, mealName: string, ingredients: string[]): Promise<IngredientAvoidProposal>;
  getPendingProposals(userId: string): Promise<IngredientAvoidProposal[]>;
  resolveProposal(id: string, userId: string, chosenIngredients: string[], action: "accepted" | "declined"): Promise<IngredientAvoidProposal | undefined>;
  createWeeklyCheckIn(userId: string, data: { goalPlanId?: string; weekStartDate: string; weightStart?: number; weightEnd?: number; energyRating?: number; complianceMeals?: number; complianceWorkouts?: number; notes?: string }): Promise<WeeklyCheckIn>;
  getWeeklyCheckIns(userId: string, goalPlanId?: string): Promise<WeeklyCheckIn[]>;
  deleteMealFeedbackByFingerprint(userId: string, fingerprint: string): Promise<boolean>;
  upsertExercisePreference(userId: string, exerciseKey: string, exerciseName: string, status: "liked" | "disliked" | "avoided"): Promise<ExercisePreferenceRecord>;
  deleteExercisePreference(userId: string, exerciseKey: string): Promise<boolean>;
  deleteExercisePreferenceById(id: string, userId: string): Promise<boolean>;
  getExercisePreferences(userId: string): Promise<ExercisePreferenceRecord[]>;
  getExercisePreferenceMap(userId: string): Promise<Record<string, "liked" | "disliked" | "avoided">>;
  getGoalPlanByMealPlanId(mealPlanId: string): Promise<GoalPlan | undefined>;
  getGoalPlanByWorkoutPlanId(workoutPlanId: string): Promise<GoalPlan | undefined>;
  getUserProfile(userId: string): Promise<UserProfile | undefined>;
  createUserProfile(userId: string, data: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  createConstraintViolations(violations: { userId: string; planType: string; planId?: string; goalPlanId?: string; stage: string; ruleKey: string; severity: string; message: string; metaJson?: any }[]): Promise<ConstraintViolation[]>;
  getConstraintViolations(userId: string, goalPlanId?: string): Promise<ConstraintViolation[]>;
  createWellnessPlanSpec(data: { userId: string; planType: string; planId?: string; goalPlanId?: string; safeSpecJson: any }): Promise<WellnessPlanSpec>;
  getWellnessPlanSpec(planId: string): Promise<WellnessPlanSpec | undefined>;
  getScheduledMealPlanDates(userId: string): Promise<string[]>;
  getScheduledWorkoutPlanDates(userId: string): Promise<string[]>;
  upsertPerformanceSummary(data: Omit<PerformanceSummary, "id" | "createdAt" | "updatedAt">): Promise<PerformanceSummary>;
  getLatestPerformanceSummary(userId: string): Promise<PerformanceSummary | undefined>;
  getRecentPerformanceSummaries(userId: string, limit?: number): Promise<PerformanceSummary[]>;
  getPerformanceSummariesByRange(userId: string, from: string, to: string): Promise<PerformanceSummary[]>;
  createDailyMeal(userId: string, date: string, mealsPerDay: number, profileSnapshot: any, adaptiveSnapshot?: any): Promise<DailyMeal>;
  getDailyMealByDate(userId: string, date: string): Promise<DailyMeal | undefined>;
  getDailyMealsByDateRange(userId: string, startDate: string, endDate: string): Promise<DailyMeal[]>;
  updateDailyMealStatus(id: string, status: string, planJson?: any, groceryJson?: any, title?: string): Promise<DailyMeal | undefined>;
  createDailyWorkout(userId: string, date: string, profileSnapshot: any, adaptiveSnapshot?: any): Promise<DailyWorkout>;
  getDailyWorkoutByDate(userId: string, date: string): Promise<DailyWorkout | undefined>;
  getDailyWorkoutsByDateRange(userId: string, startDate: string, endDate: string): Promise<DailyWorkout[]>;
  updateDailyWorkoutStatus(id: string, status: string, planJson?: any, title?: string): Promise<DailyWorkout | undefined>;
  upsertActivityCompletion(userId: string, date: string, itemType: string, sourceType: string, sourceId: string, itemKey: string, completed: boolean): Promise<ActivityCompletion>;
  getCompletionsByDateRange(userId: string, startDate: string, endDate: string): Promise<ActivityCompletion[]>;
  getCompletionsBySource(userId: string, sourceType: string, sourceId: string): Promise<ActivityCompletion[]>;
  upsertWeeklyAdaptation(userId: string, weekStartDate: string, computedSignals: any, adaptationParams: any, summaryText: string): Promise<WeeklyAdaptation>;
  getLatestWeeklyAdaptation(userId: string): Promise<WeeklyAdaptation | undefined>;
  getWeeklyAdaptationsByRange(userId: string, from: string, to: string): Promise<WeeklyAdaptation[]>;
  createRefreshToken(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string, ipAddress?: string): Promise<RefreshToken>;
  getRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string): Promise<void>;
  updateRefreshTokenLastUsed(id: string): Promise<void>;
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

  async createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any, startDate?: string, profileSnapshot?: any, adaptiveSnapshot?: any): Promise<MealPlan> {
    const [plan] = await db.insert(mealPlans).values({
      userId,
      idempotencyKey,
      preferencesJson,
      planJson: null,
      status: "generating",
      startedAt: new Date(),
      planStartDate: startDate || null,
      profileSnapshot: profileSnapshot || null,
      adaptiveSnapshot: adaptiveSnapshot || null,
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

  async upsertMealFeedback(userId: string, data: { mealPlanId?: string; mealFingerprint: string; mealName: string; cuisineTag: string; feedback: "like" | "dislike" | "neutral" }): Promise<MealFeedbackRecord | null> {
    const existing = await db.select().from(mealFeedback)
      .where(and(eq(mealFeedback.userId, userId), eq(mealFeedback.mealFingerprint, data.mealFingerprint)))
      .limit(1);

    if (data.feedback === "neutral") {
      if (existing.length > 0) {
        await db.delete(mealFeedback).where(eq(mealFeedback.id, existing[0].id));
      }
      return null;
    }

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

    const allExPrefs = await db.select().from(exercisePreferences)
      .where(eq(exercisePreferences.userId, userId));
    const avoidedExercises = allExPrefs.filter(p => p.status === "avoided").map(p => p.exerciseName);
    const dislikedExercises = allExPrefs.filter(p => p.status === "disliked").map(p => p.exerciseName);

    return { likedMeals, dislikedMeals, avoidIngredients, preferIngredients, avoidedExercises, dislikedExercises };
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

  async createPendingWorkoutPlan(userId: string, idempotencyKey: string | null, preferencesJson: any, startDate?: string, profileSnapshot?: any, adaptiveSnapshot?: any): Promise<WorkoutPlan> {
    const [plan] = await db.insert(workoutPlans).values({
      userId,
      idempotencyKey,
      preferencesJson,
      planJson: null,
      status: "generating",
      startedAt: new Date(),
      planStartDate: startDate || null,
      profileSnapshot: profileSnapshot || null,
      adaptiveSnapshot: adaptiveSnapshot || null,
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

  async createGoalPlan(userId: string, goalType: string, startDate?: string, mealPlanId?: string, workoutPlanId?: string): Promise<GoalPlan> {
    const [plan] = await db.insert(goalPlans).values({
      userId,
      goalType,
      startDate: startDate || null,
      mealPlanId: mealPlanId || null,
      workoutPlanId: workoutPlanId || null,
    }).returning();
    return plan;
  }

  async createGoalPlanFull(userId: string, data: { goalType: string; planType?: string; startDate?: string; endDate?: string; pace?: string; title?: string; globalInputs?: any; nutritionInputs?: any; trainingInputs?: any; status?: string; progress?: any; profileSnapshot?: any; adaptiveSnapshot?: any }): Promise<GoalPlan> {
    const [plan] = await db.insert(goalPlans).values({
      userId,
      goalType: data.goalType,
      planType: data.planType || "both",
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      pace: data.pace || null,
      title: data.title || null,
      globalInputs: data.globalInputs || null,
      nutritionInputs: data.nutritionInputs || null,
      trainingInputs: data.trainingInputs || null,
      status: data.status || "draft",
      progress: data.progress || null,
      profileSnapshot: data.profileSnapshot || null,
      adaptiveSnapshot: data.adaptiveSnapshot || null,
    }).returning();
    return plan;
  }

  async getGoalPlan(id: string): Promise<GoalPlan | undefined> {
    const [plan] = await db.select().from(goalPlans).where(eq(goalPlans.id, id)).limit(1);
    return plan;
  }

  async getGoalPlansByUser(userId: string): Promise<GoalPlan[]> {
    return db.select().from(goalPlans)
      .where(and(eq(goalPlans.userId, userId), isNull(goalPlans.deletedAt)))
      .orderBy(desc(goalPlans.createdAt));
  }

  async updateGoalPlan(id: string, updates: Partial<{ startDate: string | null; mealPlanId: string | null; workoutPlanId: string | null }>): Promise<GoalPlan | undefined> {
    const [plan] = await db.update(goalPlans)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(goalPlans.id, id))
      .returning();
    return plan;
  }

  async softDeleteGoalPlan(id: string): Promise<GoalPlan | undefined> {
    const [plan] = await db.update(goalPlans)
      .set({ deletedAt: new Date() })
      .where(eq(goalPlans.id, id))
      .returning();
    return plan;
  }

  async upsertWorkoutFeedback(userId: string, data: { workoutPlanId?: string; dayIndex: number; sessionKey: string; feedback: "like" | "dislike" | "neutral" }): Promise<WorkoutFeedbackRecord | null> {
    const existing = await db.select().from(workoutFeedback)
      .where(and(eq(workoutFeedback.userId, userId), eq(workoutFeedback.sessionKey, data.sessionKey)))
      .limit(1);

    if (data.feedback === "neutral") {
      if (existing.length > 0) {
        await db.delete(workoutFeedback).where(eq(workoutFeedback.id, existing[0].id));
      }
      return null;
    }

    if (existing.length > 0) {
      const [updated] = await db.update(workoutFeedback)
        .set({ feedback: data.feedback, workoutPlanId: data.workoutPlanId || null, createdAt: new Date() })
        .where(eq(workoutFeedback.id, existing[0].id))
        .returning();
      return updated;
    }

    const [record] = await db.insert(workoutFeedback).values({
      userId,
      workoutPlanId: data.workoutPlanId || null,
      dayIndex: data.dayIndex,
      sessionKey: data.sessionKey,
      feedback: data.feedback,
    }).returning();
    return record;
  }

  async getWorkoutFeedbackForPlan(userId: string, planId: string): Promise<WorkoutFeedbackRecord[]> {
    return db.select().from(workoutFeedback)
      .where(and(eq(workoutFeedback.userId, userId), eq(workoutFeedback.workoutPlanId, planId)));
  }

  async getAllWorkoutFeedback(userId: string): Promise<WorkoutFeedbackRecord[]> {
    return db.select().from(workoutFeedback)
      .where(eq(workoutFeedback.userId, userId))
      .orderBy(desc(workoutFeedback.createdAt));
  }

  async deleteWorkoutFeedback(id: string, userId: string): Promise<boolean> {
    const [record] = await db.select().from(workoutFeedback)
      .where(and(eq(workoutFeedback.id, id), eq(workoutFeedback.userId, userId)))
      .limit(1);
    if (!record) return false;
    await db.delete(workoutFeedback).where(eq(workoutFeedback.id, id));
    return true;
  }

  async createIngredientProposal(userId: string, mealKey: string, mealName: string, ingredients: string[]): Promise<IngredientAvoidProposal> {
    const [proposal] = await db.insert(ingredientAvoidProposals).values({
      userId,
      mealKey,
      mealName,
      ingredients,
    }).returning();
    return proposal;
  }

  async getPendingProposals(userId: string): Promise<IngredientAvoidProposal[]> {
    return db.select().from(ingredientAvoidProposals)
      .where(and(eq(ingredientAvoidProposals.userId, userId), isNull(ingredientAvoidProposals.resolvedAt)))
      .orderBy(desc(ingredientAvoidProposals.createdAt));
  }

  async resolveProposal(id: string, userId: string, chosenIngredients: string[], action: "accepted" | "declined"): Promise<IngredientAvoidProposal | undefined> {
    const [proposal] = await db.update(ingredientAvoidProposals)
      .set({ chosenIngredients, action, resolvedAt: new Date() })
      .where(and(eq(ingredientAvoidProposals.id, id), eq(ingredientAvoidProposals.userId, userId)))
      .returning();
    return proposal;
  }

  async createWeeklyCheckIn(userId: string, data: { goalPlanId?: string; weekStartDate: string; weightStart?: number; weightEnd?: number; energyRating?: number; complianceMeals?: number; complianceWorkouts?: number; notes?: string }): Promise<WeeklyCheckIn> {
    const [checkIn] = await db.insert(weeklyCheckIns).values({
      userId,
      goalPlanId: data.goalPlanId || null,
      weekStartDate: data.weekStartDate,
      weightStart: data.weightStart ?? null,
      weightEnd: data.weightEnd ?? null,
      energyRating: data.energyRating ?? null,
      complianceMeals: data.complianceMeals ?? null,
      complianceWorkouts: data.complianceWorkouts ?? null,
      notes: data.notes || null,
    }).returning();
    return checkIn;
  }

  async getWeeklyCheckIns(userId: string, goalPlanId?: string): Promise<WeeklyCheckIn[]> {
    if (goalPlanId) {
      return db.select().from(weeklyCheckIns)
        .where(and(eq(weeklyCheckIns.userId, userId), eq(weeklyCheckIns.goalPlanId, goalPlanId)))
        .orderBy(desc(weeklyCheckIns.weekStartDate));
    }
    return db.select().from(weeklyCheckIns)
      .where(eq(weeklyCheckIns.userId, userId))
      .orderBy(desc(weeklyCheckIns.weekStartDate));
  }

  async deleteMealFeedbackByFingerprint(userId: string, fingerprint: string): Promise<boolean> {
    const [record] = await db.select().from(mealFeedback)
      .where(and(eq(mealFeedback.userId, userId), eq(mealFeedback.mealFingerprint, fingerprint)))
      .limit(1);
    if (!record) return false;
    await db.delete(mealFeedback).where(eq(mealFeedback.id, record.id));
    return true;
  }

  async upsertExercisePreference(userId: string, exerciseKey: string, exerciseName: string, status: "liked" | "disliked" | "avoided"): Promise<ExercisePreferenceRecord> {
    const existing = await db.select().from(exercisePreferences)
      .where(and(eq(exercisePreferences.userId, userId), eq(exercisePreferences.exerciseKey, exerciseKey)))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(exercisePreferences)
        .set({ status, exerciseName, updatedAt: new Date() })
        .where(eq(exercisePreferences.id, existing[0].id))
        .returning();
      return updated;
    }

    const [record] = await db.insert(exercisePreferences).values({
      userId,
      exerciseKey,
      exerciseName,
      status,
    }).returning();
    return record;
  }

  async deleteExercisePreference(userId: string, exerciseKey: string): Promise<boolean> {
    const [record] = await db.select().from(exercisePreferences)
      .where(and(eq(exercisePreferences.userId, userId), eq(exercisePreferences.exerciseKey, exerciseKey)))
      .limit(1);
    if (!record) return false;
    await db.delete(exercisePreferences).where(eq(exercisePreferences.id, record.id));
    return true;
  }

  async deleteExercisePreferenceById(id: string, userId: string): Promise<boolean> {
    const [record] = await db.select().from(exercisePreferences)
      .where(and(eq(exercisePreferences.id, id), eq(exercisePreferences.userId, userId)))
      .limit(1);
    if (!record) return false;
    await db.delete(exercisePreferences).where(eq(exercisePreferences.id, id));
    return true;
  }

  async getExercisePreferences(userId: string): Promise<ExercisePreferenceRecord[]> {
    return db.select().from(exercisePreferences)
      .where(eq(exercisePreferences.userId, userId))
      .orderBy(desc(exercisePreferences.updatedAt));
  }

  async getExercisePreferenceMap(userId: string): Promise<Record<string, "liked" | "disliked" | "avoided">> {
    const prefs = await this.getExercisePreferences(userId);
    const map: Record<string, "liked" | "disliked" | "avoided"> = {};
    for (const p of prefs) {
      map[p.exerciseKey] = p.status as "liked" | "disliked" | "avoided";
    }
    return map;
  }

  async getGoalPlanByMealPlanId(mealPlanId: string): Promise<GoalPlan | undefined> {
    const [plan] = await db.select().from(goalPlans)
      .where(and(eq(goalPlans.mealPlanId, mealPlanId), isNull(goalPlans.deletedAt)))
      .orderBy(desc(goalPlans.createdAt))
      .limit(1);
    return plan;
  }

  async getGoalPlanByWorkoutPlanId(workoutPlanId: string): Promise<GoalPlan | undefined> {
    const [plan] = await db.select().from(goalPlans)
      .where(and(eq(goalPlans.workoutPlanId, workoutPlanId), isNull(goalPlans.deletedAt)))
      .orderBy(desc(goalPlans.createdAt))
      .limit(1);
    return plan;
  }

  async getUserProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return profile;
  }

  async createUserProfile(userId: string, data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values({
      ...data,
      userId,
    }).returning();
    return profile;
  }

  async updateUserProfile(userId: string, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db.update(userProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async createConstraintViolations(violations: { userId: string; planType: string; planId?: string; goalPlanId?: string; stage: string; ruleKey: string; severity: string; message: string; metaJson?: any }[]): Promise<ConstraintViolation[]> {
    if (violations.length === 0) return [];
    const results = await db.insert(constraintViolations).values(violations).returning();
    return results;
  }

  async getConstraintViolations(userId: string, goalPlanId?: string): Promise<ConstraintViolation[]> {
    if (goalPlanId) {
      return db.select().from(constraintViolations)
        .where(and(eq(constraintViolations.userId, userId), eq(constraintViolations.goalPlanId, goalPlanId)))
        .orderBy(desc(constraintViolations.createdAt));
    }
    return db.select().from(constraintViolations)
      .where(eq(constraintViolations.userId, userId))
      .orderBy(desc(constraintViolations.createdAt));
  }

  async createWellnessPlanSpec(data: { userId: string; planType: string; planId?: string; goalPlanId?: string; safeSpecJson: any }): Promise<WellnessPlanSpec> {
    const [spec] = await db.insert(wellnessPlanSpecs).values(data).returning();
    return spec;
  }

  async getWellnessPlanSpec(planId: string): Promise<WellnessPlanSpec | undefined> {
    const [spec] = await db.select().from(wellnessPlanSpecs)
      .where(eq(wellnessPlanSpecs.planId, planId))
      .limit(1);
    return spec;
  }

  async getScheduledMealPlanDates(userId: string): Promise<string[]> {
    const plans = await db.select({ startDate: mealPlans.planStartDate }).from(mealPlans)
      .where(and(eq(mealPlans.userId, userId), isNull(mealPlans.deletedAt)));
    const dates: string[] = [];
    for (const p of plans) {
      if (p.startDate) {
        const sd = new Date(p.startDate + "T00:00:00");
        for (let i = 0; i < 7; i++) {
          const d = new Date(sd);
          d.setDate(d.getDate() + i);
          dates.push(d.toISOString().split("T")[0]);
        }
      }
    }
    return dates;
  }

  async getScheduledWorkoutPlanDates(userId: string): Promise<string[]> {
    const plans = await db.select({ startDate: workoutPlans.planStartDate }).from(workoutPlans)
      .where(and(eq(workoutPlans.userId, userId), isNull(workoutPlans.deletedAt)));
    const dates: string[] = [];
    for (const p of plans) {
      if (p.startDate) {
        const sd = new Date(p.startDate + "T00:00:00");
        for (let i = 0; i < 7; i++) {
          const d = new Date(sd);
          d.setDate(d.getDate() + i);
          dates.push(d.toISOString().split("T")[0]);
        }
      }
    }
    return dates;
  }

  async upsertPerformanceSummary(data: Omit<PerformanceSummary, "id" | "createdAt" | "updatedAt">): Promise<PerformanceSummary> {
    const existing = await db.select().from(performanceSummaries)
      .where(and(eq(performanceSummaries.userId, data.userId), eq(performanceSummaries.weekStartDate, data.weekStartDate)))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(performanceSummaries)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(performanceSummaries.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(performanceSummaries).values(data).returning();
    return created;
  }

  async getLatestPerformanceSummary(userId: string): Promise<PerformanceSummary | undefined> {
    const [summary] = await db.select().from(performanceSummaries)
      .where(eq(performanceSummaries.userId, userId))
      .orderBy(desc(performanceSummaries.weekStartDate))
      .limit(1);
    return summary;
  }

  async getRecentPerformanceSummaries(userId: string, limit: number = 5): Promise<PerformanceSummary[]> {
    return db.select().from(performanceSummaries)
      .where(eq(performanceSummaries.userId, userId))
      .orderBy(desc(performanceSummaries.weekStartDate))
      .limit(limit);
  }

  async getPerformanceSummariesByRange(userId: string, from: string, to: string): Promise<PerformanceSummary[]> {
    return db.select().from(performanceSummaries)
      .where(and(
        eq(performanceSummaries.userId, userId),
        gte(performanceSummaries.weekStartDate, from),
        lt(performanceSummaries.weekStartDate, to),
      ))
      .orderBy(desc(performanceSummaries.weekStartDate));
  }

  async createDailyMeal(userId: string, date: string, mealsPerDay: number, profileSnapshot: any, adaptiveSnapshot?: any): Promise<DailyMeal> {
    const [meal] = await db.insert(dailyMeals).values({
      userId,
      date,
      mealsPerDay,
      profileSnapshot,
      adaptiveSnapshot: adaptiveSnapshot || null,
      status: "generating",
    }).returning();
    return meal;
  }

  async getDailyMealByDate(userId: string, date: string): Promise<DailyMeal | undefined> {
    const [meal] = await db.select().from(dailyMeals)
      .where(and(eq(dailyMeals.userId, userId), eq(dailyMeals.date, date)))
      .limit(1);
    return meal;
  }

  async getDailyMealsByDateRange(userId: string, startDate: string, endDate: string): Promise<DailyMeal[]> {
    return db.select().from(dailyMeals)
      .where(and(
        eq(dailyMeals.userId, userId),
        gte(dailyMeals.date, startDate),
        lte(dailyMeals.date, endDate),
      ));
  }

  async updateDailyMealStatus(id: string, status: string, planJson?: any, groceryJson?: any, title?: string): Promise<DailyMeal | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (planJson !== undefined) updates.planJson = planJson;
    if (groceryJson !== undefined) updates.groceryJson = groceryJson;
    if (title !== undefined) updates.generatedTitle = title;
    const [meal] = await db.update(dailyMeals).set(updates).where(eq(dailyMeals.id, id)).returning();
    return meal;
  }

  async createDailyWorkout(userId: string, date: string, profileSnapshot: any, adaptiveSnapshot?: any): Promise<DailyWorkout> {
    const [workout] = await db.insert(dailyWorkouts).values({
      userId,
      date,
      profileSnapshot,
      adaptiveSnapshot: adaptiveSnapshot || null,
      status: "generating",
    }).returning();
    return workout;
  }

  async getDailyWorkoutByDate(userId: string, date: string): Promise<DailyWorkout | undefined> {
    const [workout] = await db.select().from(dailyWorkouts)
      .where(and(eq(dailyWorkouts.userId, userId), eq(dailyWorkouts.date, date)))
      .limit(1);
    return workout;
  }

  async getDailyWorkoutsByDateRange(userId: string, startDate: string, endDate: string): Promise<DailyWorkout[]> {
    return db.select().from(dailyWorkouts)
      .where(and(
        eq(dailyWorkouts.userId, userId),
        gte(dailyWorkouts.date, startDate),
        lte(dailyWorkouts.date, endDate),
      ));
  }

  async updateDailyWorkoutStatus(id: string, status: string, planJson?: any, title?: string): Promise<DailyWorkout | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (planJson !== undefined) updates.planJson = planJson;
    if (title !== undefined) updates.generatedTitle = title;
    const [workout] = await db.update(dailyWorkouts).set(updates).where(eq(dailyWorkouts.id, id)).returning();
    return workout;
  }

  async upsertActivityCompletion(userId: string, date: string, itemType: string, sourceType: string, sourceId: string, itemKey: string, completed: boolean): Promise<ActivityCompletion> {
    const existing = await db.select().from(activityCompletions)
      .where(and(
        eq(activityCompletions.userId, userId),
        eq(activityCompletions.date, date),
        eq(activityCompletions.itemType, itemType),
        eq(activityCompletions.sourceType, sourceType),
        eq(activityCompletions.sourceId, sourceId),
        eq(activityCompletions.itemKey, itemKey),
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(activityCompletions)
        .set({
          completed,
          completedAt: completed ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(activityCompletions.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(activityCompletions).values({
      userId,
      date,
      itemType,
      sourceType,
      sourceId,
      itemKey,
      completed,
      completedAt: completed ? new Date() : null,
    }).returning();
    return created;
  }

  async getCompletionsByDateRange(userId: string, startDate: string, endDate: string): Promise<ActivityCompletion[]> {
    return db.select().from(activityCompletions)
      .where(and(
        eq(activityCompletions.userId, userId),
        gte(activityCompletions.date, startDate),
        lte(activityCompletions.date, endDate),
      ));
  }

  async getCompletionsBySource(userId: string, sourceType: string, sourceId: string): Promise<ActivityCompletion[]> {
    return db.select().from(activityCompletions)
      .where(and(
        eq(activityCompletions.userId, userId),
        eq(activityCompletions.sourceType, sourceType),
        eq(activityCompletions.sourceId, sourceId),
      ));
  }

  async upsertWeeklyAdaptation(userId: string, weekStartDate: string, computedSignals: any, adaptationParams: any, summaryText: string): Promise<WeeklyAdaptation> {
    const existing = await db.select().from(weeklyAdaptations)
      .where(and(eq(weeklyAdaptations.userId, userId), eq(weeklyAdaptations.weekStartDate, weekStartDate)))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await db.update(weeklyAdaptations)
        .set({ computedSignals, adaptationParams, summaryText })
        .where(eq(weeklyAdaptations.id, existing[0].id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(weeklyAdaptations)
      .values({ userId, weekStartDate, computedSignals, adaptationParams, summaryText })
      .returning();
    return row;
  }

  async getLatestWeeklyAdaptation(userId: string): Promise<WeeklyAdaptation | undefined> {
    const [row] = await db.select().from(weeklyAdaptations)
      .where(eq(weeklyAdaptations.userId, userId))
      .orderBy(desc(weeklyAdaptations.weekStartDate))
      .limit(1);
    return row;
  }

  async getWeeklyAdaptationsByRange(userId: string, from: string, to: string): Promise<WeeklyAdaptation[]> {
    return db.select().from(weeklyAdaptations)
      .where(and(
        eq(weeklyAdaptations.userId, userId),
        gte(weeklyAdaptations.weekStartDate, from),
        lte(weeklyAdaptations.weekStartDate, to),
      ))
      .orderBy(desc(weeklyAdaptations.weekStartDate));
  }

  async createRefreshToken(userId: string, tokenHash: string, expiresAt: Date, userAgent?: string, ipAddress?: string): Promise<RefreshToken> {
    const [token] = await db.insert(refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
    }).returning();
    return token;
  }

  async getRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined> {
    const [token] = await db.select().from(refreshTokens)
      .where(and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
      ))
      .limit(1);
    return token;
  }

  async revokeRefreshToken(id: string): Promise<void> {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revokeAllRefreshTokensForUser(userId: string): Promise<void> {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
      ));
  }

  async updateRefreshTokenLastUsed(id: string): Promise<void> {
    await db.update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }
}

export const storage = new DatabaseStorage();
