import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { TrendingUp } from "lucide-react";

export default function OnboardingPage() {
  return (
    <div className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <TrendingUp className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Setup Your Portfolio</CardTitle>
          <CardDescription>
            Let&apos;s get started by setting up your initial balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingWizard />
        </CardContent>
      </Card>
    </div>
  );
}
