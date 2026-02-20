import type { PerformanceSummary } from "@shared/schema";

export interface AdaptiveInputs {
  profile: {
    primaryGoal: string | null;
    trainingExperience: string | null;
    activityLevel: string | null;
  };
  pace: string | null;
  latestSummary: PerformanceSummary | null;
  last2Summaries: PerformanceSummary[];
}

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

export interface AdaptiveResult {
  modifiers: AdaptiveModifiers;
  decisions: AdaptiveDecision[];
}

export interface AdaptiveSnapshot {
  modifiers: AdaptiveModifiers;
  decisions: AdaptiveDecision[];
  inputsMeta: {
    summaryIdsUsed: string[];
    computedAt: string;
  };
}
