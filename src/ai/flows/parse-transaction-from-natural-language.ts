'use server';
/**
 * @fileOverview Parses natural language input to extract transaction details, including CRUD intent and page context.
 *
 * - parseTransactionFromNaturalLanguage - A function that parses natural language input and returns structured transaction information.
 * - ParseTransactionInput - The input type for the parseTransactionFrom-language function.
 * - ParseTransactionOutput - The return type for the parseTransactionFromNaturalLanguage function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { z } from 'genkit';
import { calculateAggregation } from '@/ai/tools/aggregate-transactions';

const ParseTransactionInputSchema = z.object({
  naturalLanguageInput: z
    .string()
    .describe('The natural language input describing the transaction or action.'),
  pageContext: z
    .string()
    .optional()
    .describe('The name of the page the user is currently on (e.g., "positions", "transactions").'),
  pageData: z
    .any()
    .optional()
    .describe('A JSON object or array representing the data currently visible on the page.'),
  image: z.string().optional().describe('Base64 image string if user uploaded an attachment.'),
  images: z.array(z.string()).optional().describe('Array of Base64 image strings if user uploaded multiple attachments.'),
  // Adding a field for the dynamic date. It will be added in the flow.
  currentDate: z.string().describe("The current date in YYYY-MM-DD format."),
  userId: z.string().optional().describe("The user ID, required for data aggregation queries."),
});
export type ParseTransactionInput = z.infer<typeof ParseTransactionInputSchema>;

// Define the single transaction item schema (reused for array)
const TransactionItemSchema = z.object({
  transactionType: z
    .string()
    .describe(
      'The type of transaction or action. Can be "buy", "sell", "income", "expense", "fx", "update", "delete", "normalize", "normalize_quantity", "summary", "set_balance", or "refresh_prices".'
    ),
  transactionId: z.string().optional().describe('The ID (docId or displayId) of the transaction or holding to update or delete.'),
  symbol: z
    .string()
    .optional()
    .describe(
      'The stock symbol, asset, or a description of the income/expense. For fx, use format "FROM_TO", e.g., "AUD_USD". For set_balance, use the currency (e.g. "USD").'
    ),
  date: z.string().optional().describe('The date of the transaction (YYYY-MM-DD).'),
  quantity: z.number().optional().describe('The quantity or amount.'),
  price: z.number().optional().describe('The price per share or exchange rate. CRITICAL: For income/currency transactions, this should be 1.0 (not the amount). The amount goes in quantity.'),
  fee: z.number().optional().describe('The transaction fee.'),
  currency: z.string().optional().describe('The transaction currency (e.g., USD, AUD).'),
  notes: z.string().optional().describe('Notes or update fields.'),
  assetClass: z.string().optional().describe('Asset class (Stock, Crypto, Cash).'),
  market: z.enum(['ASX', 'NASDAQ', 'NYSE', 'US', 'HKEX', 'SSE', 'SZSE', 'TSE', 'LSE', 'FX', 'Crypto']).optional(),
  contextualContent: z.string().optional(),
  requiresConfirmation: z.boolean().optional(),
  deleteScope: z.enum(['single', 'symbol', 'all', 'date']).optional().describe('Scope of delete operation: single (1 record), symbol (all records for that symbol), all (everything), date (date-based filtering).'),
  dateFilter: z.object({
    operator: z.enum(['>', '<', '>=', '<=', '==']).optional().describe('Comparison operator for date filter.'),
    value: z.string().optional().describe('Date value in YYYY-MM-DD format to compare against.'),
  }).optional().describe('Date filter for date-scoped deletes. Example: { operator: ">", value: "2026-01-22" } means "delete all where date > 2026-01-22".'),
  confirmationMessage: z.string().optional(),
  impactsCash: z.boolean().describe('True if this modifies cash balance.'),
  metadata: z.object({
    parsedIntent: z.enum(['trade', 'initial_holding', 'inquiry']).optional(),
    needsAggregation: z.boolean().optional(),
  }).optional(),
  scope: z.enum(['INVESTMENT', 'LIFESTYLE']).optional(),
  category: z.string().optional(),
});

const ParseTransactionOutputSchema = z.object({
  // Legacy single transaction fields (optional for backward compat, but we prefer array)
  ...TransactionItemSchema.shape,
  
  // New Batch Field
  transactions: z.array(TransactionItemSchema).optional().describe('Array of transactions if multiple actions detected.'),
});

export type ParseTransactionOutput = z.infer<typeof ParseTransactionOutputSchema>;

// The exported function signature remains the same, without `currentDate`
export async function parseTransactionFromNaturalLanguage(
  input: Omit<ParseTransactionInput, 'currentDate'>
): Promise<ParseTransactionOutput> {
  // The current date is added here, at runtime.
  const fullInput: ParseTransactionInput = {
    ...input,
    currentDate: new Date().toISOString().split('T')[0],
  };
  return parseTransactionFlow(fullInput);
}

const parseTransactionPrompt = ai.definePrompt({
  name: 'parseTransactionPrompt',
  input: { schema: ParseTransactionInputSchema },
  output: { schema: ParseTransactionOutputSchema },
  model: 'googleai/gemini-2.5-flash',
  prompt: `You are a financial expert AI that parses natural language into structured JSON, now with contextual awareness and CRUD capabilities.

  Today's date is {{{currentDate}}}. You MUST use this as the reference for any relative date calculations (e.g., "today", "yesterday").

  You will receive user input, and optionally, the 'pageContext' (the page they are on) and 'pageData' (the data they see).

  ⚠️ **CRITICAL RULE #1 - INCOME/CURRENCY PARSING (HIGHEST PRIORITY)** ⚠️:
  
  **BEFORE** processing ANY other logic, check if this is an INCOME or CURRENCY transaction:
  
  Keywords indicating INCOME: "收入", "income", "工资", "salary", "赚", "earned", "received", "台币", "人民币", "美元", "澳币"
  
  **IF** the input contains INCOME keywords AND a number (e.g., "今天收入2000台币", "income 5000 USD", "工资3000人民币"):
  
  ✅ **CORRECT PARSING FOR INCOME:**
  - transactionType: "income"
  - quantity: [THE AMOUNT] (e.g., 2000, 5000, 3000)
  - price: 1 (ALWAYS 1 for income!)
  - currency: [EXTRACTED CURRENCY] (TWD, USD, CNY, etc.)
  - symbol: "Cash Income" or identifier from user input
  - assetClass: "Cash" (DO NOT use "USD Cash", "AUD Cash" etc. Just "Cash" or "Deposit")
  
  ❌ **NEVER DO THIS FOR INCOME:**
  - quantity: 1, price: 2000  ← WRONG! This is the common error!
  
  **EXAMPLES (MEMORIZE THESE):**
  - "今天收入2000台币" → { transactionType: "income", quantity: 2000, price: 1, currency: "TWD", assetClass: "Cash" }
  - "本月收入人民币3000" → { transactionType: "income", quantity: 3000, price: 1, currency: "CNY", assetClass: "Cash" }
  - "income 5000 USD" → { transactionType: "income", quantity: 5000, price: 1, currency: "USD", assetClass: "Cash" }
  - "工资8000澳币" → { transactionType: "income", quantity: 8000, price: 1, currency: "AUD", assetClass: "Cash" }

  CORE ACTIONS:
  1.  **Transaction Parsing & Global Market Intelligence**:
      - **BATCH MODE**: If input contains multiple lines or distinct actions (e.g. copied from Excel or a list), parse them all.
      - Return the result in the 'transactions' array field.
      - If only one transaction, you can still use the 'transactions' array with 1 item.
      - **CRITICAL RULE**: For "buy" or "sell", you MUST set 'assetClass' to "Stock".
      
  🆕 **V2.0 DUAL-TRACK TAXONOMY (INVESTMENT vs LIFESTYLE)**:
      
      **SCOPE DETECTION RULES (HIGHEST PRIORITY)**:
      
      A) **Scope: INVESTMENT** - Set when transaction involves:
         - Stock/crypto ticker symbols (AAPL, BHP.AX, BTC, etc.)
         - Keywords: "buy", "sell", "股票", "加仓", "减仓", "dividend", "股息"
         - Cash operations: "deposit", "withdraw", "存入", "转入", "入金", "出金"
         - Examples:
           * "bought 10 AAPL at 150" → scope: "INVESTMENT"
           * "卖出 50 股 CBA" → scope: "INVESTMENT"
           * "存入5000美元" → scope: "INVESTMENT"
           * "收到 BHP 股息 200 澳币" → scope: "INVESTMENT"
      
      B) **Scope: LIFESTYLE** - Set when transaction involves:
         - Daily living expenses, income, bills, rent, groceries, dining, transportation
         - Keywords: "房租", "吃饭", "超市", "加油", "工资", "账单", "租金", "咖啡"
         - Keywords: "rent", "food", "groceries", "gas", "salary", "bill", "utilities", "coffee"
         - NO ticker symbols present
         - Examples:
           * "付房租2000澳币" → scope: "LIFESTYLE", category: "Housing"
           * "工资5000" → scope: "LIFESTYLE", category: "Income"
           * "超市买菜花了150" → scope: "LIFESTYLE", category: "Groceries"
           * "paid rent 2000" → scope: "LIFESTYLE", category: "Housing"
      
      **CATEGORY MAPPING (For LIFESTYLE scope ONLY)**:
      When scope is LIFESTYLE, you MUST assign a category from this standardized list:
      
      | Category    | Keywords/Scenarios                                      | Type    |
      |-------------|--------------------------------------------------------|---------|
      | Housing     | 房租, 房贷, 物业费, rent, mortgage, property fee       | EXPENSE |
      | Food        | 吃饭, 餐厅, 外卖, dining, restaurant, takeout, coffee  | EXPENSE |
      | Groceries   | 超市, 买菜, Coles, Woolworths, supermarket            | EXPENSE |
      | Transport   | 打车, 加油, 公交, Uber, gas, fuel, taxi, parking      | EXPENSE |
      | Utilities   | 水电煤, 话费, 宽带, 账单, water, electricity, internet | EXPENSE |
      | Shopping    | 衣服, 购物, 淘宝, shopping, clothes, Amazon           | EXPENSE |
      | Entertainment| 电影, 游戏, Netflix, Spotify, movie, gaming          | EXPENSE |
      | Health      | 医院, 药店, 健身, hospital, pharmacy, gym             | EXPENSE |
      | Income      | 工资, 奖金, 外快, 退税, salary, bonus, refund         | INCOME  |
      | General     | 其他无法归类的支出 (fallback)                          | EXPENSE |
      
      **CRITICAL EXAMPLES**:
      ✅ CORRECT:
      - "我今天付房租花了2000澳币" → { scope: "LIFESTYLE", category: "Housing", transactionType: "expense", quantity: 2000 }
      - "工资到账5000" → { scope: "LIFESTYLE", category: "Income", transactionType: "income", quantity: 5000 }
      - "超市买菜150" → { scope: "LIFESTYLE", category: "Groceries", transactionType: "expense", quantity: 150 }
      - "paid rent 2000 AUD" → { scope: "LIFESTYLE", category: "Housing", transactionType: "expense", quantity: 2000 }
      
      ❌ INCORRECT:
      - "付房租2000" → scope: "INVESTMENT" ⚠️ WRONG! This is LIFESTYLE + Housing
      - "工资5000" → scope: "INVESTMENT" ⚠️ WRONG! This is LIFESTYLE + Income
      
      **DEFAULT LOGIC**:
      - If NO scope is set and transactionType is "income" or "expense" WITHOUT ticker → Default to LIFESTYLE
      - If ticker symbol is present (AAPL, BHP.AX, etc.) → Default to INVESTMENT
      
  2.  **ACCOUNTING INQUIRIES (Data Query)**:
      - If user asks about 'balance', 'reconciliation', 'audit', 'how much did I spend', or 'why is my balance X':
      - SET 'transactionType' to "inquiry".
      - SET 'metadata.needsAggregation' to "true".
      - SET 'metadata.parsedIntent' to "inquiry".
      - DO NOT try to answer the question with guessed numbers. The system will auto-calculate standard audit data.
      - In 'notes', summarize the user's question.
      
      - **🌍 GLOBAL MARKET RESOLVER** (STRICT Priority Order):
        
        **🛡️ PRIORITY SHIELD (ABSOLUTE HIGHEST)**: 
           - If user EXPLICITLY states market (e.g. "市场为ASX", "market is ASX", "on ASX", "ASX market")
           - You MUST use that exact market, DO NOT override or change it
           - Lock the market field immediately, ignore all other rules below
           - Examples:
             * "买入 IIND 100股 价格40，市场为ASX" -> market: "ASX" (LOCKED)
             * "buy UNKNOWN ticker, market is HKEX" -> market: "HKEX" (LOCKED)
        
        A) **Symbol Suffix Detection (SECOND PRIORITY)**:
           - .AX or .ASX -> market: "ASX" (Australia), currency: "AUD"
           - .HK -> market: "HKEX" (Hong Kong), currency: "HKD"
           - .SS -> market: "SSE" (Shanghai), currency: "CNY"
           - .SZ -> market: "SZSE" (Shenzhen), currency: "CNY"
           - .T or .TYO -> market: "TSE" (Tokyo), currency: "JPY"
           - .TW -> market: "TSE" (Taiwan), currency: "TWD"
           - .L or .LON -> market: "LSE" (London), currency: "GBP"
        
        B) **Knowledge Base Lookup (THIRD PRIORITY)**:
           - For well-known tickers without suffix (AAPL, NVDA, TSLA, GOOGL, AMZN, MSFT, META, etc.)
           - Use your internal knowledge to determine primary exchange
           - AAPL/MSFT/GOOGL -> "NASDAQ", JPM/BAC -> "NYSE"
        
        C) **Fuzzy Market Name Correction**:
           - "AUX" -> "ASX"
           - "HKG" -> "HKEX"
           - "SHA"/"SHG" -> "SSE"
        
        D) **LAST RESORT Default** (ONLY if all above fail):
           - Unknown ticker with no suffix, no user specification, not in knowledge base
           - Default to "US" market, currency: "USD"
           - ⚠️ Use this sparingly, prefer asking user for clarification in 'notes'
      
      - For cash transactions ('income', 'expense'), set market based on currency:
        * AUD -> market: "ASX"
        * USD -> market: "US"
        * CNY/RMB -> market: "SSE"
        * HKD -> market: "HKEX"
        * JPY -> market: "TSE"
        * GBP -> market: "LSE"
      - 'date' defaults to today ({{{currentDate}}}). 'fee' defaults to 0.
      
      - **💰 CASH IMPACT DETECTION (CRITICAL)**:
        * **Intent A - Real Transaction** (impactsCash: true):
          - User says: "买入/卖出", "buy/sell", "bought/sold", "purchase", "收入", "income", "支出", "expense", "换汇", "convert"
          - These are REAL transactions that happened and should modify cash balance
          - Set 'impactsCash' to TRUE
          - Examples: "bought 10 AAPL at 150", "卖出 50 股 CBA", "salary 5000 AUD"
        
        * **Intent B - Position-Only Entry** (impactsCash: false):
          - User says: "添加持仓", "录入持仓", "我有", "I have", "add position", "add holding", "record existing", "原始持仓", "initial position"
          - These are EXISTING positions being recorded, should NOT modify cash balance
          - Set 'impactsCash' to FALSE
          - Set 'transactionType' to "buy" (for stocks) but with impactsCash=false
          - Examples: "添加 100 股 CBA 原始持仓，均价 105", "I have 50 shares of AAPL at average cost 170", "录入我的 TSLA 持仓 20 股，成本 200"


  2.  **Cash Operations (CRITICAL DISTINCTION)**:
      📌 **Type A: Incremental Deposit (income)** - Use this for ADD operations:
         - Keywords: "存入", "转入", "多了", "增加现金", "deposit", "add cash", "transfer in", "received"
         - User says: "存入5000美元", "转入2000 AUD", "deposit 3000 USD", "我账户多了8000美元"
         - Action: transactionType = "income", this ADDS to existing balance
         - Set 'currency' to the target currency (USD, AUD, CNY, etc.)
         - Set 'quantity' to the amount being deposited
         - Set 'symbol' to a descriptive name (e.g., "Cash Deposit", "转账") 
         - Examples:
           * "存入5000美元" -> { transactionType: "income", symbol: "Cash Deposit", quantity: 5000, currency: "USD", assetClass: "USD Cash", market: "US", notes: "存入5000美元" }
           * "deposit 2000 AUD" -> { transactionType: "income", symbol: "Cash Deposit", quantity: 2000, currency: "AUD", assetClass: "AUD Cash", market: "ASX" }

      📌 **Type B: Balance Sync/Override (set_balance)** - Use this ONLY for TOTAL balance setting:
         - Keywords: "我现在总共有", "同步余额为", "set balance to", "total balance is", "校准为", "现金余额是"
         - User says: "我现在总共有15000美元", "同步USD余额为8000", "set my USD balance to 10000"
         - Action: transactionType = "set_balance", this OVERWRITES existing balance
         - **SAFETY**: ALWAYS set requiresConfirmation: true for set_balance
         - Set confirmationMessage to warn about overwriting: "⚠️ 检测到余额校准指令，这将覆盖自动计算的现金余额。当前操作将设置 {currency} 为 {quantity}。确定吗？"
         - 'symbol' and 'currency' should be the currency code (e.g., "USD", "CNY", "AUD")
         - Examples:
           * "我现在总共有15000美元" -> { transactionType: "set_balance", symbol: "USD", quantity: 15000, price: 1, currency: "USD", assetClass: "USD Cash", market: "US", requiresConfirmation: true, confirmationMessage: "⚠️ 检测到余额校准指令，这将覆盖自动计算的USD余额为 15000。确定吗？" }
           * "set my AUD balance to 50000" -> { transactionType: "set_balance", symbol: "AUD", quantity: 50000, currency: "AUD", requiresConfirmation: true, confirmationMessage: "⚠️ Balance sync detected. This will override your AUD balance to 50000. Confirm?" }

      📌 **Type C: Simple Cash Recording (for backward compatibility)**:
         - If user says "录入X元现金" without clear incremental or total context
         - Default to "income" (incremental) to be conservative
         - Example: "录入5000美元现金" -> income (adds 5000 USD)

  3.  CRUD Actions (update, delete):
      - For "update" or "delete", your primary goal is to identify the asset's SYMBOL.
      - If the user says "delete transaction for AAPL", extract "AAPL" into 'symbol'.
      - For "update", you MUST extract any NEW values into the corresponding fields:
        - e.g., "change price of AAPL to 251" -> { transactionType: "update", symbol: "AAPL", price: 251 }
        - e.g., "change quantity to 50 for my last TSLA buy" -> { transactionType: "update", symbol: "TSLA", quantity: 50 }
      - Use the 'notes' field to capture any non-standard update instructions or context (e.g., "last transaction").
      - CONTEXTUAL: If on 'positions' page and user says "update notes for TSLA", find the object with symbol 'TSLA' in pageData and use its 'symbol'.
      
      - **DELETE SAFETY RULES**:
        a) SINGLE DELETE (no confirmation needed):
           - "delete the last transaction" -> { transactionType: "delete", deleteScope: "single", requiresConfirmation: false }
           - "delete transaction #TX-123" -> { transactionType: "delete", transactionId: "TX-123", deleteScope: "single", requiresConfirmation: false }
        
        b) SYMBOL DELETE (requires confirmation):
           - "delete all AAPL transactions" -> { transactionType: "delete", symbol: "AAPL", deleteScope: "symbol", requiresConfirmation: true, confirmationMessage: "This will delete ALL transactions for AAPL. Type 'confirm' to proceed." }
           - "remove all my Tesla shares" -> { transactionType: "delete", symbol: "TSLA", deleteScope: "symbol", requiresConfirmation: true, confirmationMessage: "This will delete ALL transactions for TSLA. Type 'confirm' to proceed." }
        
        c) DELETE ALL (requires typing "delete"):
           - "delete all transactions" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ WARNING: This will DELETE ALL your transactions permanently! Type 'delete' (exactly) to confirm." }
           - "clear all my data" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ WARNING: This will DELETE ALL your transactions permanently! Type 'delete' (exactly) to confirm." }
           - "删除所有交易" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ 警告：这将永久删除所有交易记录！请输入 'delete' 确认。" }
        
        d) DATE-BASED DELETE (requires confirmation):
           **⚠️ DATE BOUNDARY RULE (CRITICAL):**
           - When user says "after [Date]" or "from [Date]", default to **INCLUSIVE** operator (\`>=\`).
           - When user says "before [Date]" or "until [Date]", default to **INCLUSIVE** operator (\`<=\`).
           - **Reason:** Most transaction timestamps are at midnight (00:00:00). Using strict \`>\` excludes the mentioned date, often resulting in 0 matches.
           - **Exception:** Only use strict \`>\` or \`<\` if user EXPLICITLY says "strictly after" or "excluding [Date]".
           
           - "delete all transactions after 2026-01-22" -> { transactionType: "delete", deleteScope: "date", dateFilter: { operator: ">=", value: "2026-01-22" }, requiresConfirmation: true, confirmationMessage: "This will delete all transactions with date >= 2026-01-22. Confirm?" }
           - "删除日期大于2026年1月22日的所有交易" -> { transactionType: "delete", deleteScope: "date", dateFilter: { operator: ">=", value: "2026-01-22" }, requiresConfirmation: true, confirmationMessage: "这将删除所有日期 >= 2026-01-22 的交易记录。确认吗？" }
           - "删除2026年3月14日之后的所有交易" -> { transactionType: "delete", deleteScope: "date", dateFilter: { operator: ">=", value: "2026-03-14" }, requiresConfirmation: true, confirmationMessage: "这将删除所有日期 >= 2026-03-14 的交易记录。确认吗？" }
           - "remove transactions before 2025-06-01" -> { transactionType: "delete", deleteScope: "date", dateFilter: { operator: "<=", value: "2025-06-01" }, requiresConfirmation: true, confirmationMessage: "..." }
           - "delete transactions STRICTLY after 2026-01-22" -> { transactionType: "delete", deleteScope: "date", dateFilter: { operator: ">", value: "2026-01-22" }, requiresConfirmation: true, confirmationMessage: "..." }
         
         e) DATA NORMALIZATION (fix quantity inflation):
            - When user requests to "normalize", "fix quantity", "correct price/quantity ratio", or "set all quantities to 1"
            - Set transactionType to "normalize" or "normalize_quantity"
            - This will find all LIFESTYLE transactions where Quantity > 1, then:
              * Calculate new Price = Current Price × Current Quantity
              * Set Quantity = 1
              * Preserve original values in notes for audit trail
            - Examples:
              * "normalize all transactions" -> { transactionType: "normalize" }
              * "fix quantity inflation" -> { transactionType: "normalize_quantity" }
              * "set all lifestyle quantities to 1" -> { transactionType: "normalize" }
              * "修正数量膨胀问题" -> { transactionType: "normalize" }
         
         f) DATE-BASED UPDATE (requires confirmation):
           - Uses the same DATE BOUNDARY RULE as deletes (default to inclusive operators).
           - "update notes to 'IMPORTED' for all transactions after 2026-01-22" -> { transactionType: "update", dateFilter: { operator: ">=", value: "2026-01-22" }, notes: "IMPORTED", requiresConfirmation: true, confirmationMessage: "This will update notes for all transactions with date >= 2026-01-22. Confirm?" }
           - "将2026年4月之后的所有交易备注改为 'TEST'" -> { transactionType: "update", dateFilter: { operator: ">=", value: "2026-04-01" }, notes: "TEST", requiresConfirmation: true, confirmationMessage: "这将更新所有日期 >= 2026-04-01 交易的备注。确认吗？" }
        
        g) DATE-BASED QUERY/INQUIRY:
           - "show me all transactions after 2026-01-22" -> { transactionType: "inquiry", dateFilter: { operator: ">=", value: "2026-01-22" }, metadata: { parsedIntent: "inquiry" } }
           - "显示2026年1月22日之后的所有交易" -> { transactionType: "inquiry", dateFilter: { operator: ">=", value: "2026-01-22" }, metadata: { parsedIntent: "inquiry" } }
           - "list transactions before 2025-12-01" -> { transactionType: "inquiry", dateFilter: { operator: "<=", value: "2025-12-01" }, metadata: { parsedIntent: "inquiry" } }
  
  4. Price Refresh (refresh_prices):
     - If the user asks to refresh, update, or get the latest prices (e.g., "refresh prices", "get latest market value").
     - Set 'transactionType' to "refresh_prices".
     - Leave all other fields empty.
 
  5.  Contextual Summarization (summary):
      - If the user asks for a summary (e.g., "summarize this page"), and 'pageContext' is provided:
        - Set 'transactionType' to "summary".
        - Analyze 'pageData' and generate a concise summary.
        - Put the summary text into the 'contextualContent' field.
        - Leave other transaction fields empty.
 
  EXAMPLES:
  - Input: "bought 10 CBA.AX at $120" -> Output: { transactionType: "buy", symbol: "CBA.AX", date: "{{{currentDate}}}", quantity: 10, price: 120, fee: 0, currency: "AUD", notes: "bought 10 CBA.AX at $120", assetClass: "Stock", market: "ASX", impactsCash: true }
  - Input: "bought 10 AAPL at 170" -> Output: { transactionType: "buy", symbol: "AAPL", date: "{{{currentDate}}}", quantity: 10, price: 170, fee: 0, currency: "USD", notes: "bought 10 AAPL at 170", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "添加 100 股 CBA 原始持仓，均价 105" -> Output: { transactionType: "buy", symbol: "CBA.AX", quantity: 100, price: 105, fee: 0, currency: "AUD", notes: "添加 100 股 CBA 原始持仓，均价 105", assetClass: "Stock", market: "ASX", impactsCash: false }
  - Input: "I have 50 shares of NVDA at average cost 130" -> Output: { transactionType: "buy", symbol: "NVDA", quantity: 50, price: 130, fee: 0, currency: "USD", notes: "I have 50 shares of NVDA at average cost 130", assetClass: "Stock", market: "NASDAQ", impactsCash: false }
  - Input: "买入 100 股 NVDA，价格 130" -> Output: { transactionType: "buy", symbol: "NVDA", quantity: 100, price: 130, currency: "USD", notes: "买入 100 股 NVDA，价格 130", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "买TSLA, 150, 10股" -> Output: { transactionType: "buy", symbol: "TSLA", quantity: 10, price: 150, currency: "USD", notes: "买TSLA, 150, 10股", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "请帮我更改一下最近一次AAPL的交易价格为251" -> Output: { transactionType: "update", symbol: "AAPL", price: 251, notes: "last transaction" }
  - Input: "将 NVDA 的数量改为 50" -> Output: { transactionType: "update", symbol: "NVDA", quantity: 50 }
  - Input: "set my usd account to 5000" -> Output: { transactionType: "set_balance", symbol: "USD", quantity: 5000, price: 1, currency: "USD", notes: "Set USD balance to 5000", assetClass: "USD Cash", market: "US" }
  - Input: "delete all my AAPL shares" -> Output: { transactionType: "delete", symbol: "AAPL", ...other fields empty... }
  - Input: "refresh my portfolio value" -> Output: { transactionType: "refresh_prices", ...other fields empty... }
  - Input: "summarize this for me", pageContext: "positions", pageData: {positions: [{symbol: 'TSLA', marketValueAUD: 15000}, ...], totalMarketValueAUD: 25000} -> Output: { transactionType: "summary", contextualContent: "You are viewing your positions page. Your total portfolio is valued at A$25,000, with TSLA being a significant holding.", ...other fields empty... }
 
  CRITICAL: You must extract numbers accurately. For "Symbol, Price, Quantity" comma-separated formats, pay close attention to which number represents the price and which represents quantity (shares/股).
  
 
  User Input: {{{naturalLanguageInput}}}
  Page Context: {{{pageContext}}}
  Page Data: {{{pageData}}}
  `,
});

const parseTransactionFlow = ai.defineFlow(
  {
    name: 'parseTransactionFlow',
    inputSchema: ParseTransactionInputSchema,
    outputSchema: ParseTransactionOutputSchema,
  },
  async input => {
    // 🏗️ Construct Multimodal Prompt manually to support Image
    // We cannot easily use `parseTransactionPrompt` with dynamic media in Genkit v0.5/v0.9 consistently across all adapters.
    // So we invoke the model directly using the same system prompt logic.

    const systemPrompt = `You are a financial expert AI that parses natural language into structured JSON, now with contextual awareness and CRUD capabilities.

  Today's date is ${input.currentDate}. You MUST use this as the reference for any relative date calculations (e.g., "today", "yesterday").

  You will receive user input, and optionally, the 'pageContext' (the page they are on) and 'pageData' (the data they see).
  
  🆕 **VISION CAPABILITIES (STRICT PROTOCOL)**:
  - If the user provides IMAGES (e.g., receipts, screenshots, invoices):
  
  > **IMAGE ANALYSIS RULES:**
  > 1.  **OCR & Extract:** Identify Date, Transaction Type (Buy/Sell/Expense), Symbol/Merchant, Quantity, Price, Fee, and Total.
  > 2.  **Normalize Data:**
  >     -   **Date:** Format as 'YYYY-MM-DD'. If year is missing, assume current year. Only extract the business date. DO NOT generate 'timestamp' or 'createdAt'.
  >     -   **Type:** Map to strict enum: ['buy', 'sell', 'income', 'expense'].
  >     -   **Symbol:**
  >         -   If Investment: Extract Ticker (e.g., "HJPN", "AAPL").
  >         -   If Expense: Extract Merchant Name (e.g., "Starbucks") or Category.
  >     -   **Quantity/Price (CRITICAL FUNGIBLE ASSET RULE):**
  >         -   **Investment (Stocks):** Extract explicit Qty and Unit Price.
  >         -   **Income/Currency Deposits:** Set quantity: Amount, Set price: 1.0
  >         -   **Expense (Lifestyle):** Set quantity: 1, Set price: Total Amount
  >         -   **Explanation:** 
  >             * Income of "10,000 JPY" means you RECEIVED 10,000 units of JPY currency → quantity: 10000, price: 1
  >             * Expense of "100 AUD coffee" means 1 transaction costing 100 AUD → quantity: 1, price: 100
  > 3.  **Strict Output JSON:** Return the data in the **SAME** 'transactions' array structure used for text inputs.
  >     - **NO ID GENERATION:** Do NOT include an 'id' or '_id' field.
  >     - **Currency:** Infer from symbol or text ($ -> USD, A$ -> AUD).
  >
  >   **FORMAT**: Return strict JSON array Transaction[].
  >   If image is blurry or ambiguous, mark low confidence fields as null or inferred in notes.


  🆕 **CSV/DATA PARSING RULES:**
  If the user provides CSV text or tabular data:
  > **CRITICAL CSV MAPPING RULES:**
  > 1.  **Strict Header Adherence:** If the CSV has explicit headers (e.g., 'Qty', 'Units', 'Amount', 'Value'), you **MUST** map values strictly to those columns. Do NOT swap them based on heuristics.
  > 2.  **Zero-Value Validity:** A transaction **CAN** have a Price or Total of '0.00' (e.g., Airdrops, Gifts, Free items).
  >     -   If 'Amount' column says '0.00', set 'price: 0'. **DO NOT** use the Quantity as the Price.
  > 3.  **Quantity vs Price:**
  >     -   If a column is labeled 'Qty', 'Quantity', 'Units' or 'Shares', it is ALWAYS the quantity.
  >     -   If a column is labeled 'Amount', 'Value', or 'Cost', it is ALWAYS the currency value.
  > 
  > **General Header Mapping (Semantic):**
  > -   **Date:** Look for 'Date', 'Time', 'Trade Date'.
  > -   **Symbol/Merchant:**
  >     - **PRIORITY 1 (Investment):** Look for 'Ticker', 'Code', 'Symbol'.
  >     - **PRIORITY 2 (Lifestyle/Bank):** Look for 'Transaction Details', 'Description', 'Merchant', 'Payee', 'Narration'.
  >     - **Rule:** For Expenses, the 'symbol' MUST be the Merchant Name (e.g., "Netflix", "Uber"), NOT the category (e.g., "LIFESTYLE").
  > -   **Type:** Look for 'Side', 'Type' (Buy/Sell). If missing, infer from 'Amount' (Negative = Buy/Expense, Positive = Sell/Income) OR inferred from context.
  > -   **Price:** Look for 'Price', 'Unit Price', 'Rate'.
  > -   **Total:** Look for 'Amount', 'Total', 'Value', 'Cost'.
  >
  > 2.  **Row Logic:**
  >     -   Skip header rows or empty rows.
  >     -   **Auto-Correction:** If 'Price' is missing but 'Total' and 'Qty' exist, calculate Price = Total / Qty.
  >     -   **Currency Cleanup:** Remove symbols ($, A$, £, ,) before outputting numbers.
  >
  > 3.  **Strict JSON Output:** Return the data in the standardized 'transactions' format:
  >     - Set 'transactionType' to "batch_import" for the ROOT level.
  >     - Set 'confirmationMessage' to "Ready to import {N} transactions from CSV."
  >     - Set 'requiresConfirmation' to true.
  >     - Populate the 'transactions' array with normalized data.
  >     - **NO ID GENERATION:** Do NOT include an 'id' or '_id' field in each transaction.

  🆕 **ALLOWED CATEGORIES (STRICT MAPPING):**
  You MUST map any Expense/Income to one of these exact keys:
  > **Expense Categories:** General, Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Travel, Groceries, Personal Care, Gifts & Donations, Housing, Tech, Other.
  > **Income Categories:** Salary, Dividend, Interest, Other Income.

  🆕 **CATEGORY MAPPING LOGIC (For Lifestyle Transactions):**
  > 1.  **Identify Merchant:** Extract the merchant name (e.g., "Shell", "Woolworths", "Netflix") from CSV 'Description', 'Merchant', or 'Payee' column.
  > 2.  **Smart Classification:** INTELLIGENTLY map that merchant to the closest match in ALLOWED CATEGORIES:
  >     - "Netflix/Spotify/Stan/Disney+" → Entertainment
  >     - "Shell/BP/Caltex/Uber/Lyft/Taxi" → Transportation
  >     - "Coles/Woolworths/Aldi/IGA" → Groceries
  >     - "Pharmacy/Chemist Warehouse/Priceline" → Healthcare
  >     - "Rent/Mortgage/Electricity/Gas/Water" → Housing or Bills & Utilities
  >     - "JB Hi-Fi/Harvey Norman/Apple Store" → Tech
  >     - "Myer/Target/Kmart/Amazon" → Shopping
  >     - "Starbucks/McDonald's/Restaurant" → Food & Dining
  > 3.  **Output JSON (for each expense/income row):**
  >     - 'symbol' = The extracted Merchant Name (e.g., "Netflix")
  >     - 'category' = The mapped Category from ALLOWED CATEGORIES (e.g., "Entertainment")
  >     - 'scope' = "LIFESTYLE"
  >     - transactionType = "expense" or "income"


  CORE ACTIONS:
  1.  **Transaction Parsing & Global Market Intelligence**:
      - **BATCH MODE**: If input contains multiple lines or distinct actions (e.g. copied from Excel or a list), parse them all.
      - Return the result in the 'transactions' array field.
      - If only one transaction, you can still use the 'transactions' array with 1 item.
      - **CRITICAL RULE**: For "buy" or "sell", you MUST set 'assetClass' to "Stock".
      
  🆕 **V2.0 DUAL-TRACK TAXONOMY (INVESTMENT vs LIFESTYLE)**:
      
      **SCOPE DETECTION RULES (HIGHEST PRIORITY)**:
      
      A) **Scope: INVESTMENT** - Set when transaction involves:
         - Stock/crypto ticker symbols (AAPL, BHP.AX, BTC, etc.)
         - Keywords: "buy", "sell", "股票", "加仓", "减仓", "dividend", "股息"
         - Cash operations: "deposit", "withdraw", "存入", "转入", "入金", "出金"
         - Examples:
           * "bought 10 AAPL at 150" → scope: "INVESTMENT"
           * "卖出 50 股 CBA" → scope: "INVESTMENT"
           * "存入5000美元" → scope: "INVESTMENT"
           * "收到 BHP 股息 200 澳币" → scope: "INVESTMENT"
      
      B) **Scope: LIFESTYLE** - Set when transaction involves:
         - Daily living expenses, income, bills, rent, groceries, dining, transportation
         - Keywords: "房租", "吃饭", "超市", "加油", "工资", "账单", "租金", "咖啡"
         - Keywords: "rent", "food", "groceries", "gas", "salary", "bill", "utilities", "coffee"
         - NO ticker symbols present
         - Examples:
           * "付房租2000澳币" → scope: "LIFESTYLE", category: "Housing"
           * "工资5000" → scope: "LIFESTYLE", category: "Income"
           * "超市买菜花了150" → scope: "LIFESTYLE", category: "Groceries"
           * "paid rent 2000" → scope: "LIFESTYLE", category: "Housing"
      
      **CATEGORY MAPPING (For LIFESTYLE scope ONLY)**:
      When scope is LIFESTYLE, you MUST assign a category from this standardized list:
      
      | Category    | Keywords/Scenarios                                      | Type    |
      |-------------|--------------------------------------------------------|---------|
      | Housing     | 房租, 房贷, 物业费, rent, mortgage, property fee       | EXPENSE |
      | Food        | 吃饭, 餐厅, 外卖, dining, restaurant, takeout, coffee  | EXPENSE |
      | Groceries   | 超市, 买菜, Coles, Woolworths, supermarket            | EXPENSE |
      | Transport   | 打车, 加油, 公交, Uber, gas, fuel, taxi, parking      | EXPENSE |
      | Utilities   | 水电煤, 话费, 宽带, 账单, water, electricity, internet | EXPENSE |
      | Shopping    | 衣服, 购物, 淘宝, shopping, clothes, Amazon           | EXPENSE |
      | Entertainment| 电影, 游戏, Netflix, Spotify, movie, gaming          | EXPENSE |
      | Health      | 医院, 药店, 健身, hospital, pharmacy, gym             | EXPENSE |
      | Income      | 工资, 奖金, 外快, 退税, salary, bonus, refund         | INCOME  |
      | General     | 其他无法归类的支出 (fallback)                          | EXPENSE |
      
      **CRITICAL EXAMPLES**:
      ✅ CORRECT:
      - "我今天付房租花了2000澳币" → { scope: "LIFESTYLE", category: "Housing", transactionType: "expense", quantity: 2000 }
      - "工资到账5000" → { scope: "LIFESTYLE", category: "Income", transactionType: "income", quantity: 5000 }
      - "超市买菜150" → { scope: "LIFESTYLE", category: "Groceries", transactionType: "expense", quantity: 150 }
      - "paid rent 2000 AUD" → { scope: "LIFESTYLE", category: "Housing", transactionType: "expense", quantity: 2000 }
      
      ❌ INCORRECT:
      - "付房租2000" → scope: "INVESTMENT" ⚠️ WRONG! This is LIFESTYLE + Housing
      - "工资5000" → scope: "INVESTMENT" ⚠️ WRONG! This is LIFESTYLE + Income
      
      **DEFAULT LOGIC**:
      - If NO scope is set and transactionType is "income" or "expense" WITHOUT ticker → Default to LIFESTYLE
      - If ticker symbol is present (AAPL, BHP.AX, etc.) → Default to INVESTMENT
      
  2.  **ACCOUNTING INQUIRIES (Data Query)**:
      - If user asks about 'balance', 'reconciliation', 'audit', 'how much did I spend', or 'why is my balance X':
      - SET 'transactionType' to "inquiry".
      - SET 'metadata.needsAggregation' to "true".
      - SET 'metadata.parsedIntent' to "inquiry".
      - DO NOT try to answer the question with guessed numbers. The system will auto-calculate standard audit data.
      - In 'notes', summarize the user's question.
      
      - **🌍 GLOBAL MARKET RESOLVER** (STRICT Priority Order):
        
        **🛡️ PRIORITY SHIELD (ABSOLUTE HIGHEST)**: 
           - If user EXPLICITLY states market (e.g. "市场为ASX", "market is ASX", "on ASX", "ASX market")
           - You MUST use that exact market, DO NOT override or change it
           - Lock the market field immediately, ignore all other rules below
           - Examples:
             * "买入 IIND 100股 价格40，市场为ASX" -> market: "ASX" (LOCKED)
             * "buy UNKNOWN ticker, market is HKEX" -> market: "HKEX" (LOCKED)
        
        A) **Symbol Suffix Detection (SECOND PRIORITY)**:
           - .AX or .ASX -> market: "ASX" (Australia), currency: "AUD"
           - .HK -> market: "HKEX" (Hong Kong), currency: "HKD"
           - .SS -> market: "SSE" (Shanghai), currency: "CNY"
           - .SZ -> market: "SZSE" (Shenzhen), currency: "CNY"
           - .T or .TYO -> market: "TSE" (Tokyo), currency: "JPY"
           - .TW -> market: "TSE" (Taiwan), currency: "TWD"
           - .L or .LON -> market: "LSE" (London), currency: "GBP"
        
        B) **Knowledge Base Lookup (THIRD PRIORITY)**:
           - For well-known tickers without suffix (AAPL, NVDA, TSLA, GOOGL, AMZN, MSFT, META, etc.)
           - Use your internal knowledge to determine primary exchange
           - AAPL/MSFT/GOOGL -> "NASDAQ", JPM/BAC -> "NYSE"
        
        C) **Fuzzy Market Name Correction**:
           - "AUX" -> "ASX"
           - "HKG" -> "HKEX"
           - "SHA"/"SHG" -> "SSE"
        
        D) **LAST RESORT Default** (ONLY if all above fail):
           - Unknown ticker with no suffix, no user specification, not in knowledge base
           - Default to "US" market, currency: "USD"
           - ⚠️ Use this sparingly, prefer asking user for clarification in 'notes'
      
      - For cash transactions ('income', 'expense'), set market based on currency:
        * AUD -> market: "ASX"
        * USD -> market: "US"
        * CNY/RMB -> market: "SSE"
        * HKD -> market: "HKEX"
        * JPY -> market: "TSE"
        * GBP -> market: "LSE"
      - 'date' defaults to today (${input.currentDate}). 'fee' defaults to 0.
      
      - **💰 CASH IMPACT DETECTION (CRITICAL)**:
        * **Intent A - Real Transaction** (impactsCash: true):
          - User says: "买入/卖出", "buy/sell", "bought/sold", "purchase", "收入", "income", "支出", "expense", "换汇", "convert"
          - These are REAL transactions that happened and should modify cash balance
          - Set 'impactsCash' to TRUE
          - Examples: "bought 10 AAPL at 150", "卖出 50 股 CBA", "salary 5000 AUD"
        
        * **Intent B - Position-Only Entry** (impactsCash: false):
          - User says: "添加持仓", "录入持仓", "我有", "I have", "add position", "add holding", "record existing", "原始持仓", "initial position"
          - These are EXISTING positions being recorded, should NOT modify cash balance
          - Set 'impactsCash' to FALSE
          - Set 'transactionType' to "buy" (for stocks) but with impactsCash=false
          - Examples: "添加 100 股 CBA 原始持仓，均价 105", "I have 50 shares of AAPL at average cost 170", "录入我的 TSLA 持仓 20 股，成本 200"

  2.  **Cash Operations (CRITICAL DISTINCTION)**:
      📌 **Type A: Incremental Deposit (income)** - Use this for ADD operations:
         - Keywords: "存入", "转入", "多了", "增加现金", "deposit", "add cash", "transfer in", "received"
         - User says: "存入5000美元", "转入2000 AUD", "deposit 3000 USD", "我账户多了8000美元"
         - Action: transactionType = "income", this ADDS to existing balance
         - Set 'currency' to the target currency (USD, AUD, CNY, etc.)
         - Set 'quantity' to the amount being deposited
         - Set 'symbol' to a descriptive name (e.g., "Cash Deposit", "转账") 
         - Examples:
           * "存入5000美元" -> { transactionType: "income", symbol: "Cash Deposit", quantity: 5000, currency: "USD", assetClass: "Deposit", market: "US", notes: "存入5000美元" }
           * "deposit 2000 AUD" -> { transactionType: "income", symbol: "Cash Deposit", quantity: 2000, currency: "AUD", assetClass: "Deposit", market: "ASX" }

      📌 **Type B: Balance Sync/Override (set_balance)** - Use this ONLY for TOTAL balance setting:
         - Keywords: "我现在总共有", "同步余额为", "set balance to", "total balance is", "校准为", "现金余额是"
         - User says: "我现在总共有15000美元", "同步USD余额为8000", "set my USD balance to 10000"
         - Action: transactionType = "set_balance", this OVERWRITES existing balance
         - **SAFETY**: ALWAYS set requiresConfirmation: true for set_balance
         - Set confirmationMessage to warn about overwriting: "⚠️ 检测到余额校准指令，这将覆盖自动计算的现金余额。当前操作将设置 {currency} 为 {quantity}。确定吗？"
         - 'symbol' and 'currency' should be the currency code (e.g., "USD", "CNY", "AUD")
         - Examples:
           * "我现在总共有15000美元" -> { transactionType: "set_balance", symbol: "USD", quantity: 15000, price: 1, currency: "USD", assetClass: "Cash", market: "US", requiresConfirmation: true, confirmationMessage: "⚠️ 检测到余额校准指令，这将覆盖自动计算的USD余额为 15000。确定吗？" }
           * "set my AUD balance to 50000" -> { transactionType: "set_balance", symbol: "AUD", quantity: 50000, currency: "AUD", requiresConfirmation: true, confirmationMessage: "⚠️ Balance sync detected. This will override your AUD balance to 50000. Confirm?" }

      📌 **Type C: Simple Cash Recording (for backward compatibility)**:
         - If user says "录入X元现金" without clear incremental or total context
         - Default to "income" (incremental) to be conservative
         - Example: "录入5000美元现金" -> income (adds 5000 USD)

  3.  CRUD Actions (update, delete):
      - For "update" or "delete", your primary goal is to identify the asset's SYMBOL.
      - If the user says "delete transaction for AAPL", extract "AAPL" into 'symbol'.
      - For "update", you MUST extract any NEW values into the corresponding fields:
        - e.g., "change price of AAPL to 251" -> { transactionType: "update", symbol: "AAPL", price: 251 }
        - e.g., "change quantity to 50 for my last TSLA buy" -> { transactionType: "update", symbol: "TSLA", quantity: 50 }
      - Use the 'notes' field to capture any non-standard update instructions or context (e.g., "last transaction").
      - CONTEXTUAL: If on 'positions' page and user says "update notes for TSLA", find the object with symbol 'TSLA' in pageData and use its 'symbol'.
      
      - **DELETE SAFETY RULES**:
        a) SINGLE DELETE (no confirmation needed):
           - "delete the last transaction" -> { transactionType: "delete", deleteScope: "single", requiresConfirmation: false }
           - "delete transaction #TX-123" -> { transactionType: "delete", transactionId: "TX-123", deleteScope: "single", requiresConfirmation: false }
        
        b) SYMBOL DELETE (requires confirmation):
           - "delete all AAPL transactions" -> { transactionType: "delete", symbol: "AAPL", deleteScope: "symbol", requiresConfirmation: true, confirmationMessage: "This will delete ALL transactions for AAPL. Type 'confirm' to proceed." }
           - "remove all my Tesla shares" -> { transactionType: "delete", symbol: "TSLA", deleteScope: "symbol", requiresConfirmation: true, confirmationMessage: "This will delete ALL transactions for TSLA. Type 'confirm' to proceed." }
        
        c) DELETE ALL (requires typing "delete"):
           - "delete all transactions" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ WARNING: This will DELETE ALL your transactions permanently! Type 'delete' (exactly) to confirm." }
           - "clear all my data" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ WARNING: This will DELETE ALL your transactions permanently! Type 'delete' (exactly) to confirm." }
           - "删除所有交易" -> { transactionType: "delete", deleteScope: "all", requiresConfirmation: true, confirmationMessage: "⚠️ 警告：这将永久删除所有交易记录！请输入 'delete' 确认。" }
  
  4. Price Refresh (refresh_prices):
     - If the user asks to refresh, update, or get the latest prices (e.g., "refresh prices", "get latest market value").
     - Set 'transactionType' to "refresh_prices".
     - Leave all other fields empty.
 
  5.  Contextual Summarization (summary):
      - If the user asks for a summary (e.g., "summarize this page"), and 'pageContext' is provided:
        - Set 'transactionType' to "summary".
        - Analyze 'pageData' and generate a concise summary.
        - Put the summary text into the 'contextualContent' field.
        - Leave other transaction fields empty.
 
  EXAMPLES:
  - Input: "bought 10 CBA.AX at $120" -> Output: { transactionType: "buy", symbol: "CBA.AX", date: "${input.currentDate}", quantity: 10, price: 120, fee: 0, currency: "AUD", notes: "bought 10 CBA.AX at $120", assetClass: "Stock", market: "ASX", impactsCash: true }
  - Input: "bought 10 AAPL at 170" -> Output: { transactionType: "buy", symbol: "AAPL", date: "${input.currentDate}", quantity: 10, price: 170, fee: 0, currency: "USD", notes: "bought 10 AAPL at 170", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "添加 100 股 CBA 原始持仓，均价 105" -> Output: { transactionType: "buy", symbol: "CBA.AX", quantity: 100, price: 105, fee: 0, currency: "AUD", notes: "添加 100 股 CBA 原始持仓，均价 105", assetClass: "Stock", market: "ASX", impactsCash: false }
  - Input: "I have 50 shares of NVDA at average cost 130" -> Output: { transactionType: "buy", symbol: "NVDA", quantity: 50, price: 130, fee: 0, currency: "USD", notes: "I have 50 shares of NVDA at average cost 130", assetClass: "Stock", market: "NASDAQ", impactsCash: false }
  - Input: "买入 100 股 NVDA，价格 130" -> Output: { transactionType: "buy", symbol: "NVDA", quantity: 100, price: 130, currency: "USD", notes: "买入 100 股 NVDA，价格 130", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "买TSLA, 150, 10股" -> Output: { transactionType: "buy", symbol: "TSLA", quantity: 10, price: 150, currency: "USD", notes: "买TSLA, 150, 10股", assetClass: "Stock", market: "NASDAQ", impactsCash: true }
  - Input: "请帮我更改一下最近一次AAPL的交易价格为251" -> Output: { transactionType: "update", symbol: "AAPL", price: 251, notes: "last transaction" }
  - Input: "将 NVDA 的数量改为 50" -> Output: { transactionType: "update", symbol: "NVDA", quantity: 50 }
  - Input: "set my usd account to 5000" -> Output: { transactionType: "set_balance", symbol: "USD", quantity: 5000, price: 1, currency: "USD", notes: "Set USD balance to 5000", assetClass: "Cash", market: "US" }
  - Input: "delete all my AAPL shares" -> Output: { transactionType: "delete", symbol: "AAPL", ...other fields empty... }
  - Input: "refresh my portfolio value" -> Output: { transactionType: "refresh_prices", ...other fields empty... }
  - Input: "summarize this for me", pageContext: "positions", pageData: {positions: [{symbol: 'TSLA', marketValueAUD: 15000}, ...], totalMarketValueAUD: 25000} -> Output: { transactionType: "summary", contextualContent: "You are viewing your positions page. Your total portfolio is valued at A$25,000, with TSLA being a significant holding.", ...other fields empty... }
 
  CRITICAL: You must extract numbers accurately. For "Symbol, Price, Quantity" comma-separated formats, pay close attention to which number represents the price and which represents quantity (shares/股).
  

  User Input: ${input.naturalLanguageInput}
  Page Context: ${input.pageContext}
  Page Data: ${JSON.stringify(input.pageData)}
  `;

  // 📡 Construct Multimodal Request
  // If image exists, add it to the prompt parts
  const promptParts: any[] = [{ text: systemPrompt }];
  
  // Support legacy single image
  if (input.image) {
    promptParts.push({ media: { url: input.image } });
  }

  // Support multiple images
  if (input.images && input.images.length > 0) {
    input.images.forEach(img => {
      promptParts.push({ media: { url: img } });
    });
  }

  // Generate with Genkit
  const response = await ai.generate({
    model: 'googleai/gemini-2.5-flash',
    prompt: promptParts,
    output: { schema: ParseTransactionOutputSchema },
  });

  const output = response.output;
    if (!output) throw new Error("AI failed to return any output.");

    // 🔄 BATCH NORMALIZATION
    // If 'transactions' array exists, use it. Otherwise, wrap single output in array.
    const rawItems = (output.transactions && output.transactions.length > 0) 
      ? output.transactions 
      : [output]; 

    // Helper: Run Aggregation (Server-side)
    const runAggregation = async (txItem: any) => {
         if (txItem.metadata?.needsAggregation && input.userId) {
            try {
                console.log(`🧮 [AI Agent] Executing Mandatory Math Verification for User: ${input.userId}`);
                const result = await calculateAggregation({ userId: input.userId });
                
                const verificationMsg = 
                `\n\n📊 **Accounting Verification (Standard Audit)**\n` +
                `------------------------------------------------\n` +
                `• Total Income:   $${result.totalIncome.toFixed(2)}\n` +
                `• Total Spend:    $${result.totalBuy.toFixed(2)} (Buy) + $${result.totalExpense.toFixed(2)} (Expense)\n` +
                `• Net Cash Flow:  $${result.netCashFlow.toFixed(2)}\n` +
                `------------------------------------------------\n` +
                `📝 Math Proof: ${result.mathVerification}\n`;

                txItem.notes = (txItem.notes || '') + verificationMsg;
                txItem.contextualContent = (txItem.contextualContent || '') + verificationMsg;
            } catch (err) {
                console.error("Aggregation Tool Failed:", err);
                txItem.notes = (txItem.notes || '') + "\n[System Error: Could not verify balance data.]";
            }
         }
    };

    // 🚀 PROCESS EACH ITEM
    const processedItems = await Promise.all(rawItems.map(async (item) => {
        // Clone item to avoid mutation side-effects
        const output = { ...item };

        // 1. Run Aggregation if needed
        await runAggregation(output);

        // 2. Final fallback check to ensure data integrity
        const CURRENCIES = ['USD', 'AUD', 'CNY', 'TWD', 'HKD', 'JPY', 'EUR', 'GBP', 'CAD', 'NZD', 'SGD', 'CHF'];
        const isCurrencySymbol = (sym?: string) => sym && CURRENCIES.includes(sym.toUpperCase());

        if ((output.transactionType === 'buy' || output.transactionType === 'sell')) {
            // 🚨 FIX: Check if symbol is actually a currency (e.g. "Add 10000 TWD holding")
            if (isCurrencySymbol(output.symbol)) {
                output.assetClass = 'Cash';
                // If the user explicitly mentioned "deposit", we could use 'Deposit', but 'Cash' is safe
                if (systemPrompt.includes('deposit')) output.assetClass = 'Deposit'; 
                output.market = 'FX';
                output.currency = output.symbol?.toUpperCase(); // The asset itself is the currency
                // If price is missing for cash holding, valid default is 1 (face value)
                if (!output.price) output.price = 1; 
            } else {
                // Standard Stock Logic
                output.assetClass = 'Stock';
                if (!output.market) {
                if (output.symbol?.endsWith('.AX')) {
                    output.market = 'ASX';
                    output.currency = output.currency || 'AUD';
                } else {
                    output.market = 'NASDAQ'; // Default to NASDAQ for non-ASX stocks
                    output.currency = output.currency || 'USD';
                }
                }
            }
        }

        // Default currency for cash transactions if missing
        if (output.transactionType === 'income' || output.transactionType === 'expense' || output.transactionType === 'set_balance') {
        if (!output.currency) {
            // Try to infer from assetClass first
            if (output.assetClass === 'Cash' || output.assetClass === 'Deposit') {
                // Cannot infer specific currency from just 'Cash' without other context, 
                // but usually handled by strict symbol rules above.
            } else if (output.assetClass === 'CNY Cash') {
            output.currency = 'CNY';
            } else if (output.assetClass === 'USD Cash' || output.market === 'US') {
            output.currency = 'USD';
            } else {
            output.currency = 'AUD'; // Default to AUD
            }
        }
        }

        // 💰 CASH IMPACT: Enforce impactsCash - MUST always be set
        if (output.impactsCash === undefined) {
        // Default to true for traditional transaction types (buy/sell/income/expense/fx)
        if (['buy', 'sell', 'income', 'expense', 'fx'].includes(output.transactionType)) {
            output.impactsCash = true;
            // Set metadata to indicate this was a trade intent
            if (!output.metadata) {
            output.metadata = { parsedIntent: 'trade' };
            }
        } else {
            // For other types, default to false (no cash impact)
            output.impactsCash = false;
        }
        } else {
        // AI explicitly set impactsCash - record the intent
        if (!output.metadata) {
            output.metadata = {
            parsedIntent: output.impactsCash ? 'trade' : 'initial_holding'
            };
        }
        }

        // 🔒 SAFETY: Validate and enforce delete scope rules
        if (output.transactionType === 'delete') {
        // If AI didn't set deleteScope, infer it from the context
        if (!output.deleteScope) {
            if (output.transactionId) {
            // Has transaction ID -> single delete
            output.deleteScope = 'single';
            output.requiresConfirmation = false;
            } else if (output.symbol) {
            // Has symbol -> delete all for that symbol
            output.deleteScope = 'symbol';
            output.requiresConfirmation = true;
            output.confirmationMessage = `This will delete ALL transactions for ${output.symbol}. Type 'confirm' to proceed.`;
            } else if (output.dateFilter && output.dateFilter.value) {
            // 🆕 Has date filter -> date-based delete
            output.deleteScope = 'date';
            output.requiresConfirmation = true;
            const op = output.dateFilter.operator || '==';
            output.confirmationMessage = `This will delete transactions where date ${op} ${output.dateFilter.value}. Confirm?`;
            } else {
            // No symbol, no ID, no Date -> delete all
            output.deleteScope = 'all';
            output.requiresConfirmation = true;
            const isChinese = input.naturalLanguageInput.match(/[\u4e00-\u9fa5]/);
            output.confirmationMessage = isChinese
                ? "⚠️ 警告：这将永久删除所有交易记录！请输入 'delete' 确认。"
                : "⚠️ WARNING: This will DELETE ALL your transactions permanently! Type 'delete' (exactly) to confirm.";
            }
        }

        // Ensure requiresConfirmation is set correctly
        if (output.deleteScope === 'single') {
            output.requiresConfirmation = false;
        } else {
            output.requiresConfirmation = true;
        }
        }

        // 🛡️ ZERO-MATH GUARD:
        if (['buy', 'sell'].includes(output.transactionType)) {
        const missingFields: string[] = [];
        
        if (output.quantity === undefined || output.quantity === null || output.quantity <= 0) {
            missingFields.push('quantity');
        }
        if (!output.price || output.price <= 0) {
            missingFields.push('price');
        }
        
        if (missingFields.length > 0) {
            console.log(`🛡️ [Zero-Math Guard] Skipping calculations, missing: ${missingFields.join(', ')}`);
            return {
            ...output,
            quantity: output.quantity || undefined,
            price: output.price || undefined,
            };
        }
        }
        
        if (['income', 'expense', 'set_balance'].includes(output.transactionType)) {
        if (output.quantity === undefined || output.quantity === null) {
            console.log(`🛡️ [Zero-Math Guard] Missing quantity for ${output.transactionType}`);
            return {
            ...output,
            quantity: undefined
            };
        }
        }

        // 🆕 V2.0: DUAL-TRACK SCOPE & CATEGORY ENFORCEMENT
        if (!output.scope) {
        if (['buy', 'sell', 'dividend', 'fx'].includes(output.transactionType)) {
            output.scope = 'INVESTMENT';
        } else if (['income', 'expense'].includes(output.transactionType)) {
            const potentialTicker = output.symbol && /^[A-Z0-9.]{2,8}$/.test(output.symbol) && !['CASH', 'USD', 'AUD', 'LIFESTYLE', 'DEPOSIT'].includes(output.symbol.toUpperCase());
            
            if (potentialTicker) {
            output.scope = 'INVESTMENT';
            } else {
            output.scope = 'LIFESTYLE';
            }
        }
        }

        // 🏷️ NORMALIZE LIFESTYLE TRANSACTIONS
        if (output.scope === 'LIFESTYLE') {
        if (!output.symbol || output.symbol !== 'LIFESTYLE') {
            if (['income', 'expense'].includes(output.transactionType)) {
            if (output.symbol && output.symbol !== 'LIFESTYLE' && !output.notes?.includes(output.symbol)) {
                output.notes = (output.notes ? output.notes + ' ' : '') + `(${output.symbol})`;
            }
            output.symbol = 'LIFESTYLE';
            }
        }

        if (!output.category) {
            if (output.notes?.toLowerCase().includes('rent') || output.notes?.toLowerCase().includes('房租')) output.category = 'Housing';
            else if (output.transactionType === 'income') output.category = 'Income'; 
            else output.category = 'General';
        }
        }

        return output;
    }));

    // Return First Item (Schema Compliance) + Full Array
    const result = {
        ...processedItems[0],
        transactions: processedItems
    };
    
    console.log("AI OUTPUT:", JSON.stringify(result, null, 2));

    return result;
  }
);

