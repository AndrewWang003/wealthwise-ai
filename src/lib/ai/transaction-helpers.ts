import { ParseTransactionOutput } from '@/ai/flows/parse-transaction-from-natural-language';
import { ErrorCode, PendingIntent } from './types';

// 🌍 Market Name Correction Helper
export const correctMarketName = (input: string): string => {
  const corrections: Record<string, string> = {
    'AUX': 'ASX',
    'HKG': 'HKEX',
    'SHA': 'SSE',
    'SHG': 'SSE',
    'LSE': 'LSE',
    'NYSE': 'NYSE',
    'NASDAQ': 'NASDAQ',
  };
  const upper = input.toUpperCase();
  return corrections[upper] || input;
};

// 📚 High-Confidence Knowledge Base for Ticker Auto-Completion
export const TICKER_KNOWLEDGE_BASE: Record<string, { market: string; currency: string; name?: string }> = {
  // Australian Stocks
  'IIND': { market: 'ASX', currency: 'AUD', name: 'Intelligent Investor' },
  'CBA': { market: 'ASX', currency: 'AUD', name: 'Commonwealth Bank' },
  'BHP': { market: 'ASX', currency: 'AUD', name: 'BHP Group' },
  'WBC': { market: 'ASX', currency: 'AUD', name: 'Westpac' },
  'ANZ': { market: 'ASX', currency: 'AUD', name: 'ANZ Bank' },
  'NAB': { market: 'ASX', currency: 'AUD', name: 'NAB' },
  'WES': { market: 'ASX', currency: 'AUD', name: 'Wesfarmers' },
  'WOW': { market: 'ASX', currency: 'AUD', name: 'Woolworths' },
  'TLS': { market: 'ASX', currency: 'AUD', name: 'Telstra' },
  'CSL': { market: 'ASX', currency: 'AUD', name: 'CSL Limited' },
  'RIO': { market: 'ASX', currency: 'AUD', name: 'Rio Tinto' },
  
  // US Stocks
  'AAPL': { market: 'NASDAQ', currency: 'USD', name: 'Apple' },
  'MSFT': { market: 'NASDAQ', currency: 'USD', name: 'Microsoft' },
  'GOOGL': { market: 'NASDAQ', currency: 'USD', name: 'Google' },
  'AMZN': { market: 'NASDAQ', currency: 'USD', name: 'Amazon' },
  'NVDA': { market: 'NASDAQ', currency: 'USD', name: 'NVIDIA' },
  'TSLA': { market: 'NASDAQ', currency: 'USD', name: 'Tesla' },
  'META': { market: 'NASDAQ', currency: 'USD', name: 'Meta' },
  'JPM': { market: 'NYSE', currency: 'USD', name: 'JP Morgan' },
  'BAC': { market: 'NYSE', currency: 'USD', name: 'Bank of America' },
  'V': { market: 'NYSE', currency: 'USD', name: 'Visa' },
};

// 🔮 RAG Hook: Long-term Memory Query Interface
export const applyLongTermMemory = async (
  parsedData: ParseTransactionOutput,
  userId: string
): Promise<ParseTransactionOutput> => {
  const enrichedData = { ...parsedData };
  
  if (enrichedData.symbol && !enrichedData.market) {
    const knowledgeEntry = TICKER_KNOWLEDGE_BASE[enrichedData.symbol.toUpperCase()];
    if (knowledgeEntry) {
      enrichedData.market = knowledgeEntry.market as any;
      enrichedData.currency = enrichedData.currency || knowledgeEntry.currency as any;
      enrichedData.notes = enrichedData.notes || `Auto-identified: ${knowledgeEntry.name || enrichedData.symbol} (${knowledgeEntry.market})`;
      console.log(`📚 [Knowledge Base] Auto-completed ${enrichedData.symbol}: market=${knowledgeEntry.market}`);
    }
  }
  
  return enrichedData;
};

