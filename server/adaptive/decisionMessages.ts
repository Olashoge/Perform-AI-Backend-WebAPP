const DECISION_MESSAGE_MAP: Record<string, string> = {
  LOW_WORKOUT_ADHERENCE_SIMPLIFY:
    "Your recent workout consistency was lower, so we simplified this week.",
  HIGH_WORKOUT_ADHERENCE_PROGRESS:
    "Strong consistency allowed a small progression this week.",
  LOW_MEAL_ADHERENCE_SIMPLIFY_MEALS:
    "Meal consistency was lower, so recipes are simpler this week.",
  FATIGUE_RISK_DELOAD:
    "Energy levels were low, so this week emphasizes recovery.",
  LOW_ENERGY_SIMPLIFY:
    "Energy was low and consistency dipped, so we kept things simple this week.",
  STALL_WEIGHT_LOSS_ADJUST:
    "Weight progress slowed, so calories and conditioning were adjusted.",
  STALL_MUSCLE_GAIN_ADJUST:
    "Weight gain slowed, so calories were nudged up slightly.",
  HIGH_PLAN_VOLATILITY_SIMPLIFY:
    "You made many plan changes recently, so we streamlined this week.",
  BASELINE:
    "This plan is based on your profile and goals.",
};

export function mapAdaptiveDecisionToMessage(decisionCode: string): string {
  return DECISION_MESSAGE_MAP[decisionCode] || decisionCode;
}

export function getBaselineMessage(): string {
  return DECISION_MESSAGE_MAP.BASELINE;
}
