import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Meal, WorkoutSession, WeeklyCheckIn } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays, ChevronLeft, ChevronRight,
  Target, UtensilsCrossed, Dumbbell,
  ClipboardCheck, ArrowRight, Plus,
} from "lucide-react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { PlanThisDay } from "@/components/plan-this-day";
import { CompletionCheckbox } from "@/components/completion-checkbox";
import { useCompletions, useWeeklyAdherence } from "@/hooks/use-completions";
import { WeeklyScorecard } from "@/components/weekly-scorecard";


const DAY_ABBR_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_ABBR_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface WeekDataDay {
  date: string;
  meals: Record<string, Meal>;
  planIds: string[];
  workout: WorkoutSession | null;
  workoutPlanId: string | null;
  isWorkoutDay: boolean;
  dailyMeal: { id: string; planJson: any; generatedTitle: string | null } | null;
  dailyWorkout: { id: string; planJson: any; generatedTitle: string | null } | null;
  hasDailyMeal: boolean;
  hasDailyWorkout: boolean;
  completions: any[];
}

interface WeekDataResponse {
  weekStart: string;
  weekEnd: string;
  mealSlots: string[];
  days: WeekDataDay[];
}

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: checkIns } = useQuery<WeeklyCheckIn[]>({
    queryKey: ["/api/check-ins", "all"],
    queryFn: async () => {
      const res = await fetch("/api/check-ins", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
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

  const { data: weekData } = useQuery<WeekDataResponse>({
    queryKey: ["/api/week-data", weekStartStr],
    queryFn: async () => {
      const res = await fetch(`/api/week-data?weekStart=${weekStartStr}&weekStartsOn=${weekStartsOn}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user,
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));



  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  const selectedDay = useMemo(() => {
    if (!weekData?.days) return null;
    return weekData.days.find(d => d.date === selectedDateStr) || null;
  }, [weekData, selectedDateStr]);

  const dayMeals = useMemo(() => {
    if (!selectedDay || Object.keys(selectedDay.meals).length === 0) return null;
    return { date: selectedDay.date, meals: selectedDay.meals, planIds: selectedDay.planIds };
  }, [selectedDay]);

  const dayWorkout = useMemo(() => {
    if (!selectedDay || !selectedDay.isWorkoutDay || !selectedDay.workout) return null;
    return { date: selectedDay.date, isWorkoutDay: true, session: selectedDay.workout, workoutPlanId: selectedDay.workoutPlanId! };
  }, [selectedDay]);

  const selectedDailyMeal = useMemo(() => {
    if (!selectedDay?.dailyMeal) return null;
    return { ...selectedDay.dailyMeal, date: selectedDay.date, status: "ready" as const };
  }, [selectedDay]);

  const selectedDailyWorkout = useMemo(() => {
    if (!selectedDay?.dailyWorkout) return null;
    return { ...selectedDay.dailyWorkout, date: selectedDay.date, status: "ready" as const };
  }, [selectedDay]);

  function hasMealsOnDate(date: Date): boolean {
    const ds = format(date, "yyyy-MM-dd");
    const day = weekData?.days?.find(d => d.date === ds);
    if (!day) return false;
    return Object.keys(day.meals).length > 0 || day.hasDailyMeal;
  }

  function hasWorkoutOnDate(date: Date): boolean {
    const ds = format(date, "yyyy-MM-dd");
    const day = weekData?.days?.find(d => d.date === ds);
    if (!day) return false;
    return day.isWorkoutDay || day.hasDailyWorkout;
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
                        className={`border-t pt-4 first:border-t-0 first:pt-0 rounded-md p-2 -mx-2 ${mealCompleted ? "opacity-60" : ""}`}
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
            <Card className={`mb-4 ${isCompleted(selectedDateStr, "workout", "workout_plan", dayWorkout.workoutPlanId, "workout") ? "opacity-60" : ""}`} data-testid="card-day-workout">
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

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6">
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
        <Card className="hover-elevate cursor-pointer" onClick={() => navigate("/goals")} data-testid="quick-wellness">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold">Wellness Plans</div>
            <div className="text-xs text-muted-foreground">Manage your goals</div>
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
        hasMeal={selectedDay?.hasDailyMeal}
        hasWorkout={selectedDay?.hasDailyWorkout}
      />
    </div>
  );
}
