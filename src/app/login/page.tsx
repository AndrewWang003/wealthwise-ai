
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Mail, KeyRound, Loader2 } from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useUser, useAuth, useFirestore } from '@/firebase';
import { useEffect } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('tester@test.com');
  const [password, setPassword] = useState('password123');
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [isAnonymousLoading, setIsAnonymousLoading] = useState(false);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const checkOnboardingAndRedirect = async (userId: string) => {
    try {
      const profileRef = doc(firestore, `users/${userId}/profile/main`);
      const profileDoc = await getDoc(profileRef);
      if (profileDoc.exists() && profileDoc.data()?.onboardingComplete) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    } catch (error) {
      console.error("Error checking onboarding:", error);
      router.push('/dashboard'); // Fallback
    }
  };

  const handleLogin = async () => {
    setIsLoginLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await checkOnboardingAndRedirect(userCredential.user.uid);
    } catch (error: any) {
      toast({
        title: 'Authentication Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    setIsRegisterLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      router.push('/onboarding');
    } catch (error: any) {
      toast({
        title: 'Registration Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsRegisterLoading(false);
    }
  };


  const handleAnonymousLogin = async () => {
    setIsAnonymousLoading(true);
    try {
      const userCredential = await signInAnonymously(auth);
      await checkOnboardingAndRedirect(userCredential.user.uid);
    } catch (error: any) {
      toast({
        title: 'Anonymous Sign-In Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsAnonymousLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <TrendingUp className="h-8 w-8" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Welcome to WealthWise AI</CardTitle>
          <CardDescription>Sign in to manage your portfolio intelligently.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="tester@test.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <div className="flex w-full gap-2">
            <Button onClick={handleLogin} disabled={isLoginLoading} className="w-full">
              {isLoginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <Button onClick={handleRegister} disabled={isRegisterLoading} className="w-full" variant="secondary">
              {isRegisterLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register
            </Button>
          </div>
          <Button onClick={handleAnonymousLogin} disabled={isAnonymousLoading} className="w-full" variant="outline">
            {isAnonymousLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In Anonymously
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
