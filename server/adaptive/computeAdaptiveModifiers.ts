import type { AdaptiveInputs, AdaptiveModifiers, AdaptiveDecision, AdaptiveResult } from "./types";

function getDefaultModifiers(): AdaptiveModifiers {
  return {
    volumeMultiplier: 1.0,
    intensityCapRPE: 8,
    cardioBias: "normal",
    recoveryBias: "normal",
    complexityLevel: "standard",
    nutritionCalorieDeltaKcal: 0,
    trainingDayCarbBias: "normal",
    simplifyMeals: false,
    deloadWeek: false,
  };
}

export function computeAdaptiveModifiers(inputs: AdaptiveInputs): AdaptiveResult {
  const m = getDefaultModifiers();
  const decisions: AdaptiveDecision[] = [];

  const latest = inputs.latestSummary;
  if (!latest) {
    return { modifiers: m, decisions };
  }

  const mealAdh = latest.mealAdherencePct;
  const workoutAdh = latest.workoutAdherencePct;
  const energyAvg = latest.energyAvg;
  const adherenceScore = latest.adherenceScore;
  const experience = inputs.profile.trainingExperience || "intermediate";

  if (workoutAdh != null && workoutAdh < 60) {
    m.volumeMultiplier = 0.85;
    m.complexityLevel = "simple";
    m.cardioBias = "lower";
    decisions.push({
      code: "LOW_WORKOUT_ADHERENCE_SIMPLIFY",
      severity: "adjust",
      message: "Workout adherence below 60%, simplifying volume and complexity.",
    });
  } else if (workoutAdh != null && workoutAdh > 85 && (energyAvg == null || energyAvg >= 80)) {
    m.volumeMultiplier = 1.05;
    if (experience !== "beginner") {
      m.complexityLevel = "advanced";
    }
    decisions.push({
      code: "HIGH_WORKOUT_ADHERENCE_PROGRESS",
      severity: "info",
      message: "High workout adherence with good energy, progressing.",
    });
  }

  if (mealAdh != null && mealAdh < 60) {
    m.simplifyMeals = true;
    m.complexityLevel = "simple";
    decisions.push({
      code: "LOW_MEAL_ADHERENCE_SIMPLIFY_MEALS",
      severity: "adjust",
      message: "Meal adherence below 60%, simplifying meals.",
    });
  }

  if (energyAvg != null && energyAvg <= 40) {
    if (adherenceScore >= 70) {
      m.recoveryBias = "higher";
      m.intensityCapRPE = 7;
      m.deloadWeek = true;
      m.volumeMultiplier = Math.min(m.volumeMultiplier, 0.9);
      m.cardioBias = "lower";
      decisions.push({
        code: "FATIGUE_RISK_DELOAD",
        severity: "adjust",
        message: "Low energy with decent adherence — deload week triggered.",
      });
    } else {
      m.recoveryBias = "higher";
      m.intensityCapRPE = 7;
      m.complexityLevel = "simple";
      decisions.push({
        code: "LOW_ENERGY_SIMPLIFY",
        severity: "adjust",
        message: "Low energy and low adherence — simplifying plan.",
      });
    }
  }

  const goal = inputs.profile.primaryGoal;
  const summaries = inputs.last2Summaries;
  if (goal === "weight_loss" && summaries.length >= 2) {
    const bothStalled = summaries.every(
      (s) => s.weightDeltaKg != null && s.weightDeltaKg >= -0.05
    );
    const bothAdherent = summaries.every((s) => s.adherenceScore >= 70);
    if (bothStalled && bothAdherent) {
      m.nutritionCalorieDeltaKcal = -150;
      m.cardioBias = "higher";
      decisions.push({
        code: "STALL_WEIGHT_LOSS_ADJUST",
        severity: "adjust",
        message: "Weight loss stalled for 2 weeks — adjusting calories and cardio.",
      });
    }
  }
  if (goal === "muscle_gain" && summaries.length >= 2) {
    const bothStalled = summaries.every(
      (s) => s.weightDeltaKg != null && s.weightDeltaKg <= 0.05
    );
    const bothAdherent = summaries.every((s) => s.adherenceScore >= 70);
    if (bothStalled && bothAdherent) {
      m.nutritionCalorieDeltaKcal = 150;
      decisions.push({
        code: "STALL_MUSCLE_GAIN_ADJUST",
        severity: "adjust",
        message: "Muscle gain stalled for 2 weeks — nudging calories up.",
      });
    }
  }

  const pace = inputs.pace || "steady";
  if (pace === "gentle") {
    m.nutritionCalorieDeltaKcal = Math.max(-100, Math.min(100, m.nutritionCalorieDeltaKcal));
    m.volumeMultiplier = Math.min(m.volumeMultiplier, 1.05);
    if (m.recoveryBias === "normal") m.recoveryBias = "normal";
  } else if (pace === "steady") {
    m.nutritionCalorieDeltaKcal = Math.max(-200, Math.min(200, m.nutritionCalorieDeltaKcal));
    m.volumeMultiplier = Math.min(m.volumeMultiplier, 1.10);
  } else if (pace === "aggressive") {
    m.nutritionCalorieDeltaKcal = Math.max(-300, Math.min(300, m.nutritionCalorieDeltaKcal));
    m.volumeMultiplier = Math.min(m.volumeMultiplier, 1.15);
  }

  m.volumeMultiplier = Math.max(0.85, Math.min(1.15, m.volumeMultiplier));

  return { modifiers: m, decisions };
}
