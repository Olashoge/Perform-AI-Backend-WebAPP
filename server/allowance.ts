import { storage } from "./storage";
import type { PlanAllowance } from "@shared/schema";

export interface AllowanceCheckResult {
  allowed: boolean;
  reason?: string;
  cooldownMinutesRemaining?: number;
  nextResetAt?: string;
}

export interface AllowanceState {
  goalPlanId: string;
  allowanceId: string;
  today: {
    mealSwapsUsed: number;
    mealSwapsLimit: number;
    workoutSwapsUsed: number;
    workoutSwapsLimit: number;
    mealRegensUsed: number;
    mealRegensLimit: number;
    workoutRegensUsed: number;
    workoutRegensLimit: number;
  };
  plan: {
    regensUsed: number;
    regensLimit: number;
  };
  cooldown: {
    active: boolean;
    minutesRemaining: number;
  };
  flexTokensAvailable: number;
  coachInsight: string | null;
}

function getUtcDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

function isSameUtcDay(date: Date): boolean {
  return date.toISOString().split("T")[0] === getUtcDateString();
}

async function resetDailyIfNeeded(allowance: PlanAllowance): Promise<PlanAllowance> {
  if (!isSameUtcDay(allowance.lastDailyResetAt)) {
    const updated = await storage.updatePlanAllowance(allowance.id, {
      mealSwapsUsedToday: 0,
      workoutSwapsUsedToday: 0,
      mealRegensUsedToday: 0,
      workoutRegensUsedToday: 0,
      lastDailyResetAt: new Date(),
    });
    return updated || allowance;
  }
  return allowance;
}

function computedMealSwapsPerDay(a: PlanAllowance): number {
  return a.baseMealSwapsPerDay + a.bonusMealSwapsPerDay;
}

function computedWorkoutSwapsPerDay(a: PlanAllowance): number {
  return a.baseWorkoutSwapsPerDay + a.bonusWorkoutSwapsPerDay;
}

function computedPlanRegensTotal(a: PlanAllowance): number {
  return Math.max(3, a.basePlanRegensTotal + a.bonusPlanRegensTotal - a.penaltyPlanRegensTotal);
}

export async function resolveAllowanceForMealPlan(userId: string, mealPlanId: string): Promise<PlanAllowance | null> {
  const goalPlan = await storage.getGoalPlanByMealPlanId(mealPlanId);
  if (!goalPlan) return null;
  let allowance = await storage.getPlanAllowanceByGoalPlan(goalPlan.id);
  if (!allowance) return null;
  allowance = await resetDailyIfNeeded(allowance);
  return allowance;
}

export async function checkMealSwapAllowed(userId: string, mealPlanId: string): Promise<{ allowance: PlanAllowance | null; result: AllowanceCheckResult }> {
  const allowance = await resolveAllowanceForMealPlan(userId, mealPlanId);
  if (!allowance) {
    return { allowance: null, result: { allowed: true } };
  }

  const limit = computedMealSwapsPerDay(allowance);
  if (allowance.mealSwapsUsedToday >= limit) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return {
      allowance,
      result: {
        allowed: false,
        reason: `You've used all ${limit} meal swaps for today. Resets at midnight UTC.`,
        nextResetAt: tomorrow.toISOString(),
      },
    };
  }

  return { allowance, result: { allowed: true } };
}

export async function checkMealRegenAllowed(userId: string, mealPlanId: string): Promise<{ allowance: PlanAllowance | null; result: AllowanceCheckResult }> {
  const allowance = await resolveAllowanceForMealPlan(userId, mealPlanId);
  if (!allowance) {
    return { allowance: null, result: { allowed: true } };
  }

  if (allowance.regenCooldownUntil && new Date(allowance.regenCooldownUntil) > new Date()) {
    const remaining = Math.ceil((new Date(allowance.regenCooldownUntil).getTime() - Date.now()) / 60000);
    return {
      allowance,
      result: {
        allowed: false,
        reason: `Regen cooldown active. Available in ${remaining} minutes.`,
        cooldownMinutesRemaining: remaining,
      },
    };
  }

  if (allowance.mealRegensUsedToday >= allowance.baseMealDayRegensPerDay) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return {
      allowance,
      result: {
        allowed: false,
        reason: `You've used your daily meal regen. Resets at midnight UTC.`,
        nextResetAt: tomorrow.toISOString(),
      },
    };
  }

  const planLimit = computedPlanRegensTotal(allowance);
  if (allowance.regensUsedTotal >= planLimit) {
    return {
      allowance,
      result: {
        allowed: false,
        reason: `You've used all ${planLimit} regens for this wellness plan.`,
      },
    };
  }

  return { allowance, result: { allowed: true } };
}

