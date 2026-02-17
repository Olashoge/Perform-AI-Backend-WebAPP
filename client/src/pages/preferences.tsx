import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, UtensilsCrossed, ThumbsUp, ThumbsDown, Loader2, Trash2, AlertCircle, Ban, AlertTriangle, Check, X } from "lucide-react";
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

interface IngredientProposal {
  id: string;
  mealName: string;
  proposedIngredients: string[];
  status: string;
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

function MealItem({ item, onRemove, isPending }: { item: MealFeedbackItem; onRemove: () => void; isPending: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate" data-testid={`text-meal-${item.id}`}>{item.mealName}</p>
            <Badge variant="secondary" className="mt-1.5">{item.cuisineTag}</Badge>
          </div>
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
      <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            <Ban className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm capitalize" data-testid={`text-ingredient-${item.id}`}>{item.ingredientKey}</p>
            <Badge variant="secondary" className="mt-1.5">{item.source}</Badge>
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
    <div className="text-center py-16">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto">{message}</p>
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

  const { data: proposals = [] } = useQuery<IngredientProposal[]>({
    queryKey: ["/api/ingredient-proposals"],
    enabled: !!user,
  });

  const [proposalSelections, setProposalSelections] = useState<Record<string, Set<string>>>({});

  const resolveProposalMutation = useMutation({
    mutationFn: async ({ proposalId, chosenIngredients, action }: { proposalId: string; chosenIngredients: string[]; action: "accepted" | "declined" }) => {
      await apiRequest("POST", `/api/ingredient-proposals/${proposalId}/resolve`, { chosenIngredients, action });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ingredient-proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Proposal resolved" });
    },
    onError: () => {
      toast({ title: "Failed to resolve", variant: "destructive" });
    },
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <Link href="/plans">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-base sm:text-lg tracking-tight">Your Preferences</span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="mb-8">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">Meal Preferences</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">Manage your liked and disliked meals and ingredient preferences. These are used to personalize your future meal plans.</p>
        </div>

        {proposals.length > 0 && (
          <div className="mb-8 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">Pending Ingredient Reviews ({proposals.length})</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which ingredients to avoid in future plans.
                </p>
              </div>
            </div>
            {proposals.map(proposal => {
              const selected = proposalSelections[proposal.id] || new Set<string>();
              return (
                <Card key={proposal.id}>
                  <CardContent className="p-5 space-y-4">
                    <div>
                      <p className="text-sm font-semibold">From: {proposal.mealName}</p>
                      <p className="text-xs text-muted-foreground mt-1">Select ingredients to avoid</p>
                    </div>
                    <div className="space-y-2.5">
                      {proposal.proposedIngredients.map(ing => (
                        <label key={ing} className="flex items-center gap-2.5 cursor-pointer">
                          <Checkbox
                            checked={selected.has(ing)}
                            onCheckedChange={(checked) => {
                              setProposalSelections(prev => {
                                const s = new Set(prev[proposal.id] || []);
                                if (checked) s.add(ing); else s.delete(ing);
                                return { ...prev, [proposal.id]: s };
                              });
                            }}
                            data-testid={`checkbox-proposal-${proposal.id}-${ing.toLowerCase().replace(/\s+/g, "-")}`}
                          />
                          <span className="text-sm capitalize">{ing}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-3 justify-end pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveProposalMutation.mutate({ proposalId: proposal.id, chosenIngredients: [], action: "declined" })}
                        disabled={resolveProposalMutation.isPending}
                        data-testid={`button-decline-proposal-${proposal.id}`}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        disabled={selected.size === 0 || resolveProposalMutation.isPending}
                        onClick={() => resolveProposalMutation.mutate({
                          proposalId: proposal.id,
                          chosenIngredients: Array.from(selected),
                          action: "accepted",
                        })}
                        data-testid={`button-accept-proposal-${proposal.id}`}
                      >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Avoid Selected
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isLoading ? (
          <PreferencesSkeleton />
        ) : !data ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">Failed to load preferences.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="liked" className="space-y-5">
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

            <TabsContent value="liked" className="space-y-3">
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

            <TabsContent value="disliked" className="space-y-3">
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

            <TabsContent value="avoided" className="space-y-3">
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
