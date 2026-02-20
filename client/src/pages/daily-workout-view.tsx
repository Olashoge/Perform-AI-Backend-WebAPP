import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCompletions } from "@/hooks/use-completions";
import type { AdaptiveSnapshot } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CompletionCheckbox } from "@/components/completion-checkbox";
import {
  ArrowLeft, Dumbbell, Clock, Loader2, Zap, Timer,
  ThumbsUp, ThumbsDown, RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { AdaptiveInsightsCard } from "@/components/adaptive-insights-card";

interface DailyWorkoutData {
  id: string;
  date: string;
  status: string;
  generatedTitle: string | null;
  planJson: any;
  adaptiveSnapshot?: any;
}

export default function DailyWorkoutView() {
  const params = useParams<{ date: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: workout, isLoading, error } = useQuery<DailyWorkoutData>({
    queryKey: ["/api/daily-workout", params.date],
    queryFn: async () => {
      const res = await fetch(`/api/daily-workout/${params.date}`, { credentials: "include" });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!user && !!params.date,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === "generating") return 2000;
      return false;
    },
  });

  const { isCompleted, toggle } = useCompletions(params.date!, params.date!, !!workout);

  const [exerciseFeedback, setExerciseFeedback] = useState<Record<string, "like" | "dislike" | null>>({});

  const feedbackMutation = useMutation({
    mutationFn: async (data: { sessionKey: string; feedback: "like" | "dislike" | "neutral" }) => {
      const res = await apiRequest("POST", "/api/feedback/workout", {
        dayIndex: 0,
        sessionKey: data.sessionKey,
        feedback: data.feedback,
      });
      return await res.json();
    },
  });

  const handleExerciseFeedback = (exerciseName: string, feedback: "like" | "dislike" | "neutral") => {
    const key = exerciseName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setExerciseFeedback(prev => ({
      ...prev,
      [key]: feedback === "neutral" ? null : feedback,
    }));
    feedbackMutation.mutate({ sessionKey: key, feedback });
  };

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/daily-workout/${params.date}/regenerate`, {});
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Regenerating workout", description: "Creating a new workout for this day..." });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-workout", params.date] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to regenerate workout.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-32 w-full mb-3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !workout) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground mb-4">No daily workout found for this date.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  if (workout.status === "generating") {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4" data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-teal-600" />
            <div className="font-semibold text-lg mb-1">Generating your workout...</div>
            <p className="text-sm text-muted-foreground">Creating a personalized workout for {params.date}. This usually takes 15-30 seconds.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workout.status === "failed") {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto text-center">
        <p className="text-muted-foreground mb-4">Workout generation failed. Please try again.</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")} data-testid="button-back-dashboard">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const session = workout.planJson;

  return (
    <div className="px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="mb-4" data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-11 h-11 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
            <Dumbbell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" data-testid="text-daily-workout-title">{workout.generatedTitle || `Daily Workout — ${params.date}`}</h1>
              {(workout.adaptiveSnapshot as AdaptiveSnapshot | null)?.modifiers?.deloadWeek && (
                <Badge variant="secondary" size="sm" data-testid="badge-deload">
                  Recovery
                </Badge>
              )}
              {(workout.adaptiveSnapshot as AdaptiveSnapshot | null)?.modifiers?.volumeMultiplier !== undefined &&
               (workout.adaptiveSnapshot as AdaptiveSnapshot).modifiers.volumeMultiplier > 1.05 &&
               !(workout.adaptiveSnapshot as AdaptiveSnapshot).modifiers.deloadWeek && (
                <Badge variant="default" size="sm" data-testid="badge-progression">
                  Progression
                </Badge>
              )}
            </div>
            {session?.focus && <p className="text-xs text-muted-foreground">{session.focus}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CompletionCheckbox
            date={params.date!}
            itemType="workout"
            sourceType="daily_workout"
            sourceId={workout.id}
            itemKey="workout"
            completed={isCompleted(params.date!, "workout", "daily_workout", workout.id, "workout")}
            onToggle={toggle}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid="button-regenerate-daily-workout"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Regenerate
          </Button>
        </div>
      </div>

      {(workout.adaptiveSnapshot as AdaptiveSnapshot | null) && (
        <div className="mb-4">
          <AdaptiveInsightsCard snapshot={workout.adaptiveSnapshot as AdaptiveSnapshot} planType="workout" />
        </div>
      )}

      {session && (
        <div className={isCompleted(params.date!, "workout", "daily_workout", workout.id, "workout") ? "opacity-60" : ""}>
          <div className="flex gap-3 mb-4 flex-wrap">
            {session.mode && (
              <Badge variant="secondary" className="text-xs capitalize">
                {session.mode}
              </Badge>
            )}
            {session.intensity && (
              <Badge variant="secondary" className="text-xs capitalize">
                <Zap className="h-3 w-3 mr-1" />
                {session.intensity}
              </Badge>
            )}
            {session.durationMinutes && (
              <Badge variant="secondary" className="text-xs">
                <Timer className="h-3 w-3 mr-1" />
                {session.durationMinutes} min
              </Badge>
            )}
          </div>

          {session.warmup && session.warmup.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Warm-up</div>
                <ul className="space-y-1">
                  {session.warmup.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {session.main && session.main.length > 0 && (
            <Card className="mb-4" data-testid="card-main-exercises">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Exercises</div>
                <div className="space-y-3">
                  {session.main.map((ex: any, i: number) => {
                    const exKey = ex.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                    const fbState = exerciseFeedback[exKey];
                    return (
                      <div key={i} className="flex items-start justify-between border-t pt-3 first:border-t-0 first:pt-0" data-testid={`exercise-${i}`}>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{ex.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {ex.type && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{ex.type}</Badge>
                            )}
                          </div>
                          {ex.notes && <div className="text-xs text-muted-foreground mt-1">{ex.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-4">
                          <div className="text-right text-xs text-muted-foreground mr-2">
                            {ex.sets && ex.reps && <div>{ex.sets} × {ex.reps}</div>}
                            {ex.time && !ex.sets && <div>{ex.time}</div>}
                            {ex.restSeconds && <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{ex.restSeconds}s rest</div>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 transition-colors duration-200 ${fbState === "like" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "text-muted-foreground"}`}
                            onClick={() => handleExerciseFeedback(ex.name, fbState === "like" ? "neutral" : "like")}
                            title={fbState === "like" ? "Remove like" : "Like this exercise"}
                            data-testid={`button-like-exercise-${i}`}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 transition-colors duration-200 ${fbState === "dislike" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400" : "text-muted-foreground"}`}
                            onClick={() => handleExerciseFeedback(ex.name, fbState === "dislike" ? "neutral" : "dislike")}
                            title={fbState === "dislike" ? "Remove dislike" : "Dislike this exercise"}
                            data-testid={`button-dislike-exercise-${i}`}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {session.finisher && session.finisher.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Finisher</div>
                <ul className="space-y-1">
                  {session.finisher.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {session.cooldown && session.cooldown.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cool-down</div>
                <ul className="space-y-1">
                  {session.cooldown.map((item: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">• {item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {session.coachingCues && session.coachingCues.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Coaching Cues</div>
                <ul className="space-y-1">
                  {session.coachingCues.map((cue: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground italic">"{cue}"</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
