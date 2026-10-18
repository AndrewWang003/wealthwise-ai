'use server';
/**
 * @fileOverview A flow that suggests or appends '.AX' to common ASX tickers without a suffix.
 *
 * - suggestASX: A function that suggests or appends '.AX' to a given ticker.
 * - SuggestASXInput: The input type for the suggestASX function.
 * - SuggestASXOutput: The return type for the suggestASX function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestASXInputSchema = z.object({
  ticker: z.string().describe('The stock ticker to check and potentially append ".AX" to.'),
});
export type SuggestASXInput = z.infer<typeof SuggestASXInputSchema>;

const SuggestASXOutputSchema = z.object({
  suggestedTicker: z
    .string()
    .describe(
      'The stock ticker, with ".AX" appended if it was a common ASX ticker without a suffix.'
    ),
});
export type SuggestASXOutput = z.infer<typeof SuggestASXOutputSchema>;

export async function suggestASX(input: SuggestASXInput): Promise<SuggestASXOutput> {
  return suggestASXFlow(input);
}

const asxSuggestionPrompt = ai.definePrompt({
  name: 'asxSuggestionPrompt',
  input: {schema: SuggestASXInputSchema},
  output: {schema: SuggestASXOutputSchema},
  prompt: `You are a financial assistant that helps users enter Australian stock tickers. If the user enters a common ASX ticker without a suffix, you will automatically suggest or append ".AX" to improve accuracy and convenience. Otherwise, just return the ticker as is.

Ticker: {{{ticker}}}`,
});

const suggestASXFlow = ai.defineFlow(
  {
    name: 'suggestASXFlow',
    inputSchema: SuggestASXInputSchema,
    outputSchema: SuggestASXOutputSchema,
  },
  async input => {
    const {output} = await asxSuggestionPrompt(input);
    return output!;
  }
);
