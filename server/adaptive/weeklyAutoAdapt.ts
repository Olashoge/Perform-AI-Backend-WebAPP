import type { PerformanceSummary, UserProfile } from "@shared/schema";
import { computeAdaptiveModifiers } from "./computeAdaptiveModifiers";
import type { AdaptiveResult } from "./types";

export interface WeeklyAdaptationSignals {
  mealAdherencePct: number | null;
  workoutAdherencePct: number | null;
  adherenceScore: number | null;
  energyAvg: number | null;
  momentumState: string | null;
  weekCount: number;
  trend: "improving" | "stable" | "declining" | "insufficient_data";
}

export interface WeeklyAdaptationParams {
  adaptiveResult: AdaptiveResult;
  adjustmentAction: string;
  economyDelta: { regenBonus: number; swapBonus: number };
}

function computeTrend(summaries: PerformanceSummary[]): "improving" | "stable" | "declining" | "insufficient_data" {
  if (summaries.length < 2) return "insufficient_data";
  const recent = summaries.slice(0, 2);
  const scores = recent.map(s => s.adherenceScore ?? 0);
  const diff = scores[0] - scores[1];
  if (diff > 5) return "improving";
  if (diff < -5) return "declining";
  return "stable";
}

function computeEconomyDelta(summaries: PerformanceSummary[]): { regenBonus: number; swapBonus: number } {
  if (summaries.length < 2) return { regenBonus: 0, swapBonus: 0 };
  const twoWeeksAbove85 = summaries.slice(0, 2).every(s => (s.adherenceScore ?? 0) >= 85);
  const twoWeeksBelow60 = summaries.slice(0, 2).every(s => (s.adherenceScore ?? 0) < 60);
  if (twoWeeksAbove85) return { regenBonus: 1, swapBonus: 1 };
  if (twoWeeksBelow60) return { regenBonus: -1, swapBonus: -1 };
  return { regenBonus: 0, swapBonus: 0 };
}

function computeAdjustmentAction(latest: PerformanceSummary | null, trend: string): string {
  if (!latest) return "maintain";
  const score = latest.adherenceScore ?? 0;
  const energy = latest.energyAvg ?? 70;

  if (score >= 85 && energy >= 70) return "maintain";
  if (score >= 70 && energy < 60) return "reduce_load";
  if (score >= 85 && energy >= 80) return "increase_load";
  if (score < 60) return "simplify_plan";
  if (trend === "declining") return "reduce_load";
  return "maintain";
}

function buildSummaryText(signals: WeeklyAdaptationSignals, params: WeeklyAdaptationParams): string {
  const parts: string[] = [];

  if (signals.trend === "improving") {
    parts.push("Your consistency is improving — great momentum!");
  } else if (signals.trend === "declining") {
    parts.push("Your adherence has dipped recently. This week's plan adjusts to help you stay on track.");
  } else if (signals.trend === "stable" && (signals.adherenceScore ?? 0) >= 70) {
    parts.push("You're staying consistent. Keep it up!");
  } else if (signals.trend === "insufficient_data") {
    parts.push("Building your baseline — more data will unlock personalized adaptations.");
  }

  const decisions = params.adaptiveResult.decisions;
  if (decisions.length > 0) {
    const adjustments = decisions.filter(d => d.severity === "adjust");
    if (adjustments.length > 0) {
      parts.push(`Adjustments: ${adjustments.map(d => d.message).join(" ")}`);
    }
  }

  if (params.economyDelta.regenBonus > 0) {
    parts.push("Bonus: +1 regen and +1 swap earned for sustained high performance.");
  } else if (params.economyDelta.regenBonus < 0) {
    parts.push("Note: Regen and swap budgets reduced — focus on completing more of your plan.");
  }

  return parts.join(" ");
}

export function computeWeeklyAdaptation(
  profile: UserProfile,
  summaries: PerformanceSummary[],
  pace: string | null = null,
): { signals: WeeklyAdaptationSignals; params: WeeklyAdaptationParams; summaryText: string } {
  const latest = summaries.length > 0 ? summaries[0] : null;
  const trend = computeTrend(summaries);

  const signals: WeeklyAdaptationSignals = {
    mealAdherencePct: latest?.mealAdherencePct ?? null,
    workoutAdherencePct: latest?.workoutAdherencePct ?? null,
    adherenceScore: latest?.adherenceScore ?? null,
    energyAvg: latest?.energyAvg ?? null,
    momentumState: latest?.momentumState ?? null,
    weekCount: summaries.length,
    trend,
  };

  const adaptiveResult = computeAdaptiveModifiers({
    profile: {
      primaryGoal: profile.primaryGoal,
      trainingExperience: profile.trainingExperience,
      activityLevel: profile.activityLevel,
    },
    pace,
    latestSummary: latest,
    last2Summaries: summaries.slice(0, 2),
  });

  const adjustmentAction = computeAdjustmentAction(latest, trend);
  const economyDelta = computeEconomyDelta(summaries);

  const params: WeeklyAdaptationParams = {
    adaptiveResult,
    adjustmentAction,
    economyDelta,
  };

  const summaryText = buildSummaryText(signals, params);

  return { signals, params, summaryText };
}
