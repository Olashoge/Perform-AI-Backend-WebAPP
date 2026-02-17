import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workoutPreferencesSchema, type WorkoutPreferences } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Dumbbell, Loader2, ArrowLeft, Sparkles } from "lucide-react";
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
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();
  const submittedRef = useRef(false);

  const form = useForm<WorkoutPreferences>({
    resolver: zodResolver(workoutPreferencesSchema),
    defaultValues: {
      goal: "maintenance",
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
      });
      const result = await res.json();
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
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b px-3 sm:px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Dumbbell className="h-5 w-5 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold">New Workout Plan</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 pb-24">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Goal & Setup</h2>

                <FormField
                  control={form.control}
                  name="goal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fitness Goal</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {GOAL_OPTIONS.map((opt) => (
                          <Badge
                            key={opt.value}
                            className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                            variant={field.value === opt.value ? "default" : "outline"}
                            onClick={() => field.onChange(opt.value)}
                            data-testid={`badge-goal-${opt.value}`}
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

                <FormField
                  control={form.control}
                  name="trainingMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Training Mode</FormLabel>
                      <div className="flex flex-wrap gap-2">
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
                      <div className="flex flex-wrap gap-2">
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
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Schedule & Duration</h2>

                <FormField
                  control={form.control}
                  name="daysOfWeek"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout Days</FormLabel>
                      <FormDescription>Select which days you want to work out</FormDescription>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => {
                          const selected = (field.value || []).includes(day);
                          return (
                            <Badge
                              key={day}
                              className={`cursor-pointer toggle-elevate ${selected ? "toggle-elevated" : ""}`}
                              variant={selected ? "default" : "outline"}
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
                            </Badge>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sessionLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Session Length</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {SESSION_LENGTHS.map((opt) => (
                          <Badge
                            key={opt.value}
                            className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                            variant={field.value === opt.value ? "default" : "outline"}
                            onClick={() => field.onChange(opt.value)}
                            data-testid={`badge-session-${opt.value}`}
                          >
                            {opt.label}
                          </Badge>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Focus Areas</h2>

                <FormField
                  control={form.control}
                  name="focusAreas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>What do you want to focus on?</FormLabel>
                      <FormDescription>Select one or more areas</FormDescription>
                      <div className="flex flex-wrap gap-2">
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

            <Card>
              <CardContent className="p-4 sm:p-6 space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Limitations</h2>

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

            <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t -mx-3 sm:-mx-4 px-3 sm:px-4 py-3">
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
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
