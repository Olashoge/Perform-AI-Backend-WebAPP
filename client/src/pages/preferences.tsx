import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader2, Trash2, AlertCircle, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MealFeedbackItem {
  id: string;
  mealFingerprint: string;
  mealName: string;
  cuisineTag: string;
  feedback: string;
  createdAt: string;
}

interface IngredientPrefItem {
  id: string;
  ingredientKey: string;
  preference: string;
  source: string;
  createdAt: string;
}

interface PreferencesData {
  likedMeals: MealFeedbackItem[];
  dislikedMeals: MealFeedbackItem[];
  avoidIngredients: IngredientPrefItem[];
  preferIngredients: IngredientPrefItem[];
}

function PreferencesSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-5 w-2/3 mb-2" />
            <Skeleton className="h-4 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MealItem({ item, onRemove, isPending }: { item: MealFeedbackItem; onRemove: () => void; isPending: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate" data-testid={`text-meal-${item.id}`}>{item.mealName}</p>
          <Badge variant="secondary" className="mt-1 text-xs">{item.cuisineTag}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={isPending}
          title="Remove"
          data-testid={`button-remove-meal-${item.id}`}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function IngredientItem({ item, onRemove, isPending }: { item: IngredientPrefItem; onRemove: () => void; isPending: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm capitalize" data-testid={`text-ingredient-${item.id}`}>{item.ingredientKey}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" className="text-xs">{item.source}</Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={isPending}
          title="Remove"
          data-testid={`button-remove-ingredient-${item.id}`}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-muted-foreground" />}
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof ThumbsUp; message: string }) {
  return (
    <div className="text-center py-12">
      <Icon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default function PreferencesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<PreferencesData>({
    queryKey: ["/api/preferences"],
  });

  const deleteMealMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/preferences/meal/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Meal preference removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove preference", variant: "destructive" });
    },
  });

  const deleteIngredientMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/preferences/ingredient/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Ingredient preference removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove preference", variant: "destructive" });
    },
  });

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

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-4">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-primary hidden sm:block" />
            <span className="font-semibold text-sm sm:text-base">Your Preferences</span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold mb-2">Meal Preferences</h1>
          <p className="text-muted-foreground text-sm">Manage your liked and disliked meals and ingredient preferences. These are used to personalize your future meal plans.</p>
        </div>

        {isLoading ? (
          <PreferencesSkeleton />
        ) : !data ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Failed to load preferences.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="liked" className="space-y-4">
            <TabsList>
              <TabsTrigger value="liked" data-testid="tab-liked">
                <ThumbsUp className="h-4 w-4 mr-1.5" />
                Liked ({data.likedMeals.length})
              </TabsTrigger>
              <TabsTrigger value="disliked" data-testid="tab-disliked">
                <ThumbsDown className="h-4 w-4 mr-1.5" />
                Disliked ({data.dislikedMeals.length})
              </TabsTrigger>
              <TabsTrigger value="avoided" data-testid="tab-avoided">
                <Ban className="h-4 w-4 mr-1.5" />
                Avoided ({data.avoidIngredients.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="liked" className="space-y-2">
              {data.likedMeals.length === 0 ? (
                <EmptyState icon={ThumbsUp} message="No liked meals yet. Like meals in your plans to improve future suggestions." />
              ) : (
                data.likedMeals.map(item => (
                  <MealItem
                    key={item.id}
                    item={item}
                    onRemove={() => deleteMealMutation.mutate(item.id)}
                    isPending={deleteMealMutation.isPending}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="disliked" className="space-y-2">
              {data.dislikedMeals.length === 0 ? (
                <EmptyState icon={ThumbsDown} message="No disliked meals yet. Dislike meals to avoid similar suggestions." />
              ) : (
                data.dislikedMeals.map(item => (
                  <MealItem
                    key={item.id}
                    item={item}
                    onRemove={() => deleteMealMutation.mutate(item.id)}
                    isPending={deleteMealMutation.isPending}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="avoided" className="space-y-2">
              {data.avoidIngredients.length === 0 ? (
                <EmptyState icon={Ban} message="No avoided ingredients yet. These are derived from your disliked meals." />
              ) : (
                data.avoidIngredients.map(item => (
                  <IngredientItem
                    key={item.id}
                    item={item}
                    onRemove={() => deleteIngredientMutation.mutate(item.id)}
                    isPending={deleteIngredientMutation.isPending}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
