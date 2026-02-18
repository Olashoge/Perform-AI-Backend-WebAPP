import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, ThumbsUp, ThumbsDown, Loader2, Trash2, AlertCircle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExercisePrefItem {
  id: string;
  exerciseKey: string;
  exerciseName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ExercisePrefsData {
  liked: ExercisePrefItem[];
  disliked: ExercisePrefItem[];
  avoided: ExercisePrefItem[];
}

function PreferencesSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExerciseItem({ item, onRemove, isPending }: { item: ExercisePrefItem; onRemove: () => void; isPending: boolean }) {
  const statusLabels: Record<string, string> = {
    liked: "Liked",
    disliked: "Disliked",
    avoided: "Avoided",
  };
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" data-testid={`text-exercise-${item.id}`}>{item.exerciseName}</p>
            <Badge variant="secondary" className="mt-1.5">{statusLabels[item.status] || item.status}</Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={isPending}
          title="Remove"
          data-testid={`button-remove-exercise-${item.id}`}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof ThumbsUp; message: string }) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{message}</p>
    </div>
  );
}

export default function ExercisePreferencesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ExercisePrefsData>({
    queryKey: ["/api/preferences/exercise"],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/preferences/exercise/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences/exercise"] });
      toast({ title: "Exercise preference removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove preference", variant: "destructive" });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2" data-testid="text-exercise-prefs-title">Exercise Preferences</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">Manage what you like, dislike, and want to avoid in future workouts.</p>
      </div>

      {isLoading ? (
        <PreferencesSkeleton />
      ) : !data ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground">Failed to load exercise preferences.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="liked" className="space-y-5">
          <TabsList>
            <TabsTrigger value="liked" data-testid="tab-exercise-liked">
              <ThumbsUp className="h-4 w-4 mr-1.5" />
              Liked ({data.liked.length})
            </TabsTrigger>
            <TabsTrigger value="disliked" data-testid="tab-exercise-disliked">
              <ThumbsDown className="h-4 w-4 mr-1.5" />
              Disliked ({data.disliked.length})
            </TabsTrigger>
            <TabsTrigger value="avoided" data-testid="tab-exercise-avoided">
              <Ban className="h-4 w-4 mr-1.5" />
              Avoided ({data.avoided.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="liked" className="space-y-3">
            {data.liked.length === 0 ? (
              <EmptyState icon={ThumbsUp} message="No liked exercises yet. Like exercises in your workout plans to improve future suggestions." />
            ) : (
              data.liked.map(item => (
                <ExerciseItem
                  key={item.id}
                  item={item}
                  onRemove={() => deleteMutation.mutate(item.id)}
                  isPending={deleteMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="disliked" className="space-y-3">
            {data.disliked.length === 0 ? (
              <EmptyState icon={ThumbsDown} message="No disliked exercises yet. Dislike exercises to deprioritize them in future plans." />
            ) : (
              data.disliked.map(item => (
                <ExerciseItem
                  key={item.id}
                  item={item}
                  onRemove={() => deleteMutation.mutate(item.id)}
                  isPending={deleteMutation.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="avoided" className="space-y-3">
            {data.avoided.length === 0 ? (
              <EmptyState icon={Ban} message="No avoided exercises yet. Avoid exercises you never want to see in future plans." />
            ) : (
              data.avoided.map(item => (
                <ExerciseItem
                  key={item.id}
                  item={item}
                  onRemove={() => deleteMutation.mutate(item.id)}
                  isPending={deleteMutation.isPending}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