// 🎩 Butler-Style Inquiry Message Generator
export const generateInquiryMessage = (
  partialData: Partial<ParseTransactionOutput>,
  missingFields: string[],
  userName: string
): string => {
  const { symbol, transactionType, quantity, price } = partialData;
  
  const fieldDescriptions: Record<string, { cn: string; en: string }> = {
    quantity: { cn: '数量', en: 'quantity' },
    price: { cn: '成交价格', en: 'price' },
    date: { cn: '日期', en: 'date' },
    currency: { cn: '币种', en: 'currency' },
  };
  
  const action = transactionType === 'buy' ? { cn: '买入', en: 'buy' } : { cn: '卖出', en: 'sell' };
  const symbolInfo = symbol ? ` ${symbol}` : '';
  
  if (missingFields.length === 2 && missingFields.includes('quantity') && missingFields.includes('price')) {
    return `${userName}，我已经记录下您想${action.cn}${symbolInfo}，但能请您补充一下数量和成交价格吗？`;
  }
  
  if (missingFields.length === 1 && missingFields.includes('price')) {
    const quantityInfo = quantity ? ` ${quantity} 股` : '';
    return `${userName}，我已经记录下您想${action.cn}${quantityInfo}${symbolInfo}，但能请您补充一下成交价格吗？`;
  }
  
  if (missingFields.length === 1 && missingFields.includes('quantity')) {
    return `${userName}，我已经记录下您想${action.cn}${symbolInfo}，但能请您补充一下数量吗？`;
  }
  
  const fieldListCn = missingFields.map(f => fieldDescriptions[f]?.cn || f).join('和');
  return `${userName}，记录已准备好，请问${fieldListCn}分别是多少？`;
};

// 🧩 Intent Merger: Combine pending data with user response
export const mergeIntentWithResponse = async (
  pending: NonNullable<PendingIntent>,
  userResponse: string,
  userId: string
): Promise<{ data: Partial<ParseTransactionOutput>; missingFields: string[]; isComplete: boolean }> => {
  if (!pending) {
    throw new Error('No pending intent to merge');
  }
  
  const { rawData, missingFields } = pending;
  const merged = { ...rawData };
  const mutableMissingFields = [...missingFields];
  
  const numbers = userResponse.match(/\d+(\.\d+)?/g)?.map(Number) || [];
  
  if (mutableMissingFields.includes('quantity') && numbers[0]) {
    merged.quantity = numbers[0];
    mutableMissingFields.splice(mutableMissingFields.indexOf('quantity'), 1);
  }
  
  if (mutableMissingFields.includes('price') && numbers[numbers.length > 1 ? 1 : 0]) {
    merged.price = numbers[numbers.length > 1 ? 1 : 0];
    mutableMissingFields.splice(mutableMissingFields.indexOf('price'), 1);
  }
  
  const enriched = await applyLongTermMemory(merged as ParseTransactionOutput, userId);
  
  return {
    data: enriched,
    missingFields: mutableMissingFields,
    isComplete: mutableMissingFields.length === 0
  };
};

// 🎭 Error Interpreter: Translate technical errors to butler-style messages
export const translateError = (error: any, userName: string = 'there'): { code: ErrorCode; message: string } => {
  let code: ErrorCode = ErrorCode.UNKNOWN;
  
  if (error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT')) {
    code = ErrorCode.TIMEOUT;
  } else if (error.message?.includes('parse') || error.message?.includes('parsing')) {
    code = ErrorCode.PARSING_FAILURE;
  } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
    code = ErrorCode.NETWORK_ERROR;
  } else if (error.message?.includes('validation') || error.message?.includes('invalid')) {
    code = ErrorCode.VALIDATION_ERROR;
  } else if (error.code === 'LOGIC_ERROR' || error.message?.includes('500')) {
    code = ErrorCode.LOGIC_ERROR;
  }
  
  const translations: Record<ErrorCode, string> = {
    [ErrorCode.LOGIC_ERROR]: `${userName}，抱歉，我的大脑刚刚开了一会儿小差，能请您稍后再试一次吗？`,
    [ErrorCode.TIMEOUT]: `${userName}，由于网络信号不太稳定，我还没能成功连接到数据库，建议检查一下网络环境。`,
    [ErrorCode.PARSING_FAILURE]: `${userName}，这段指令我理解起来有点吃力，能请您换一种说法，或者补充一下数量和价格吗？`,
    [ErrorCode.NETWORK_ERROR]: `${userName}，网络连接似乎出现了一些问题，请稍后再试。`,
    [ErrorCode.VALIDATION_ERROR]: `${userName}，这个数据似乎不太对劲，能请您再检查一下吗？`,
    [ErrorCode.UNKNOWN]: `${userName}，抱歉，遇到了一个小问题。请稍后再试，或联系技术支持。`
  };
  
  const message = translations[code];
  console.error(`🛡️ [Error Interpreter] Code: ${code}, Original:`, error);
  
  return { code, message };
};

// 🧮 Fuzzy Matching Logic (Levenshtein Distance)
export const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export const isFuzzyMatch = (input: string, target: string, threshold = 0.8): boolean => {
  const distance = levenshteinDistance(input.toLowerCase(), target.toLowerCase());
  const maxLen = Math.max(input.length, target.length);
  const similarity = 1 - distance / maxLen;
  return similarity >= threshold;
};
