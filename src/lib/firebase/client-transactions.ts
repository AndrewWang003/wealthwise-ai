import {
  doc,
  getDoc,
  writeBatch,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { ParseTransactionOutput } from '@/ai/flows/parse-transaction-from-natural-language';
import { UserSettings } from '@/lib/types';
import { toCents, toUnits, calculateCostBasis } from '@/lib/currencyMath';

export const generateDisplayId = () => {
  const prefix = 'TX';
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${randomPart}`;
};

export const addTransactionWithClientSDK = async (
  userId: string,
  firestore: any,
  transactionData: ParseTransactionOutput
) => {
  const {
    transactionType,
    currency,
    quantity,
    price,
    fee,
    symbol,
    notes,
    assetClass,
    market,
    ...remainingData
  } = transactionData;


  // 🛡️ SAFETY NET: Fix Income/Currency Quantity Bug
  // CRITICAL: ONLY for INCOME - expenses should keep qty=1, price=total
  // If transactionType is income and it looks like a currency transaction with qty=1, price>1
  // This is a defensive check in case the AI incorrectly parses "Income 2000 CNY" as qty=1, price=2000
  if (transactionType === 'income' && quantity === 1 && price && price > 1) {
    // console.log('🛡️ Safety net condition triggered: transactionType=' + transactionType + ', qty=1, price=' + price);
    
    // CRITICAL: Check currency first - it's the most reliable indicator
    const isCurrencyTransaction = 
      // Primary check: currency field
      ['USD', 'AUD', 'CNY', 'JPY', 'HKD', 'GBP', 'EUR', 'RMB', 'TWD', 'KRW', 'SGD', 'MYR', 'THB', 'VND'].includes(currency || '') ||
      // Secondary checks
      assetClass?.includes('Cash') || 
      ['USD', 'AUD', 'CNY', 'JPY', 'HKD', 'GBP', 'EUR', 'RMB', 'TWD', 'KRW', 'SGD', 'MYR', 'THB', 'VND'].includes(symbol || '') ||
      // Keyword checks
      symbol?.toLowerCase().includes('deposit') ||
      symbol?.toLowerCase().includes('income') ||
      symbol?.toLowerCase().includes('salary') ||
      symbol?.toLowerCase().includes('现金') ||
      symbol?.toLowerCase().includes('收入') ||
      symbol?.toLowerCase().includes('工资') ||
      symbol?.toLowerCase().includes('台币') ||
      symbol?.toLowerCase().includes('人民币');
    
      symbol?.toLowerCase().includes('人民币');
    
    // console.log('🛡️ isCurrencyTransaction check result:', isCurrencyTransaction);
    
    if (isCurrencyTransaction) {
      console.warn('🛡️ SAFETY NET ACTIVATED: Detected income parsing bug');
      
      // Apply correction: for income, quantity should be the amount, price should be 1
      transactionData.quantity = price;
      transactionData.price = 1;
    }
  }

  // Validation: Ensure mandatory fields are present to avoid Firestore errors
  if (!currency || !symbol) {
    if (['buy', 'sell', 'income', 'expense', 'fx', 'set_balance'].includes(transactionType)) {
      throw new Error(`Missing required fields: ${!currency ? 'currency ' : ''}${!symbol ? 'symbol' : ''}. Please provide more details.`);
    }
  }

  try {
    // --- READ PHASE (Simplified: No longer pre-fetching holdings or cash accounts for manual updates) ---
    const settingsRef = doc(firestore, `users/${userId}/settings/config`);
    const settingsSnap = await getDoc(settingsRef);
    const isCashTrackingEnabled = settingsSnap.exists() ? (settingsSnap.data() as UserSettings).isCashTrackingEnabled : false;

    // --- CALCULATION PHASE ---
    const batch = writeBatch(firestore);
    const newTransactionRef = doc(collection(firestore, `users/${userId}/transactions`));
    const transactionDate = remainingData.date && !isNaN(new Date(remainingData.date).getTime())
      ? new Date(remainingData.date).toISOString()
      : new Date().toISOString();
    const displayId = generateDisplayId();

    const calculatedQuantity = transactionData.quantity || 0;
    const calculatedPrice = transactionData.price || 0;
    const calculatedFee = transactionData.fee || 0;

    // 🔒 PRECISION FIX: Convert to cents immediately
    const priceInCents = toCents(calculatedPrice);
    const feeInCents = toCents(calculatedFee);

    // 🔒 PRECISION FIX: Use integer arithmetic for cost basis
    const costBasisInCents = calculateCostBasis(priceInCents, calculatedQuantity, feeInCents);

    // Backward compatibility: Keep original float values for display/debugging
    const costBasis = toUnits(costBasisInCents);

    const fxRate = (transactionType === 'fx') ? calculatedPrice : 1;

    // 💰 CASH IMPACT: Use AI-determined value from parsedData
    // If AI explicitly set impactsCash to false, respect it (for position-only entries)
    // Otherwise, default to the traditional logic for backward compatibility
    const impactsCash = transactionData.impactsCash !== undefined
      ? transactionData.impactsCash
      : ['buy', 'sell', 'income', 'expense', 'fx'].includes(transactionType);

    // (Phase 2): Simplified. We no longer manually update holdings or cash documents.
    // The usePortfolioAggregation hook will handle all calculations from transactions.

    // 所有模式共用：记录详尽的交易信息
    const finalTransactionData = {
      ...remainingData,
      userId,
      transactionType,
      currency,
      quantity: calculatedQuantity,

      // 🔒 PRECISION FIX: Store both cents (for calculation) and units (for backward compatibility)
      priceInCents,           // PRIMARY: Use this for all calculations
      price: calculatedPrice, // DEPRECATED: For backward compatibility and manual inspection

      feeInCents,             // PRIMARY: Use this for all calculations
      fee: calculatedFee,     // DEPRECATED: For backward compatibility and manual inspection

      costBasisInCents,       // PRIMARY: Use this for all calculations
      costBasis,              // DEPRECATED: For backward compatibility and manual inspection

      symbol,
      transactionDate,
      notes: notes || "",
      assetClass: assetClass || "",
      market: market || "",
      displayId,
      fxRate,
      impactsCash,
      metadata: transactionData.metadata,  // 🔍 Track AI parsing intent
      createdAt: serverTimestamp(),
    };

    // Clean up undefined values to avoid Firestore errors
    Object.keys(finalTransactionData).forEach(key => {
      if ((finalTransactionData as any)[key] === undefined) {
        delete (finalTransactionData as any)[key];
      }
    });

    // 🔍 DEBUG: Log the transaction being written
    // console.log('🔥 WRITE DEBUG: About to write transaction:', newTransactionRef.id);

    batch.set(newTransactionRef, finalTransactionData);

    // 4. Commit Batch
    await batch.commit();
    // console.log('✅ WRITE DEBUG: Batch committed successfully for doc:', newTransactionRef.id);

    // 🔑 Return receipt for confirmation message
    return {
      transactionType,
      symbol,
      quantity: calculatedQuantity,
      totalCost: costBasis,
      currency,
      displayId,
      market: market || '',
      impactsCash,  // 💰 Include impactsCash in receipt for UI feedback
    };

  } catch (e: any) {
    console.error('Add transaction failed: ', e);
    throw new Error(`Could not add transaction: ${e.message}`);
  }
};
