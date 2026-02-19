import type { RuleContext, RuleResult, SafeSpec } from "../types";

interface InjuryMapping {
  keywords: string[];
  bannedTags: string[];
  bannedExercises: string[];
  swapHints: Record<string, string[]>;
}

const INJURY_MAPPINGS: InjuryMapping[] = [
  {
    keywords: ["acl", "knee", "meniscus", "knee pain", "patella"],
    bannedTags: ["highImpact", "deepKneeFlexionLoaded", "jumping", "plyometric"],
    bannedExercises: [
      "barbell back squat", "barbell front squat", "jump rope", "box jumps",
      "jumping lunges", "jump squats", "depth jumps", "burpees",
      "pistol squats", "sissy squats",
    ],
    swapHints: {
      "barbell back squat": ["leg press", "wall sit", "goblet squat (partial ROM)"],
      "jump rope": ["stationary bike", "rowing machine", "elliptical"],
      "box jumps": ["step-ups", "glute bridges"],
      "burpees": ["modified burpees (no jump)", "mountain climbers (slow)"],
    },
  },
  {
    keywords: ["shoulder", "rotator cuff", "shoulder pain", "shoulder impingement", "labrum"],
    bannedTags: ["overheadPress", "overhead", "snatch"],
    bannedExercises: [
      "barbell overhead press", "military press", "snatch", "clean and jerk",
      "behind-the-neck press", "upright row", "kipping pull-ups",
      "handstand push-ups", "dumbbell overhead press",
    ],
    swapHints: {
      "barbell overhead press": ["landmine press", "cable lateral raise"],
      "snatch": ["dumbbell row", "face pulls"],
      "kipping pull-ups": ["lat pulldown", "band-assisted pull-ups"],
    },
  },
  {
    keywords: ["lower back", "back pain", "lumbar", "herniated disc", "sciatica", "spinal"],
    bannedTags: ["heavyHinge", "spinalLoading", "heavyCompression"],
    bannedExercises: [
      "barbell deadlift", "conventional deadlift", "sumo deadlift",
      "good mornings", "barbell row (heavy)", "barbell back squat",
      "t-bar row", "romanian deadlift (heavy)",
    ],
    swapHints: {
      "barbell deadlift": ["hip thrust", "cable pull-through", "trap bar deadlift (light)"],
      "barbell back squat": ["leg press", "goblet squat", "belt squat"],
      "good mornings": ["bird dog", "glute bridge", "back extension (bodyweight)"],
    },
  },
  {
    keywords: ["wrist", "carpal tunnel", "wrist pain"],
    bannedTags: ["heavyGrip", "wristLoading"],
    bannedExercises: [
      "barbell bench press", "front squat (clean grip)", "handstand push-ups",
      "heavy farmer's walk",
    ],
    swapHints: {
      "barbell bench press": ["dumbbell bench press (neutral grip)", "machine chest press"],
    },
  },
  {
    keywords: ["hip", "hip pain", "hip impingement", "hip flexor"],
    bannedTags: ["deepHipFlexion", "highImpact"],
    bannedExercises: [
      "deep squats", "pistol squats", "barbell hip thrust (heavy)",
      "jumping lunges",
    ],
    swapHints: {
      "deep squats": ["box squat (parallel)", "leg press"],
    },
  },
  {
    keywords: ["ankle", "achilles", "ankle sprain", "plantar fasciitis"],
    bannedTags: ["highImpact", "jumping", "calf intensive"],
    bannedExercises: [
      "box jumps", "jump rope", "sprints", "calf raises (heavy)",
      "jumping lunges",
    ],
    swapHints: {
      "box jumps": ["step-ups", "seated leg press"],
      "jump rope": ["stationary bike", "swimming"],
    },
  },
];

export function evaluateInjuryRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};

  const healthConstraints = (ctx.profile.healthConstraints as string[]) || [];
  const allConditions = healthConstraints.map(c => c.toLowerCase());

  if (allConditions.length === 0) return { violations, specPatch };

  const bannedTags = new Set<string>();
  const bannedExercises = new Set<string>();
  const swapHints: Record<string, string[]> = {};

  for (const condition of allConditions) {
    for (const mapping of INJURY_MAPPINGS) {
      const matched = mapping.keywords.some(kw => condition.includes(kw));
      if (matched) {
        mapping.bannedTags.forEach(t => bannedTags.add(t));
        mapping.bannedExercises.forEach(e => bannedExercises.add(e));
        Object.entries(mapping.swapHints).forEach(([k, v]) => {
          swapHints[k] = v;
        });
      }
    }
  }

  if (bannedTags.size > 0 || bannedExercises.size > 0) {
    violations.push({
      ruleKey: "INJURY_RESTRICTIONS",
      category: "INJURY",
      severity: "ADJUST",
      message: `Adjusted plan based on reported conditions: ${allConditions.join(", ")}. Certain exercises and movement patterns have been restricted.`,
      metadata: {
        conditions: allConditions,
        bannedTags: Array.from(bannedTags),
        bannedExercises: Array.from(bannedExercises),
        swapHintsCount: Object.keys(swapHints).length,
      },
    });

    specPatch.bannedExerciseTags = Array.from(bannedTags);
    specPatch.bannedExercisesExact = Array.from(bannedExercises);
    specPatch.swapHints = swapHints;
  }

  return { violations, specPatch };
}
