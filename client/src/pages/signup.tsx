import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Activity, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SignupForm = z.infer<typeof signupSchema>;

export default function Signup() {
  const { signup } = useAuth();
  const [, navigate] = useLocation();
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: SignupForm) {
    setIsPending(true);
    try {
      await signup(data.email, data.password);
      setTimeout(() => navigate("/new-plan"), 50);
    } catch (err: any) {
      toast({
        title: "Signup failed",
        description: err.message?.includes("409") ? "An account with this email already exists" : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/">
          <div className="flex items-center justify-center gap-2 mb-2 cursor-pointer">
            <Activity className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Perform AI</span>
          </div>
          <p className="text-xs text-muted-foreground text-center mb-8">Your personal performance system</p>
        </Link>

        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <h1 className="text-xl font-semibold text-center">Create your account</h1>
            <p className="text-sm text-muted-foreground text-center">Start planning meals in minutes</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" data-testid="input-email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 6 characters" data-testid="input-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isPending} data-testid="button-signup">
                  {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create account
                </Button>
              </form>
            </Form>
            <p className="text-sm text-muted-foreground text-center mt-4">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
