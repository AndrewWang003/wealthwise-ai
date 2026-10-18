export const STANDARD_CATEGORIES = [
  'General',
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Travel',
  'Groceries',
  'Personal Care',
  'Gifts & Donations',
  'Other'
] as const;

export type StandardCategory = typeof STANDARD_CATEGORIES[number];

// Smart Alias Map for Fuzzy Matching
// Keys should be lowercased for case-insensitive matching
export const CATEGORY_ALIASES: Record<string, StandardCategory> = {
  // Food & Dining
  'food': 'Food & Dining',
  'dining': 'Food & Dining',
  'restaurant': 'Food & Dining',
  'restaurants': 'Food & Dining',
  'cafe': 'Food & Dining',
  'coffee': 'Food & Dining',
  'fast food': 'Food & Dining',
  'takeout': 'Food & Dining',
  'delivery': 'Food & Dining',
  'bar': 'Food & Dining',
  'pub': 'Food & Dining',
  'lunch': 'Food & Dining',
  'dinner': 'Food & Dining',
  'breakfast': 'Food & Dining',
  'snacks': 'Food & Dining',

  // Transportation
  'gas': 'Transportation',
  'fuel': 'Transportation',
  'petrol': 'Transportation',
  'uber': 'Transportation',
  'lyft': 'Transportation',
  'taxi': 'Transportation',
  'cab': 'Transportation',
  'bus': 'Transportation',
  'train': 'Transportation',
  'subway': 'Transportation',
  'metro': 'Transportation',
  'parking': 'Transportation',
  'transport': 'Transportation',
  'transit': 'Transportation',
  'auto': 'Transportation',
  'car': 'Transportation',
  'vehicle': 'Transportation',
  'tolls': 'Transportation',

  // Shopping
  'clothing': 'Shopping',
  'clothes': 'Shopping',
  'apparel': 'Shopping',
  'shoes': 'Shopping',
  'accessories': 'Shopping',
  'electronics': 'Shopping',
  'gadgets': 'Shopping',
  'furniture': 'Shopping',
  'home decor': 'Shopping',
  'online shopping': 'Shopping',
  'amazon': 'Shopping',
  'ebay': 'Shopping',

  // Groceries
  'supermarket': 'Groceries',
  'grocery': 'Groceries',
  'market': 'Groceries',
  'convenience store': 'Groceries',
  'woolworths': 'Groceries',
  'coles': 'Groceries',
  'aldi': 'Groceries',
  'costco': 'Groceries',

  // Bills & Utilities
  'bills': 'Bills & Utilities',
  'utilities': 'Bills & Utilities',
  'electricity': 'Bills & Utilities',
  'water': 'Bills & Utilities',
  'gas bill': 'Bills & Utilities',
  'internet': 'Bills & Utilities',
  'phone': 'Bills & Utilities',
  'mobile': 'Bills & Utilities',
  'insurance': 'Bills & Utilities',
  'rent': 'Bills & Utilities',
  'mortgage': 'Bills & Utilities',
  'council tax': 'Bills & Utilities',
  'rates': 'Bills & Utilities',

  // Entertainment
  'movies': 'Entertainment',
  'cinema': 'Entertainment',
  'theatre': 'Entertainment',
  'concert': 'Entertainment',
  'music': 'Entertainment',
  'streaming': 'Entertainment',
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'games': 'Entertainment',
  'gaming': 'Entertainment',
  'sports': 'Entertainment',
  'hobbies': 'Entertainment',

  // Healthcare
  'health': 'Healthcare',
  'medical': 'Healthcare',
  'doctor': 'Healthcare',
  'dentist': 'Healthcare',
  'pharmacy': 'Healthcare',
  'drug store': 'Healthcare',
  'medicine': 'Healthcare',
  'hospital': 'Healthcare',
  'gym': 'Healthcare',
  'fitness': 'Healthcare',

  // Travel
  'hotel': 'Travel',
  'accommodation': 'Travel',
  'airbnb': 'Travel',
  'flight': 'Travel',
  'airfare': 'Travel',
  'airline': 'Travel',
  'vacation': 'Travel',
  'holiday': 'Travel',
  'trip': 'Travel',

  // Education
  'school': 'Education',
  'university': 'Education',
  'college': 'Education',
  'tuition': 'Education',
  'course': 'Education',
  'books': 'Education',
  'textbooks': 'Education',
  'learning': 'Education',

  // Personal Care
  'hair': 'Personal Care',
  'salon': 'Personal Care',
  'barber': 'Personal Care',
  'beauty': 'Personal Care',
  'cosmetics': 'Personal Care',
  'spa': 'Personal Care',
  'grooming': 'Personal Care',

  // Gifts & Donations
  'gift': 'Gifts & Donations',
  'present': 'Gifts & Donations',
  'donation': 'Gifts & Donations',
  'charity': 'Gifts & Donations',
  
  // 🆕 Income (All mapped to Other)
  'salary': 'Other',
  'wages': 'Other',
  'payroll': 'Other',
  'pay': 'Other',
  'dividend': 'Other',
  'div': 'Other',
  'distribution': 'Other',
  'interest': 'Other',
  'savings interest': 'Other',
  'term deposit': 'Other',
  
  // 🆕 Australian Merchants - Specifics
  'agl': 'Bills & Utilities',
  'origin energy': 'Bills & Utilities',
  'energy australia': 'Bills & Utilities',
  'telstra': 'Bills & Utilities',
  'optus': 'Bills & Utilities',
  'vodafone': 'Bills & Utilities',
  'nbn': 'Bills & Utilities',
  
  'chemist warehouse': 'Healthcare',
  'priceline': 'Healthcare',
  'terry white': 'Healthcare',
  'blooms': 'Healthcare',
  
  'uber eats': 'Food & Dining',
  'menulog': 'Food & Dining',
  'doordash': 'Food & Dining',
  'deliveroo': 'Food & Dining',
  'mcdonald': 'Food & Dining',
  'hungry jack': 'Food & Dining',
  'kfc': 'Food & Dining',
  
  'bunnings': 'Shopping',
  'ikea': 'Shopping',
  'kmart': 'Shopping',
  'target': 'Shopping',
  'big w': 'Shopping',
  'myer': 'Shopping',
  'david jones': 'Shopping',
};

