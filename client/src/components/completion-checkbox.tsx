import { Check } from "lucide-react";
import type { ToggleCompletionInput } from "@shared/schema";

interface CompletionCheckboxProps {
  date: string;
  itemType: "meal" | "workout";
  sourceType: "meal_plan" | "workout_plan" | "daily_meal" | "daily_workout";
  sourceId: string;
  itemKey: string;
  completed: boolean;
  onToggle: (input: ToggleCompletionInput) => void;
  size?: "sm" | "md";
}

export function CompletionCheckbox({
  date,
  itemType,
  sourceType,
  sourceId,
  itemKey,
  completed,
  onToggle,
  size = "sm",
}: CompletionCheckboxProps) {
  const dim = size === "sm" ? "w-5 h-5" : "w-6 h-6";
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle({ date, itemType, sourceType, sourceId, itemKey, completed: !completed });
      }}
      className={`${dim} rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
        completed
          ? "bg-primary border-primary text-primary-foreground"
          : "border-muted-foreground/30 hover:border-primary/50"
      }`}
      data-testid={`completion-${itemType}-${itemKey}-${date}`}
      aria-label={`Mark ${itemKey} as ${completed ? "incomplete" : "complete"}`}
    >
      {completed && <Check className={iconSize} />}
    </button>
  );
}
