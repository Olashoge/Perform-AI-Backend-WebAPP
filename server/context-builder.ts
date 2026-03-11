import type { UserProfile } from "@shared/schema";

export interface GenerationContext {
  demographics: {
    age?: number;
    sex?: string | null;
  };
  measurements: {
    heightCm?: number | null;
    weightKg: number;
    targetWeightKg?: number | null;
    unitSystem: string;
  };
  goals: {
    primaryGoal: string;
    secondaryFocus?: string | null;
    pace?: string | null;
  };
  training: {
    experience: string;
    trainingDaysOfWeek: string[];
    sessionDurationMinutes?: number | null;
    activityLevel?: string | null;
  };
  health: {
    healthConstraints: string[];
    sleepHours?: number | null;
    stressLevel?: string | null;
  };
  nutrition: {
    allergiesIntolerances: string[];
    foodsToAvoid: string[];
    foodsToAvoidNotes?: string | null;
    appetiteLevel?: string | null;
    spicePreference?: string | null;
    favoriteMealsText?: string;
  };
  bodyContext: string;
  equipment: {
    workoutLocation?: string | null;
    equipmentAvailable: string[];
    equipmentOtherNotes?: string;
  };
}

export interface ContextBuilderResult {
  context: GenerationContext;
  snapshot: Record<string, any>;
  mealPromptBlock: string;
  workoutPromptBlock: string;
  profileExtras: {
    bodyContext?: string;
    workoutLocation?: string;
    equipment?: string[];
    equipmentNotes?: string;
  };
}

export interface ContextOverrides {
  favoriteMealsText?: string;
  bodyContext?: string;
  equipmentAvailable?: string[];
  workoutLocation?: string;
  equipmentOtherNotes?: string;
  foodsToAvoid?: string[];
  allergiesIntolerances?: string[];
  spicePreference?: string;
  appetiteLevel?: string;
}

const PRIMARY_GOAL_LABELS: Record<string, string> = {
  weight_loss: "Weight Loss",
  muscle_gain: "Muscle Gain",
  body_recomposition: "Body Recomposition",
  general_fitness: "General Fitness",
  athletic_performance: "Athletic Performance",
  performance: "Athletic Performance",
  maintenance: "General Fitness",
  energy: "General Fitness",
};

const SECONDARY_FOCUS_LABELS: Record<string, string> = {
  strength: "Strength",
  endurance: "Endurance",
  mobility: "Mobility",
  energy_focus: "Energy & Focus",
  recovery: "Recovery",
};

export function formatGoalLabel(primaryGoal: string): string {
  return PRIMARY_GOAL_LABELS[primaryGoal] || primaryGoal.replace(/_/g, " ");
}

export function formatSecondaryFocusLabel(focus: string): string {
  return SECONDARY_FOCUS_LABELS[focus] || focus.replace(/_/g, " ");
}

