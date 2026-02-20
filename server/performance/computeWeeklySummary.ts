import { storage } from "../storage";
import type { PerformanceSummary } from "@shared/schema";

export type MomentumState = "building" | "maintaining" | "fatigue_risk" | "slipping";
export type AdjustmentAction = "maintain" | "reduce_load" | "increase_load" | "simplify_plan" | "nutrition_bias_training_days";

interface EconomyDelta {
  regenBonus: number;
  swapBonus: number;
  regenPenalty?: number;
  swapPenalty?: number;
}

const ENERGY_MAP: Record<number, number> = {
  1: 20,
  2: 40,
  3: 60,
  4: 80,
  5: 100,
};

function getWeekEndDate(weekStartDate: string): string {
  const d = new Date(weekStartDate + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

function computeAdherenceScore(
  mealAdh: number | null,
  workoutAdh: number | null,
  energyAvg: number | null,
): number {
  const energy = energyAvg ?? 60;
  let wm = 0.4, ww = 0.4, we = 0.2;

  if (mealAdh == null && workoutAdh == null) {
    wm = 0; ww = 0; we = 1.0;
  } else if (mealAdh == null) {
    wm = 0; ww = 0.67; we = 0.33;
  } else if (workoutAdh == null) {
    wm = 0.67; ww = 0; we = 0.33;
  }

  const score = Math.round(
    (mealAdh ?? 0) * wm + (workoutAdh ?? 0) * ww + energy * we
  );
  return Math.max(0, Math.min(100, score));
}

function computeMomentumState(
  score: number,
  energyAvg: number | null,
  previousSummaries: PerformanceSummary[],
): MomentumState {
  const energy = energyAvg ?? 60;

  const prevScore = previousSummaries.length > 0 ? previousSummaries[0].adherenceScore : null;
  const trendUp = prevScore != null && score >= prevScore + 5;
  const trendDown = prevScore != null && score <= prevScore - 5;

  if (energy <= 40 && score >= 70) return "fatigue_risk";
  if (score >= 80 && (trendUp || prevScore == null)) return "building";
  if (score < 60 || trendDown) return "slipping";
  return "maintaining";
}

function computeAdjustment(momentum: MomentumState): { action: AdjustmentAction; statement: string } {
  switch (momentum) {
    case "fatigue_risk":
      return {
        action: "reduce_load",
        statement: "Reducing training load slightly this week to support recovery and keep consistency high.",
      };
    case "building":
      return {
        action: "increase_load",
        statement: "Consistency is strong. Increasing challenge slightly to keep progress moving.",
      };
    case "slipping":
      return {
        action: "simplify_plan",
        statement: "Simplifying your week to make consistency easier. We'll rebuild intensity once adherence stabilizes.",
      };
    case "maintaining":
    default:
      return {
        action: "maintain",
        statement: "Maintaining your structure this week to reinforce consistency and momentum.",
      };
  }
}

function computeInsights(
  mealAdh: number | null,
  workoutAdh: number | null,
  energyAvg: number | null,
  score: number,
): string[] {
  const bullets: string[] = [];

  if (mealAdh != null && mealAdh < 70) {
    bullets.push("Nutrition consistency is the biggest lever this week.");
  }
  if (workoutAdh != null && workoutAdh < 70) {
    bullets.push("Training consistency is the biggest lever this week.");
  }
  if (energyAvg != null && energyAvg <= 40) {
    bullets.push("Energy is trending low — prioritize sleep and recovery.");
  }
  if (score >= 80) {
    bullets.push("Excellent consistency. Keep the same rhythm.");
  }
  if (mealAdh != null && mealAdh >= 90 && workoutAdh != null && workoutAdh >= 90) {
    bullets.push("Both nutrition and training are dialed in. Great execution.");
  }
  if (score >= 60 && score < 80) {
    bullets.push("Solid effort. Small improvements in consistency will compound fast.");
  }

  if (bullets.length === 0) {
    bullets.push("Keep logging check-ins to build your performance picture.");
  }

  return bullets.slice(0, 3);
}

function computeEconomyDelta(
  score: number,
  previousSummaries: PerformanceSummary[],
): EconomyDelta {
  const prevScore = previousSummaries.length > 0 ? previousSummaries[0].adherenceScore : null;

  if (prevScore != null && prevScore >= 85 && score >= 85) {
    return { regenBonus: 1, swapBonus: 1 };
  }

  if (prevScore != null && prevScore < 60 && score < 60) {
    return { regenBonus: 0, swapBonus: 0, regenPenalty: 1 };
  }

  return { regenBonus: 0, swapBonus: 0 };
}

async function computeRealAdherence(
  userId: string,
  weekStartDate: string,
  weekEndDate: string,
): Promise<{ mealPct: number | null; workoutPct: number | null }> {
  try {
    let scheduledMeals = 0;
    let scheduledWorkouts = 0;

    const mealPlans = await storage.getMealPlansByUser(userId);
    for (const mp of mealPlans) {
      if (!mp.planStartDate || mp.deletedAt) continue;
      const plan = mp.planOutput as any;
      if (!plan?.days) continue;
      for (let d = 0; d < (plan.days?.length || 7); d++) {
        const dayDate = new Date(mp.planStartDate + "T00:00:00");
        dayDate.setDate(dayDate.getDate() + d);
        const ds = dayDate.toISOString().split("T")[0];
        if (ds >= weekStartDate && ds <= weekEndDate) {
          const dayMeals = plan.days[d]?.meals;
          if (dayMeals) scheduledMeals += Object.keys(dayMeals).length;
        }
      }
    }

    const workoutPlans = await storage.getWorkoutPlansByUser(userId);
    for (const wp of workoutPlans) {
      if (!wp.planStartDate || wp.deletedAt) continue;
      const plan = wp.planOutput as any;
      if (!plan?.sessions) continue;
      for (let d = 0; d < plan.sessions.length; d++) {
        const session = plan.sessions[d];
        if (!session || session.isRestDay) continue;
        const dayDate = new Date(wp.planStartDate + "T00:00:00");
        dayDate.setDate(dayDate.getDate() + d);
        const ds = dayDate.toISOString().split("T")[0];
        if (ds >= weekStartDate && ds <= weekEndDate) scheduledWorkouts++;
      }
    }

    const dailyMeals = await storage.getDailyMealsByDateRange(userId, weekStartDate, weekEndDate);
    for (const dm of dailyMeals) {
      if (dm.status !== "ready" || !dm.planJson) continue;
      const meals = (dm.planJson as any)?.meals;
      if (meals) scheduledMeals += Object.keys(meals).length;
    }

    const dailyWorkouts = await storage.getDailyWorkoutsByDateRange(userId, weekStartDate, weekEndDate);
    for (const dw of dailyWorkouts) {
      if (dw.status !== "ready" || !dw.planJson) continue;
      scheduledWorkouts++;
    }

    if (scheduledMeals === 0 && scheduledWorkouts === 0) return { mealPct: null, workoutPct: null };

    const completions = await storage.getCompletionsByDateRange(userId, weekStartDate, weekEndDate);
    const completedMeals = completions.filter(c => c.itemType === "meal" && c.completed).length;
    const completedWorkouts = completions.filter(c => c.itemType === "workout" && c.completed).length;

    const mealPct = scheduledMeals > 0 ? Math.round((completedMeals / scheduledMeals) * 100) : null;
    const workoutPct = scheduledWorkouts > 0 ? Math.round((completedWorkouts / scheduledWorkouts) * 100) : null;

    return { mealPct, workoutPct };
  } catch {
    return { mealPct: null, workoutPct: null };
  }
}

export async function computeWeeklySummary(
  userId: string,
  weekStartDate: string,
): Promise<PerformanceSummary> {
  const weekEndDate = getWeekEndDate(weekStartDate);

  const checkIns = await storage.getWeeklyCheckIns(userId);
  const weekCheckIn = checkIns.find(ci => ci.weekStartDate === weekStartDate);

  const realAdherence = await computeRealAdherence(userId, weekStartDate, weekEndDate);

  const mealAdh = realAdherence.mealPct ?? weekCheckIn?.complianceMeals ?? null;
  const workoutAdh = realAdherence.workoutPct ?? weekCheckIn?.complianceWorkouts ?? null;

  let energyAvg: number | null = null;
  if (weekCheckIn?.energyRating != null) {
    energyAvg = ENERGY_MAP[weekCheckIn.energyRating] ?? 60;
  }

  let weightDeltaKg: number | null = null;
  if (weekCheckIn?.weightStart != null && weekCheckIn?.weightEnd != null) {
    weightDeltaKg = weekCheckIn.weightEnd - weekCheckIn.weightStart;
  }

  const previousSummaries = await storage.getRecentPerformanceSummaries(userId, 3);
  const olderSummaries = previousSummaries.filter(s => s.weekStartDate < weekStartDate);

  const adherenceScore = computeAdherenceScore(mealAdh, workoutAdh, energyAvg);
  const momentumState = computeMomentumState(adherenceScore, energyAvg, olderSummaries);
  const { action: adjustmentAction, statement: adjustmentStatement } = computeAdjustment(momentumState);
  const insights = computeInsights(mealAdh, workoutAdh, energyAvg, adherenceScore);
  const economyDelta = computeEconomyDelta(adherenceScore, olderSummaries);

  const summaryData = {
    userId,
    weekStartDate,
    weekEndDate,
    mealAdherencePct: mealAdh,
    workoutAdherencePct: workoutAdh,
    energyAvg,
    weightDeltaKg,
    adherenceScore,
    momentumState,
    insights,
    adjustmentAction,
    adjustmentStatement,
    economyDelta,
  };

  const summary = await storage.upsertPerformanceSummary(summaryData);

  try {
    await storage.updateUserProfile(userId, { nextWeekPlanBias: adjustmentAction });
  } catch {}

  return summary;
}
