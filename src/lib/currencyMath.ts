/**
 * Currency Math Utilities
 * 
 * Solves floating-point precision issues by using cents (integer) as the base unit.
 * All monetary calculations should use these functions to ensure accuracy.
 * 
 * Example:
 * - Store: 10050 cents (integer)
 * - Display: $100.50 (formatted)
 * - Calculate: Always in cents, convert only for display
 */

/**
 * Convert dollar amount to cents (integer)
 * Avoids floating-point precision issues
 * 
 * @param amount - Dollar amount (e.g., 100.50)
 * @returns Cents as integer (e.g., 10050)
 * 
 * @example
 * toCents(100.50) // 10050
 * toCents(0.1 + 0.2) // 30 (not 29.999999999999996)
 */
export function toCents(amount: number): number {
    return Math.round(amount * 100);
}

/**
 * Convert cents (integer) to dollar amount
 * 
 * @param cents - Cents as integer (e.g., 10050)
 * @returns Dollar amount (e.g., 100.50)
 * 
 * @example
 * toUnits(10050) // 100.50
 * toUnits(1) // 0.01
 */
export function toUnits(cents: number): number {
    return cents / 100;
}

/**
 * Format cents as currency string with symbol
 * 
 * @param cents - Amount in cents (integer)
 * @param currency - Currency code (AUD, USD, etc.)
 * @returns Formatted string (e.g., "$100.50", "A$100.50")
 * 
 * @example
 * formatCurrency(10050, 'USD') // "$100.50"
 * formatCurrency(10050, 'AUD') // "A$100.50"
 */