export function buildUserContextForGeneration(
  profile: UserProfile,
  overrides?: ContextOverrides
): ContextBuilderResult {
  const ctx: GenerationContext = {
    demographics: {
      age: profile.age ?? undefined,
      sex: profile.sex,
    },
    measurements: {
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      targetWeightKg: profile.targetWeightKg,
      unitSystem: profile.unitSystem || "imperial",
    },
    goals: {
      primaryGoal: profile.primaryGoal,
      secondaryFocus: (profile as any).secondaryFocus ?? null,
      pace: profile.nextWeekPlanBias,
    },
    training: {
      experience: profile.trainingExperience,
      trainingDaysOfWeek: (profile.trainingDaysOfWeek as string[]) || [],
      sessionDurationMinutes: profile.sessionDurationMinutes,
      activityLevel: profile.activityLevel,
    },
    health: {
      healthConstraints: (profile.healthConstraints as string[]) || [],
      sleepHours: profile.sleepHours,
      stressLevel: profile.stressLevel,
    },
    nutrition: {
      allergiesIntolerances: overrides?.allergiesIntolerances ?? ((profile.allergiesIntolerances as string[]) || []),
      foodsToAvoid: overrides?.foodsToAvoid ?? ((profile.foodsToAvoid as string[]) || []),
      foodsToAvoidNotes: profile.foodsToAvoidNotes,
      appetiteLevel: overrides?.appetiteLevel ?? profile.appetiteLevel,
      spicePreference: overrides?.spicePreference ?? profile.spicePreference,
      favoriteMealsText: overrides?.favoriteMealsText ?? (profile.favoriteMealsText || ""),
    },
    bodyContext: overrides?.bodyContext ?? (profile.bodyContext || ""),
    equipment: {
      workoutLocation: overrides?.workoutLocation ?? profile.workoutLocationDefault,
      equipmentAvailable: overrides?.equipmentAvailable ?? ((profile.equipmentAvailable as string[]) || []),
      equipmentOtherNotes: overrides?.equipmentOtherNotes ?? (profile.equipmentOtherNotes || ""),
    },
  };

  const snapshot: Record<string, any> = {
    ...ctx,
    profileId: profile.id,
    userId: profile.userId,
    generatedAt: new Date().toISOString(),
  };
  if (overrides) {
    snapshot.overridesApplied = overrides;
  }

  const mealPromptBlock = buildMealContextBlock(ctx);
  const workoutPromptBlock = buildWorkoutContextBlock(ctx);

  const profileExtras = {
    bodyContext: ctx.bodyContext || undefined,
    workoutLocation: ctx.equipment.workoutLocation || undefined,
    equipment: ctx.equipment.equipmentAvailable.length > 0 ? ctx.equipment.equipmentAvailable : undefined,
    equipmentNotes: ctx.equipment.equipmentOtherNotes || undefined,
  };

  return { context: ctx, snapshot, mealPromptBlock, workoutPromptBlock, profileExtras };
}

function buildMealContextBlock(ctx: GenerationContext): string {
  const parts: string[] = [];

  parts.push("\n--- USER CONTEXT (MUST FOLLOW STRICTLY) ---");

  if (ctx.demographics.age) parts.push(`Age: ${ctx.demographics.age}`);
  if (ctx.demographics.sex) parts.push(`Sex: ${ctx.demographics.sex}`);

  const unit = ctx.measurements.unitSystem === "metric" ? "kg" : "lb";
  const displayWeight = ctx.measurements.unitSystem === "metric"
    ? ctx.measurements.weightKg
    : Math.round(ctx.measurements.weightKg * 2.205);
  parts.push(`Current Weight: ${displayWeight} ${unit}`);
  if (ctx.measurements.targetWeightKg) {
    const displayTarget = ctx.measurements.unitSystem === "metric"
      ? ctx.measurements.targetWeightKg
      : Math.round(ctx.measurements.targetWeightKg * 2.205);
    parts.push(`Target Weight: ${displayTarget} ${unit}`);
  }

  parts.push(`Primary Goal: ${formatGoalLabel(ctx.goals.primaryGoal)}`);
  if (ctx.goals.secondaryFocus) {
    parts.push(`Secondary Focus: ${formatSecondaryFocusLabel(ctx.goals.secondaryFocus)} (modifier — support this emphasis while serving the primary goal)`);
  }

  if (ctx.training.trainingDaysOfWeek.length > 0) {
    parts.push(`Training Days: ${ctx.training.trainingDaysOfWeek.join(", ")}`);
  }
  if (ctx.training.activityLevel) {
    parts.push(`Activity Level: ${ctx.training.activityLevel}`);
  }

  if (ctx.nutrition.allergiesIntolerances.length > 0) {
    parts.push(`HARD CONSTRAINT — Allergies & Intolerances: ${ctx.nutrition.allergiesIntolerances.join(", ")} (NEVER include these)`);
  }
  if (ctx.nutrition.foodsToAvoid.length > 0) {
    parts.push(`HARD CONSTRAINT — Foods to Avoid: ${ctx.nutrition.foodsToAvoid.join(", ")} (NEVER include these)`);
  }
  if (ctx.nutrition.foodsToAvoidNotes) {
    parts.push(`Additional avoidance notes: ${ctx.nutrition.foodsToAvoidNotes}`);
  }
  if (ctx.nutrition.appetiteLevel) {
    parts.push(`Appetite Level: ${ctx.nutrition.appetiteLevel}`);
  }
  if (ctx.nutrition.spicePreference) {
    parts.push(`Spice Preference: ${ctx.nutrition.spicePreference}`);
  }

  if (ctx.nutrition.favoriteMealsText && ctx.nutrition.favoriteMealsText.trim()) {
    parts.push(`FAVORITE MEALS (soft constraint — include at least 1 per day as a healthier version): ${ctx.nutrition.favoriteMealsText.trim()}`);
    parts.push(`If a favorite meal conflicts with allergies/foods to avoid, adjust ingredients to comply or propose a close alternative labeled as a substitution.`);
  }

  if (ctx.health.healthConstraints.length > 0) {
    parts.push(`Health Constraints: ${ctx.health.healthConstraints.join(", ")}`);
  }
  if (ctx.health.sleepHours != null) {
    parts.push(`Sleep: ~${ctx.health.sleepHours} hours/night`);
  }
  if (ctx.health.stressLevel) {
    parts.push(`Stress Level: ${ctx.health.stressLevel}`);
  }

  if (ctx.bodyContext && ctx.bodyContext.trim()) {
    parts.push(`\nIMPORTANT USER BODY CONTEXT (high priority — tailor plan accordingly):\n${ctx.bodyContext.trim()}`);
  }

  parts.push("--- END USER CONTEXT ---");

  return parts.join("\n");
}

