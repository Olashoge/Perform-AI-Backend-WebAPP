import { useState, useEffect, useMemo, useCallback } from "react";
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
  ArrowLeft, CalendarDays, Rows3, Grid3X3,
  Loader2, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown,
  Settings2, Ban, Dumbbell, UtensilsCrossed,
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
      <div className="flex items-center justify-between mb-2 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} data-testid="button-prev-week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium text-muted-foreground" data-testid="text-week-range">
          {format(currentWeekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} data-testid="button-next-week">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto -mx-1 px-1">
        <div className="min-w-[400px]">
          <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `44px repeat(${slots.length}, 1fr)` }}>
            <div className="p-1" />
            {slots.map(slot => (
              <div key={slot} className="text-[11px] font-medium text-muted-foreground p-1.5 text-center border-l">
                {SLOT_FULL[slot] || slot}
              </div>
            ))}
          </div>

          {weekDates.map((date) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const calDay = dayMap.get(dateStr);
            const isToday = isSameDay(date, new Date());
            const dayOfWeek = date.getDay();

            return (
              <div
                key={dateStr}
                className={`grid border-b last:border-b-0 cursor-pointer ${isToday ? "bg-primary/5" : ""}`}
                style={{ gridTemplateColumns: `44px repeat(${slots.length}, 1fr)` }}
                onClick={() => calDay && onDayClick(calDay)}
                data-testid={`week-row-${dateStr}`}
              >
                <div className="p-1 flex flex-col items-center justify-center border-r">
                  <span className={`text-[13px] font-semibold leading-none ${isToday ? "text-primary" : ""}`}>
                    {format(date, "d")}
                  </span>
                  <span className={`text-[10px] leading-none mt-0.5 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_ABBR[dayOfWeek]}
                  </span>
                  {calDay?.workout?.isWorkoutDay && (
                    <Dumbbell className="h-2.5 w-2.5 text-violet-500 mt-0.5" />
                  )}
                </div>

                {slots.map(slot => {
                  const meal = calDay?.meals[slot] as Meal | undefined;
                  if (!meal) {
                    return <div key={slot} className="border-l min-h-[44px]" />;
                  }
                  const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                  const feedback = getMealFeedback(meal, fp, feedbackMap, avoidedIngredients);

                  return (
                    <div key={slot} className={`border-l min-h-[44px] p-1 flex items-start gap-1`}>
                      <div className={`border-l-2 ${SLOT_BORDER[slot] || ""} pl-1.5 flex-1 min-w-0`}>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] leading-tight line-clamp-2" data-testid={`text-week-meal-${dateStr}-${slot}`}>
                            {meal.name}
                          </span>
                          <FeedbackDot feedback={feedback} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
      <div className="flex items-center justify-between mb-2 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} data-testid="button-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="border rounded-md overflow-x-auto -mx-1 px-1">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 bg-muted/40">
            {dayNames.map((dn, i) => (
              <div key={dn} className={`text-center text-[10px] sm:text-[11px] font-medium py-1 ${i === 0 || i === 6 ? "text-rose-500" : "text-muted-foreground"} ${i > 0 ? "border-l" : ""}`}>
                {dn}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t">
              {week.map((date, di) => {
                const dateStr = format(date, "yyyy-MM-dd");
                const calDay = dayMap.get(dateStr);
                const isCurrentMonth = isSameMonth(date, currentMonth);
                const isToday = isSameDay(date, new Date());
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                return (
                  <div
                    key={dateStr}
                    className={`min-h-[60px] sm:min-h-[72px] p-0.5 cursor-pointer ${di > 0 ? "border-l" : ""} ${!isCurrentMonth ? "opacity-30" : ""} ${isToday ? "bg-primary/5" : ""}`}
                    onClick={() => calDay && onDayClick(calDay)}
                    data-testid={`cell-date-${dateStr}`}
                  >
                    <div className="flex items-center gap-0.5">
                      <span className={`text-[10px] sm:text-[11px] font-medium leading-none pl-0.5 ${isToday ? "text-primary font-bold" : isWeekend ? "text-rose-500" : "text-muted-foreground"}`}>
                        {format(date, "d")}
                      </span>
                      {calDay?.workout?.isWorkoutDay && (
                        <Dumbbell className="h-2 w-2 text-violet-500 shrink-0" />
                      )}
                    </div>
                    {calDay && (
                      <div className="space-y-px mt-0.5">
                        {slots.map(slot => {
                          const meal = calDay.meals[slot] as Meal | undefined;
                          if (!meal) return null;
                          const truncName = meal.name.length > 10 ? meal.name.slice(0, 9) + "\u2026" : meal.name;
                          const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                          const fb = getMealFeedback(meal, fp, feedbackMap, avoidedIngredients);
                          return (
                            <div key={slot} className="flex items-center gap-0 px-0.5">
                              <span className={`text-[8px] sm:text-[9px] leading-tight font-semibold shrink-0 ${SLOT_TEXT_COLOR[slot] || ""}`}>{SLOT_LABEL[slot] || slot[0]?.toUpperCase()}</span>
                              <span className={`text-[8px] sm:text-[9px] leading-tight truncate ml-0.5 ${SLOT_BORDER[slot] || ""} border-l pl-0.5`}>
                                {truncName}
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
}: {
  day: CalendarDay;
  mealSlots: string[];
  feedbackMap: Record<string, "like" | "dislike">;
  avoidedIngredients: string[];
  open: boolean;
  onClose: () => void;
}) {
  const date = new Date(day.date + "T00:00:00");
  const slots = sortSlots(mealSlots);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {format(date, "EEEE, MMM d, yyyy")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {day.workout?.isWorkoutDay && day.workout.session && (
            <div className="border-l-2 border-l-violet-500 pl-3">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                Workout
              </div>
              <div className="flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <p className="font-medium text-sm">{day.workout.session.focus}</p>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
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

            return (
              <div key={slot} className={`border-l-2 ${SLOT_BORDER[slot] || ""} pl-3`}>
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  {SLOT_FULL[slot] || slot}
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-sm">{meal.name}</p>
                  <FeedbackDot feedback={feedback} />
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
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

function SettingsModal({
  open,
  onClose,
  weekStartsOn,
  setWeekStartsOn,
}: {
  open: boolean;
  onClose: () => void;
  weekStartsOn: 0 | 1;
  setWeekStartsOn: (v: 0 | 1) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Calendar Settings</DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Start of the week</p>
            <div className="space-y-1">
              {([{ value: 0, label: "Sunday" }, { value: 1, label: "Monday" }] as const).map(opt => (
                <div
                  key={opt.value}
                  className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer border ${weekStartsOn === opt.value ? "border-primary bg-primary/5" : "border-transparent hover-elevate"}`}
                  onClick={() => {
                    setWeekStartsOn(opt.value);
                    try { localStorage.setItem("cal_weekStart", String(opt.value)); } catch {}
                  }}
                  data-testid={`option-weekstart-${opt.label.toLowerCase()}`}
                >
                  <span className="text-sm">{opt.label}</span>
                  {weekStartsOn === opt.value && (
                    <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PlanCalendar() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [viewMode, setViewMode] = useState<"month" | "week">("week");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 0 });
  });
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(() => {
    try {
      const stored = localStorage.getItem("cal_weekStart");
      return stored === "1" ? 1 : 0;
    } catch { return 0; }
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasMeals = calendarData && calendarData.days.length > 0;
  const hasWorkouts = workoutCalData && workoutCalData.days.length > 0;
  const hasAnyData = hasMeals || hasWorkouts;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-2 sm:px-4 h-12 flex items-center justify-between gap-1 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <CalendarDays className="h-4 w-4 text-primary hidden sm:block" />
            <span className="font-semibold text-sm">Calendar</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="button-settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={calFilter === "combined" ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setCalFilter("combined")}
              data-testid="button-filter-combined"
            >
              Combined
            </Button>
            <Button
              variant={calFilter === "meals" ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setCalFilter("meals")}
              data-testid="button-filter-meals"
            >
              <UtensilsCrossed className="h-3 w-3 mr-1" />
              Meals
            </Button>
            <Button
              variant={calFilter === "workouts" ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setCalFilter("workouts")}
              data-testid="button-filter-workouts"
            >
              <Dumbbell className="h-3 w-3 mr-1" />
              Workouts
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setViewMode("week")}
              data-testid="button-view-week"
            >
              <Rows3 className="h-3.5 w-3.5 mr-1" />
              Week
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              className="text-xs"
              onClick={() => setViewMode("month")}
              data-testid="button-view-month"
            >
              <Grid3X3 className="h-3.5 w-3.5 mr-1" />
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
            <CardContent className="p-10 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <h2 className="font-semibold mb-1" data-testid="text-no-scheduled-plans">No scheduled plans</h2>
              <p className="text-xs text-muted-foreground mb-3">Schedule your meal or workout plans from each plan's detail page to see them here.</p>
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
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          mealSlots={calendarData?.mealSlots || ["breakfast", "lunch", "dinner"]}
          feedbackMap={feedbackMap}
          avoidedIngredients={avoidedIngredients}
          open={!!selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        weekStartsOn={weekStartsOn}
        setWeekStartsOn={setWeekStartsOn}
      />
    </div>
  );
}
