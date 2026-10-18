/**
 * Date formatting utilities for WealthWise AI
 * 
 * Backend: Stores precise timestamps (ISO 8601 format with milliseconds)
 * Frontend: Displays only date (YYYY-MM-DD) for user-facing views
 * AI: Uses full timestamp for "just now" / "latest" queries
 */

import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';

/**
 * Helper: Safely convert any date input to Date object
 * Handles ISO strings, Firestore Timestamps, and Date objects
 */
function toDate(input: any): Date {
    if (input instanceof Date) return input;
    if (typeof input === 'string') return parseISO(input);
    if (input?.toDate) return input.toDate(); // Firestore Timestamp
    if (input?.seconds) return new Date(input.seconds * 1000); // Firestore Timestamp shape
    return new Date(); // Fallback
}

/**
 * Format transaction date for display (user-facing)
 * Shows only: DD MMM YYYY (e.g., "05 Jan 2026")
 * Hides: Hours, minutes, seconds, milliseconds
 */
export function formatTransactionDate(dateInput: any): string {
    try {
        const date = toDate(dateInput);
        return format(date, 'dd MMM yyyy');
    } catch (error) {
        console.error('Invalid date format:', dateInput);
        return 'Invalid Date';
    }
}

/**
 * Format transaction date with relative time (e.g., "2 hours ago")
 * Used in conversation history or recent activity
 */
export function formatTransactionDateRelative(dateInput: any): string {
    try {
        const date = toDate(dateInput);

        if (isToday(date)) {
            return `Today, ${format(date, 'HH:mm')}`;
        }

        if (isYesterday(date)) {
            return `Yesterday, ${format(date, 'HH:mm')}`;
        }

        return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
        console.error('Invalid date format:', dateInput);
        return 'Invalid Date';
    }
}

/**
 * Format transaction date for AI context (full timestamp)
 * Used internally for sorting and "latest transaction" queries
 */
export function formatTransactionDateForAI(dateInput: any): string {
    try {
        const date = toDate(dateInput);
        return date.toISOString();
    } catch (error) {
        console.error('Invalid date format:', dateInput);
        return new Date().toISOString();
    }
}

/**
 * Get current timestamp for new transactions
 * Always returns ISO 8601 format with full precision
 */
export function getCurrentTransactionTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Parse user input date (YYYY-MM-DD) to full timestamp
 * Sets time to current time to maintain chronological order within the same day
 */
export function parseUserInputDate(dateInput: string): string {
    try {
        // If user provides YYYY-MM-DD, append current time
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            const [year, month, day] = dateInput.split('-').map(Number);
            const now = new Date();
            const date = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
            return date.toISOString();
        }

        // If user provides full ISO string, use as-is
        const date = parseISO(dateInput);
        return date.toISOString();
    } catch (error) {
        console.error('Invalid date input:', dateInput);
        return getCurrentTransactionTimestamp();
    }
}

/**
 * Sort transactions by timestamp (newest first)
 * Used by AI to find "latest" or "just now" transactions
 */
export function sortTransactionsByDate<T extends { transactionDate: string }>(
    transactions: T[],
    order: 'asc' | 'desc' = 'desc'
): T[] {
    return [...transactions].sort((a, b) => {
        const dateA = new Date(a.transactionDate).getTime();
        const dateB = new Date(b.transactionDate).getTime();
        return order === 'desc' ? dateB - dateA : dateA - dateB;
    });
}

/**
 * Get the most recent transaction from a list
 */
export function getMostRecentTransaction<T extends { transactionDate: string }>(
    transactions: T[]
): T | null {
    if (!transactions.length) return null;
    const sorted = sortTransactionsByDate(transactions, 'desc');
    return sorted[0];
}

/**
 * Check if a transaction was created within the last N minutes
 */
export function isRecentTransaction(dateString: string, withinMinutes: number = 5): boolean {
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes <= withinMinutes;
    } catch (error) {
        return false;
    }
}