function buildWorkoutContextBlock(ctx: GenerationContext): string {
  const parts: string[] = [];

  parts.push("\n--- USER CONTEXT (MUST FOLLOW STRICTLY) ---");

  if (ctx.demographics.age) parts.push(`Age: ${ctx.demographics.age}`);
  if (ctx.demographics.sex) parts.push(`Sex: ${ctx.demographics.sex}`);

  const unit = ctx.measurements.unitSystem === "metric" ? "kg" : "lb";
  const displayWeight = ctx.measurements.unitSystem === "metric"
    ? ctx.measurements.weightKg
    : Math.round(ctx.measurements.weightKg * 2.205);
  parts.push(`Current Weight: ${displayWeight} ${unit}`);

  parts.push(`Primary Goal: ${formatGoalLabel(ctx.goals.primaryGoal)}`);
  if (ctx.goals.secondaryFocus) {
    parts.push(`Secondary Focus: ${formatSecondaryFocusLabel(ctx.goals.secondaryFocus)} (modifier — shape training emphasis while serving the primary goal)`);
  }
  parts.push(`Experience: ${ctx.training.experience}`);

  if (ctx.training.sessionDurationMinutes) {
    parts.push(`Session Duration: ${ctx.training.sessionDurationMinutes} minutes`);
  }
  if (ctx.training.activityLevel) {
    parts.push(`Activity Level: ${ctx.training.activityLevel}`);
  }

  if (ctx.health.healthConstraints.length > 0) {
    parts.push(`HARD CONSTRAINT — Health/Injury Constraints: ${ctx.health.healthConstraints.join(", ")} (avoid exercises stressing these areas)`);
  }

  if (ctx.equipment.workoutLocation) {
    parts.push(`Workout Location: ${ctx.equipment.workoutLocation}`);
  }
  if (ctx.equipment.equipmentAvailable.length > 0) {
    parts.push(`HARD CONSTRAINT — Available Equipment: ${ctx.equipment.equipmentAvailable.join(", ")}`);
    parts.push(`Only prescribe exercises using the equipment listed above. If an exercise requires unlisted equipment, provide a bodyweight or available-equipment alternative.`);
  }
  if (ctx.equipment.equipmentOtherNotes) {
    parts.push(`Equipment Notes: ${ctx.equipment.equipmentOtherNotes}`);
  }

  if (ctx.bodyContext && ctx.bodyContext.trim()) {
    parts.push(`\nIMPORTANT USER BODY CONTEXT (high priority — tailor plan accordingly):\n${ctx.bodyContext.trim()}`);
  }

  parts.push("--- END USER CONTEXT ---");

  return parts.join("\n");
}
