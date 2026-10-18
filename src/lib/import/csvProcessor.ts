import { parse, isValid, format } from 'date-fns';
import { standardizeCategory } from '@/lib/constants/categories';

/**
 * Simple string hash function for generating unique IDs
 * Not cryptographically secure, but sufficient for deduplication
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

/**
 * Generate a unique fingerprint ID for a transaction row
 */
export function generateRowId(date: string, amount: string, description: string, rowIndex: number): string {
  const combined = `${date}|${amount}|${description}|${rowIndex}`;
  return simpleHash(combined);
}

/**
 * Date format patterns
 */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export const DATE_FORMAT_PATTERNS: Record<DateFormat, string> = {
  'DD/MM/YYYY': 'dd/MM/yyyy',
  'MM/DD/YYYY': 'MM/dd/yyyy',
  'YYYY-MM-DD': 'yyyy-MM-dd',
};

/**
 * Parse a date string using the specified format
 * Also tries to handle / vs - variations
 */
export function parseDate(dateStr: string, formatType: DateFormat): Date | null {
  try {
    let cleaned = dateStr.trim();
    
    // Try to normalize date separators: / -> -
    if (formatType === 'YYYY-MM-DD' && cleaned.includes('/')) {
      cleaned = cleaned.replace(/\//g, '-');
    }
    
    const pattern = DATE_FORMAT_PATTERNS[formatType];
    const parsed = parse(cleaned, pattern, new Date());
    
    if (isValid(parsed)) {
      return parsed;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Clean and parse amount string
 * Handles: $1,234.56, (500), "1234.56", etc.
 */
export function cleanAmount(amountStr: string): number | null {
  try {
    let cleaned = amountStr.trim();
    
    // Handle parentheses as negative (accounting format)
    const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
    if (isNegative) {
      cleaned = cleaned.slice(1, -1);
    }
    
    // Remove currency symbols, commas, and quotes
    cleaned = cleaned.replace(/[$,£€¥"']/g, '');
    
    // Parse as number
    const parsed = parseFloat(cleaned);
    
    if (isNaN(parsed)) {
      return null;
    }
    
    return isNegative ? -parsed : parsed;
  } catch (error) {
    return null;
  }
}

/**
 * Processed row for preview
 */
export interface ProcessedRow {
  id: string;
  date: Date | null;
  dateStr: string;
  amount: number | null;
  amountStr: string;
  description: string;
  category?: string;
  isNewCategory?: boolean; // Flag for auto-creation
  type?: string;
  symbol?: string;
  quantity?: number;
  price?: number;
  fee?: number;
  currency?: string;
  isValid: boolean;
  errors: string[];
  rawRow: string[];
}



/**
 * Process CSV rows with mapping and date format
 */
export function processRows(
  rows: string[][],
  headers: string[],
  mapping: {
    date: string;
    amount: string;
    description: string;
    category?: string;
    type?: string;
    symbol?: string;
    quantity?: string;
    price?: string;
    fee?: string;
    currency?: string;
  },
  dateFormat: DateFormat,
  customCategories: string[] = [], // New parameter
  keywordMap?: Record<string, string> // 🆕 AI Keyword Map
): ProcessedRow[] {
  return rows.map((row, index) => {
    const errors: string[] = [];
    
    // Get column indices
    const dateIdx = headers.indexOf(mapping.date);
    const amountIdx = headers.indexOf(mapping.amount);
    const descIdx = headers.indexOf(mapping.description);
    const categoryIdx = mapping.category ? headers.indexOf(mapping.category) : -1;
    const typeIdx = mapping.type ? headers.indexOf(mapping.type) : -1;
    const symbolIdx = mapping.symbol ? headers.indexOf(mapping.symbol) : -1;
    const qtyIdx = mapping.quantity ? headers.indexOf(mapping.quantity) : -1;
    const priceIdx = mapping.price ? headers.indexOf(mapping.price) : -1;
    const feeIdx = mapping.fee ? headers.indexOf(mapping.fee) : -1;
    const currencyIdx = mapping.currency ? headers.indexOf(mapping.currency) : -1;
    
    // Extract values
    const dateStr = row[dateIdx] || '';
    const amountStr = row[amountIdx] || '';
    const description = row[descIdx] || '';
    
    // Parse date
    const parsedDate = parseDate(dateStr, dateFormat);
    if (!parsedDate) {
      errors.push('Invalid date format');
    }
    
    // Parse amount
    const parsedAmount = cleanAmount(amountStr);
    if (parsedAmount === null) {
      errors.push('Invalid amount');
    }
    
    // Validate description
    if (!description.trim()) {
      errors.push('Missing description');
    }
    
    // Parse optional fields
    const rawCategory = categoryIdx >= 0 ? row[categoryIdx]?.trim() : undefined;
    
    // Smart Category Standardization
    let category: string | undefined;
    let isNewCategory = false;
    
    // 1. Try explicit column value
    if (rawCategory) {
        const result = standardizeCategory(rawCategory, customCategories);
        category = result.name;
        isNewCategory = result.isNew;
    }

    // 2. If no category, try AI Keyword Map (Broadcasting)
    if (!category && keywordMap && description) {
        const lowerDesc = description.toLowerCase();
        for (const [keyword, mappedCat] of Object.entries(keywordMap)) {
            if (lowerDesc.includes(keyword.toLowerCase())) {
                const result = standardizeCategory(mappedCat, customCategories);
                category = result.name; // e.g. "Transportation"
                isNewCategory = result.isNew;
                break;
            }
        }
    }
    const quantity = qtyIdx >= 0 ? cleanAmount(row[qtyIdx]) : undefined;
    const price = priceIdx >= 0 ? cleanAmount(row[priceIdx]) : undefined;
    const fee = feeIdx >= 0 ? cleanAmount(row[feeIdx]) : undefined;
    
    // Generate ID (Unique per row)
    const id = generateRowId(dateStr, amountStr, description, index);
    
    return {
      id,
      date: parsedDate,
      dateStr,
      amount: parsedAmount,
      amountStr,
      description,
      category,
      isNewCategory,
      type: typeIdx >= 0 ? row[typeIdx] : undefined,
      symbol: symbolIdx >= 0 ? row[symbolIdx] : undefined,
      quantity: quantity !== null ? quantity : undefined,
      price: price !== null ? price : undefined,
      fee: fee !== null ? fee : undefined,
      currency: currencyIdx >= 0 ? row[currencyIdx] : undefined,
      isValid: errors.length === 0,
      errors,
      rawRow: row,
    };
  });
}
