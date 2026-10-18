'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Next.js Error Boundary caught:', error);
    }, [error]);

    return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center">
            <div className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-10 w-10" />
            </div>
            <h2 className="mb-2 text-2xl font-bold tracking-tight">Something went wrong!</h2>
            <p className="mb-8 max-w-md text-muted-foreground">
                {error.message || "An unexpected error occurred while processing your request."}
            </p>
            <div className="flex gap-4">
                <Button onClick={() => reset()} variant="default">
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Try again
                </Button>
                <Button onClick={() => window.location.href = '/'} variant="outline">
                    Go back home
                </Button>
            </div>
        </div>
    );
}
