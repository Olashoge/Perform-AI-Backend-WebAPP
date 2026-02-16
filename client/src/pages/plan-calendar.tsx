import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { MealPlan, Meal } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ArrowLeft, CalendarDays, Rows3, Grid3X3,
  Loader2, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown,
  CalendarIcon, Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameDay, isSameMonth, eachDayOfInterval } from "date-fns";

interface CalendarDay {
  date: string;
  dayIndex: number;
  dayName: string;
  meals: { breakfast?: Meal; lunch?: Meal; dinner?: Meal };
  mealSlots: string[];
}

interface CalendarData {
  planId: string;
  startDate: string;
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

function FeedbackDot({ feedback }: { feedback?: "like" | "dislike" }) {
  if (!feedback) return null;
  if (feedback === "like") return <ThumbsUp className="h-2.5 w-2.5 text-emerald-500 shrink-0" />;
  return <ThumbsDown className="h-2.5 w-2.5 text-rose-500 shrink-0" />;
}

function WeekView({
  calendarData,
  currentWeekStart,
  setCurrentWeekStart,
  feedbackMap,
  weekStartsOn,
  onDayClick,
}: {
  calendarData: CalendarData;
  currentWeekStart: Date;
  setCurrentWeekStart: (d: Date) => void;
  feedbackMap: Record<string, "like" | "dislike">;
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
  const slots = calendarData.mealSlots;

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

      <div className="border rounded-md overflow-hidden">
        <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: `48px repeat(${slots.length}, 1fr)` }}>
          <div className="p-1" />
          {slots.map(slot => (
            <div key={slot} className="text-[11px] font-medium text-muted-foreground p-1.5 text-center border-l">
              {SLOT_FULL[slot]}
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
              className={`grid border-b last:border-b-0 cursor-pointer hover-elevate ${isToday ? "bg-primary/5" : ""}`}
              style={{ gridTemplateColumns: `48px repeat(${slots.length}, 1fr)` }}
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
              </div>

              {slots.map(slot => {
                const meal = calDay?.meals[slot as keyof CalendarDay["meals"]];
                if (!meal) {
                  return <div key={slot} className="border-l min-h-[44px]" />;
                }
                const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                const feedback = feedbackMap[fp];

                return (
                  <div key={slot} className={`border-l min-h-[44px] p-1 flex items-start gap-1`}>
                    <div className={`border-l-2 ${SLOT_BORDER[slot]} pl-1.5 flex-1 min-w-0`}>
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
  );
}

function MonthView({
  calendarData,
  currentMonth,
  setCurrentMonth,
  weekStartsOn,
  onDayClick,
  feedbackMap,
}: {
  calendarData: CalendarData;
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
  weekStartsOn: 0 | 1;
  onDayClick: (day: CalendarDay) => void;
  feedbackMap: Record<string, "like" | "dislike">;
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

  const slots = calendarData.mealSlots;
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

      <div className="border rounded-md overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/40">
          {dayNames.map((dn, i) => (
            <div key={dn} className={`text-center text-[11px] font-medium py-1 ${i === 0 || i === 6 ? "text-rose-500" : "text-muted-foreground"} ${i > 0 ? "border-l" : ""}`}>
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
                  className={`min-h-[72px] p-0.5 cursor-pointer hover-elevate ${di > 0 ? "border-l" : ""} ${!isCurrentMonth ? "opacity-30" : ""} ${isToday ? "bg-primary/5" : ""}`}
                  onClick={() => calDay && onDayClick(calDay)}
                  data-testid={`cell-date-${dateStr}`}
                >
                  <div className={`text-[11px] font-medium leading-none mb-0.5 pl-0.5 ${isToday ? "text-primary font-bold" : isWeekend ? "text-rose-500" : "text-muted-foreground"}`}>
                    {format(date, "d")}
                  </div>
                  {calDay && (
                    <div className="space-y-px">
                      {slots.map(slot => {
                        const meal = calDay.meals[slot as keyof typeof calDay.meals];
                        if (!meal) return null;
                        const truncName = meal.name.length > 14 ? meal.name.slice(0, 13) + "\u2026" : meal.name;
                        return (
                          <div key={slot} className="flex items-start gap-0 px-0.5">
                            <span className={`text-[9px] leading-tight font-semibold shrink-0 ${SLOT_TEXT_COLOR[slot]}`}>{SLOT_LABEL[slot]}</span>
                            <span className={`text-[9px] leading-tight truncate ml-0.5 ${SLOT_BORDER[slot]} border-l pl-0.5`}>
                              {truncName}
                            </span>
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
  );
}

function DayDetailModal({
  day,
  mealSlots,
  feedbackMap,
  open,
  onClose,
}: {
  day: CalendarDay;
  mealSlots: string[];
  feedbackMap: Record<string, "like" | "dislike">;
  open: boolean;
  onClose: () => void;
}) {
  const date = new Date(day.date + "T00:00:00");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {format(date, "EEEE, MMM d, yyyy")}
            <Badge variant="secondary" className="text-xs">{day.dayName}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {mealSlots.map(slot => {
            const meal = day.meals[slot as keyof typeof day.meals];
            if (!meal) return null;
            const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
            const feedback = feedbackMap[fp];

            return (
              <div key={slot} className={`border-l-2 ${SLOT_BORDER[slot]} pl-3`}>
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
                  {SLOT_FULL[slot]}
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
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"month" | "week">("week");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(), { weekStartsOn: 0 });
  });
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(() => {
    try {
      const stored = localStorage.getItem("cal_weekStart");
      return stored === "1" ? 1 : 0;
    } catch { return 0; }
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: plans, isLoading: plansLoading } = useQuery<MealPlan[]>({
    queryKey: ["/api/plans"],
    enabled: !!user,
  });

  const readyPlans = useMemo(() => {
    return (plans || []).filter(p => p.status === "ready" && p.planJson);
  }, [plans]);

  useEffect(() => {
    if (readyPlans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(readyPlans[0].id);
    }
  }, [readyPlans, selectedPlanId]);

  const { data: calendarData, isLoading: calLoading } = useQuery<CalendarData>({
    queryKey: ["/api/plan", selectedPlanId, "calendar"],
    queryFn: async () => {
      const res = await fetch(`/api/plan/${selectedPlanId}/calendar`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load calendar");
      return res.json();
    },
    enabled: !!selectedPlanId,
  });

  const { data: feedbackMap } = useQuery<Record<string, "like" | "dislike">>({
    queryKey: ["/api/feedback/plan", selectedPlanId],
    queryFn: async () => {
      const res = await fetch(`/api/feedback/plan/${selectedPlanId}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!selectedPlanId,
  });

  const startDateMutation = useMutation({
    mutationFn: async (startDate: string) => {
      await apiRequest("PATCH", `/api/plan/${selectedPlanId}/start-date`, { startDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plan", selectedPlanId, "calendar"] });
      toast({ title: "Start date updated" });
      setDatePickerOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update start date", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (calendarData?.startDate) {
      const start = new Date(calendarData.startDate + "T00:00:00");
      setCurrentMonth(new Date(start.getFullYear(), start.getMonth()));
      setCurrentWeekStart(startOfWeek(start, { weekStartsOn }));
    }
  }, [calendarData?.startDate, weekStartsOn]);

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

  const currentStartDate = calendarData?.startDate
    ? new Date(calendarData.startDate + "T00:00:00")
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/plans">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <CalendarDays className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Calendar</span>
          </div>
          <div className="flex items-center gap-1">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs" data-testid="button-start-date-picker">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {currentStartDate ? format(currentStartDate, "MMM d") : "Start"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={currentStartDate}
                  onSelect={(date) => {
                    if (date) startDateMutation.mutate(format(date, "yyyy-MM-dd"));
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="button-settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            {readyPlans.length > 1 && (
              <Select value={selectedPlanId || ""} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="w-[180px] text-xs" data-testid="select-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {readyPlans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {((p.planJson as any)?.title || "Meal Plan").slice(0, 30)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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

        {plansLoading || calLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : readyPlans.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <h2 className="font-semibold mb-1">No meal plans yet</h2>
              <p className="text-xs text-muted-foreground mb-3">Create a meal plan first to view it on the calendar.</p>
              <Link href="/new-plan">
                <Button size="sm" data-testid="button-create-plan">Create a Plan</Button>
              </Link>
            </CardContent>
          </Card>
        ) : !calendarData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : viewMode === "month" ? (
          <MonthView
            calendarData={calendarData}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            weekStartsOn={weekStartsOn}
            onDayClick={setSelectedDay}
            feedbackMap={feedbackMap || {}}
          />
        ) : (
          <WeekView
            calendarData={calendarData}
            currentWeekStart={currentWeekStart}
            setCurrentWeekStart={setCurrentWeekStart}
            feedbackMap={feedbackMap || {}}
            weekStartsOn={weekStartsOn}
            onDayClick={setSelectedDay}
          />
        )}
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          mealSlots={calendarData?.mealSlots || ["breakfast", "lunch", "dinner"]}
          feedbackMap={feedbackMap || {}}
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
