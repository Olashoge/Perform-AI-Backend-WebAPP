import type { UserProfile } from "@shared/schema";

export type ViolationSeverity = "BLOCK" | "WARN" | "ADJUST";
export type ViolationCategory = "AGE" | "INJURY" | "EQUIPMENT" | "NUTRITION" | "SCHEDULE" | "OTHER";
export type PlanKind = "meal" | "workout" | "both";

export interface Violation {
  ruleKey: string;
  category: ViolationCategory;
  severity: ViolationSeverity;
  message: string;
  metadata?: Record<string, any>;
}

export interface SafeSpec {
  ageTier: "child" | "young_teen" | "older_teen" | "adult" | "senior";
  bannedFoods: string[];
  bannedIngredients: string[];
  bannedExerciseTags: string[];
  bannedExercisesExact: string[];
  allowedEquipment: string[];
  equipmentRestriction: "home_bodyweight" | "home_equipment" | "gym" | "outdoor" | "any";
  nutritionBounds: {
    calorieDeficitMaxPercent: number;
    calorieDeficitMaxKcal: number;
    calorieSurplusMaxKcal: number;
    minDailyCalories: number;
    maxDailyCalories: number;
    noAggressiveDeficit: boolean;
  };
  intensityCaps: {
    maxRPE: number;
    noOneRepMax: boolean;
    noMaxEffortLifts: boolean;
    noPlyometrics: boolean;
    plyoLimit: "none" | "light" | "moderate" | "full";
    warmupMinutesMin: number;
    mobilityMinutesMin: number;
    requireLowImpactCardio: boolean;
    jointFriendlyBias: boolean;
    longerWarmup: boolean;
  };
  scheduleConstraints: {
    noOverlapPolicy: boolean;
    blockedStartDates: string[];
  };
  swapHints: Record<string, string[]>;
}

export interface RuleContext {
  profile: UserProfile;
  planKind: PlanKind;
  startDate?: string;
  endDate?: string;
  mealPreferences?: any;
  workoutPreferences?: any;
  existingScheduledMealDates?: string[];
  existingScheduledWorkoutDates?: string[];
}

export interface RuleResult {
  violations: Violation[];
  specPatch: Partial<SafeSpec>;
}

export interface ConstraintResult {
  blocked: boolean;
  violations: Violation[];
  safeSpec: SafeSpec;
}

export function getDefaultSafeSpec(): SafeSpec {
  return {
    ageTier: "adult",
    bannedFoods: [],
    bannedIngredients: [],
    bannedExerciseTags: [],
    bannedExercisesExact: [],
    allowedEquipment: [],
    equipmentRestriction: "any",
    nutritionBounds: {
      calorieDeficitMaxPercent: 0.25,
      calorieDeficitMaxKcal: 700,
      calorieSurplusMaxKcal: 500,
      minDailyCalories: 1200,
      maxDailyCalories: 4000,
      noAggressiveDeficit: false,
    },
    intensityCaps: {
      maxRPE: 10,
      noOneRepMax: false,
      noMaxEffortLifts: false,
      noPlyometrics: false,
      plyoLimit: "full",
      warmupMinutesMin: 5,
      mobilityMinutesMin: 3,
      requireLowImpactCardio: false,
      jointFriendlyBias: false,
      longerWarmup: false,
    },
    scheduleConstraints: {
      noOverlapPolicy: true,
      blockedStartDates: [],
    },
    swapHints: {},
  };
}
