import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { Meal, WorkoutSession } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CalendarDays, Rows3, Grid3X3,
  Loader2, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown,
  Ban, Dumbbell, UtensilsCrossed,
} from "lucide-react";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameDay, isSameMonth, eachDayOfInterval } from "date-fns";

const SLOT_ORDER: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };

function sortSlots(slots: string[]): string[] {
  return [...slots].sort((a, b) => (SLOT_ORDER[a] || 99) - (SLOT_ORDER[b] || 99));
}

interface WorkoutCalendarDay {
  date: string;
  isWorkoutDay: boolean;
  session: WorkoutSession | null;
  workoutPlanId: string;
}

interface CalendarDay {
  date: string;
  meals: Record<string, Meal>;
  planIds?: string[];
  workout?: WorkoutCalendarDay;
}

interface AllCalendarData {
  mealSlots: string[];
  days: CalendarDay[];
}

function generateMealFingerprint(mealName: string, cuisineTag: string, ingredients?: string[]): string {
  const slugify = (str: string) => str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const namePart = slugify(mealName);
  const cuisinePart = slugify(cuisineTag);
  const keyIngredients = ["chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb", "tofu", "tempeh", "egg", "eggs", "beans", "lentils", "chickpeas", "milk", "cheese", "yogurt", "cream", "rice", "pasta", "bread", "quinoa", "oats", "avocado", "mushroom", "mushrooms"];
  let proteinPart = "none";
  if (ingredients && ingredients.length > 0) {
    const combined = ingredients.join(" ").toLowerCase();
    for (const key of keyIngredients) {
      if (combined.includes(key)) { proteinPart = key; break; }
    }
  }
  return `${namePart}|${cuisinePart}|${proteinPart}`;
}