/**
 * Standardize a raw category string using enhanced matching strategy:
 * 1. Exact Match (Case-Insensitive) on Standard Categories
 * 2. Exact Alias Match
 * 3. Fuzzy Match (check if any alias keyword is CONTAINED in the input)
 * 4. Exact Match on Custom Categories (if provided)
 * 5. Fallback to 'General'
 * 
 * Returns: { name: string; isNew: boolean }
 */
export function standardizeCategory(
  rawInput: string, 
  customCategories: string[] = []
): { name: string; isNew: boolean } {
  if (!rawInput) return { name: 'General', isNew: false };

  const cleanInput = rawInput.trim();
  const lowerInput = cleanInput.toLowerCase();

  // 1. Check Standard Categories (Exact Match)
  const standardMatch = STANDARD_CATEGORIES.find(c => c.toLowerCase() === lowerInput);
  if (standardMatch) {
    return { name: standardMatch, isNew: false };
  }

  // 2. Check Aliases (Exact Match)
  const aliasMatch = CATEGORY_ALIASES[lowerInput];
  if (aliasMatch) {
    return { name: aliasMatch, isNew: false };
  }

  // 3. 🆕 FUZZY MATCH: Check if any alias keyword is CONTAINED in the input
  // Sort aliases by length (longer first) to match more specific terms first
  const sortedAliases = Object.entries(CATEGORY_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [aliasKey, categoryName] of sortedAliases) {
    // Check if the alias keyword appears in the input
    if (lowerInput.includes(aliasKey)) {
      return { name: categoryName, isNew: false };
    }
  }

  // 4. Check Custom Categories (Exact Match)
  const customMatch = customCategories.find(c => c.toLowerCase() === lowerInput);
  if (customMatch) {
    return { name: customMatch, isNew: false };
  }

  // 5. Fallback to 'General' instead of creating new categories
  // This ensures all transactions map to existing categories
  return { name: 'General', isNew: false };
}
