import type { AdaptiveModifiers, AdaptiveDecision } from "./types";

export function buildAdaptivePromptBlock(
  modifiers: AdaptiveModifiers,
  decisions: AdaptiveDecision[],
): string {
  const parts: string[] = [];

  parts.push(`\n\n--- ADAPTIVE MODIFIERS (apply exactly) ---`);
  parts.push(`Volume multiplier: ${modifiers.volumeMultiplier} (scale sets/reps by this factor)`);
  parts.push(`Intensity cap RPE: ${modifiers.intensityCapRPE} (do not exceed this RPE)`);
  parts.push(`Cardio bias: ${modifiers.cardioBias}`);
  parts.push(`Recovery bias: ${modifiers.recoveryBias}`);
  parts.push(`Complexity level: ${modifiers.complexityLevel}`);

  if (modifiers.nutritionCalorieDeltaKcal !== 0) {
    const sign = modifiers.nutritionCalorieDeltaKcal > 0 ? "+" : "";
    parts.push(`Nutrition calorie adjustment: ${sign}${modifiers.nutritionCalorieDeltaKcal} kcal/day from baseline`);
  }
  if (modifiers.trainingDayCarbBias !== "normal") {
    parts.push(`Training day carb bias: ${modifiers.trainingDayCarbBias}`);
  }
  if (modifiers.simplifyMeals) {
    parts.push(`SIMPLIFY MEALS: Use fewer ingredients (max 8), shorter prep (max 20 min), and allow repeating meals across days.`);
  }
  if (modifiers.deloadWeek) {
    parts.push(`DELOAD WEEK: Reduce overall training volume and intensity. Focus on technique, mobility, and active recovery. Limit sets to 2 per exercise. Include extra stretching.`);
  }

  if (decisions.length > 0) {
    parts.push(`\nWHY these adjustments:`);
    for (const d of decisions) {
      parts.push(`- [${d.code}] ${d.message}`);
    }
  }

  parts.push(`--- END ADAPTIVE MODIFIERS ---`);

  return parts.join("\n");
}
