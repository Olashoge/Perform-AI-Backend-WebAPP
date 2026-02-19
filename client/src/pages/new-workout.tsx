import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workoutPreferencesSchema, type WorkoutPreferences, type UserProfile } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, Sparkles, CalendarDays, Target, Clock, Crosshair, AlertTriangle, User, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const prefillDone = useRef(false);

  const mapProfileGoalToWorkoutGoal = (g: string): "weight_loss" | "muscle_gain" | "performance" | "maintenance" => {
    if (["weight_loss", "muscle_gain", "performance", "maintenance"].includes(g)) return g as any;
    if (g === "general_fitness" || g === "energy" || g === "mobility") return "maintenance";
    if (g === "endurance") return "performance";
    if (g === "strength") return "muscle_gain";
    return "maintenance";
  };

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

  useEffect(() => {
    if (!profile || prefillDone.current) return;
    prefillDone.current = true;
    if (!goalFromUrl) {
      form.setValue("goal", mapProfileGoalToWorkoutGoal(profile.primaryGoal));
    }
    form.setValue("experienceLevel", profile.trainingExperience as "beginner" | "intermediate" | "advanced");
    const profileDays = (profile.trainingDaysOfWeek as string[]) || [];
    if (profileDays.length > 0) {
      const mapped = profileDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)) as ("Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat")[];
      form.setValue("daysOfWeek", mapped);
    }
    if (profile.sessionDurationMinutes) {
      const validLengths = [20, 30, 45, 60] as const;
      const closest = validLengths.reduce((prev, curr) =>
        Math.abs(curr - profile.sessionDurationMinutes!) < Math.abs(prev - profile.sessionDurationMinutes!) ? curr : prev
      );
      form.setValue("sessionLength", closest);
    }
    const injuries = (profile.injuries as string[]) || [];
    const mobility = (profile.mobilityLimitations as string[]) || [];
    const chronic = (profile.chronicConditions as string[]) || [];
    const allLimitations = [...injuries, ...mobility, ...chronic].filter(Boolean);
    if (allLimitations.length > 0) {
      form.setValue("limitations", allLimitations.join(", "));
    }
  }, [profile, goalFromUrl, form]);

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
      const errMsg = err?.message || "";
      let parsedBody: any = null;
      try { const j = errMsg.indexOf("{"); if (j >= 0) parsedBody = JSON.parse(errMsg.slice(j)); } catch {}
      if (parsedBody?.blocked) {
        const msgs = (parsedBody.violations || []).map((v: any) => v.message).filter(Boolean);
        toast({ title: "Plan cannot be generated", description: msgs.join(" ") || parsedBody.message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: parsedBody?.message || "Failed to create workout plan", variant: "destructive" });
      }
    }
  }

  if (isLoading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="loading-spinner">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  if (!profile) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-semibold">Profile Required</h2>
        <p className="text-muted-foreground">Complete your Performance Blueprint before creating a workout plan. This lets us tailor exercises to your experience, goals, and any limitations.</p>
        <Button onClick={() => navigate("/profile")} data-testid="button-go-to-profile">
          <ExternalLink className="h-4 w-4 mr-2" />
          Set Up Profile
        </Button>
      </div>
    );
  }

  const profileDaysOfWeek = (profile.trainingDaysOfWeek as string[]) || [];
  const LBS_PER_KG = 2.2046226218;
  const profileWeightDisplay = profile.unitSystem === "metric"
    ? `${profile.weightKg} kg`
    : `${Math.round(profile.weightKg * LBS_PER_KG)} lbs`;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
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
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Your Profile</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} data-testid="link-edit-profile">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm" data-testid="profile-summary-workout">
                    <div>
                      <span className="text-muted-foreground">Age:</span>{" "}
                      <span className="font-medium">{profile.age}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Weight:</span>{" "}
                      <span className="font-medium">{profileWeightDisplay}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Goal:</span>{" "}
                      <span className="font-medium capitalize">{profile.primaryGoal.replace(/_/g, " ")}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Experience:</span>{" "}
                      <span className="font-medium capitalize">{profile.trainingExperience}</span>
                    </div>
                    {profileDaysOfWeek.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Training:</span>{" "}
                        <span className="font-medium">{profileDaysOfWeek.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")} ({profileDaysOfWeek.length}/wk)</span>
                      </div>
                    )}
                    {((profile.injuries as string[]) || []).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-muted-foreground">Injuries:</span>{" "}
                        <span className="font-medium">{(profile.injuries as string[]).join(", ")}</span>
                      </div>
                    )}
                    {((profile.mobilityLimitations as string[]) || []).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-muted-foreground">Mobility:</span>{" "}
                        <span className="font-medium">{(profile.mobilityLimitations as string[]).join(", ")}</span>
                      </div>
                    )}
                    {((profile.chronicConditions as string[]) || []).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <span className="text-muted-foreground">Conditions:</span>{" "}
                        <span className="font-medium">{(profile.chronicConditions as string[]).join(", ")}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>

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
  );
}
