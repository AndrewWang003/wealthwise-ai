# WealthWise AI (Wisecoin)

A personal investment tracker where you record trades and cash movements in plain English, for example *"Bought 10 shares of AAPL at 150"* or *"Convert 500 USD to AUD at 0.66"*. An LLM turns the sentence into a structured transaction, and the app applies it with double-entry rules across AUD and USD cash accounts.

This was my first large project (December 2025 – January 2026, about 240 commits). This is a cleaned public copy: credentials, personal data and internal development notes have been removed, so the commit history starts here.

## What it does

- **Natural-language entry.** A chat-style input sends the sentence to Gemini 2.5 Flash through Genkit, which returns a typed transaction (buy, sell, income, expense, currency exchange). Australian tickers without a suffix get an `.AX` suggestion.
- **Double-entry bookkeeping.** A buy deducts cash from the matching currency account in the same atomic write; a currency exchange debits one account and credits the other; a transaction that would overdraw cash is blocked.
- **Money stored as integer cents.** Prices and balances are stored in cents, not floating-point dollars, to avoid rounding drift in totals.
- **Positions and net worth in AUD.** Holdings and cash are combined in one table with market value, unrealised profit/loss and weight, converted to AUD with the live USD/AUD rate.
- **Dashboards.** Net-worth history, asset allocation, wealth sources and cash-flow charts (Recharts).
- **Onboarding and export.** A first-login wizard for opening balances and holdings; full transaction history export to CSV.
- **Price refresh.** A scheduled job refreshes stock prices (Yahoo Finance) into a shared price cache.

## How it was built

I designed the product and data model and directed AI coding agents (mainly Gemini in Firebase Studio) to implement it, reviewing and testing each change in the running app. Much of the work went into correctness problems that only show up with real numbers: currency precision, cash calibration, safe deletes that keep balances consistent, and stopping charts from flickering during real-time updates.

## Tech stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Firebase (Authentication, Firestore, App Hosting), Genkit with Gemini 2.5 Flash.

Some UI text and code comments are in Chinese.

## Running it

1. Create a Firebase project with Authentication and Firestore enabled.
2. Copy `.env.example` to `.env.local` and fill in the Firebase web app config and a Gemini API key.
3. `npm install`, then `npm run dev` (port 9002).

## Known issues

I am listing these honestly; they would need fixing before real use.

- **Firestore security rules are development-level.** `firestore.rules` lets any signed-in user read and write any document. They should be restricted so each user can only access their own data under `users/{uid}`.
- **The scheduled price-refresh endpoint (`/api/cron/update-prices`) has no authentication.** It should check a secret sent by the scheduler.
- `npm run typecheck` reports 8 existing TypeScript errors (the production build skips type checking).
- `package-lock.json` is out of sync with `package.json`, so `npm ci` fails; use `npm install`.
- No automated tests.

## Licence

Copyright (c) 2026 Andrew Wang. All rights reserved. The source is shared so it can be read and reviewed; please ask before reusing it.
