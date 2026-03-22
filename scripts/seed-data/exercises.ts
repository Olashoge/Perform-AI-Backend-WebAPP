// Curated exercise seed data.
// Each entry maps to one row in the exercises table.
// Optional `aliases` array maps to rows in exercise_aliases.
//
// Fields required per entry:
//   canonicalName, displayName, normalizedCanonicalName,
//   category, movementPattern, primaryMuscleGroups, secondaryMuscleGroups,
//   equipmentType, trainingModes, repTrackingMode, isBilateral, isUnilateral,
//   difficultyLevel, reviewStatus, createdBySource
//
// Alias fields:
//   aliasText, normalizedAliasText, source, isPreferred

export const exercises: any[] = [
  // ─── CHEST ────────────────────────────────────────────────────────────────

  {
    canonicalName: "Barbell Bench Press",
    displayName: "Barbell Bench Press",
    normalizedCanonicalName: "barbell bench press",
    category: "strength",
    movementPattern: "push",
    primaryMuscleGroups: ["pectoralis major"],
    secondaryMuscleGroups: ["triceps", "anterior deltoid"],
    equipmentType: "barbell",
    trainingModes: ["strength", "hypertrophy"],
    isBilateral: true,
    isUnilateral: false,
    repTrackingMode: "reps",
    difficultyLevel: "intermediate",
    createdBySource: "curated",
    reviewStatus: "approved",
    aliases: [
      { aliasText: "Bench Press", normalizedAliasText: "bench press", source: "curated", isPreferred: true },
      { aliasText: "Flat Bench Press", normalizedAliasText: "flat bench press", source: "curated", isPreferred: false },
      { aliasText: "BB Bench Press", normalizedAliasText: "bb bench press", source: "curated", isPreferred: false },
    ],
  },

  // ─── BACK ─────────────────────────────────────────────────────────────────

  {
    canonicalName: "Barbell Bent-Over Row",
    displayName: "Barbell Bent-Over Row",
    normalizedCanonicalName: "barbell bent-over row",
    category: "strength",
    movementPattern: "pull",
    primaryMuscleGroups: ["latissimus dorsi", "rhomboids", "middle trapezius"],
    secondaryMuscleGroups: ["biceps", "rear deltoid", "erector spinae"],
    equipmentType: "barbell",
    trainingModes: ["strength", "hypertrophy"],
    isBilateral: true,
    isUnilateral: false,
    repTrackingMode: "reps",
    difficultyLevel: "intermediate",
    createdBySource: "curated",
    reviewStatus: "approved",
    aliases: [
      { aliasText: "Bent Over Row", normalizedAliasText: "bent over row", source: "curated", isPreferred: true },
      { aliasText: "BB Row", normalizedAliasText: "bb row", source: "curated", isPreferred: false },
      { aliasText: "Barbell Row", normalizedAliasText: "barbell row", source: "curated", isPreferred: false },
    ],
  },

  // ─── SHOULDERS ────────────────────────────────────────────────────────────

  {
    canonicalName: "Barbell Overhead Press",
    displayName: "Barbell Overhead Press",
    normalizedCanonicalName: "barbell overhead press",
    category: "strength",
    movementPattern: "push",
    primaryMuscleGroups: ["anterior deltoid", "lateral deltoid"],
    secondaryMuscleGroups: ["triceps", "upper trapezius", "core"],
    equipmentType: "barbell",
    trainingModes: ["strength", "hypertrophy"],
    isBilateral: true,
    isUnilateral: false,
    repTrackingMode: "reps",
    difficultyLevel: "intermediate",
    createdBySource: "curated",
    reviewStatus: "approved",
    aliases: [
      { aliasText: "Overhead Press", normalizedAliasText: "overhead press", source: "curated", isPreferred: true },
      { aliasText: "Military Press", normalizedAliasText: "military press", source: "curated", isPreferred: false },
      { aliasText: "OHP", normalizedAliasText: "ohp", source: "curated", isPreferred: false },
    ],
  },

  // ─── BICEPS ───────────────────────────────────────────────────────────────

  {
    canonicalName: "Barbell Curl",
    displayName: "Barbell Curl",
    normalizedCanonicalName: "barbell curl",
    category: "strength",
    movementPattern: "pull",
    primaryMuscleGroups: ["biceps brachii"],
    secondaryMuscleGroups: ["brachialis", "forearms"],
    equipmentType: "barbell",
    trainingModes: ["strength", "hypertrophy"],
    isBilateral: true,
    isUnilateral: false,
    repTrackingMode: "reps",
    difficultyLevel: "beginner",
    createdBySource: "curated",
    reviewStatus: "approved",
    aliases: [
      { aliasText: "BB Curl", normalizedAliasText: "bb curl", source: "curated", isPreferred: false },
      { aliasText: "Standing Barbell Curl", normalizedAliasText: "standing barbell curl", source: "curated", isPreferred: false },
      { aliasText: "Straight Bar Curl", normalizedAliasText: "straight bar curl", source: "curated", isPreferred: false },
    ],
  },

  // ─── TRICEPS ──────────────────────────────────────────────────────────────

  {
    canonicalName: "Cable Rope Triceps Pushdown",
    displayName: "Cable Rope Triceps Pushdown",
    normalizedCanonicalName: "cable rope triceps pushdown",
    category: "strength",
    movementPattern: "push",
    primaryMuscleGroups: ["triceps brachii"],
    secondaryMuscleGroups: [],
    equipmentType: "cable",
    trainingModes: ["hypertrophy"],
    isBilateral: true,
    isUnilateral: false,
    repTrackingMode: "reps",
    difficultyLevel: "beginner",
    createdBySource: "curated",
    reviewStatus: "approved",
    aliases: [
      { aliasText: "Rope Pushdown", normalizedAliasText: "rope pushdown", source: "curated", isPreferred: true },
      { aliasText: "Tricep Rope Pushdown", normalizedAliasText: "tricep rope pushdown", source: "curated", isPreferred: false },
      { aliasText: "Cable Rope Pressdown", normalizedAliasText: "cable rope pressdown", source: "curated", isPreferred: false },
    ],
  },
];