export async function recordMealSwap(allowance: PlanAllowance, userId: string, metadata: any): Promise<void> {
  await storage.updatePlanAllowance(allowance.id, {
    mealSwapsUsedToday: allowance.mealSwapsUsedToday + 1,
  });

  await storage.createPlanUsageEvent(userId, allowance.goalPlanId, "MEAL", "SWAP", "ITEM", metadata);
}

export async function recordMealRegen(allowance: PlanAllowance, userId: string, metadata: any): Promise<void> {
  await storage.updatePlanAllowance(allowance.id, {
    mealRegensUsedToday: allowance.mealRegensUsedToday + 1,
    regensUsedTotal: allowance.regensUsedTotal + 1,
  });

  await storage.createPlanUsageEvent(userId, allowance.goalPlanId, "MEAL", "REGEN", "DAY", metadata);

  const recentRegens = await storage.getRecentRegenEvents(userId, 24);
  if (recentRegens.length >= 3) {
    const cooldownUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await storage.updatePlanAllowance(allowance.id, {
      regenCooldownUntil: cooldownUntil,
    });
  }
}

export async function getAllowanceState(userId: string, mealPlanId?: string): Promise<AllowanceState | null> {
  let allowance: PlanAllowance | undefined;

  if (mealPlanId) {
    const resolved = await resolveAllowanceForMealPlan(userId, mealPlanId);
    if (resolved) allowance = resolved;
  }

  if (!allowance) {
    allowance = await storage.getPlanAllowanceByUser(userId);
  }

  if (!allowance) return null;

  allowance = await resetDailyIfNeeded(allowance);

  const cooldownActive = allowance.regenCooldownUntil ? new Date(allowance.regenCooldownUntil) > new Date() : false;
  const cooldownMinutes = cooldownActive && allowance.regenCooldownUntil
    ? Math.ceil((new Date(allowance.regenCooldownUntil).getTime() - Date.now()) / 60000)
    : 0;

  const tokens = await storage.getAvailableFlexTokens(userId);

  const lastSummary = await storage.getLastBehaviorSummary(userId);
  let coachInsight: string | null = null;
  if (lastSummary) {
    const bonus = lastSummary.resultingBonusJson as any;
    const penalty = lastSummary.resultingPenaltyJson as any;
    if (bonus?.bonusPlanRegensTotal > 0) {
      coachInsight = `You earned +${bonus.bonusPlanRegensTotal} regen${bonus.bonusPlanRegensTotal > 1 ? "s" : ""} from ${Math.round(lastSummary.combinedAdherence || 0)}% adherence.`;
    }
    if (penalty?.penaltyPlanRegensTotal > 0) {
      coachInsight = `High regen use last plan reduced plan regens by ${penalty.penaltyPlanRegensTotal}.`;
    }
    if (bonus?.bonusMealSwapsPerDay > 0) {
      coachInsight = (coachInsight ? coachInsight + " " : "") + `+${bonus.bonusMealSwapsPerDay} daily meal swap${bonus.bonusMealSwapsPerDay > 1 ? "s" : ""} from great adherence.`;
    }
  }

  return {
    goalPlanId: allowance.goalPlanId,
    allowanceId: allowance.id,
    today: {
      mealSwapsUsed: allowance.mealSwapsUsedToday,
      mealSwapsLimit: computedMealSwapsPerDay(allowance),
      workoutSwapsUsed: allowance.workoutSwapsUsedToday,
      workoutSwapsLimit: computedWorkoutSwapsPerDay(allowance),
      mealRegensUsed: allowance.mealRegensUsedToday,
      mealRegensLimit: allowance.baseMealDayRegensPerDay,
      workoutRegensUsed: allowance.workoutRegensUsedToday,
      workoutRegensLimit: allowance.baseWorkoutDayRegensPerDay,
    },
    plan: {
      regensUsed: allowance.regensUsedTotal,
      regensLimit: computedPlanRegensTotal(allowance),
    },
    cooldown: {
      active: cooldownActive,
      minutesRemaining: cooldownMinutes,
    },
    flexTokensAvailable: tokens.length,
    coachInsight,
  };
}

export async function redeemFlexToken(userId: string): Promise<{ success: boolean; message: string }> {
  const tokens = await storage.getAvailableFlexTokens(userId);
  if (tokens.length === 0) {
    return { success: false, message: "No flex tokens available to redeem." };
  }

  const token = tokens[0];
  await storage.consumeFlexToken(token.id);

  const allowance = await storage.getPlanAllowanceByUser(userId);
  if (allowance) {
    await storage.updatePlanAllowance(allowance.id, {
      mealRegensUsedToday: Math.max(0, allowance.mealRegensUsedToday - 1),
    });
    await storage.createPlanUsageEvent(userId, allowance.goalPlanId, "MEAL", "REDEEM", "ITEM", { tokenId: token.id });
  }

  return { success: true, message: "Flex token redeemed. You have an extra regen available." };
}

