'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from 'firebase-admin/app';
import { toUnits } from '@/lib/currencyMath';

// Ensure Admin App is initialized
if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();


export const calculateAggregation = async ({ userId, filter }: { userId: string, filter?: { currency?: string } }) => {
    try {
      if (!userId) {
        throw new Error('userId is required for aggregation.');
      }

      const transactionsRef = db.collection(`users/${userId}/transactions`);
      const snapshot = await transactionsRef.get();

      let incomeInCents = 0;
      let buyInCents = 0;
      let sellInCents = 0;
      let expenseInCents = 0;
      let equityInCents = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // Filter by currency if requested
        if (filter?.currency && data.currency !== filter.currency) {
          return;
        }

        // 🔒 Robust Cents Parsing
        const getCents = (valCents: any, valUnits: any) => {
           if (typeof valCents === 'number') return valCents;
           if (typeof valUnits === 'number') return Math.round(valUnits * 100);
           return 0;
        };

        const priceInCents = getCents(data.priceInCents, data.price);
        const feeInCents = getCents(data.feeInCents, data.fee);
        
        const qty = Number(data.quantity) || 0;
        const type = data.transactionType?.toLowerCase();

        if (type === 'income') {
            incomeInCents += Math.round(qty * 100); 
        } else if (type === 'expense') {
            expenseInCents += Math.round(qty * 100);
        } else if (type === 'equity_adjustment') {
            equityInCents += Math.round(qty * 100);
        } else if (type === 'buy') {
            const costBasis = data.costBasisInCents ?? (Math.round(priceInCents * qty) + feeInCents);
            buyInCents += costBasis;
        } else if (type === 'sell') {
            const proceeds = (Math.round(priceInCents * qty) - feeInCents);
            sellInCents += proceeds;
        }
      });

      const totalIncome = toUnits(incomeInCents);
      const totalBuy = toUnits(buyInCents);
      const totalSell = toUnits(sellInCents);
      const totalExpense = toUnits(expenseInCents);
      const totalEquity = toUnits(equityInCents);

      const netCashFlow = (totalIncome + totalEquity + totalSell) - (totalBuy + totalExpense);

      return {
        totalIncome,
        totalBuy,
        totalSell,
        totalExpense,
        totalEquityInjection: totalEquity,
        netCashFlow,
        mathVerification: `(Income $${totalIncome.toFixed(2)} + Equity $${totalEquity.toFixed(2)} + Sell $${totalSell.toFixed(2)}) - (Buy $${totalBuy.toFixed(2)} + Expense $${totalExpense.toFixed(2)}) = Net Flow $${netCashFlow.toFixed(2)}`
      };

    } catch (error: any) {
      console.error('[aggregateTransactions] Error:', error);
      throw new Error(`Aggregation failed: ${error.message}`);
    }
};

export const aggregateTransactions = ai.defineTool(
  {
    name: 'aggregateTransactions',
    description: 'Aggregates transaction history to calculate totals and verify balances. REQUIRED when user asks about "balance", "spending", "income", or "reconciliation".',
    inputSchema: z.object({
      userId: z.string().describe('The user ID to query data for.'),
      filter: z.object({
        currency: z.string().optional().describe('Filter by currency code (e.g. AUD, USD).'),
      }).optional(),
    }),
    outputSchema: z.object({
      totalIncome: z.number().describe('Sum of "income" transactions.'),
      totalBuy: z.number().describe('Sum of "buy" transactions (cost basis).'),
      totalSell: z.number().describe('Sum of "sell" transactions (proceeds).'),
      totalExpense: z.number().describe('Sum of "expense" transactions.'),
      totalEquityInjection: z.number().describe('Sum of "equity_adjustment" (Initial Capital).'),
      netCashFlow: z.number().describe('Calculated as (Income + Equity + Sell) - (Buy + Expense).'),
      mathVerification: z.string().describe('Readable proof string showing the calculation steps.'),
    }),
  },
  calculateAggregation
);
