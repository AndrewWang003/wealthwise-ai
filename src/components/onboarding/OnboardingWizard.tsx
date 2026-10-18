
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, PlusCircle, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore } from "@/firebase";
import { runTransaction, doc, collection, serverTimestamp } from "firebase/firestore";

const holdingSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").toUpperCase(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  averageCost: z.coerce.number().positive("Average cost must be positive"),
  currency: z.enum(["AUD", "USD"]),
  assetClass: z.enum(["Stock", "Crypto", "AUD Cash", "USD Cash"]),
  market: z.enum(["ASX", "NASDAQ", "NYSE", "US", "Crypto"]),
});

const onboardingSchema = z.object({
  audCash: z.coerce.number().min(0, "Cannot be negative"),
  usdCash: z.coerce.number().min(0, "Cannot be negative"),
  holdings: z.array(holdingSchema),
});

type OnboardingValues = z.infer<typeof onboardingSchema>;

async function completeOnboarding(firestore: any, userId: string, data: OnboardingValues) {
  try {
    await runTransaction(firestore, async (transaction) => {
      // 1. Set user profile
      const userProfileRef = doc(firestore, `users/${userId}/profile/main`);
      transaction.set(userProfileRef, { id: userId, onboardingComplete: true }, { merge: true });

      // 2. Set cash balances
      const audCashRef = doc(firestore, `users/${userId}/cash_accounts/AUD`);
      const usdCashRef = doc(firestore, `users/${userId}/cash_accounts/USD`);
      
      transaction.set(audCashRef, { userId, currency: "AUD", balance: data.audCash, id: 'AUD' });
      transaction.set(usdCashRef, { userId, currency: "USD", balance: data.usdCash, id: 'USD' });
      
      // 3. Create initial holdings and corresponding transactions
      data.holdings.forEach(holding => {
        if(holding.symbol && holding.quantity > 0 && holding.averageCost > 0){
          const newTransactionRef = doc(collection(firestore, `users/${userId}/transactions`));
          const holdingRef = doc(firestore, `users/${userId}/asset_holdings/${holding.symbol}`);

          // Create the initial "buy" transaction
          transaction.set(newTransactionRef, {
            userId: userId,
            transactionType: "buy",
            symbol: holding.symbol,
            quantity: holding.quantity,
            price: holding.averageCost,
            fee: 0,
            transactionDate: new Date().toISOString(),
            currency: holding.currency,
            notes: "Initial holding from onboarding.",
            assetClass: holding.assetClass,
            market: holding.market,
            createdAt: serverTimestamp(),
          });

          // Create the asset holding record
          transaction.set(holdingRef, {
            userId: userId,
            symbol: holding.symbol,
            quantity: holding.quantity,
            averageCost: holding.averageCost,
            currency: holding.currency,
            assetClass: holding.assetClass,
            market: holding.market,
            id: holding.symbol
          });
        }
      });
    });

  } catch (error) {
    console.error("Onboarding transaction failed: ", error);
    if (error instanceof Error) {
        throw new Error(`Could not complete onboarding: ${error.message}`);
    }
    throw new Error("Could not complete onboarding due to an unknown error.");
  }
}

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useUser();
  const firestore = useFirestore();

  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      audCash: 0,
      usdCash: 0,
      holdings: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "holdings",
  });

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const onSubmit = async (data: OnboardingValues) => {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      await completeOnboarding(firestore, user.uid, data);
      toast({ title: "Success", description: "Your portfolio has been set up!" });
      router.push("/dashboard");
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save your details.";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">1. Cash Balances</h3>
            <FormField
              control={form.control}
              name="audCash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>AUD Cash Balance</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 10000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="usdCash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>USD Cash Balance</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 5000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold">2. Existing Stock Holdings</h3>
            <p className="text-sm text-muted-foreground">
              Add any stocks you already own. This is optional.
            </p>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end border p-4 rounded-md relative">
                <FormField
                  control={form.control}
                  name={`holdings.${index}.symbol`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Symbol</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., AAPL" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`holdings.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="10" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`holdings.${index}.averageCost`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avg. Cost</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="150.00" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name={`holdings.${index}.currency`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="AUD">AUD</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`holdings.${index}.assetClass`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asset Class</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select class" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Stock">Stock</SelectItem>
                          <SelectItem value="Crypto">Crypto</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name={`holdings.${index}.market`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Market</FormLabel>
                       <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select market" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           <SelectItem value="ASX">ASX</SelectItem>
                          <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                          <SelectItem value="NYSE">NYSE</SelectItem>
                          <SelectItem value="US">US</SelectItem>
                          <SelectItem value="Crypto">Crypto</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                 <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={() => remove(index)}>
                   <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
             <Button
              type="button"
              variant="outline"
              onClick={() => append({ symbol: '', quantity: 0, averageCost: 0, currency: 'USD', assetClass: 'Stock', market: 'NASDAQ' })}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Holding
            </Button>
          </div>
        )}

        <div className="flex justify-between">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={prevStep}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
          )}
          <div/>
          {step < 2 && (
            <Button type="button" onClick={nextStep}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button type="submit" disabled={isSubmitting || !user}>
               {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finish
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