export function formatCurrency(cents: number, currency: string): string {
    const amount = toUnits(cents);

    try {
        return amount.toLocaleString('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch (error) {
        // Fallback if currency code is invalid
        return `${currency} ${amount.toFixed(2)}`;
    }
}

/**
 * Calculate cost basis in cents (integer arithmetic)
 * Formula: (price × quantity) + fee
 * 
 * @param priceCents - Price per unit in cents
 * @param quantity - Number of units (can be decimal for fractional shares)
 * @param feeCents - Transaction fee in cents
 * @returns Total cost in cents
 * 
 * @example
 * // Buy 10 shares at $150.25 with $5.00 fee
 * calculateCostBasis(15025, 10, 500) // 150750 cents = $1,507.50
 */
export function calculateCostBasis(
    priceCents: number,
    quantity: number,
    feeCents: number
): number {
    // For fractional shares, we need to handle decimals carefully
    // Convert quantity to integer by multiplying by 10000 (4 decimal places)
    const quantityScaled = Math.round(quantity * 10000);

    // Calculate: (price × quantity) / 10000 + fee
    // This maintains precision for fractional shares
    const costWithoutFee = Math.round((priceCents * quantityScaled) / 10000);

    return costWithoutFee + feeCents;
}

/**
 * Add two amounts in cents
 * 
 * @param cents1 - First amount in cents
 * @param cents2 - Second amount in cents
 * @returns Sum in cents
 * 
 * @example
 * addCents(10050, 2500) // 12550 cents = $125.50
 */
export function addCents(cents1: number, cents2: number): number {
    return cents1 + cents2;
}

/**
 * Subtract two amounts in cents
 * 
 * @param cents1 - Amount to subtract from
 * @param cents2 - Amount to subtract
 * @returns Difference in cents
 * 
 * @example
 * subtractCents(10050, 2500) // 7550 cents = $75.50
 */
export function subtractCents(cents1: number, cents2: number): number {
    return cents1 - cents2;
}

/**
 * Multiply amount in cents by a factor
 * Useful for calculating totals
 * 
 * @param cents - Amount in cents
 * @param factor - Multiplication factor
 * @returns Result in cents
 * 
 * @example
 * multiplyCents(10050, 2) // 20100 cents = $201.00
 */
export function multiplyCents(cents: number, factor: number): number {
    return Math.round(cents * factor);
}

/**
 * Divide amount in cents by a divisor
 * Useful for calculating averages
 * 
 * @param cents - Amount in cents
 * @param divisor - Division factor
 * @returns Result in cents
 * 
 * @example
 * divideCents(10050, 2) // 5025 cents = $50.25
 */
export function divideCents(cents: number, divisor: number): number {
    return Math.round(cents / divisor);
}

/**
 * Calculate percentage of an amount
 * 
 * @param cents - Base amount in cents
 * @param percentage - Percentage (e.g., 5 for 5%)
 * @returns Result in cents
 * 
 * @example
 * percentageOf(10000, 5) // 500 cents = $5.00 (5% of $100)
 */
export function percentageOf(cents: number, percentage: number): number {
    return Math.round((cents * percentage) / 100);
}

/**
 * Calculate weighted average cost in cents
 * Used for calculating average cost basis when buying multiple times
 * 
 * @param positions - Array of {quantity, costCents}
 * @returns Average cost per unit in cents
 * 
 * @example
 * // Bought 10 shares at $150, then 20 shares at $160
 * calculateWeightedAverage([
 *   { quantity: 10, costCents: 15000 },
 *   { quantity: 20, costCents: 16000 }
 * ]) // 15667 cents = $156.67 per share
 */
export function calculateWeightedAverage(
    positions: Array<{ quantity: number; costCents: number }>
): number {
    let totalQuantity = 0;
    let totalCost = 0;

    positions.forEach(({ quantity, costCents }) => {
        // Scale quantity to handle decimals
        const quantityScaled = Math.round(quantity * 10000);
        totalQuantity += quantityScaled;
        totalCost += Math.round((costCents * quantityScaled) / 10000);
    });

    if (totalQuantity === 0) return 0;

    return Math.round((totalCost * 10000) / totalQuantity);
}

/**
 * Calculate profit/loss in cents
 * Formula: (sellPrice × quantity - fee) - costBasis
 * 
 * @param sellPriceCents - Selling price per unit in cents
 * @param quantity - Number of units sold
 * @param feeCents - Transaction fee in cents
 * @param costBasisCents - Original cost basis in cents
 * @returns Profit (positive) or Loss (negative) in cents
 * 
 * @example
 * // Sell 10 shares at $160 with $5 fee, originally bought for $1,500
 * calculateProfitLoss(16000, 10, 500, 150000) // 9500 cents = $95.00 profit
 */
export function calculateProfitLoss(
    sellPriceCents: number,
    quantity: number,
    feeCents: number,
    costBasisCents: number
): number {
    const quantityScaled = Math.round(quantity * 10000);
    const proceeds = Math.round((sellPriceCents * quantityScaled) / 10000) - feeCents;
    return proceeds - costBasisCents;
}

/**
 * Calculate profit/loss percentage
 * Formula: ((currentValue - costBasis) / costBasis) × 100
 * 
 * @param currentValueCents - Current market value in cents
 * @param costBasisCents - Original cost basis in cents
 * @returns Percentage (e.g., 15.5 for 15.5%)
 * 
 * @example
 * // Current value $1,600, cost basis $1,500
 * calculatePLPercent(160000, 150000) // 6.67%
 */
export function calculatePLPercent(
    currentValueCents: number,
    costBasisCents: number
): number {
    if (costBasisCents === 0) return 0;

    const plCents = currentValueCents - costBasisCents;
    return (plCents / costBasisCents) * 100;
}

/**
 * Convert between currencies using exchange rate
 * 
 * @param amountCents - Amount in source currency (cents)
 * @param exchangeRate - Exchange rate (e.g., 1.5 for USD to AUD)
 * @returns Amount in target currency (cents)
 * 
 * @example
 * // Convert $100 USD to AUD at rate 1.5
 * convertCurrency(10000, 1.5) // 15000 cents = A$150.00
 */
export function convertCurrency(
    amountCents: number,
    exchangeRate: number
): number {
    // Scale exchange rate to avoid floating point issues
    const rateScaled = Math.round(exchangeRate * 10000);
    return Math.round((amountCents * rateScaled) / 10000);
}

/**
 * Safe comparison of two amounts in cents
 * Handles rounding errors
 * 
 * @param cents1 - First amount
 * @param cents2 - Second amount
 * @returns true if amounts are equal (within 1 cent tolerance)
 */
export function isEqual(cents1: number, cents2: number): boolean {
    return Math.abs(cents1 - cents2) <= 1;
}

/**
 * Validate that a cents value is a valid integer
 * 
 * @param cents - Value to validate
 * @returns true if valid
 */
export function isValidCents(cents: number): boolean {
    return Number.isInteger(cents) && cents >= 0;
}

/**
 * Parse user input string to cents
 * Handles various formats: "$100.50", "100.50", "100"
 * 
 * @param input - User input string
 * @returns Amount in cents, or null if invalid
 * 
 * @example
 * parseToCents("$100.50") // 10050
 * parseToCents("100.5") // 10050
 * parseToCents("100") // 10000
 * parseToCents("invalid") // null
 */
export function parseToCents(input: string): number | null {
    // Remove currency symbols and whitespace
    const cleaned = input.replace(/[$€£¥A-Z\s]/g, '');

    // Parse as float
    const amount = parseFloat(cleaned);

    if (isNaN(amount) || amount < 0) {
        return null;
    }

    return toCents(amount);
}