const SLOT_FULL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const SLOT_BORDER: Record<string, string> = {
  breakfast: "border-l-amber-500",
  lunch: "border-l-emerald-500",
  dinner: "border-l-indigo-500",
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function FeedbackDot({ feedback }: { feedback?: "like" | "dislike" | "avoid" }) {
  if (!feedback) return null;
  if (feedback === "like") return <ThumbsUp className="h-2.5 w-2.5 text-emerald-500 shrink-0" />;
  if (feedback === "avoid") return <Ban className="h-2.5 w-2.5 text-orange-500 shrink-0" />;
  return <ThumbsDown className="h-2.5 w-2.5 text-rose-500 shrink-0" />;
}

function getMealFeedback(
  meal: Meal,
  fingerprint: string,
  feedbackMap: Record<string, "like" | "dislike">,
  avoidedIngredients: string[],
): "like" | "dislike" | "avoid" | undefined {
  const fb = feedbackMap[fingerprint];
  if (fb) return fb;
  if (avoidedIngredients.length > 0 && meal.ingredients) {
    const combined = meal.ingredients.join(" ").toLowerCase();
    for (const ing of avoidedIngredients) {
      if (combined.includes(ing.toLowerCase())) return "avoid";
    }
  }
  return undefined;
}

function WeekView({
  calendarData,
  currentWeekStart,
  setCurrentWeekStart,
  feedbackMap,
  avoidedIngredients,
  weekStartsOn,
  onDayClick,
}: {
  calendarData: AllCalendarData;
  currentWeekStart: Date;
  setCurrentWeekStart: (d: Date) => void;
  feedbackMap: Record<string, "like" | "dislike">;
  avoidedIngredients: string[];
  weekStartsOn: 0 | 1;
  onDayClick: (day: CalendarDay) => void;
}) {
  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of calendarData.days) m.set(d.date, d);
    return m;
  }, [calendarData.days]);

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const weekEnd = weekDates[6];
  const slots = sortSlots(calendarData.mealSlots);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} data-testid="button-prev-week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-muted-foreground tracking-wide" data-testid="text-week-range">
          {format(currentWeekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} data-testid="button-next-week">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {weekDates.map((date) => {
          const dateStr = format(date, "yyyy-MM-dd");
          const calDay = dayMap.get(dateStr);
          const isToday = isSameDay(date, new Date());
          const dayOfWeek = date.getDay();
          const hasMeals = calDay && Object.keys(calDay.meals).length > 0;
          const hasWorkout = calDay?.workout?.isWorkoutDay;

          return (
            <Card
              key={dateStr}
              className={`cursor-pointer overflow-visible hover-elevate transition-shadow ${isToday ? "ring-1 ring-primary/30" : ""}`}
              onClick={() => calDay && onDayClick(calDay)}
              data-testid={`week-row-${dateStr}`}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center min-w-[40px]">
                    <span className={`text-lg font-bold leading-none ${isToday ? "text-primary" : ""}`}>
                      {format(date, "d")}
                    </span>
                    <span className={`text-[10px] leading-none mt-1 uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                      {DAY_ABBR[dayOfWeek]}
                    </span>
                    <div className="flex items-center gap-1 mt-1.5">
                      {hasMeals && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                      {hasWorkout && <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {slots.map(slot => {
                      const meal = calDay?.meals[slot] as Meal | undefined;
                      if (!meal) return null;
                      const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                      const feedback = getMealFeedback(meal, fp, feedbackMap, avoidedIngredients);
                      const SLOT_DOT_COLOR: Record<string, string> = {
                        breakfast: "bg-amber-500",
                        lunch: "bg-emerald-500",
                        dinner: "bg-indigo-500",
                      };
                      return (
                        <div key={slot} className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${SLOT_DOT_COLOR[slot] || "bg-muted-foreground"}`} />
                          <span className="text-xs text-muted-foreground font-medium uppercase w-10 shrink-0">
                            {(SLOT_FULL[slot] || slot).slice(0, 3)}
                          </span>
                          <span className="text-sm leading-tight truncate" data-testid={`text-week-meal-${dateStr}-${slot}`}>
                            {meal.name}
                          </span>
                          <FeedbackDot feedback={feedback} />
                        </div>
                      );
                    })}
                    {hasWorkout && calDay?.workout?.session && (
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-teal-500" />
                        <Dumbbell className="h-3 w-3 text-teal-500 shrink-0" />
                        <span className="text-sm leading-tight truncate text-teal-700 dark:text-teal-400">
                          {calDay.workout.session.focus}
                        </span>
                      </div>
                    )}
                    {!hasMeals && !hasWorkout && (
                      <span className="text-xs text-muted-foreground/60 italic">No plans</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({
  calendarData,
  currentMonth,
  setCurrentMonth,
  weekStartsOn,
  onDayClick,
  feedbackMap,
  avoidedIngredients,
}: {
  calendarData: AllCalendarData;
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
  weekStartsOn: 0 | 1;
  onDayClick: (day: CalendarDay) => void;
  feedbackMap: Record<string, "like" | "dislike">;
  avoidedIngredients: string[];
}) {
  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of calendarData.days) m.set(d.date, d);
    return m;
  }, [calendarData.days]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn });
  const allDates = eachDayOfInterval({ start: calStart, end: calEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < allDates.length; i += 7) {
    weeks.push(allDates.slice(i, i + 7));
  }

  const dayNames = weekStartsOn === 1
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const slots = sortSlots(calendarData.mealSlots);
  const SLOT_LABEL: Record<string, string> = { breakfast: "B", lunch: "L", dinner: "D" };
  const SLOT_TEXT_COLOR: Record<string, string> = {
    breakfast: "text-amber-600 dark:text-amber-400",
    lunch: "text-emerald-600 dark:text-emerald-400",
    dinner: "text-indigo-600 dark:text-indigo-400",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold tracking-wide" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} data-testid="button-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map((dn, i) => (
              <div key={dn} className={`text-center text-[10px] sm:text-[11px] font-medium py-1.5 ${i === 0 || i === 6 ? "text-rose-500/70" : "text-muted-foreground"}`}>
                {dn}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1 mb-1">
              {week.map((date) => {
                const dateStr = format(date, "yyyy-MM-dd");
                const calDay = dayMap.get(dateStr);
                const isCurrentMonth = isSameMonth(date, currentMonth);
                const isToday = isSameDay(date, new Date());
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const hasMealData = calDay && Object.keys(calDay.meals).length > 0;
                const hasWorkoutData = calDay?.workout?.isWorkoutDay;

                return (
                  <div
                    key={dateStr}
                    className={`min-h-[56px] sm:min-h-[80px] lg:min-h-[96px] p-1 sm:p-1.5 cursor-pointer rounded-md border border-transparent transition-all hover-elevate ${!isCurrentMonth ? "opacity-25" : ""} ${isToday ? "ring-1 ring-primary/30 bg-primary/5" : ""}`}
                    onClick={() => calDay && onDayClick(calDay)}
                    data-testid={`cell-date-${dateStr}`}
                  >
                    <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                      <span className={`text-[11px] sm:text-xs font-medium leading-none ${isToday ? "text-primary font-bold" : isWeekend ? "text-rose-500/70" : "text-muted-foreground"}`}>
                        {format(date, "d")}
                      </span>
                    </div>
                    {hasWorkoutData && (
                      <div className="flex items-center gap-1 px-0.5 mb-0.5 sm:mb-1">
                        <Dumbbell className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-teal-500 shrink-0" />
                        <span className="hidden lg:inline text-[9px] lg:text-[10px] leading-tight truncate font-medium text-teal-600 dark:text-teal-400">
                          {calDay?.workout?.session?.focus || "Workout"}
                        </span>
                      </div>
                    )}
                    {calDay && (
                      <div className="space-y-px">
                        {slots.map(slot => {
                          const meal = calDay.meals[slot] as Meal | undefined;
                          if (!meal) return null;
                          const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                          const fb = getMealFeedback(meal, fp, feedbackMap, avoidedIngredients);
                          return (
                            <div key={slot} className="flex items-center gap-1 px-0.5">
                              <span className={`text-[8px] sm:text-[9px] lg:text-[10px] leading-tight font-semibold shrink-0 ${SLOT_TEXT_COLOR[slot] || ""}`}>{SLOT_LABEL[slot] || slot[0]?.toUpperCase()}</span>
                              <span className="text-[8px] sm:text-[9px] lg:text-[10px] leading-tight truncate text-muted-foreground">
                                {meal.name}
                              </span>
                              {fb && <FeedbackDot feedback={fb} />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><UtensilsCrossed className="h-3 w-3 text-amber-500" /> Meals</span>
        <span className="flex items-center gap-1.5"><Dumbbell className="h-3 w-3 text-teal-500" /> Workouts</span>
      </div>
    </div>
  );
}

function DayDetailModal({
  day,
  mealSlots,
  feedbackMap,
  avoidedIngredients,
  open,
  onClose,
  onNavigate,
  mealPlanStartDates,
}: {
  day: CalendarDay;
  mealSlots: string[];
  feedbackMap: Record<string, "like" | "dislike">;
  avoidedIngredients: string[];
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  mealPlanStartDates: Record<string, string>;
}) {
  const date = new Date(day.date + "T00:00:00");
  const slots = sortSlots(mealSlots);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            {format(date, "EEEE, MMM d, yyyy")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-3">
          {day.workout?.isWorkoutDay && day.workout.session && (
            <div
              className="rounded-md bg-teal-50 dark:bg-teal-950/30 p-3 cursor-pointer hover-elevate"
              onClick={() => {
                onClose();
                onNavigate(`/workout/${day.workout!.workoutPlanId}`);
              }}
              data-testid="link-workout-detail"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-widest">
                  Workout
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-teal-400" />
              </div>
              <div className="flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-teal-500 shrink-0" />
                <p className="font-medium text-sm">{day.workout.session.focus}</p>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs capitalize">{day.workout.session.mode}</Badge>
                <span className="text-[11px] text-muted-foreground">{day.workout.session.durationMinutes} min</span>
                <Badge variant="outline" className="text-xs capitalize">{day.workout.session.intensity}</Badge>
              </div>
            </div>
          )}
          {slots.map(slot => {
            const meal = day.meals[slot] as Meal | undefined;
            if (!meal) return null;
            const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
            const feedback = getMealFeedback(meal, fp, feedbackMap, avoidedIngredients);
            const SLOT_DOT_MODAL: Record<string, string> = {
              breakfast: "bg-amber-500",
              lunch: "bg-emerald-500",
              dinner: "bg-indigo-500",
            };

            const planId = day.planIds?.[0];
            const planStart = planId ? mealPlanStartDates[planId] : null;
            const dayIndex = planStart ? Math.round((date.getTime() - new Date(planStart + "T00:00:00").getTime()) / 86400000) : null;

            return (
              <div
                key={slot}
                className="space-y-1.5 cursor-pointer rounded-md hover-elevate p-2 -mx-2"
                onClick={() => {
                  onClose();
                  if (planId && dayIndex !== null) {
                    onNavigate(`/plan/${planId}?scrollTo=day-${dayIndex}&meal=${slot}`);
                  } else if (planId) {
                    onNavigate(`/plan/${planId}`);
                  }
                }}
                data-testid={`link-meal-${slot}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${SLOT_DOT_MODAL[slot] || "bg-muted-foreground"}`} />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                      {SLOT_FULL[slot] || slot}
                    </span>
                  </div>
                  <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                </div>
                <div className="flex items-center gap-1.5 pl-4">
                  <p className="font-medium text-sm">{meal.name}</p>
                  <FeedbackDot feedback={feedback} />
                </div>
                <div className="flex items-center gap-2 pl-4 flex-wrap">
                  <Badge variant="outline" className="text-xs">{meal.cuisineTag}</Badge>
                  <span className="text-[11px] text-muted-foreground">{meal.prepTimeMinutes} min</span>
                  <span className="text-[11px] text-muted-foreground">{meal.nutritionEstimateRange.calories} cal</span>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PlanCalendar() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const weekStartsOn: 0 | 1 = (() => {
    try {
      const stored = localStorage.getItem("cal_weekStart");
      return stored === "1" ? 1 : 0;
    } catch { return 0 as const; }
  })();

  const [viewMode, setViewMode] = useState<"month" | "week">("week");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn });
  });
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [calFilter, setCalFilter] = useState<"combined" | "meals" | "workouts">("combined");

  const { data: rawCalendarData, isLoading: calLoading } = useQuery<AllCalendarData>({
    queryKey: ["/api/calendar/all"],
    enabled: !!user,
  });

  const { data: workoutCalData } = useQuery<{ days: WorkoutCalendarDay[] }>({
    queryKey: ["/api/calendar/workouts"],
    enabled: !!user,
  });

  const calendarData = useMemo((): AllCalendarData | undefined => {
    const base: AllCalendarData = rawCalendarData || { mealSlots: ["breakfast", "lunch", "dinner"], days: [] };
    const wDays = workoutCalData?.days || [];

    if (!rawCalendarData && wDays.length === 0) return undefined;

    const workoutMap = new Map<string, WorkoutCalendarDay>();
    for (const wd of wDays) workoutMap.set(wd.date, wd);

    const existingDates = new Set(base.days.map(d => d.date));
    const mergedDays: CalendarDay[] = base.days.map(d => ({
      ...d,
      workout: workoutMap.get(d.date),
    }));

    for (const wd of wDays) {
      if (!existingDates.has(wd.date)) {
        mergedDays.push({ date: wd.date, meals: {}, workout: wd });
      }
    }

    mergedDays.sort((a, b) => a.date.localeCompare(b.date));

    if (calFilter === "meals") {
      return { ...base, days: mergedDays.map(d => ({ ...d, workout: undefined })).filter(d => Object.keys(d.meals).length > 0) };
    }
    if (calFilter === "workouts") {
      return { ...base, days: mergedDays.filter(d => d.workout).map(d => ({ ...d, meals: {} })) };
    }
    return { ...base, days: mergedDays };
  }, [rawCalendarData, workoutCalData, calFilter]);

  const { data: allFeedback } = useQuery<{ likedMeals: { mealFingerprint: string; feedback: string }[]; dislikedMeals: { mealFingerprint: string; feedback: string }[] }>({
    queryKey: ["/api/preferences"],
    enabled: !!user,
  });

  const feedbackMap = useMemo(() => {
    const map: Record<string, "like" | "dislike"> = {};
    if (allFeedback) {
      for (const m of allFeedback.likedMeals || []) {
        map[m.mealFingerprint] = "like";
      }
      for (const m of allFeedback.dislikedMeals || []) {
        map[m.mealFingerprint] = "dislike";
      }
    }
    return map;
  }, [allFeedback]);

  const { data: prefsData } = useQuery<{ avoidIngredients: { ingredientKey: string }[] }>({
    queryKey: ["/api/preferences"],
    enabled: !!user,
  });

  const { data: plansData } = useQuery<{ id: number; planStartDate: string | null }[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const mealPlanStartDates = useMemo(() => {
    const map: Record<string, string> = {};
    if (plansData) {
      for (const p of plansData) {
        if (p.planStartDate) {
          map[String(p.id)] = p.planStartDate;
        }
      }
    }
    return map;
  }, [plansData]);

  const avoidedIngredients = useMemo(() => {
    return (prefsData?.avoidIngredients || []).map(i => i.ingredientKey);
  }, [prefsData]);

  useEffect(() => {
    if (calendarData?.days && calendarData.days.length > 0) {
      const firstDate = calendarData.days[0].date;
      const start = new Date(firstDate + "T00:00:00");
      setCurrentMonth(new Date(start.getFullYear(), start.getMonth()));
      setCurrentWeekStart(startOfWeek(start, { weekStartsOn }));
    }
  }, [calendarData?.days?.length, weekStartsOn]);

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasMeals = calendarData && calendarData.days.length > 0;
  const hasWorkouts = workoutCalData && workoutCalData.days.length > 0;
  const hasAnyData = hasMeals || hasWorkouts;

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">Your unified schedule</p>
      </div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
            <Button
              variant={calFilter === "combined" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCalFilter("combined")}
              data-testid="button-filter-combined"
            >
              Combined
            </Button>
            <Button
              variant={calFilter === "meals" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCalFilter("meals")}
              data-testid="button-filter-meals"
            >
              <UtensilsCrossed className="h-3.5 w-3.5 mr-1.5" />
              Meals
            </Button>
            <Button
              variant={calFilter === "workouts" ? "default" : "ghost"}
              size="sm"
              onClick={() => setCalFilter("workouts")}
              data-testid="button-filter-workouts"
            >
              <Dumbbell className="h-3.5 w-3.5 mr-1.5" />
              Workouts
            </Button>
          </div>
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
              data-testid="button-view-week"
            >
              <Rows3 className="h-3.5 w-3.5 mr-1.5" />
              Week
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
              data-testid="button-view-month"
            >
              <Grid3X3 className="h-3.5 w-3.5 mr-1.5" />
              Month
            </Button>
          </div>
        </div>

        {calLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !hasAnyData ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <h2 className="font-semibold text-base mb-1.5" data-testid="text-no-scheduled-plans">No scheduled plans</h2>
              <p className="text-sm text-muted-foreground mb-4">Schedule your meal or workout plans from each plan's detail page to see them here.</p>
              <Link href="/plans">
                <Button size="sm" data-testid="button-go-to-plans">View Plans</Button>
              </Link>
            </CardContent>
          </Card>
        ) : viewMode === "month" ? (
          <MonthView
            calendarData={calendarData!}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            weekStartsOn={weekStartsOn}
            onDayClick={setSelectedDay}
            feedbackMap={feedbackMap}
            avoidedIngredients={avoidedIngredients}
          />
        ) : (
          <WeekView
            calendarData={calendarData!}
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            feedbackMap={feedbackMap}
            avoidedIngredients={avoidedIngredients}
            weekStartsOn={weekStartsOn}
            onDayClick={setSelectedDay}
          />
        )}

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          mealSlots={calendarData?.mealSlots || ["breakfast", "lunch", "dinner"]}
          feedbackMap={feedbackMap}
          avoidedIngredients={avoidedIngredients}
          open={!!selectedDay}
          onClose={() => setSelectedDay(null)}
          onNavigate={navigate}
          mealPlanStartDates={mealPlanStartDates}
        />
      )}

    </div>
  );
}
