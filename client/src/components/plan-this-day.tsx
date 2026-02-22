import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  UtensilsCrossed, Dumbbell, Loader2, Check, Sparkles, Ban,
} from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";

interface PlanThisDayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  hasMeal?: boolean;
  hasWorkout?: boolean;
}

function invalidateDailyQueries() {
  queryClient.invalidateQueries({ predicate: (q) => {
    const key = q.queryKey[0] as string;
    return key?.startsWith("/api/daily-coverage") || key?.startsWith("/api/daily-meals") || key?.startsWith("/api/daily-workouts") || key?.startsWith("/api/week-data") || key?.startsWith("/api/weekly-summary");
  }});
}

export function PlanThisDay({ open, onOpenChange, date, hasMeal, hasWorkout }: PlanThisDayProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [mealsPerDay, setMealsPerDay] = useState<"2" | "3">("3");
  const dateStr = format(date, "yyyy-MM-dd");
  const dateLabel = format(date, "EEEE, MMMM d");
  const isPast = isBefore(date, startOfDay(new Date()));

  const mealMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/daily-meal", {
        date: dateStr,
        mealsPerDay: Number(mealsPerDay),
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Generating meals", description: `Your daily meal plan for ${dateLabel} is being created.` });
      invalidateDailyQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/daily-meal", dateStr] });
      onOpenChange(false);
      navigate(`/daily-meal/${dateStr}`);
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("profileRequired")) {
        toast({ title: "Profile required", description: "Please complete your profile first.", variant: "destructive" });
        navigate("/profile");
        return;
      }
      if (msg.includes("409") || msg.includes("already exists")) {
        onOpenChange(false);
        navigate(`/daily-meal/${dateStr}`);
        return;
      }
      toast({ title: "Error", description: "Failed to start meal generation.", variant: "destructive" });
    },
  });

  const workoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/daily-workout", {
        date: dateStr,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Generating workout", description: `Your daily workout for ${dateLabel} is being created.` });
      invalidateDailyQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/daily-workout", dateStr] });
      onOpenChange(false);
      navigate(`/daily-workout/${dateStr}`);
    },
    onError: (err: any) => {
      const msg = err?.message || "";
      if (msg.includes("profileRequired")) {
        toast({ title: "Profile required", description: "Please complete your profile first.", variant: "destructive" });
        navigate("/profile");
        return;
      }
      if (msg.includes("409") || msg.includes("already exists")) {
        onOpenChange(false);
        navigate(`/daily-workout/${dateStr}`);
        return;
      }
      toast({ title: "Error", description: "Failed to start workout generation.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" data-testid="sheet-plan-this-day">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg font-bold" data-testid="text-plan-day-title">
            Plan {dateLabel}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Generate daily meal or workout plans for {dateLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isPast && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3" data-testid="past-day-notice">
              <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">Past days are view-only. You can only create plans for today or future dates.</p>
            </div>
          )}
          <div className="rounded-xl border p-4" data-testid="section-daily-meal">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <UtensilsCrossed className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Daily Meals</div>
                <div className="text-xs text-muted-foreground">AI-generated meals for this day</div>
              </div>
              {hasMeal && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>Ready</span>
                </div>
              )}
            </div>

            {hasMeal ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { onOpenChange(false); navigate(`/daily-meal/${dateStr}`); }}
                data-testid="button-view-daily-meal"
              >
                View Meals
              </Button>
            ) : (
              <>
                <div className="mb-3">
                  <Label className="text-xs text-muted-foreground mb-2 block">Meals per day</Label>
                  <RadioGroup value={mealsPerDay} onValueChange={(v) => setMealsPerDay(v as "2" | "3")} className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="3" id="meals-3" data-testid="radio-meals-3" />
                      <Label htmlFor="meals-3" className="text-sm cursor-pointer">3 meals</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="2" id="meals-2" data-testid="radio-meals-2" />
                      <Label htmlFor="meals-2" className="text-sm cursor-pointer">2 meals</Label>
                    </div>
                  </RadioGroup>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => mealMutation.mutate()}
                  disabled={mealMutation.isPending || isPast}
                  data-testid="button-generate-daily-meal"
                >
                  {mealMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Meals
                </Button>
              </>
            )}
          </div>

          <div className="rounded-xl border p-4" data-testid="section-daily-workout">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Daily Workout</div>
                <div className="text-xs text-muted-foreground">AI-generated workout for this day</div>
              </div>
              {hasWorkout && (
                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <Check className="h-3.5 w-3.5" />
                  <span>Ready</span>
                </div>
              )}
            </div>

            {hasWorkout ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => { onOpenChange(false); navigate(`/daily-workout/${dateStr}`); }}
                data-testid="button-view-daily-workout"
              >
                View Workout
              </Button>
            ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={() => workoutMutation.mutate()}
                disabled={workoutMutation.isPending || isPast}
                data-testid="button-generate-daily-workout"
              >
                {workoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Workout
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
