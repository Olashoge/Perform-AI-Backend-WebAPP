import type { RuleContext, RuleResult, SafeSpec } from "../types";

export function evaluateScheduleRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};

  if (!ctx.startDate) {
    return { violations, specPatch };
  }

  const startDate = ctx.startDate;
  const endDate = ctx.endDate || (() => {
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  })();

  const blockedDates: string[] = [];

  const scheduledMealDates = ctx.existingScheduledMealDates || [];
  const scheduledWorkoutDates = ctx.existingScheduledWorkoutDates || [];

  const planDates: string[] = [];
  const sd = new Date(startDate + "T00:00:00");
  const ed = new Date(endDate + "T00:00:00");
  for (let d = new Date(sd); d <= ed; d.setDate(d.getDate() + 1)) {
    planDates.push(d.toISOString().split("T")[0]);
  }

  if (ctx.planKind === "meal" || ctx.planKind === "both") {
    const overlappingMealDates = planDates.filter(d => scheduledMealDates.includes(d));
    if (overlappingMealDates.length > 0) {
      violations.push({
        ruleKey: "SCHEDULE_MEAL_OVERLAP",
        category: "SCHEDULE",
        severity: "WARN",
        message: `The selected date range overlaps with ${overlappingMealDates.length} existing meal plan date(s). The new plan will replace the overlapping dates.`,
        metadata: { overlappingDates: overlappingMealDates },
      });
    }
  }

  if (ctx.planKind === "workout" || ctx.planKind === "both") {
    const overlappingWorkoutDates = planDates.filter(d => scheduledWorkoutDates.includes(d));
    if (overlappingWorkoutDates.length > 0) {
      violations.push({
        ruleKey: "SCHEDULE_WORKOUT_OVERLAP",
        category: "SCHEDULE",
        severity: "WARN",
        message: `The selected date range overlaps with ${overlappingWorkoutDates.length} existing workout plan date(s). The new plan will replace the overlapping dates.`,
        metadata: { overlappingDates: overlappingWorkoutDates },
      });
    }
  }

  specPatch.scheduleConstraints = {
    noOverlapPolicy: true,
    blockedStartDates: blockedDates,
  };

  return { violations, specPatch };
}
