import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Dumbbell, Clock, Loader2, Zap, Timer,
} from "lucide-react";

interface DailyWorkoutData {
  id: string;
  date: string;
  status: string;
  generatedTitle: string | null;
  planJson: any;
}

export default function DailyWorkoutView() {
  const params = useParams<{ date: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

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

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
          <Dumbbell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-daily-workout-title">{workout.generatedTitle || `Daily Workout — ${params.date}`}</h1>
          {session?.focus && <p className="text-xs text-muted-foreground">{session.focus}</p>}
        </div>
      </div>

      {session && (
        <>
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
                  {session.main.map((ex: any, i: number) => (
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
                      <div className="text-right text-xs text-muted-foreground shrink-0 ml-4">
                        {ex.sets && ex.reps && <div>{ex.sets} × {ex.reps}</div>}
                        {ex.time && !ex.sets && <div>{ex.time}</div>}
                        {ex.restSeconds && <div className="flex items-center gap-1"><Clock className="h-3 w-3" />{ex.restSeconds}s rest</div>}
                      </div>
                    </div>
                  ))}
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
        </>
      )}
    </div>
  );
}
