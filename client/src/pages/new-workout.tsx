import { useState, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workoutPreferencesSchema, type WorkoutPreferences } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dumbbell, Loader2, ArrowLeft, Sparkles, CalendarDays, Target, Clock, Crosshair, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "Weight Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "performance", label: "Performance" },
  { value: "maintenance", label: "General Fitness" },
];

const LOCATION_OPTIONS = [
  { value: "home_none", label: "Home (No Equipment)" },
  { value: "home_equipment", label: "Home (Dumbbells/Bands)" },
  { value: "gym", label: "Gym" },
  { value: "outdoor", label: "Outdoor" },
  { value: "mixed", label: "Mixed" },
];

const TRAINING_MODE_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "both", label: "Both" },
];

const FOCUS_AREAS = [
  "Full Body", "Upper Body", "Lower Body", "Core", "Back", "Chest", "Arms", "Shoulders", "Glutes", "Legs", "Flexibility", "Endurance",
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const SESSION_LENGTHS = [
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export default function NewWorkout() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const validGoals = ["weight_loss", "muscle_gain", "performance", "maintenance"] as const;
  const goalParam = searchParams.get("goal");
  const goalFromUrl = validGoals.includes(goalParam as any) ? (goalParam as typeof validGoals[number]) : undefined;
  const startDateFromUrl = searchParams.get("startDate");
  const goalPlanId = searchParams.get("goalPlanId");
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const submittedRef = useRef(false);
  const [planStartDate, setPlanStartDate] = useState(startDateFromUrl || "");

  const form = useForm<WorkoutPreferences>({
    resolver: zodResolver(workoutPreferencesSchema),
    defaultValues: {
      goal: goalFromUrl || "maintenance",
      location: "gym",
      trainingMode: "both",
      focusAreas: ["Full Body"],
      daysOfWeek: ["Mon", "Wed", "Fri"],
      sessionLength: 45,
      experienceLevel: "intermediate",
      limitations: "",
    },
  });

  async function onSubmit(data: WorkoutPreferences) {
    if (!user || isPending || submittedRef.current) return;
    submittedRef.current = true;
    setIsPending(true);
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await apiRequest("POST", "/api/workout", {
        preferences: data,
        idempotencyKey,
        startDate: planStartDate || undefined,
      });
      const result = await res.json();

      if (goalPlanId) {
        try {
          await apiRequest("PATCH", `/api/goal-plans/${goalPlanId}`, { workoutPlanId: result.id });
        } catch {}
      }

      navigate(`/workout/${result.id}/generating`);
    } catch (err: any) {
      submittedRef.current = false;
      setIsPending(false);
      toast({
        title: "Error",
        description: err.message || "Failed to create workout plan",
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2.5">
            <Dumbbell className="h-5 w-5 text-primary" />
            <span className="font-semibold">New Workout Plan</span>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {searchParams.get("fromMealPlan") === "true" && (
          <div className="mb-6 flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-muted-foreground">Step 2 of 2: Now set up your workout plan to complement your meal plan.</span>
          </div>
        )}

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1.5">Create Your Workout Plan</h1>
          <p className="text-muted-foreground">Customize your fitness preferences and we'll generate a personalized 7-day workout plan.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Goal & Setup</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="goal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fitness Goal</FormLabel>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {GOAL_OPTIONS.map((opt) => (
                            <Button
                              key={opt.value}
                              type="button"
                              variant={field.value === opt.value ? "default" : "outline"}
                              className="justify-start"
                              onClick={() => field.onChange(opt.value)}
                              data-testid={`badge-goal-${opt.value}`}
                            >
                              {opt.label}
                            </Button>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Workout Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-location">
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {LOCATION_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value} data-testid={`option-location-${opt.value}`}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="trainingMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Training Mode</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {TRAINING_MODE_OPTIONS.map((opt) => (
                                <Badge
                                  key={opt.value}
                                  className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  data-testid={`badge-mode-${opt.value}`}
                                >
                                  {opt.label}
                                </Badge>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="experienceLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Experience Level</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {EXPERIENCE_OPTIONS.map((opt) => (
                                <Badge
                                  key={opt.value}
                                  className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  data-testid={`badge-exp-${opt.value}`}
                                >
                                  {opt.label}
                                </Badge>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Schedule & Duration</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="daysOfWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workout Days</FormLabel>
                        <FormDescription>Select which days you want to work out</FormDescription>
                        <div className="grid grid-cols-7 gap-1.5 mt-1">
                          {DAYS_OF_WEEK.map((day) => {
                            const selected = (field.value || []).includes(day);
                            return (
                              <Button
                                key={day}
                                type="button"
                                variant={selected ? "default" : "outline"}
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  const current = field.value || [];
                                  if (selected) {
                                    field.onChange(current.filter((d: string) => d !== day));
                                  } else {
                                    field.onChange([...current, day]);
                                  }
                                }}
                                data-testid={`badge-day-${day}`}
                              >
                                {day}
                              </Button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <FormField
                      control={form.control}
                      name="sessionLength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Session Length</FormLabel>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {SESSION_LENGTHS.map((opt) => (
                              <Button
                                key={opt.value}
                                type="button"
                                variant={field.value === opt.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => field.onChange(opt.value)}
                                data-testid={`badge-session-${opt.value}`}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Crosshair className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Focus Areas</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <FormField
                    control={form.control}
                    name="focusAreas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What do you want to focus on?</FormLabel>
                        <FormDescription>Select one or more areas</FormDescription>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {FOCUS_AREAS.map((area) => {
                            const selected = (field.value || []).includes(area);
                            return (
                              <Badge
                                key={area}
                                className={`cursor-pointer toggle-elevate ${selected ? "toggle-elevated" : ""}`}
                                variant={selected ? "default" : "outline"}
                                onClick={() => {
                                  const current = field.value || [];
                                  if (selected) {
                                    field.onChange(current.filter((a: string) => a !== area));
                                  } else {
                                    field.onChange([...current, area]);
                                  }
                                }}
                                data-testid={`badge-focus-${area.replace(/\s/g, "-")}`}
                              >
                                {area}
                              </Badge>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Limitations</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <FormField
                    control={form.control}
                    name="limitations"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Injuries or Limitations (optional)</FormLabel>
                        <FormDescription>Any conditions the AI should account for</FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="e.g. bad knees, lower back pain, recovering from shoulder surgery..."
                            className="resize-none text-sm"
                            rows={3}
                            data-testid="input-limitations"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Start Date</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <FormLabel>Schedule Start Date (optional)</FormLabel>
                  <p className="text-sm text-muted-foreground mt-1 mb-3">
                    Optionally pick when this workout plan should start. You can also schedule it later.
                  </p>
                  <Input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    disabled={isPending}
                    className="max-w-xs"
                    data-testid="input-workout-start-date"
                  />
                </CardContent>
              </Card>
            </section>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isPending}
              data-testid="button-generate-workout"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Workout Plan
                </>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
