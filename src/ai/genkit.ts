// Polyfill for SlowBuffer which is removed in Node 25+ but needed by some legacy dependencies
import { Buffer } from 'node:buffer';
if (typeof (global as any).SlowBuffer === 'undefined') {
  (global as any).SlowBuffer = Buffer;
}

import 'reflect-metadata';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Lazily initialize Genkit instance to avoid evaluation errors in some environments
let _genkitInstance: ReturnType<typeof genkit> | null = null;

export function getGenkit() {
  if (!_genkitInstance) {
    _genkitInstance = genkit({
      plugins: [googleAI({ apiVersion: 'v1beta' })],
      model: 'googleai/gemini-2.5-flash',
    });
  }
  return _genkitInstance;
}

// Use a proxy for the 'ai' export to ensure it's not initialized until actually used, 
// even if imported at the top level of another file.
export const ai = new Proxy({} as ReturnType<typeof genkit>, {
  get(_, prop) {
    const instance = getGenkit();
    return (instance as any)[prop];
  },
});
