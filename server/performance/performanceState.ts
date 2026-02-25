export type PerformanceLabel =
  | "on_track"
  | "building_momentum"
  | "recovering"
  | "at_risk"
  | "declining";

export interface PerformanceState {
  pcs: number;
  label: PerformanceLabel;
  deltaPoints: number;
  deltaNorm01: number;
  trendSlope: number;
  trendNorm01: number;
  streakDays: number;
  explanation: string[];
}

export interface PerformanceStateInput {
  currentWeekOverallScore: number;
  previousWeekOverallScore: number | null;
  last4WeeksOverallScores: number[];
  streakDays: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeTrendSlope(scores: number[]): number {
  const len = scores.length;
  if (len <= 1) return 0;

  if (len === 2) {
    return scores[1] - scores[0];
  }

  if (len === 3) {
    return (scores[2] - scores[0]) / 2;
  }

  return ((-1.5 * scores[0]) + (-0.5 * scores[1]) + (0.5 * scores[2]) + (1.5 * scores[3])) / 5;
}

function buildExplanation(
  currentScore: number,
  deltaPoints: number,
  trendSlope: number,
  streakDays: number,
): string[] {
  const lines: string[] = [];

  if (deltaPoints < -10) {
    lines.push("Performance dropped vs last week.");
  } else if (deltaPoints > 10) {
    lines.push("Performance improved vs last week.");
  } else if (deltaPoints !== 0 && deltaPoints > 0) {
    lines.push("Slight improvement over last week.");
  } else if (deltaPoints !== 0 && deltaPoints < 0) {
    lines.push("Slight dip from last week.");
  }

  if (trendSlope < -3) {
    lines.push("4-week trend is declining.");
  } else if (trendSlope > 3) {
    lines.push("4-week trend is improving.");
  }

  if (currentScore < 40) {
    lines.push("Overall adherence is low this week.");
  } else if (currentScore >= 80) {
    lines.push("Strong adherence this week.");
  }

  if (streakDays >= 5) {
    lines.push("You have momentum from a strong streak.");
  } else if (streakDays === 0) {
    lines.push("No active completion streak.");
  }

  if (lines.length < 2) {
    lines.push("Keep going — consistency builds results.");
  }

  return lines.slice(0, 4);
}

function labelFromPcs(pcs: number): PerformanceLabel {
  if (pcs >= 0.75) return "on_track";
  if (pcs >= 0.60) return "building_momentum";
  if (pcs >= 0.45) return "recovering";
  if (pcs >= 0.30) return "at_risk";
  return "declining";
}

export function computePerformanceState(input: PerformanceStateInput): PerformanceState {
  const { currentWeekOverallScore, previousWeekOverallScore, last4WeeksOverallScores, streakDays } = input;

  const weeklyNorm = currentWeekOverallScore / 100;

  let deltaPoints: number;
  let deltaNorm01: number;
  if (previousWeekOverallScore == null) {
    deltaPoints = 0;
    deltaNorm01 = 0.5;
  } else {
    deltaPoints = currentWeekOverallScore - previousWeekOverallScore;
    const deltaClamped = clamp(deltaPoints, -25, 25);
    deltaNorm01 = (deltaClamped + 25) / 50;
  }

  const trendSlope = computeTrendSlope(last4WeeksOverallScores);
  const slopeClamped = clamp(trendSlope, -10, 10);
  const trendNorm01 = (slopeClamped + 10) / 20;

  const streakNorm01 = Math.min(streakDays, 7) / 7;

  const pcs = 0.45 * weeklyNorm + 0.25 * deltaNorm01 + 0.20 * trendNorm01 + 0.10 * streakNorm01;

  const roundedPcs = Math.round(pcs * 1000) / 1000;

  const explanation = buildExplanation(currentWeekOverallScore, deltaPoints, trendSlope, streakDays);

  return {
    pcs: roundedPcs,
    label: labelFromPcs(roundedPcs),
    deltaPoints,
    deltaNorm01: Math.round(deltaNorm01 * 1000) / 1000,
    trendSlope: Math.round(trendSlope * 100) / 100,
    trendNorm01: Math.round(trendNorm01 * 1000) / 1000,
    streakDays,
    explanation,
  };
}
