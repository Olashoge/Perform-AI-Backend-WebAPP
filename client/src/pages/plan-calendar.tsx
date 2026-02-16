import { useState, useEffect, useMemo } from "react";
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
import {
  UtensilsCrossed, ArrowLeft, CalendarDays, List, Grid3X3,
  Loader2, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown,
  CalendarIcon,
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

const SLOT_LABELS: Record<string, string> = {
  breakfast: "B",
  lunch: "L",
  dinner: "D",
};

const SLOT_FULL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

const SLOT_COLORS: Record<string, string> = {
  breakfast: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  lunch: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  dinner: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
};

function FeedbackIcon({ feedback }: { feedback?: "like" | "dislike" }) {
  if (!feedback) return null;
  if (feedback === "like") return <ThumbsUp className="h-3 w-3 text-emerald-500 shrink-0" />;
  return <ThumbsDown className="h-3 w-3 text-rose-500 shrink-0" />;
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
    for (const d of calendarData.days) {
      m.set(d.date, d);
    }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} data-testid="button-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold text-base" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} data-testid="button-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
        {dayNames.map(dn => (
          <div key={dn} className="bg-muted/50 text-center text-xs font-medium text-muted-foreground py-2">
            {dn}
          </div>
        ))}
        {weeks.flat().map((date, idx) => {
          const dateStr = format(date, "yyyy-MM-dd");
          const calDay = dayMap.get(dateStr);
          const isCurrentMonth = isSameMonth(date, currentMonth);
          const isToday = isSameDay(date, new Date());

          return (
            <div
              key={idx}
              className={`bg-background min-h-[80px] p-1 cursor-pointer hover-elevate ${!isCurrentMonth ? "opacity-40" : ""} ${isToday ? "ring-1 ring-primary ring-inset" : ""}`}
              onClick={() => calDay && onDayClick(calDay)}
              data-testid={`cell-date-${dateStr}`}
            >
              <div className={`text-xs font-medium mb-0.5 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(date, "d")}
              </div>
              {calDay && (
                <div className="space-y-0.5">
                  {calendarData.mealSlots.map(slot => {
                    const meal = calDay.meals[slot as keyof typeof calDay.meals];
                    if (!meal) return null;
                    return (
                      <div key={slot} className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${SLOT_COLORS[slot] || ""}`}>
                        <span className="font-medium">{SLOT_LABELS[slot]}</span>{" "}
                        <span className="opacity-80">{meal.name.length > 12 ? meal.name.slice(0, 12) + "..." : meal.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({
  calendarData,
  feedbackMap,
}: {
  calendarData: CalendarData;
  feedbackMap: Record<string, "like" | "dislike">;
}) {
  return (
    <div className="space-y-3">
      {calendarData.days.map(day => {
        const date = new Date(day.date + "T00:00:00");
        const isToday = isSameDay(date, new Date());

        return (
          <Card key={day.date} className={isToday ? "ring-1 ring-primary" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={isToday ? "default" : "secondary"} className="text-xs" data-testid={`badge-date-${day.date}`}>
                  {format(date, "EEE, MMM d")}
                </Badge>
                <span className="text-xs text-muted-foreground">{day.dayName}</span>
              </div>
              <div className="space-y-2">
                {calendarData.mealSlots.map(slot => {
                  const meal = day.meals[slot as keyof typeof day.meals];
                  if (!meal) return null;
                  const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
                  const feedback = feedbackMap[fp];

                  return (
                    <div key={slot} className="flex items-start gap-3" data-testid={`agenda-meal-${day.date}-${slot}`}>
                      <div className={`px-2 py-1 rounded text-xs font-medium shrink-0 mt-0.5 ${SLOT_COLORS[slot] || ""}`}>
                        {SLOT_FULL[slot]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate" data-testid={`text-meal-name-${day.date}-${slot}`}>
                            {meal.name}
                          </span>
                          <FeedbackIcon feedback={feedback} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="outline" className="text-xs">{meal.cuisineTag}</Badge>
                          <span className="text-xs text-muted-foreground">{meal.prepTimeMinutes} min</span>
                          <span className="text-xs text-muted-foreground">{meal.nutritionEstimateRange.calories} cal</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DayDetailModal({
  day,
  mealSlots,
  feedbackMap,
  onClose,
}: {
  day: CalendarDay;
  mealSlots: string[];
  feedbackMap: Record<string, "like" | "dislike">;
  onClose: () => void;
}) {
  const date = new Date(day.date + "T00:00:00");

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h3 className="font-semibold text-base">{format(date, "EEEE, MMM d, yyyy")}</h3>
            <Badge variant="secondary">{day.dayName}</Badge>
          </div>
          <div className="space-y-4">
            {mealSlots.map(slot => {
              const meal = day.meals[slot as keyof typeof day.meals];
              if (!meal) return null;
              const fp = generateMealFingerprint(meal.name, meal.cuisineTag, meal.ingredients);
              const feedback = feedbackMap[fp];

              return (
                <div key={slot}>
                  <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-1.5 ${SLOT_COLORS[slot] || ""}`}>
                    {SLOT_FULL[slot]}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm">{meal.name}</p>
                    <FeedbackIcon feedback={feedback} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{meal.cuisineTag}</Badge>
                    <span className="text-xs text-muted-foreground">{meal.prepTimeMinutes} min</span>
                    <span className="text-xs text-muted-foreground">{meal.nutritionEstimateRange.calories} cal</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Button variant="outline" className="w-full mt-4" onClick={onClose} data-testid="button-close-day-detail">
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlanCalendar() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"month" | "agenda">("agenda");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [weekStartsOn] = useState<0 | 1>(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

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
    }
  }, [calendarData?.startDate]);

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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="font-semibold">Meal Calendar</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            {readyPlans.length > 1 && (
              <Select value={selectedPlanId || ""} onValueChange={setSelectedPlanId}>
                <SelectTrigger className="w-[220px]" data-testid="select-plan">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {readyPlans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {((p.planJson as any)?.title || "Meal Plan").slice(0, 35)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" data-testid="button-start-date-picker">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {currentStartDate ? format(currentStartDate, "MMM d, yyyy") : "Set start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={currentStartDate}
                  onSelect={(date) => {
                    if (date) {
                      startDateMutation.mutate(format(date, "yyyy-MM-dd"));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "agenda" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("agenda")}
              data-testid="button-view-agenda"
            >
              <List className="h-4 w-4 mr-1.5" />
              Agenda
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("month")}
              data-testid="button-view-month"
            >
              <Grid3X3 className="h-4 w-4 mr-1.5" />
              Month
            </Button>
          </div>
        </div>

        {plansLoading || calLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-5 w-32 mb-2" />
                  <Skeleton className="h-4 w-48 mb-1" />
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : readyPlans.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h2 className="font-semibold text-lg mb-1">No meal plans yet</h2>
              <p className="text-sm text-muted-foreground mb-4">Create a meal plan first to view it on the calendar.</p>
              <Link href="/new-plan">
                <Button data-testid="button-create-plan">Create a Plan</Button>
              </Link>
            </CardContent>
          </Card>
        ) : !calendarData ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading calendar...</p>
            </CardContent>
          </Card>
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
          <AgendaView
            calendarData={calendarData}
            feedbackMap={feedbackMap || {}}
          />
        )}
      </div>

      {selectedDay && (
        <DayDetailModal
          day={selectedDay}
          mealSlots={calendarData?.mealSlots || ["breakfast", "lunch", "dinner"]}
          feedbackMap={feedbackMap || {}}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
