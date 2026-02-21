import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { MealPlan, WorkoutPlan, PlanOutput, WorkoutPlanOutput, Meal, WorkoutSession, WeeklyCheckIn } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Dumbbell, UtensilsCrossed,
  ClipboardCheck, ArrowRight, Plus,
} from "lucide-react";
import { format, startOfWeek, addDays, isWithinInterval, isSameDay } from "date-fns";
import { PlanThisDay } from "@/components/plan-this-day";
import { CompletionCheckbox } from "@/components/completion-checkbox";
import { useCompletions, useWeeklyAdherence } from "@/hooks/use-completions";
import { WeeklyScorecard } from "@/components/weekly-scorecard";


function isActivePlan(startDate: string | null | undefined, referenceDate: Date): boolean {
  if (!startDate) return false;
  const planStart = new Date(startDate + "T00:00:00");
  const planEnd = addDays(planStart, 6);
  return isWithinInterval(referenceDate, { start: planStart, end: planEnd });
}

const DAY_ABBR_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ABBR_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface AllCalendarData {
  mealSlots: string[];
  days: { date: string; meals: Record<string, Meal>; planIds?: string[] }[];
}

interface WorkoutCalendarDay {
  date: string;
  isWorkoutDay: boolean;
  session: WorkoutSession | null;
  workoutPlanId: string;
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: mealPlans } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const { data: workoutPlans } = useQuery<WorkoutPlan[]>({
    queryKey: ["/api/workouts"],
    enabled: !!user,
  });

  const { data: checkIns } = useQuery<WeeklyCheckIn[]>({
    queryKey: ["/api/check-ins", "all"],
    queryFn: async () => {
      const res = await fetch("/api/check-ins", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: calendarData } = useQuery<AllCalendarData>({
    queryKey: ["/api/calendar/all"],
    enabled: !!user,
  });

  const { data: workoutCalendarData } = useQuery<{ days: WorkoutCalendarDay[] }>({
    queryKey: ["/api/calendar/workouts"],
    enabled: !!user,
  });

  const weekStartsOn: 0 | 1 = (() => {
    try {
      const stored = localStorage.getItem("cal_weekStart");
      return stored === "1" ? 1 : 0;
    } catch { return 0 as const; }
  })();

  const now = new Date();
  const baseWeekStart = startOfWeek(now, { weekStartsOn });
  const weekStart = addDays(baseWeekStart, weekOffset * 7);
  const weekEnd = addDays(weekStart, 6);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  const { isCompleted, toggle } = useCompletions(weekStartStr, weekEndStr, !!user);
  const { data: weeklyAdherence } = useWeeklyAdherence(weekStartStr, weekEndStr, !!user);

  const { data: dailyCoverage } = useQuery<Record<string, { meal: boolean; workout: boolean }>>({
    queryKey: ["/api/daily-coverage", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-coverage?start=${weekStartStr}&end=${weekEndStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: dailyMealsRange } = useQuery<any[]>({
    queryKey: ["/api/daily-meals", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-meals?start=${weekStartStr}&end=${weekEndStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: dailyWorkoutsRange } = useQuery<any[]>({
    queryKey: ["/api/daily-workouts", weekStartStr, weekEndStr],
    queryFn: async () => {
      const res = await fetch(`/api/daily-workouts?start=${weekStartStr}&end=${weekEndStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const stats = useMemo(() => {
    const activeMeals = (mealPlans || []).filter(p => !p.deletedAt && p.status === "ready" && isActivePlan(p.planStartDate, now));
    const activeWorkouts = (workoutPlans || []).filter(p => !p.deletedAt && p.status === "ready" && isActivePlan(p.planStartDate, now));
    return { activeMeals, activeWorkouts };
  }, [mealPlans, workoutPlans, now]);


  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const dayMeals = useMemo(() => {
    if (!calendarData?.days) return null;
    return calendarData.days.find(d => d.date === selectedDateStr);
  }, [calendarData, selectedDateStr]);

  const dayWorkout = useMemo(() => {
    if (!workoutCalendarData?.days) return null;
    return workoutCalendarData.days.find(d => d.date === selectedDateStr && d.isWorkoutDay);
  }, [workoutCalendarData, selectedDateStr]);

  const selectedDailyMeal = useMemo(() => {
    if (!dailyMealsRange) return null;
    return dailyMealsRange.find(m => m.date === selectedDateStr && m.status === "ready") || null;
  }, [dailyMealsRange, selectedDateStr]);

  const selectedDailyWorkout = useMemo(() => {
    if (!dailyWorkoutsRange) return null;
    return dailyWorkoutsRange.find(w => w.date === selectedDateStr && w.status === "ready") || null;
  }, [dailyWorkoutsRange, selectedDateStr]);

  function hasMealsOnDate(date: Date): boolean {
    const ds = format(date, "yyyy-MM-dd");
    const fromPlan = calendarData?.days?.some(d => d.date === ds && Object.keys(d.meals).length > 0) ?? false;
    const fromDaily = dailyCoverage?.[ds]?.meal ?? false;
    return fromPlan || fromDaily;
  }

  function hasWorkoutOnDate(date: Date): boolean {
    const ds = format(date, "yyyy-MM-dd");
    const fromPlan = workoutCalendarData?.days?.some(d => d.date === ds && d.isWorkoutDay) ?? false;
    const fromDaily = dailyCoverage?.[ds]?.workout ?? false;
    return fromPlan || fromDaily;
  }

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{format(now, "EEEE, MMMM d")}</p>
        </div>
      </div>

      <WeeklyScorecard
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekStartStr={weekStartStr}
        weekEndStr={weekEndStr}
        enabled={!!user}
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <Card className="mb-6" data-testid="card-week-strip">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Week of</div>
                  <div className="text-base sm:text-lg font-bold truncate">{format(weekStart, "MMMM d, yyyy")}</div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => { setWeekOffset(o => o - 1); setSelectedDate(d => addDays(d, -7)); }} data-testid="button-prev-week">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setWeekOffset(0); setSelectedDate(now); }} data-testid="button-today">
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setWeekOffset(o => o + 1); setSelectedDate(d => addDays(d, 7)); }} data-testid="button-next-week">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((day, i) => {
                  const isSelected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, now);
                  const hasMeals = hasMealsOnDate(day);
                  const hasWorkout = hasWorkoutOnDate(day);
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(day)}
                      className={`flex flex-col items-center py-2 px-1 rounded-lg transition-colors ${
                        isSelected
                          ? "bg-foreground text-background"
                          : isToday
                          ? "bg-primary/10"
                          : "hover:bg-muted/50"
                      }`}
                      data-testid={`day-${format(day, "yyyy-MM-dd")}`}
                    >
                      <span className={`text-xs mb-1 ${isSelected ? "text-background/70" : "text-muted-foreground"}`}>
                        {(weekStartsOn === 1 ? DAY_ABBR_MON : DAY_ABBR_SUN)[i]}
                      </span>
                      <span className={`text-lg font-semibold ${isSelected ? "" : ""}`}>
                        {format(day, "d")}
                      </span>
                      <div className="flex items-center gap-1 mt-1 h-3">
                        {hasMeals && (
                          <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-amber-300" : "bg-amber-500"}`} />
                        )}
                        {hasWorkout && (
                          <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-teal-300" : "bg-teal-500"}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <h2 className="text-lg font-bold mb-4" data-testid="text-selected-date">
            {format(selectedDate, "EEEE, MMMM d")}
          </h2>

          {dayMeals && Object.keys(dayMeals.meals).length > 0 && (
            <Card className="mb-4" data-testid="card-day-nutrition">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="font-semibold">Nutrition</div>
                    <div className="text-xs text-muted-foreground">Tap a meal to view details</div>
                  </div>
                </div>

                <div className="space-y-4">
                  {["breakfast", "lunch", "dinner"].map(slot => {
                    const meal = dayMeals.meals[slot];
                    if (!meal) return null;
                    const planId = dayMeals.planIds?.[0];
                    const mealCompleted = planId ? isCompleted(selectedDateStr, "meal", "meal_plan", planId, slot) : false;
                    return (
                      <div
                        key={slot}
                        className={`border-t pt-4 first:border-t-0 first:pt-0 cursor-pointer rounded-md hover-elevate p-2 -mx-2 ${mealCompleted ? "opacity-60" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (planId) {
                            const matchingPlan = (mealPlans || []).find(p => String(p.id) === String(planId));
                            if (matchingPlan?.planStartDate) {
                              const planStart = new Date(matchingPlan.planStartDate + "T00:00:00");
                              const diffDays = Math.round((selectedDate.getTime() - planStart.getTime()) / 86400000);
                              navigate(`/plan/${planId}?scrollTo=day-${diffDays}&meal=${slot}`);
                            } else {
                              navigate(`/plan/${planId}`);
                            }
                          }
                        }}
                        data-testid={`meal-slot-${slot}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider capitalize">{slot}</div>
                          {planId && (
                            <CompletionCheckbox
                              date={selectedDateStr}
                              itemType="meal"
                              sourceType="meal_plan"
                              sourceId={planId}
                              itemKey={slot}
                              completed={mealCompleted}
                              onToggle={toggle}
                            />
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{meal.name}</div>
                            {meal.ingredients && meal.ingredients.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {meal.ingredients.slice(0, 4).join(", ")}{meal.ingredients.length > 4 ? ` +${meal.ingredients.length - 4} more` : ""}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                            {meal.calories && <span className="text-amber-600 dark:text-amber-400">{meal.calories}</span>}
                            {meal.macros?.protein && <span>P: {meal.macros.protein}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {dayWorkout && dayWorkout.session && (
            <Card className={`mb-4 hover-elevate cursor-pointer ${isCompleted(selectedDateStr, "workout", "workout_plan", dayWorkout.workoutPlanId, "workout") ? "opacity-60" : ""}`} onClick={() => navigate(`/workout/${dayWorkout.workoutPlanId}`)} data-testid="card-day-workout">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{dayWorkout.session.title || "Workout"}</div>
                    <div className="text-xs text-muted-foreground">
                      {dayWorkout.session.focus || "Strength"} · {dayWorkout.session.duration || "60 min"}
                    </div>
                  </div>
                  <CompletionCheckbox
                    date={selectedDateStr}
                    itemType="workout"
                    sourceType="workout_plan"
                    sourceId={dayWorkout.workoutPlanId}
                    itemKey="workout"
                    completed={isCompleted(selectedDateStr, "workout", "workout_plan", dayWorkout.workoutPlanId, "workout")}
                    onToggle={toggle}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>

                <div className="space-y-3">
                  {dayWorkout.session.exercises?.map((ex: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-t first:border-t-0 first:pt-0">
                      <div>
                        <div className="text-sm font-medium">{ex.name}</div>
                        {ex.notes && <div className="text-xs text-muted-foreground">{ex.notes}</div>}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {ex.sets && ex.reps && <div>{ex.sets} × {ex.reps}</div>}
                        {ex.time && !ex.sets && <div>{ex.time}</div>}
                        {ex.rest && <div>{ex.rest} rest</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedDailyMeal && selectedDailyMeal.planJson && (
            <Card className="mb-4 hover-elevate cursor-pointer" onClick={() => navigate(`/daily-meal/${selectedDateStr}`)} data-testid="card-daily-meal">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{selectedDailyMeal.generatedTitle || "Daily Meals"}</div>
                    <div className="text-xs text-muted-foreground">Daily plan · Tap to view details</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="space-y-4">
                  {["breakfast", "lunch", "dinner"].map(slot => {
                    const meal = selectedDailyMeal.planJson?.meals?.[slot];
                    if (!meal) return null;
                    const dmCompleted = isCompleted(selectedDateStr, "meal", "daily_meal", selectedDailyMeal.id, slot);
                    return (
                      <div key={slot} className={`border-t pt-4 first:border-t-0 first:pt-0 ${dmCompleted ? "opacity-60" : ""}`} data-testid={`daily-meal-slot-${slot}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider capitalize">{slot}</div>
                          <CompletionCheckbox
                            date={selectedDateStr}
                            itemType="meal"
                            sourceType="daily_meal"
                            sourceId={selectedDailyMeal.id}
                            itemKey={slot}
                            completed={dmCompleted}
                            onToggle={toggle}
                          />
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{meal.name}</div>
                            {meal.ingredients && meal.ingredients.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {meal.ingredients.slice(0, 4).join(", ")}{meal.ingredients.length > 4 ? ` +${meal.ingredients.length - 4} more` : ""}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            {meal.calories && <span className="text-amber-600 dark:text-amber-400">{meal.calories}</span>}
                            {meal.macros?.protein && <span>P: {meal.macros.protein}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedDailyWorkout && selectedDailyWorkout.planJson && (
            <Card className={`mb-4 hover-elevate cursor-pointer ${isCompleted(selectedDateStr, "workout", "daily_workout", selectedDailyWorkout.id, "workout") ? "opacity-60" : ""}`} onClick={() => navigate(`/daily-workout/${selectedDateStr}`)} data-testid="card-daily-workout">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{selectedDailyWorkout.generatedTitle || "Daily Workout"}</div>
                    <div className="text-xs text-muted-foreground">
                      Daily plan{selectedDailyWorkout.planJson.focus ? ` · ${selectedDailyWorkout.planJson.focus}` : ""}{selectedDailyWorkout.planJson.durationMinutes ? ` · ${selectedDailyWorkout.planJson.durationMinutes} min` : ""}
                    </div>
                  </div>
                  <CompletionCheckbox
                    date={selectedDateStr}
                    itemType="workout"
                    sourceType="daily_workout"
                    sourceId={selectedDailyWorkout.id}
                    itemKey="workout"
                    completed={isCompleted(selectedDateStr, "workout", "daily_workout", selectedDailyWorkout.id, "workout")}
                    onToggle={toggle}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
                <div className="space-y-3">
                  {selectedDailyWorkout.planJson.main?.slice(0, 5).map((ex: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-t first:border-t-0 first:pt-0">
                      <div>
                        <div className="text-sm font-medium">{ex.name}</div>
                        {ex.notes && <div className="text-xs text-muted-foreground">{ex.notes}</div>}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {ex.sets && ex.reps && <div>{ex.sets} × {ex.reps}</div>}
                        {ex.time && !ex.sets && <div>{ex.time}</div>}
                      </div>
                    </div>
                  ))}
                  {selectedDailyWorkout.planJson.main?.length > 5 && (
                    <div className="text-xs text-muted-foreground text-center pt-1">+{selectedDailyWorkout.planJson.main.length - 5} more exercises</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {(!dayMeals || Object.keys(dayMeals?.meals || {}).length === 0) && !dayWorkout && !selectedDailyMeal && !selectedDailyWorkout && (
            <Card className="mb-4">
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No meals or workouts scheduled for this day</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSheetOpen(true)}
                  data-testid="button-plan-this-day-empty"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Plan this day
                </Button>
              </CardContent>
            </Card>
          )}

          {(dayMeals && Object.keys(dayMeals?.meals || {}).length > 0 || dayWorkout || selectedDailyMeal || selectedDailyWorkout) && (
            <div className="mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSheetOpen(true)}
                className="text-xs"
                data-testid="button-plan-this-day"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Plan this day
              </Button>
            </div>
          )}
        </div>

        <div className="w-full lg:w-[36rem] shrink-0 space-y-4">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Active Plans</h3>

          {stats.activeMeals.map(mp => {
            const plan = mp.planJson as PlanOutput | null;
            const prefs = mp.preferencesJson as any;
            return (
              <Card key={mp.id} className="hover-elevate cursor-pointer" onClick={() => navigate(`/plan/${mp.id}`)} data-testid={`active-meal-${mp.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{plan?.title || "Meal Plan"}</div>
                      <Badge size="sm" variant="secondary" className="no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 mt-0.5">Active</Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(mp.planStartDate + "T00:00:00"), "MMM d")} → {format(addDays(new Date(mp.planStartDate + "T00:00:00"), 6), "MMM d")}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {stats.activeWorkouts.map(wp => {
            const plan = wp.planJson as WorkoutPlanOutput | null;
            return (
              <Card key={wp.id} className="hover-elevate cursor-pointer" onClick={() => navigate(`/workout/${wp.id}`)} data-testid={`active-workout-${wp.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                      <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{plan?.title || "Workout Plan"}</div>
                      <Badge size="sm" variant="secondary" className="no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 mt-0.5">Active</Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <CalendarDays className="h-3 w-3" />
                    {format(new Date(wp.planStartDate + "T00:00:00"), "MMM d")} → {format(addDays(new Date(wp.planStartDate + "T00:00:00"), 6), "MMM d")}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {stats.activeMeals.length === 0 && stats.activeWorkouts.length === 0 && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-3">No active plans this week</p>
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/calendar")} data-testid="quick-view-week">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold">View Week</div>
            <div className="text-xs text-muted-foreground">See your schedule</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/nutrition")} data-testid="quick-meal-plan">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <UtensilsCrossed className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold">Meal Plan</div>
            <div className="text-xs text-muted-foreground">Adjust nutrition</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/training")} data-testid="quick-workouts">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Dumbbell className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold">Workouts</div>
            <div className="text-xs text-muted-foreground">View training</div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/check-ins")} data-testid="quick-checkin">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold">Check-in</div>
            <div className="text-xs text-muted-foreground">Log progress</div>
          </CardContent>
        </Card>
      </div>

      <PlanThisDay
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        date={selectedDate}
        hasMeal={dailyCoverage?.[selectedDateStr]?.meal}
        hasWorkout={dailyCoverage?.[selectedDateStr]?.workout}
      />
    </div>
  );
}
