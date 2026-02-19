import type { RuleContext, RuleResult, SafeSpec } from "../types";

const HOME_BODYWEIGHT_EXERCISES = [
  "push-ups", "squats", "lunges", "planks", "mountain climbers",
  "burpees", "jumping jacks", "high knees", "glute bridges",
  "superman", "bicycle crunches", "leg raises", "wall sit",
  "calf raises", "tricep dips", "pike push-ups",
];

const HOME_EQUIPMENT_ALLOWED = [
  "dumbbell", "resistance band", "kettlebell", "pull-up bar",
  "yoga mat", "foam roller", "jump rope", "stability ball",
];

const GYM_EQUIPMENT = [
  ...HOME_EQUIPMENT_ALLOWED,
  "barbell", "cable", "machine", "smith machine",
  "lat pulldown", "leg press", "hack squat",
];

export function evaluateEquipmentRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};

  const workoutPrefs = ctx.workoutPreferences;
  if (!workoutPrefs || ctx.planKind === "meal") {
    return { violations, specPatch };
  }

  const location = workoutPrefs.location || "gym";

  if (location === "home_none") {
    specPatch.equipmentRestriction = "home_bodyweight";
    specPatch.allowedEquipment = [];
    specPatch.bannedExerciseTags = ["barbell", "cable", "machine"];
    specPatch.bannedExercisesExact = [
      "barbell back squat", "barbell bench press", "barbell deadlift",
      "lat pulldown", "cable fly", "leg press", "smith machine squat",
      "hack squat", "cable row",
    ];
    violations.push({
      ruleKey: "EQUIPMENT_HOME_BODYWEIGHT",
      category: "EQUIPMENT",
      severity: "ADJUST",
      message: "Plan restricted to bodyweight-only exercises (no equipment at home).",
      metadata: { location, allowedExerciseTypes: HOME_BODYWEIGHT_EXERCISES },
    });
  } else if (location === "home_equipment") {
    specPatch.equipmentRestriction = "home_equipment";
    specPatch.allowedEquipment = HOME_EQUIPMENT_ALLOWED;
    specPatch.bannedExerciseTags = ["barbell", "cable", "machine"];
    specPatch.bannedExercisesExact = [
      "barbell back squat", "barbell bench press", "barbell deadlift",
      "lat pulldown", "cable fly", "leg press", "smith machine squat",
      "hack squat", "cable row",
    ];
    violations.push({
      ruleKey: "EQUIPMENT_HOME_LIMITED",
      category: "EQUIPMENT",
      severity: "ADJUST",
      message: "Plan restricted to home equipment (dumbbells, bands, kettlebells, etc.).",
      metadata: { location, allowedEquipment: HOME_EQUIPMENT_ALLOWED },
    });
  } else if (location === "outdoor") {
    specPatch.equipmentRestriction = "outdoor";
    specPatch.allowedEquipment = [];
    specPatch.bannedExerciseTags = ["barbell", "cable", "machine"];
    violations.push({
      ruleKey: "EQUIPMENT_OUTDOOR",
      category: "EQUIPMENT",
      severity: "ADJUST",
      message: "Plan restricted to outdoor-friendly exercises (bodyweight, running, etc.).",
      metadata: { location },
    });
  } else {
    specPatch.equipmentRestriction = location === "mixed" ? "any" : "gym";
    specPatch.allowedEquipment = GYM_EQUIPMENT;
  }

  return { violations, specPatch };
}
