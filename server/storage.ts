import { eq, desc, and, gte } from "drizzle-orm";
import { db } from "./db";
import { users, mealPlans, auditLogs, type User, type MealPlan } from "@shared/schema";

export interface IStorage {
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(email: string, passwordHash: string): Promise<User>;
  createMealPlan(userId: string, preferencesJson: any, planJson: any): Promise<MealPlan>;
  createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any): Promise<MealPlan>;
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

  async createPendingMealPlan(userId: string, idempotencyKey: string, preferencesJson: any): Promise<MealPlan> {
    const [plan] = await db.insert(mealPlans).values({
      userId,
      idempotencyKey,
      preferencesJson,
      planJson: null,
      status: "generating",
      startedAt: new Date(),
    }).returning();
    return plan;
  }

  async getMealPlan(id: string): Promise<MealPlan | undefined> {
    const [plan] = await db.select().from(mealPlans).where(eq(mealPlans.id, id)).limit(1);
    return plan;
  }

  async getMealPlansByUser(userId: string): Promise<MealPlan[]> {
    return db.select().from(mealPlans).where(eq(mealPlans.userId, userId)).orderBy(desc(mealPlans.createdAt));
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
}

export const storage = new DatabaseStorage();