export async function computeBehaviorSummary(userId: string, goalPlanId: string): Promise<{
  bonuses: { bonusMealSwapsPerDay: number; bonusWorkoutSwapsPerDay: number; bonusPlanRegensTotal: number };
  penalties: { penaltyPlanRegensTotal: number };
}> {
  const checkIns = await storage.getWeeklyCheckIns(userId, goalPlanId);

  let mealAdherence = 0;
  let workoutAdherence = 0;
  let count = 0;
  for (const ci of checkIns) {
    if (ci.complianceMeals != null) { mealAdherence += ci.complianceMeals; count++; }
    if (ci.complianceWorkouts != null) { workoutAdherence += ci.complianceWorkouts; }
  }
  if (count > 0) {
    mealAdherence /= count;
    workoutAdherence /= count;
  }
  const combinedAdherence = count > 0 ? (mealAdherence + workoutAdherence) / 2 : 50;

  const allowance = await storage.getPlanAllowanceByGoalPlan(goalPlanId);
  const regensAvailable = allowance ? computedPlanRegensTotal(allowance) : 5;
  const regensUsed = allowance ? allowance.regensUsedTotal : 0;
  const regenRate = regensAvailable > 0 ? regensUsed / regensAvailable : 0;

  const allFeedback = await storage.getAllMealFeedback(userId);
  const dislikedMeals = allFeedback.filter(f => f.feedback === "dislike").length;
  const totalMealInteractions = allFeedback.length;
  const dislikedRateMeals = totalMealInteractions > 0 ? dislikedMeals / totalMealInteractions : 0;

  const allExPrefs = await storage.getExercisePreferences(userId);
  const dislikedEx = allExPrefs.filter(p => p.status === "disliked").length;
  const totalExInteractions = allExPrefs.length;
  const dislikedRateWorkouts = totalExInteractions > 0 ? dislikedEx / totalExInteractions : 0;

  const avoidedIngCount = (await storage.getAllIngredientPreferences(userId)).filter(p => p.preference === "avoid").length;
  const avoidedExCount = allExPrefs.filter(p => p.status === "avoided").length;

  const streakDays = checkIns.length;

  const bonuses = { bonusMealSwapsPerDay: 0, bonusWorkoutSwapsPerDay: 0, bonusPlanRegensTotal: 0 };
  const penalties = { penaltyPlanRegensTotal: 0 };

  if (combinedAdherence >= 80) {
    bonuses.bonusPlanRegensTotal = Math.min(bonuses.bonusPlanRegensTotal + 1, 2);
  }
  if (combinedAdherence >= 90) {
    bonuses.bonusMealSwapsPerDay = Math.min(bonuses.bonusMealSwapsPerDay + 1, 2);
    bonuses.bonusWorkoutSwapsPerDay = Math.min(bonuses.bonusWorkoutSwapsPerDay + 1, 2);
  }

  if (regenRate > 0.8 && combinedAdherence < 60) {
    penalties.penaltyPlanRegensTotal = 1;
  }

  if (dislikedRateMeals > 0.25) {
    bonuses.bonusMealSwapsPerDay = Math.min(bonuses.bonusMealSwapsPerDay + 1, 2);
  }
  if (dislikedRateWorkouts > 0.25) {
    bonuses.bonusWorkoutSwapsPerDay = Math.min(bonuses.bonusWorkoutSwapsPerDay + 1, 2);
  }

  await storage.createPlanBehaviorSummary(userId, goalPlanId, {
    mealAdherenceAvg: mealAdherence,
    workoutAdherenceAvg: workoutAdherence,
    combinedAdherence,
    regenRate,
    dislikedRateMeals,
    dislikedRateWorkouts,
    avoidedIngredientsCount: avoidedIngCount,
    avoidedExercisesCount: avoidedExCount,
    streakDays,
    resultingBonusJson: bonuses,
    resultingPenaltyJson: penalties,
  });

  if (streakDays >= 7) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await storage.createFlexToken(userId, goalPlanId, expiresAt);
  }

  return { bonuses, penalties };
}

export async function createAllowanceForGoalPlan(userId: string, goalPlanId: string, startDate?: string, endDate?: string): Promise<PlanAllowance> {
  const lastSummary = await storage.getLastBehaviorSummary(userId);
  let bonuses: any = {};
  if (lastSummary) {
    const b = lastSummary.resultingBonusJson as any;
    const p = lastSummary.resultingPenaltyJson as any;
    if (b) bonuses = { ...b };
    if (p) bonuses.penaltyPlanRegensTotal = p.penaltyPlanRegensTotal || 0;
  }

  return storage.createPlanAllowance(userId, goalPlanId, startDate, endDate, bonuses);
}
