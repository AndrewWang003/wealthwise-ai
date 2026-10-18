'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MapCSVColumnsInputSchema = z.object({
  headers: z.array(z.string()).describe('CSV column headers'),
  sampleRows: z.array(z.array(z.string())).describe('First 5 rows of CSV data'),
});

const MapCSVColumnsOutputSchema = z.object({
  date: z.string().describe('Column name that contains the transaction date'),
  amount: z.string().describe('Column name that contains the transaction amount/value'),
  description: z.string().describe('Column name that contains the description/details'),
  category: z.string().optional().describe('Column name that contains the category'), // 🆕 Added missing field
  type: z.string().optional().describe('Column name that contains the transaction type (buy/sell/income/expense)'),
  symbol: z.string().optional().describe('Column name that contains the stock symbol/ticker'),
  quantity: z.string().optional().describe('Column name that contains the quantity/shares'),
  price: z.string().optional().describe('Column name that contains the price per share'),
  fee: z.string().optional().describe('Column name that contains the transaction fee'),
  currency: z.string().optional().describe('Column name that contains the currency'),
  confidence: z.string().optional().describe('Confidence level of the mapping (high/medium/low)'),
  keywordMap: z.record(z.string(), z.string()).optional().describe('A map of keywords (from description) to Category extracted from the sample data. e.g. {"uber": "Transportation", "woolworths": "Groceries"}'),
});

export type MapCSVColumnsInput = z.infer<typeof MapCSVColumnsInputSchema>;
export type MapCSVColumnsOutput = z.infer<typeof MapCSVColumnsOutputSchema>;

export async function mapCSVColumns(input: MapCSVColumnsInput): Promise<MapCSVColumnsOutput> {
  const systemPrompt = `You are a financial data analyst AI. Your job is two-fold:
1. Map CSV columns to standard transaction fields.
2. Analyze the sample data to build a "Keyword -> Category" inference rule set.

**PART 1: COLUMN MAPPING**
Analyze headers and sample data to find:
- **date** (required)
- **amount** (required)
- **description** (required)
- **category** (optional - if a column exists)
- other optional fields (type, symbol, quantity, price, fee, currency)

**PART 2: KEYWORD EXTRACTION (The "Brain")**
Look at the 'description' field in the sample rows. Identify clear brand names or keywords and map them to a Standard Category.
Standard Categories: General, Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Groceries, Travel.

Example:
- If row description is "UBER *TRIP ....", extract keyword "uber" -> "Transportation"
- If row description is "Woolworths ...", extract keyword "woolworths" -> "Groceries"
- If row description is "Netflix", extract keyword "netflix" -> "Entertainment"

Return this map in the 'keywordMap' field. Keys must be LOWERCASE.

**CRITICAL**:
- Return only exact column names for Part 1.
- Generate as many useful keyword rules as possible from the 5 sample rows for Part 2.

CSV Headers: ${JSON.stringify(input.headers)}
Sample Data (first 5 rows): ${JSON.stringify(input.sampleRows)}

Return JSON adhering to the schema.`;

  const response = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    prompt: systemPrompt,
    output: { schema: MapCSVColumnsOutputSchema },
  });

  const output = response.output;
  if (!output) {
    throw new Error('AI failed to return column mapping');
  }

  return output;
}
