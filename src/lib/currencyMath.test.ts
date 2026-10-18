/**
 * Currency Math Test Suite
 * 
 * Run this file to verify currency calculations are accurate
 * Usage: npx tsx src/lib/currencyMath.test.ts
 */

import {
    toCents,
    toUnits,
    formatCurrency,
    calculateCostBasis,
    addCents,
    subtractCents,
    multiplyCents,
    divideCents,
    percentageOf,
    calculateWeightedAverage,
    calculateProfitLoss,
    calculatePLPercent,
    convertCurrency,
    isEqual,
    parseToCents,
} from './currencyMath';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
        testsPassed++;
    } else {
        console.error(`❌ FAIL: ${message}`);
        testsFailed++;
    }
}

function assertEqual(actual: any, expected: any, message: string) {
    assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

console.log('🧪 Running Currency Math Tests...\n');

// Test 1: Basic conversions
console.log('📋 Test Group 1: Basic Conversions');
assertEqual(toCents(100.50), 10050, 'toCents(100.50) should be 10050');
assertEqual(toCents(0.1 + 0.2), 30, 'toCents(0.1 + 0.2) should be 30 (not 29.999...)');
assertEqual(toUnits(10050), 100.50, 'toUnits(10050) should be 100.50');
assertEqual(toUnits(1), 0.01, 'toUnits(1) should be 0.01');
console.log('');

// Test 2: Currency formatting
console.log('📋 Test Group 2: Currency Formatting');
assertEqual(formatCurrency(10050, 'USD'), '$100.50', 'formatCurrency USD');
assertEqual(formatCurrency(10050, 'AUD'), 'A$100.50', 'formatCurrency AUD');
assertEqual(formatCurrency(0, 'USD'), '$0.00', 'formatCurrency zero');
console.log('');

// Test 3: Cost basis calculation
console.log('📋 Test Group 3: Cost Basis Calculation');
// Buy 10 shares at $150.25 with $5.00 fee
assertEqual(
    calculateCostBasis(15025, 10, 500),
    150750,
    'Cost basis: 10 shares @ $150.25 + $5 fee = $1,507.50'
);
// Buy 2.5 shares at $100.00 with $2.50 fee
assertEqual(
    calculateCostBasis(10000, 2.5, 250),
    25250,
    'Cost basis: 2.5 shares @ $100.00 + $2.50 fee = $252.50'
);
console.log('');

// Test 4: Arithmetic operations
console.log('📋 Test Group 4: Arithmetic Operations');
assertEqual(addCents(10050, 2500), 12550, 'Add: $100.50 + $25.00 = $125.50');
assertEqual(subtractCents(10050, 2500), 7550, 'Subtract: $100.50 - $25.00 = $75.50');
assertEqual(multiplyCents(10050, 2), 20100, 'Multiply: $100.50 × 2 = $201.00');
assertEqual(divideCents(10050, 2), 5025, 'Divide: $100.50 ÷ 2 = $50.25');
assertEqual(percentageOf(10000, 5), 500, 'Percentage: 5% of $100.00 = $5.00');
console.log('');

// Test 5: Weighted average
console.log('📋 Test Group 5: Weighted Average Cost');
const avgCost = calculateWeightedAverage([
    { quantity: 10, costCents: 15000 },
    { quantity: 20, costCents: 16000 },
]);
assertEqual(avgCost, 15667, 'Weighted avg: (10@$150 + 20@$160) / 30 = $156.67');
console.log('');

// Test 6: Profit/Loss calculation
console.log('📋 Test Group 6: Profit/Loss Calculation');
// Sell 10 shares at $160 with $5 fee, cost basis $1,500
const pl = calculateProfitLoss(16000, 10, 500, 150000);
assertEqual(pl, 9500, 'P/L: Sell 10@$160 - $5 fee - $1,500 cost = $95.00 profit');

const plPercent = calculatePLPercent(160000, 150000);
assert(
    Math.abs(plPercent - 6.67) < 0.01,
    `P/L%: ($1,600 - $1,500) / $1,500 = 6.67% (got ${plPercent.toFixed(2)}%)`
);
console.log('');

// Test 7: Currency conversion
console.log('📋 Test Group 7: Currency Conversion');
assertEqual(
    convertCurrency(10000, 1.5),
    15000,
    'Convert: $100 USD × 1.5 = A$150.00'
);
console.log('');

// Test 8: Comparison and validation
console.log('📋 Test Group 8: Comparison & Validation');
assert(isEqual(10050, 10050), 'isEqual: 10050 === 10050');
assert(isEqual(10050, 10051), 'isEqual: 10050 ≈ 10051 (within tolerance)');
assert(!isEqual(10050, 10052), 'isEqual: 10050 ≠ 10052 (outside tolerance)');
console.log('');

// Test 9: Parsing user input
console.log('📋 Test Group 9: Parse User Input');
assertEqual(parseToCents('$100.50'), 10050, 'Parse: "$100.50" → 10050');
assertEqual(parseToCents('100.5'), 10050, 'Parse: "100.5" → 10050');
assertEqual(parseToCents('100'), 10000, 'Parse: "100" → 10000');
assertEqual(parseToCents('A$50.25'), 5025, 'Parse: "A$50.25" → 5025');
assertEqual(parseToCents('invalid'), null, 'Parse: "invalid" → null');
console.log('');

// Test 10: Floating-point precision issues
console.log('📋 Test Group 10: Floating-Point Precision (Critical)');
// The classic JavaScript problem: 0.1 + 0.2 !== 0.3
const jsResult = 0.1 + 0.2; // 0.30000000000000004
const ourResult = toUnits(addCents(toCents(0.1), toCents(0.2))); // 0.3

console.log(`  JavaScript: 0.1 + 0.2 = ${jsResult}`);
console.log(`  Our method: 0.1 + 0.2 = ${ourResult}`);
assertEqual(ourResult, 0.3, 'Our method solves 0.1 + 0.2 = 0.3');

// Another example: 0.07 * 100
const jsResult2 = 0.07 * 100; // 7.000000000000001
const ourResult2 = toUnits(multiplyCents(toCents(0.07), 100));

console.log(`  JavaScript: 0.07 × 100 = ${jsResult2}`);
console.log(`  Our method: 0.07 × 100 = ${ourResult2}`);
assertEqual(ourResult2, 7, 'Our method solves 0.07 × 100 = 7');
console.log('');

// Summary
console.log('━'.repeat(50));
console.log(`\n📊 Test Summary:`);
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed! Currency math is working correctly.\n');
    process.exit(0);
} else {
    console.log('\n⚠️  Some tests failed. Please review the implementation.\n');
    process.exit(1);
}
