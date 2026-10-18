// Polyfill for SlowBuffer which is removed in Node 25+ but needed by some legacy dependencies
import { Buffer } from 'node:buffer';
if (typeof (global as any).SlowBuffer === 'undefined') {
    (global as any).SlowBuffer = Buffer;
}

import { config } from 'dotenv';
config({ path: '.env.local' });

import '@/ai/flows/parse-transaction-from-natural-language.ts';
import '@/ai/flows/suggest-asx-ticker-suffix.ts';
import '@/ai/tools/get-stock-price.ts';
import '@/ai/flows/refresh-portfolio-prices.ts';
