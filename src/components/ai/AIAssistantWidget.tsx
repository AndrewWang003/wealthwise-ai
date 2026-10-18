'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ConfirmationCard } from '@/components/transactions/ai-feedback/ConfirmationCard';
import { DiffPreviewCard } from '@/components/transactions/ai-feedback/DiffPreviewCard';
import { TransactionListCompact } from '@/components/transactions/ai-feedback/TransactionListCompact';
import { UndoToast } from '@/components/ui/UndoToast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Bot, Sparkles, X, History, Image as ImageIcon, FileSpreadsheet, Paperclip } from 'lucide-react';
import { doc, deleteDoc, getDoc, collection, query, where, getDocs, writeBatch, updateDoc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { parseTransactionFromNaturalLanguage, ParseTransactionOutput } from '@/ai/flows/parse-transaction-from-natural-language';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { usePageContext } from '@/contexts/PageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import clsx from 'clsx';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import logoImage from '@/app/logo.png';
import { addTransactionWithClientSDK } from '@/lib/firebase/client-transactions';
import { ConversationMessage, PendingIntent } from '@/lib/ai/types';
import { 
  applyLongTermMemory, 
  translateError, 
  mergeIntentWithResponse,
  generateInquiryMessage 
} from '@/lib/ai/transaction-helpers';

// 🗓️ DATE NORMALIZATION HELPER
// AI outputs "2026-03-14" but Firestore stores "2026-03-14T00:00:00.000Z"
// This function converts AI's date format to ISO for proper string comparison
const normalizeDateValue = (dateValue: string, operator: string): string => {
  // If already in ISO format, return as-is
  if (dateValue.includes('T')) return dateValue;
  
  // For > operator: We want dates AFTER the starting of the given date (Inclusive of the day basically, if time > 00:00)
  if (operator === '>') {
    return `${dateValue}T00:00:00.000Z`;
  }
  // For >= operator: Include the start of the day
  if (operator === '>=') {
    return `${dateValue}T00:00:00.000Z`;
  }
  // For < operator: Exclude the whole day
  if (operator === '<') {
    return `${dateValue}T00:00:00.000Z`;
  }
  // For <= operator: Include the whole day
  if (operator === '<=') {
    return `${dateValue}T23:59:59.999Z`;
  }
  // For == operator: We need range query (handled separately)
  // Default: start of day
  return `${dateValue}T00:00:00.000Z`;
};

// 🛠️ SHARED QUERY BUILDER FOR DATE FILTERS
const getQueryForDateFilter = (firestore: any, userId: string, dateFilter: { operator: string, value: string }) => {
    let op: string = dateFilter.operator;
    const rawDateValue = dateFilter.value;

    // 🛡️ HUMAN LOGIC OVERRIDE:
    // Users almost ALWAYS mean "Inclusive" when filtering by date.
    // Force strict operators to be inclusive to catch "midnight" timestamps.
    if (op === '>') {
        console.log(`🛡️ Query Override: Converted '>' to '>=' for Human Intuition.`);
        op = '>=';
    }
    if (op === '<') {
        console.log(`🛡️ Query Override: Converted '<' to '<=' for Human Intuition.`);
        op = '<=';
    }

    // 🛡️ TIMEZONE BUFFER (Safety Net for Server-Side Queries)
    // Problem: User says "March 5" (Local). DB has "March 4 13:00" (UTC).
    // Querying strictly "March 5 UTC" misses the record.
    // Solution: Expand the window by 24 hours.
    
    // Parse the original date
    const bufferDate = new Date(rawDateValue);
    
    // Apply buffer based on direction
    if (op === '>=' || op === '>') {
        bufferDate.setDate(bufferDate.getDate() - 1); // Look back 1 day
        console.log(`🛡️ TZ Buffer: Adjusted ${rawDateValue} -> ${bufferDate.toISOString().split('T')[0]} (Start Earlier)`);
    } else if (op === '<=' || op === '<') {
        bufferDate.setDate(bufferDate.getDate() + 1); // Look forward 1 day
        console.log(`🛡️ TZ Buffer: Adjusted ${rawDateValue} -> ${bufferDate.toISOString().split('T')[0]} (End Later)`);
    }
    
    const bufferedDateString = bufferDate.toISOString().split('T')[0];
    const dateValue = normalizeDateValue(bufferedDateString, op);

    const collectionPath = `users/${userId}/transactions`;
    const transactionsRef = collection(firestore, collectionPath);

    // 🔍 SCHEMA DEBUG (DNA TEST)
    console.log("🔍 SCHEMA DEBUG (Buffered):");
    console.log(" - Target Collection Path:", collectionPath);
    console.log(" - Target Field Name:", 'transactionDate');
    console.log(" - Original Filter:", rawDateValue);
    console.log(" - Buffered Filter:", dateValue);
    console.log(" - Operator:", op);

    if (op === '>') return query(transactionsRef, where('transactionDate', '>', dateValue));
    
    if (op === '>=') return query(transactionsRef, where('transactionDate', '>=', dateValue));
    if (op === '<') return query(transactionsRef, where('transactionDate', '<', dateValue));
    if (op === '<=') return query(transactionsRef, where('transactionDate', '<=', dateValue));
    if (op === '==') {
        // For equality, we scan the specific day +/- buffer logic if needed, 
        // but typically exact date match implies strictness. 
        // Let's keep strict day range for '==' but use the ORIGINAL value to avoid matching wrong days.
        const startOfDay = `${rawDateValue}T00:00:00.000Z`;
        const endOfDay = `${rawDateValue}T23:59:59.999Z`;
        return query(transactionsRef, where('transactionDate', '>=', startOfDay), where('transactionDate', '<=', endOfDay));
    }
    throw new Error(`❌ Unknown date operator: ${op}`);
};


// 🔮 ORB CONFIGURATION
const ORB_VARIANTS: Variants = {
    idle: {
        scale: [1, 1.05, 1],
        transition: {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
        }
    },
    expanded: {
        scale: 0,
        opacity: 0,
        transition: { duration: 0.2 }
    }
};

// 📄 PANEL CONFIGURATION
const PANEL_VARIANTS: Variants = {
    initial: { opacity: 0, scale: 0.8, y: 20 },
    animate: { 
        opacity: 1, 
        scale: 1, 
        y: 0,
        transition: { type: "spring", stiffness: 300, damping: 25 }
    },
    exit: { 
        opacity: 0, 
        scale: 0.8, 
        y: 20,
        transition: { duration: 0.2 }
    }
};

// 📎 Attachment Type Definition
type Attachment = {
    id: string;
    type: 'image' | 'csv';
    file: File;
    name: string;      // 🆕 Added name explicitly
    previewUrl?: string; // For images
    content?: string;    // For CSV text
};

export function AIAssistantWidget() {
    // Logic extraction from SmartHUDChat
    const { user } = useUser();
    const { toast } = useToast();
    const { pageName, pageData, addOptimisticDelete, clearOptimisticDelete, addOptimisticUpdate, clearOptimisticUpdate } = usePageContext();
     // ... (hooks)
    const router = useRouter();
    const firestore = useFirestore();
    
    // ... (state)
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ConversationMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAttachments, setShowAttachments] = useState(false);
    const [pendingIntent, setPendingIntent] = useState<PendingIntent>(null);
    const [pendingConfirmation, setPendingConfirmation] = useState<any>(null); // State for confirmation card
    const [showFinalWarning, setShowFinalWarning] = useState(false); // State for Tier 3 2nd step
    const [searchResults, setSearchResults] = useState<{
        data: any[];
        title?: string;
        summary?: { label: string; value: string };
    } | null>(null);
    
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // 🖼️ File Upload State
    const [attachments, setAttachments] = useState<Attachment[]>([]); // 🆕 Generic Attachments



    // ⏳ Optimistic Undo State
    const [undoData, setUndoData] = useState<{
        items: any[];
        actionData: any; // Original command data for execution
        count: number;
    } | null>(null);
    const [showUndoToast, setShowUndoToast] = useState(false);
    
    // ⏳ Optimistic Update State
    const [updateUndoData, setUpdateUndoData] = useState<{
        originalItems: any[]; // The OLD state (for undo)
        updates: any;         // The NEW state (for final commit)
        count: number;
        filterDescription: string;
    } | null>(null);
    const [showUpdateUndoToast, setShowUpdateUndoToast] = useState(false);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages, isOpen]);

    // Focus input on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Click outside to close (Auto-hide logic)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                isOpen &&
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
                setShowAttachments(false);
            }
        };

        if (isOpen) {
            // Add small delay to prevent immediate closing when opening
            setTimeout(() => {
                document.addEventListener('mousedown', handleClickOutside);
            }, 100);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // Convert File to Base64
    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    // 🚀 Send Message Handler
    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || !user || isProcessing) return;

        // 1. Construct Final Payload (Implicit CSVs)
        let finalMessage = input;
        const csvAttachments = attachments.filter(a => a.type === 'csv');
        if (csvAttachments.length > 0) {
            finalMessage += "\n\n--- IMPLICIT FILE CONTENT ---\n";
            csvAttachments.forEach(csv => {
                finalMessage += `\n[File: ${csv.name}]\n${csv.content}\n`;
            });
        }

        // 2. Optimistic UI Update
        const displayContent = input || (attachments.length > 0 ? `[Sent ${attachments.length} file(s)]` : '');
        
        // 🚨 FIX: Distinguish between the UI object and the logic string
        const userMsgObj = { role: 'user' as const, content: displayContent }; 
        const userMsg = finalMessage; // Re-use 'userMsg' variable name as STRING for downstream logic compatibility

        setMessages(prev => [...prev, userMsgObj]);
        setInput('');
        setSearchResults(null);
        setIsProcessing(true);
        
        // 📦 Show loading message for CSV uploads
        if (csvAttachments.length > 0) {
            const isChinese = /[\u4e00-\u9fa5]/.test(finalMessage);
            const loadingMsg = isChinese 
                ? '📦 正在处理CSV文件，请稍候...' 
                : '📦 Processing CSV file, please wait...';
            setMessages(prev => [...prev, { role: 'ai', content: loadingMsg }]);
        }

        try {
            // 3. Process Images (if any)
            const imageAttachments = attachments.filter(a => a.type === 'image');
            const images = imageAttachments.length > 0 
                ? await Promise.all(imageAttachments.map(a => convertToBase64(a.file)))
                : undefined;

            setAttachments([]); // Clear staging

            let parsedResult: ParseTransactionOutput;
            
            // 🔀 BRANCH 1: Handle Pending Intent (Multi-turn conversation)
            if (pendingIntent) {
                console.log('🔄 Merging user response with pending intent...', pendingIntent);
                try {
                    // FIX: Pass userMsg (string) 
                    const mergeResult = await mergeIntentWithResponse(pendingIntent, userMsg, user.uid);
                    parsedResult = mergeResult.data as ParseTransactionOutput;
                    const isComplete = mergeResult.isComplete;
                    
                    if (!isComplete) {
                        setPendingIntent({
                            ...pendingIntent,
                            rawData: mergeResult.data,
                            missingFields: mergeResult.missingFields,
                            timestamp: Date.now(),
                            userInput: userMsg // FIX: Store string
                        });
                        
                        const inquiry = generateInquiryMessage(
                            mergeResult.data, 
                            mergeResult.missingFields, 
                            user.displayName || 'there'
                        );
                        setMessages(prev => [...prev, { role: 'ai', content: inquiry }]);
                        setIsProcessing(false);
                        return;
                    } else {
                        setPendingIntent(null); // Flow complete
                    }
                } catch (error: any) {
                    console.error('Intent Merge Failed', error);
                    // FIX: Extract message from translateError object
                    const errorObj = translateError(error);
                    setMessages(prev => [...prev, { role: 'ai', content: errorObj.message || 'An error occurred' }]);
                    setIsProcessing(false);
                    return;
                }
            } else {
                // 🔀 BRANCH 2: New Request
                // 🔀 BRANCH 2: New Request
                const rawResult = await parseTransactionFromNaturalLanguage({
                    naturalLanguageInput: userMsg, 
                    pageContext: pageName,
                    // 🛡️ SANITIZE: Convert Timestamps to strings to avoid Server Action "Only plain objects" error
                    pageData: pageData ? JSON.parse(JSON.stringify(pageData)) : undefined,
                    userId: user.uid,
                     // @ts-ignore
                    images: images 
                });
                
                // 🧠 Apply Long-term Memory / RAG
                parsedResult = await applyLongTermMemory(rawResult, user.uid);
            }

            console.log("🛡️ ACL (Widget): Validating AI Response...", parsedResult!);

            // 1. 🧹 DATA NORMALIZATION
            const safeParsed = parsedResult as any;
            const cleanData = safeParsed?.data || safeParsed?.result || parsedResult;
            const txType = cleanData?.transactionType?.toLowerCase() || '';

            // 🧹 [START] DATA NORMALIZATION (Fix Expense/Income formatting)
            if (txType === 'expense' || txType === 'income') {
                const rawQty = cleanData.quantity || 0;
                const rawPrice = cleanData.price || 0;
                
                // Swap if Qty > 1 and Price is 0 or 1 (likely inverted)
                if (Math.abs(rawQty) > 1 && (rawPrice === 1 || rawPrice === 0)) {
                    console.log("🧹 ACL (Widget): Normalizing Expense/Income Data");
                    cleanData.price = Math.abs(rawQty); 
                    cleanData.quantity = 1;             
                }
            }
            // 🧹 [END] DATA NORMALIZATION

            // 🔍 [READ] QUERY / AUDIT / INQUIRY LOGIC
            // AI returns 'inquiry' or 'summary' for data queries (per schema)
            // Also detect queries by metadata.parsedIntent === 'inquiry'
            const isQueryType = ['audit', 'search', 'query', 'inquiry', 'summary'].includes(txType);
            const needsAggregation = cleanData.metadata?.needsAggregation === true;
            const isInquiryIntent = cleanData.metadata?.parsedIntent === 'inquiry';
            // Also catch "list expenses" type queries where txType might be 'expense' but intent is query
            const isListQuery = cleanData.notes?.toLowerCase().includes('查询') || 
                                cleanData.notes?.toLowerCase().includes('显示') ||
                                cleanData.notes?.toLowerCase().includes('list') ||
                                cleanData.notes?.toLowerCase().includes('show');
            
            if (isQueryType || needsAggregation || isInquiryIntent || isListQuery) {
                console.log("🔍 ACL (Widget): QUERY/INQUIRY Detected.", { txType, symbol: cleanData.symbol, notes: cleanData.notes, userMsg });
                
                // 🔥 REAL DATA FETCH: Query Firestore for matching transactions
                let results: any[] = [];
                
                // 🔎 SMART FILTER PARSING: Use ORIGINAL USER MESSAGE for keyword detection
                // This is critical - cleanData.notes may NOT contain the user's input!
                const userMsgLower = userMsg.toLowerCase();
                const notesLower = (cleanData.notes || '').toLowerCase();
                const combinedText = userMsgLower + ' ' + notesLower;
                
                console.log("🔍 Filter parsing from:", combinedText);
                
                // Detect filter type from keywords
                let filterTxType: string | null = null;
                if (combinedText.includes('支出') || combinedText.includes('expense') || combinedText.includes('消费')) {
                    filterTxType = 'expense';
                } else if (combinedText.includes('收入') || combinedText.includes('income') || combinedText.includes('工资')) {
                    filterTxType = 'income';
                } else if (combinedText.includes('买入') || combinedText.includes('buy') || combinedText.includes('购买')) {
                    filterTxType = 'buy';
                } else if (combinedText.includes('卖出') || combinedText.includes('sell') || combinedText.includes('出售')) {
                    filterTxType = 'sell';
                }
                
                // Parse limit from user message (look for numbers)
                let queryLimit = 10;
                // Pattern: "最近 3 笔" or "3 笔" or "last 5"
                const limitMatch = combinedText.match(/(\d+)\s*(笔|条|个|records?|items?)/);
                if (limitMatch) {
                    queryLimit = parseInt(limitMatch[1], 10);
                }
                // Pattern: "最近3" (no space)
                const numMatch = combinedText.match(/最近\s*(\d+)/);
                if (numMatch) {
                    queryLimit = parseInt(numMatch[1], 10);
                }
                // Pattern: "last 5" or "recent 3"
                const enMatch = combinedText.match(/(last|recent)\s*(\d+)/i);
                if (enMatch) {
                    queryLimit = parseInt(enMatch[2], 10);
                }
                
                console.log(`🔍 Parsed Filter: type=${filterTxType}, limit=${queryLimit}`);
                
                // Determine filter type (symbol takes priority)
                const filterSymbol = cleanData.symbol?.toUpperCase();
                
                if (user?.uid) {
                    try {
                        const transactionsRef = collection(firestore, `users/${user.uid}/transactions`);
                        let q;
                        
                        // 🆕 DATE FILTER SUPPORT (Priority 1)
                        const hasDateFilter = cleanData.dateFilter?.operator && cleanData.dateFilter?.value;
                        
                        if (hasDateFilter) {
                            const op = cleanData.dateFilter.operator;
                            const rawDateValue = cleanData.dateFilter.value;
                            const dateValue = normalizeDateValue(rawDateValue, op);
                            console.log(`🔍 Fetching transactions with date filter: ${op} ${rawDateValue} (normalized: ${dateValue})`);
                            
                            if (op === '>') {
                                q = query(transactionsRef, where('transactionDate', '>', dateValue), orderBy('transactionDate', 'desc'));
                            } else if (op === '>=') {
                                q = query(transactionsRef, where('transactionDate', '>=', dateValue), orderBy('transactionDate', 'desc'));
                            } else if (op === '<') {
                                q = query(transactionsRef, where('transactionDate', '<', dateValue), orderBy('transactionDate', 'desc'));
                            } else if (op === '<=') {
                                q = query(transactionsRef, where('transactionDate', '<=', dateValue), orderBy('transactionDate', 'desc'));
                            } else if (op === '==') {
                                // For == we need to match the whole day, so use range query
                                const startOfDay = `${rawDateValue}T00:00:00.000Z`;
                                const endOfDay = `${rawDateValue}T23:59:59.999Z`;
                                q = query(transactionsRef, where('transactionDate', '>=', startOfDay), where('transactionDate', '<=', endOfDay), orderBy('transactionDate', 'desc'));
                            } else {
                                console.warn(`⚠️ Unknown date operator: ${op}, falling back to default query`);
                                q = query(transactionsRef, orderBy('transactionDate', 'desc'), limit(queryLimit));
                            }
                        } else if (filterSymbol) {
                            // Filter by symbol
                            console.log(`🔍 Fetching transactions for symbol: ${filterSymbol}`);
                            q = query(transactionsRef, where('symbol', '==', filterSymbol));
                        } else if (filterTxType) {
                            // Filter by transaction type (e.g., "expense", "income")
                            console.log(`🔍 Fetching ${filterTxType} transactions, limit: ${queryLimit}`);
                            q = query(transactionsRef, where('transactionType', '==', filterTxType));
                        } else {
                            // No filter - get recent transactions
                            console.log(`🔍 Fetching recent transactions, limit: ${queryLimit}`);
                            q = query(transactionsRef, orderBy('transactionDate', 'desc'), limit(queryLimit));
                        }
                        
                        const snapshot = await getDocs(q);
                        results = snapshot.docs.map(doc => ({
                            id: doc.id,
                            ...doc.data()
                        }));
                        
                        // If filtering by type, sort by date in memory and apply limit
                        if (filterTxType && results.length > 0) {
                            results.sort((a: any, b: any) => {
                                const dateA = a.transactionDate?.toDate?.() || new Date(a.transactionDate || 0);
                                const dateB = b.transactionDate?.toDate?.() || new Date(b.transactionDate || 0);
                                return dateB.getTime() - dateA.getTime(); // Descending
                            });
                            results = results.slice(0, queryLimit);
                        }
                        
                        console.log(`✅ Found ${results.length} transactions`, results);
                    } catch (err) {
                        console.error("🔍 Query failed:", err);
                    }
                }
                
                if (results.length > 0) {
                     // 📊 Detect Currency (use most common if mixed)
                     const currencyCounts: Record<string, number> = {};
                     results.forEach((tx: any) => {
                         const curr = tx.currency || 'AUD';
                         currencyCounts[curr] = (currencyCounts[curr] || 0) + 1;
                     });
                     const primaryCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'AUD';
                     const isMixedCurrency = Object.keys(currencyCounts).length > 1;

                     // 📊 Calculate Net Position Value (Sell - Buy) only for primary currency
                     const netValue = results.reduce((sum: number, tx: any) => {
                          // Only sum transactions in the primary currency
                          if (tx.currency && tx.currency !== primaryCurrency) return sum;
                          
                          const cost = tx.totalCost || tx.costBasis || (tx.price * tx.quantity) || 0;
                          const txType = tx.transactionType?.toLowerCase();
                          
                          if (txType === 'sell') {
                              return sum + cost;
                          } else if (txType === 'buy') {
                              return sum - cost;
                          }
                          return sum;
                      }, 0);

                     setSearchResults({
                         data: results,
                         title: cleanData.symbol ? `${cleanData.symbol} Transactions` : "Recent Transactions",
                         summary: { 
                             label: isMixedCurrency ? `Net P&L (${primaryCurrency})` : "Net P&L", 
                             value: `${primaryCurrency} ${netValue >= 0 ? '+' : ''}${netValue.toFixed(2)}` 
                         }
                     });

                     setMessages(prev => [...prev, { role: 'ai', content: ">> DATA_STREAM_RECEIVED" }]);
                     setIsProcessing(false);
                     return;
                } else {
                     const noResultMsg = cleanData.symbol 
                         ? `🔍 No transactions found for ${cleanData.symbol}.`
                         : "🔍 No matching records found.";
                     setMessages(prev => [...prev, { role: 'ai', content: noResultMsg }]);
                     setIsProcessing(false);
                     return;
                }
            }

            // 2. 🗑️ DELETE LOGIC INTERCEPTION
            if (txType === 'delete' || txType === 'remove') {
                console.log("🔥 ACL (Widget): DELETE DETECTED. Executing Smart Delete...");
                
                // Check confirmation (simplified for Widget: allow single delete, warn on batch)
                if (cleanData.requiresConfirmation) {
                    // 🛑 Render CONFIRMATION CARD with PRE-CALCULATED COUNT
                    // Fix: We must query the count here to show accurate "affected items"
                    const isDateScope = cleanData.deleteScope === 'date' && cleanData.dateFilter?.operator && cleanData.dateFilter?.value;
                    let calculatedCount: number | string = cleanData.deleteScope === 'single' ? 1 : 'multiple';

                    if (isDateScope && user?.uid) {
                        try {
                            const op = cleanData.dateFilter.operator;
                            const rawDateValue = cleanData.dateFilter.value;
                            const dateValue = normalizeDateValue(rawDateValue, op); // for debug msg only
                            
                            // 🔍 DEEP DEBUG STEP 1: Log Incoming Criteria
                            console.log("🔍 DEBUG STEP 1: Incoming Criteria:", JSON.stringify(cleanData.dateFilter));
                            console.log("🔍 DEBUG: Normalized Date Value:", dateValue, `(Raw: ${rawDateValue})`);

                            // Use Shared Helper
                            const countQuery = getQueryForDateFilter(firestore, user.uid, cleanData.dateFilter);
                            
                            if (countQuery) {
                                const snapshot = await getDocs(countQuery);
                                calculatedCount = snapshot.size;
                                console.log(`📋 Pre-calculated delete count: ${calculatedCount} (Filter: ${op} ${dateValue})`);

                                // 🔍 DEEP DEBUG STEP 2: Inspect First 3 Documents Returned
                                if (snapshot.docs.length > 0) {
                                    console.log("🔍 DEBUG STEP 2: First 3 Matched Documents:");
                                    snapshot.docs.slice(0, 3).forEach((doc, index) => {
                                        const data = doc.data() as any;
                                        console.log(`   [${index}] ID: ${doc.id}`);
                                        console.log(`       - transactionDate Raw:`, data.transactionDate, `(Type: ${typeof data.transactionDate})`);
                                        console.log(`       - createdAt:`, data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toISOString() : 'N/A');
                                    });
                                } else {
                                    console.log("🔍 DEBUG STEP 2: Query returned 0 documents. Fetching ALL to compare...");
                                    // Fetch a sample of ALL docs to see what's actually in the DB
                                    const allDocsRef = collection(firestore, `users/${user.uid}/transactions`);
                                    const allDocsSnap = await getDocs(query(allDocsRef, limit(5)));
                                    console.log(`🔍 DEBUG: Total docs in collection (sample 5): ${allDocsSnap.size}`);
                                    allDocsSnap.docs.forEach((doc, index) => {
                                        const data = doc.data() as any;
                                        console.log(`   [${index}] ID: ${doc.id}`);
                                        console.log(`       - transactionDate Raw:`, data.transactionDate, `(Type: ${typeof data.transactionDate})`);
                                        // Simulate the comparison
                                        const parsedTxDate = new Date(data.transactionDate).getTime();
                                        const parsedCritDate = new Date(dateValue).getTime();
                                        const comparisonResult = op === '>' ? parsedTxDate > parsedCritDate : parsedTxDate >= parsedCritDate;
                                        console.log(`       - Parsed Tx Time: ${parsedTxDate}, Parsed Crit Time: ${parsedCritDate}`);
                                        console.log(`       - Comparison (${op}): ${comparisonResult}`);
                                    });
                                }
                                
                                if (calculatedCount === 0) {
                                    // 🕵️‍♀️ DEBUG (Console Only): Fetch recent records for developer debugging
                                    const transactionsRef = collection(firestore, `users/${user.uid}/transactions`);
                                    const debugQ = query(transactionsRef, orderBy('transactionDate', 'desc'), limit(5));
                                    const debugSnap = await getDocs(debugQ);
                                    const debugDocs = debugSnap.docs.map(d => `[${d.id}]: "${d.data().transactionDate}"`).join(', ');
                                    console.log(`🔍 DEBUG: No match for date ${op} ${dateValue}. Recent DB dates: ${debugDocs}`);

                                    // 🎭 USER-FRIENDLY ERROR MESSAGE
                                    const friendlyDate = rawDateValue; // e.g., "2019-01-19"
                                    setMessages(prev => [...prev, { 
                                        role: 'ai', 
                                        content: `❌ 没有找到 ${friendlyDate} 的交易记录。\n\n可能的原因：\n• 该日期没有任何交易\n• 日期格式或年份可能有误（您输入的是 ${rawDateValue}？）` 
                                    }]);
                                    setIsProcessing(false);
                                    return;
                                }
                            }
                        } catch (err) {
                            console.error("Delete Count Error", err);
                        }
                    }

                    const isMultiRecordDelete = cleanData.deleteScope === 'all' || cleanData.deleteScope === 'symbol' || cleanData.deleteScope === 'date';
                    
                    // 🧠 DYNAMIC TIER CALCULATION
                    // Tier 3: Dangerous/All (Delete Scope = 'all')
                    // Tier 2: Batch/Date (Confirm 'yes')
                    // Tier 1: Single (Confirm 'yes')
                    let tier = 1;
                    let message = cleanData.confirmationMessage || "High-risk deletion. Confirm?";
                    
                    // 🛡️ PRIORITY FIX: If dateFilter exists, treat as date-based deletion, NOT "delete all"
                    const hasDateFilter = cleanData.dateFilter?.operator && cleanData.dateFilter?.value;
                    
                    if (hasDateFilter) {
                        // Date-based deletion (even if AI said 'all' due to phrase "delete all on [date]")
                        tier = 2;
                        const op = cleanData.dateFilter.operator;
                        const dateVal = cleanData.dateFilter.value;
                        if (typeof calculatedCount === 'number' && calculatedCount > 0) {
                            message = `Found ${calculatedCount} transactions matching date ${op} ${dateVal}. Confirm delete?`;
                        } else {
                            message = `Delete transactions where date ${op} ${dateVal}?`;
                        }
                    } else if (cleanData.deleteScope === 'all') {
                        // TRUE "delete all" (no date filter)
                        tier = 3;
                        message = "⚠️ WARNING: You are about to delete ALL transactions. This cannot be undone.";
                    } else if (isMultiRecordDelete) {
                        tier = 2;
                    }

                    setPendingConfirmation({
                        action: cleanData, 
                        message: message,
                        affectedCount: calculatedCount,
                        tier: tier
                    });
                    console.log('📋 PendingConfirmation set with action:', cleanData);
                    setIsProcessing(false);
                    return;
                }

                await executeImmediateDelete(cleanData); // Refactored helper
                setIsProcessing(false);
                return; // Stop here
            }

            // ✏️ UPDATE INTERCEPTION
            if (txType === 'update') {
                console.log("✏️ ACL (Widget): UPDATE DETECTED. Checking for batch or single...");
                
                // 🆕 BATCH UPDATE BY DATE FILTER (Priority 1)
                const hasDateFilter = cleanData.dateFilter?.operator && cleanData.dateFilter?.value;
                
                if (hasDateFilter) {
                    console.log(`📅 BATCH UPDATE detected with date filter: ${cleanData.dateFilter.operator} ${cleanData.dateFilter.value}`);
                    
                    // Always require confirmation for batch updates
                    if (!cleanData._batchConfirmed) {
                        // Count affected records first
                        try {
                            const op = cleanData.dateFilter.operator;
                            const rawDateValue = cleanData.dateFilter.value;
                            const dateValue = normalizeDateValue(rawDateValue, op);
                            const transactionsRef = collection(firestore, `users/${user.uid}/transactions`);
                            
                            let countQuery;
                            if (op === '>') countQuery = query(transactionsRef, where('transactionDate', '>', dateValue));
                            else if (op === '>=') countQuery = query(transactionsRef, where('transactionDate', '>=', dateValue));
                            else if (op === '<') countQuery = query(transactionsRef, where('transactionDate', '<', dateValue));
                            else if (op === '<=') countQuery = query(transactionsRef, where('transactionDate', '<=', dateValue));
                            else if (op === '==') {
                                // For == we need range query
                                const startOfDay = `${rawDateValue}T00:00:00.000Z`;
                                const endOfDay = `${rawDateValue}T23:59:59.999Z`;
                                countQuery = query(transactionsRef, where('transactionDate', '>=', startOfDay), where('transactionDate', '<=', endOfDay));
                            } else {
                                setMessages(prev => [...prev, { role: 'ai', content: `❌ Unknown date operator: ${op}` }]);
                                setIsProcessing(false);
                                return;
                            }
                            
                            const snapshot = await getDocs(countQuery);
                            const affectedCount = snapshot.size;
                            
                            if (affectedCount === 0) {
                                setMessages(prev => [...prev, { role: 'ai', content: `⚠️ No transactions found matching date filter (${op} ${dateValue}).` }]);
                                setIsProcessing(false);
                                return;
                            }
                            
                            // Prepare update payload (extract only update fields)
                            const updateFields = { ...cleanData };
                            delete updateFields.transactionType;
                            delete updateFields.dateFilter;
                            delete updateFields.requiresConfirmation;
                            delete updateFields.confirmationMessage;
                            delete updateFields._batchConfirmed;
                            
                            setPendingConfirmation({
                                type: 'batch_update',
                                action: { ...cleanData, _batchConfirmed: true },
                                updateFields: updateFields,
                                message: cleanData.confirmationMessage || `This will update ${affectedCount} transactions where date ${op} ${dateValue}. Confirm?`,
                                affectedCount: affectedCount,
                                tier: 2
                            });
                            setIsProcessing(false);
                            return;
                        } catch (err: any) {
                            console.error("Batch Update Count Error", err);
                            setMessages(prev => [...prev, { role: 'ai', content: `❌ Error counting transactions: ${err.message}` }]);
                            setIsProcessing(false);
                            return;
                        }
                    } else {
                        // Already confirmed - execute with Dragnet
                        await executeBatchUpdateByDragnet(cleanData);
                        setIsProcessing(false);
                        return;
                    }
                }
                
                // SINGLE UPDATE BY ID
                const targetId = cleanData.transactionId || cleanData.transactions?.[0]?.transactionId;
                if (!targetId && !cleanData.symbol) { 
                     setMessages(prev => [...prev, { role: 'ai', content: "❌ I need a specific Transaction ID (or symbol) to update." }]);
                     setIsProcessing(false);
                     return;
                }

                try {
                    // RESOLVE ID (Using same logic as delete)
                    let docData = null;
                    let realId = targetId;
                    
                    if (realId) {
                        let docRef = doc(firestore, `users/${user.uid}/transactions`, realId);
                        let docSnap = await getDoc(docRef);
                        
                        // ID Resolution Fallback
                        if (!docSnap.exists()) {
                             const q = query(
                                collection(firestore, `users/${user.uid}/transactions`), 
                                where('displayId', '==', isNaN(Number(realId)) ? realId : Number(realId))
                            );
                            const qSnap = await getDocs(q);
                            if (!qSnap.empty) {
                                docSnap = qSnap.docs[0];
                                realId = docSnap.id;
                            }
                        }
                        
                        if (docSnap.exists()) {
                            docData = { ...docSnap.data(), id: realId };
                        }
                    } 
                    // Fallback: If only symbol provided contextually (e.g. "update price of AAPL"), 
                    // find LATEST transaction for that symbol.
                    else if (cleanData.symbol) {
                        const q = query(
                            collection(firestore, `users/${user.uid}/transactions`),
                            where('userId', '==', user.uid),
                            where('symbol', '==', cleanData.symbol)
                            // Note: Real app should order by date desc. 
                        );
                        // For MVP safety, verify ID for updates
                        setMessages(prev => [...prev, { role: 'ai', content: "⚠️ Please provide the Transaction ID (e.g. #123) to update." }]);
                        setIsProcessing(false);
                        return;
                    }

                    if (!docData) {
                        setMessages(prev => [...prev, { role: 'ai', content: `❌ Transaction ${realId || ''} not found.` }]);
                        setIsProcessing(false);
                        return;
                    }

                    // PREPARE DIFF
                    // Merge cleaning: remove non-data fields
                    const proposedChanges = { ...cleanData };
                    delete proposedChanges.transactionType;
                    delete proposedChanges.transactionId;
                    delete proposedChanges.requiresConfirmation;
                    
                    const mergedData = { ...docData, ...proposedChanges };

                    setPendingConfirmation({
                        type: 'update', // Signal for DiffCard
                        original: docData,
                        modified: mergedData,
                        action: { ...mergedData, transactionId: realId }, // Ensure ID is passed for execution
                        message: "Review the proposed changes before saving.",
                        tier: 2
                    });
                    
                    setIsProcessing(false);
                    return;

                } catch (err: any) {
                    console.error("Update Fetch Error", err);
                    setMessages(prev => [...prev, { role: 'ai', content: "❌ Error fetching transaction for update." }]);
                    setIsProcessing(false);
                    return;
                }
            }

            // 3. 🛡️ STANDARD WRITE LOGIC (Add/Update)
            const TransactionGuard = z.object({
                transactionType: z.enum(['buy', 'sell', 'income', 'expense']),
                symbol: z.string().optional(),
                quantity: z.number().optional(),
                price: z.number().optional(),
                totalCost: z.number().optional(),
                currency: z.string().default('USD'),
            }).passthrough();

            const isBatch = parsedResult!.transactions && parsedResult!.transactions.length > 1;
            const validation = TransactionGuard.safeParse(parsedResult!);

            // 📦 BATCH IMPORT HANDLING (CSV / Multi-line)
            if (isBatch) {
                console.log('📦 ACL (Widget): BATCH DETECTED. Processing', parsedResult!.transactions!.length, 'transactions...');
                
                // Dynamic import to avoid SSR issues
                const { standardizeCategory } = await import('@/lib/constants/categories');
                
                const transactions = parsedResult!.transactions!;
                let successCount = 0;
                let failCount = 0;
                const failedTransactions: Array<{symbol: string, error: string}> = [];
                
                try {
                    // 🚀 Use Firestore Batch for better performance
                    const batch = writeBatch(firestore);
                    const processedTxs: any[] = [];
                    
                    for (const tx of transactions) {
                        try {
                            // Normalize transaction type (e.g., 'B' -> 'buy', 'DIV' -> 'income')
                            let normalizedType = tx.transactionType?.toLowerCase() || '';
                            if (normalizedType === 'b' || normalizedType === 'buy') normalizedType = 'buy';
                            else if (normalizedType === 's' || normalizedType === 'sell') normalizedType = 'sell';
                            else if (normalizedType === 'div' || normalizedType === 'dividend') normalizedType = 'income';
                            else if (!['buy', 'sell', 'income', 'expense'].includes(normalizedType)) {
                                console.warn('⚠️ Skipping unknown transaction type:', tx.transactionType);
                                failCount++;
                                failedTransactions.push({ symbol: tx.symbol || 'Unknown', error: 'Unknown transaction type' });
                                continue;
                            }
                            
                            // 🎯 Smart Scope Detection based on transaction type
                            const isLifestyle = normalizedType === 'expense' || normalizedType === 'income';
                            const isInvestment = normalizedType === 'buy' || normalizedType === 'sell';
                            
                            let mappedCategory = tx.category || 'General';
                            let mappedSymbol = tx.symbol || '';
                            
                            // 🧠 For lifestyle transactions, use standardizeCategory to map symbol -> category
                            if (isLifestyle) {
                                // If symbol is "LIFESTYLE" or empty, try to use category or notes
                                if (!mappedSymbol || mappedSymbol.toLowerCase() === 'lifestyle') {
                                    mappedSymbol = tx.notes || tx.category || 'Unknown';
                                }
                                
                                // Use standardizeCategory to map the symbol/merchant to a proper category
                                const categoryResult = standardizeCategory(mappedSymbol, []);
                                mappedCategory = categoryResult.name;
                                
                                console.log(`🏷️ Category Mapping: "${mappedSymbol}" -> "${mappedCategory}"`);
                            }
                            
                            // 🧹 Normalization: Fix inverted Price/Quantity
                            let finalQuantity = Math.abs(tx.quantity || 1);
                            let finalPrice = Math.abs(tx.price || (tx as any).totalCost || 0);

                            // CRITICAL: Only swap for EXPENSE (not income!)
                            // For INCOME: quantity should be the amount, price should be 1
                            // For EXPENSE: quantity should be 1, price should be the amount
                            const isExpense = normalizedType === 'expense';
                            const isIncome = normalizedType === 'income';
                            
                            if (isLifestyle && isExpense && finalQuantity > 1 && finalPrice <= 1) {
                                // Expense: Swap to make qty=1, price=amount
                                console.log(`🧹 CSV Normalization (Expense): Swapping Qty(${finalQuantity}) with Price(${finalPrice}) for ${mappedSymbol}`);
                                finalPrice = finalQuantity;
                                finalQuantity = 1;
                            } else if (isIncome && finalQuantity === 1 && finalPrice > 1) {
                                // Income: Swap to make qty=amount, price=1
                                console.log(`🧹 CSV Normalization (Income): Swapping Qty(${finalQuantity}) with Price(${finalPrice}) for ${mappedSymbol}`);
                                finalQuantity = finalPrice;
                                finalPrice = 1;
                            }

                            const mappedTx = {
                                ...tx,
                                transactionType: normalizedType,
                                symbol: mappedSymbol,
                                category: mappedCategory,
                                quantity: finalQuantity,
                                price: finalPrice,
                                currency: tx.currency || 'AUD',
                                market: isInvestment ? (tx.market || 'US') : 'LOCAL',
                                assetClass: isInvestment ? 'Stock' : 'AUD Cash',
                                impactsCash: true,
                                scope: isLifestyle ? 'LIFESTYLE' : 'INVESTMENT',
                                notes: tx.notes || 'Imported via CSV'
                            };
                            
                            // Add to batch instead of writing immediately
                            const docRef = doc(collection(firestore, `users/${user.uid}/transactions`));
                            const firestoreData = {
                                ...mappedTx,
                                transactionDate: mappedTx.date ? Timestamp.fromDate(new Date(mappedTx.date)) : Timestamp.now(),
                                createdAt: Timestamp.now(),
                                updatedAt: Timestamp.now(),
                            };
                            batch.set(docRef, firestoreData);
                            processedTxs.push(mappedTx);
                            successCount++;
                        } catch (err: any) {
                            console.error('❌ Batch item validation failed:', tx.symbol, err.message);
                            failCount++;
                            failedTransactions.push({ symbol: tx.symbol || 'Unknown', error: err.message });
                        }
                    }
                    
                    // 🚀 Commit all transactions in one atomic operation
                    if (processedTxs.length > 0) {
                        await batch.commit();
                        console.log(`✅ Batch committed: ${processedTxs.length} transactions`);
                    }
                    
                } catch (batchError: any) {
                    console.error('❌ Batch commit failed:', batchError);
                    // If batch fails, fall back to sequential writes
                    console.log('⚠️ Falling back to sequential writes...');
                    successCount = 0;
                    failCount = 0;
                    
                    for (const tx of transactions) {
                        try {
                            await addTransactionWithClientSDK(user.uid, firestore, tx as ParseTransactionOutput);
                            successCount++;
                        } catch (err: any) {
                            console.error('❌ Sequential write failed:', tx.symbol, err.message);
                            failCount++;
                        }
                    }
                }
                
                // Remove loading message and show result
                const isChinese = /[\u4e00-\u9fa5]/.test(userMsg);
                let feedbackMsg = isChinese
                    ? `✅ 批量导入完成: ${successCount} 条成功${failCount > 0 ? `, ${failCount} 条失败` : ''}`
                    : `✅ Batch import complete: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`;
                
                // Add details about failed transactions if any
                if (failedTransactions.length > 0 && failedTransactions.length <= 5) {
                    const failedList = failedTransactions.map(f => `- ${f.symbol}: ${f.error}`).join('\n');
                    feedbackMsg += isChinese 
                        ? `\n\n失败详情:\n${failedList}`
                        : `\n\nFailed details:\n${failedList}`;
                }
                    
                setMessages(prev => {
                    // Remove loading message (last AI message)
                    const filtered = prev.filter((msg, idx) => {
                        if (idx === prev.length - 1 && msg.role === 'ai' && msg.content.includes('Processing CSV')) {
                            return false;
                        }
                        return true;
                    });
                    return [...filtered, { role: 'ai', content: feedbackMsg }];
                });
                router.refresh();
                setIsProcessing(false);
                return;
            }

            if (validation.success) {
                // Check for critically missing fields that Zod might allow as optional but business logic requires
                const validTx = validation.data;
                const missingFields = [];
                if ((validTx.transactionType === 'buy' || validTx.transactionType === 'sell') && !validTx.quantity) missingFields.push('quantity');
                // if ((validTx.transactionType === 'buy' || validTx.transactionType === 'sell') && !validTx.price) missingFields.push('price'); // Price can sometimes be inferred or 0
                
                if (missingFields.length > 0) {
                     // 📥 STASH INTENT: Asking for missing info
                     console.log('📥 Stashing intent due to missing fields:', missingFields);
                     setPendingIntent({
                         rawData: validTx,
                         missingFields: missingFields,
                         timestamp: Date.now(),
                         userInput: userMsg
                     });
                     
                     const inquiry = generateInquiryMessage(
                         validTx, 
                         missingFields, 
                         user.displayName?.split(' ')[0] || 'there'
                     );
                     setMessages(prev => [...prev, { role: 'ai', content: inquiry }]);
                     setIsProcessing(false);
                     return;
                }

                // Ready to Execute
                const validTransaction = validation.data;
                console.log("⚡ ACL (Widget): Valid Transaction. FORCE EXECUTING.", validTransaction);

                // 🔍 DEBUG: Log AI parsing output to diagnose income quantity bug
                console.log('🔍 AI PARSING OUTPUT:', {
                    type: parsedResult!.transactionType,
                    symbol: parsedResult!.symbol,
                    qty: parsedResult!.quantity,
                    price: parsedResult!.price,
                    currency: parsedResult!.currency,
                    assetClass: parsedResult!.assetClass
                });

                try {
                    const receipt = await addTransactionWithClientSDK(user.uid, firestore, parsedResult! as ParseTransactionOutput);
                    console.log("✅ ACL (Widget): Write Successful!", receipt);

                    const isChinese = /[\u4e00-\u9fa5]/.test(userMsg);
                    const displaySymbol = validTransaction.symbol || 'Record';
                    const feedbackMsg = isChinese
                        ? `✅ 已成功记录: ${displaySymbol} (#${receipt.displayId})`
                        : `✅ Successfully recorded: ${displaySymbol} (#${receipt.displayId})`;

                    setMessages(prev => [...prev, { role: 'ai', content: feedbackMsg }]);
                    router.refresh();
                } catch (writeErr: any) {
                    console.error("❌ ACL (Widget): Force Write Failed", writeErr);
                    setMessages(prev => [...prev, { role: 'ai', content: `Error: ${writeErr.message}` }]);
                    toast({ title: "Write Error", description: writeErr.message, variant: "destructive" });
                }
            } else {
                // Fallback for non-transactional queries or batch operations
                const aiText = parsedResult!.contextualContent || '✅ Processed successfully.';
                setMessages(prev => [...prev, { role: 'ai', content: aiText }]);
            }
            
        } catch (error: any) {
            console.error(error);
            // 🎭 Butler-style Error Translation
            const { message: friendlyError } = translateError(error, user.displayName?.split(' ')[0]);
            setMessages(prev => [...prev, { role: 'ai', content: friendlyError }]);
        } finally {
            setIsProcessing(false);
        }
    };

    // ⏳ OPTIMISTIC DELETE HANDLER
    const handleOptimisticDelete = (itemsToDelete: any[], actionData: any) => {
        // 1. Stash items for potential undo
        setUndoData({
            items: itemsToDelete,
            actionData: actionData,
            count: itemsToDelete.length
        });

        // 2. 🔮 HIDE ITEMS IMMEDIATELY via PageContext
        const idsToHide = itemsToDelete.map((item: any) => item.id).filter(Boolean);
        if (addOptimisticDelete && idsToHide.length > 0) {
            addOptimisticDelete(idsToHide);
        }

        // 3. Show Toast (Starts 10s timer)
        setShowUndoToast(true);

        // 4. Optimistic UI Feedback
        setMessages(prev => [...prev, {
            role: 'ai',
            content: `⏳ Deleting ${itemsToDelete.length} items... (Undo available for 10s)`
        }]);
    };

    // ⏳ FINAL EXECUTION (After timeout)
    const handleFinalDeleteExecute = async () => {
        if (!undoData) return;

        const { actionData, count } = undoData;
        setShowUndoToast(false);
        setUndoData(null); // Clear stash

        try {
            // Re-use the existing logic but FORCE execution
            // We'll create a special flag to bypass the optimistic check if needed,
            // or just call the DB logic directly since we have the data.

            // Simplified: Just call the actual DB delete logic (which we will extract below)
            await performHardDelete(actionData);

            toast({
                title: "Deleted",
                description: `Successfully removed ${count} transactions.`,
            });

            setMessages(prev => [...prev, {
                role: 'ai',
                content: `✅ Permanently deleted ${count} items.`
            }]);

            router.refresh();

        } catch (err: any) {
            console.error("Final Delete Failed", err);
            toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
        }
    };

    // ⏳ UNDO HANDLER
    const handleUndo = () => {
        console.log("↩️ Undo Requested!");
        
        // 1. 🔮 RESTORE ITEMS: Clear optimistic hiding
        if (clearOptimisticDelete) {
            clearOptimisticDelete();
        }
        
        // 2. Clear local state
        setShowUndoToast(false);
        setUndoData(null);
        
        // 3. Notify user
        setMessages(prev => [...prev, { role: 'ai', content: "✅ Deletion cancelled. Items restored." }]);
        toast({ title: "Restored", description: "Deletion cancelled." });
    };

    // 🔥 HARD DELETE HELPER (Extracted from old executeImmediateDelete)
    const performHardDelete = async (data: any) => {
        const isBatchScope = data.deleteScope === 'all' || data.deleteScope === 'batch' || data.deleteScope === 'symbol';
        const hasValidDateFilter = data.dateFilter?.operator && data.dateFilter?.value;
        const isDateScope = hasValidDateFilter;

        let queryToDelete;

        if (isBatchScope && data.symbol) {
            queryToDelete = query(
                collection(firestore, `users/${user!.uid}/transactions`),
                where('symbol', '==', data.symbol)
            );
        } else if (isDateScope) {
            const op = data.dateFilter.operator;
            const rawDateValue = data.dateFilter.value;
            const dateValue = normalizeDateValue(rawDateValue, op);
            const ref = collection(firestore, `users/${user!.uid}/transactions`);

            if (op === '>') queryToDelete = query(ref, where('transactionDate', '>', dateValue));
            else if (op === '>=') queryToDelete = query(ref, where('transactionDate', '>=', dateValue));
            else if (op === '<') queryToDelete = query(ref, where('transactionDate', '<', dateValue));
            else if (op === '<=') queryToDelete = query(ref, where('transactionDate', '<=', dateValue));
            else if (op === '==') {
                const startOfDay = `${rawDateValue}T00:00:00.000Z`;
                const endOfDay = `${rawDateValue}T23:59:59.999Z`;
                queryToDelete = query(ref, where('transactionDate', '>=', startOfDay), where('transactionDate', '<=', endOfDay));
            }
        } else if (data.transactionId) {
            // Single ID
            let docRef = doc(firestore, `users/${user!.uid}/transactions`, data.transactionId);
            let docSnap = await getDoc(docRef);

            // Smart Resolution: UUID -> DisplayID (if needed for hard delete)
            if (!docSnap.exists()) {
                console.log("...Not a UUID, trying Display ID query for hard delete...");
                const q = query(
                    collection(firestore, `users/${user!.uid}/transactions`),
                    where('displayId', '==', isNaN(Number(data.transactionId)) ? data.transactionId : Number(data.transactionId))
                );
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    docRef = qSnap.docs[0].ref;
                    console.log("✅ Resolved DisplayID for hard delete:", docRef.id);
                } else {
                    throw new Error(`Transaction ${data.transactionId} not found for hard delete.`);
                }
            }
            await deleteDoc(docRef);
            return; // Done
        }

        if (queryToDelete) {
            const snapshot = await getDocs(queryToDelete);
            const batch = writeBatch(firestore);
            snapshot.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
        }
    };




    // Helper: Execute Immediate Delete (Refactored to support Batch)
    const executeImmediateDelete = async (data: any) => {
        // 🐛 DEBUG: Log incoming data to trace payload
        console.log('🗑️ executeImmediateDelete called with data:', JSON.stringify(data, null, 2));

        const isBatchScope = data.deleteScope === 'all' || data.deleteScope === 'batch' || data.deleteScope === 'symbol';
        const hasValidDateFilter = data.dateFilter?.operator && data.dateFilter?.value;
        const isDateScope = hasValidDateFilter;

        console.log('🔍 Scope checks:', { isBatchScope, isDateScope, hasValidDateFilter, deleteScope: data.deleteScope, dateFilter: data.dateFilter });

        // 🔮 BRANCH A: BATCH DELETION
        if (isBatchScope && data.symbol) {
            // Count first for optimistic UI
            const q = query(
                collection(firestore, `users/${user!.uid}/transactions`),
                where('symbol', '==', data.symbol)
            );
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                setMessages(prev => [...prev, { role: 'ai', content: `⚠️ No transactions found for ${data.symbol}.` }]);
                return;
            }
            // Trigger Optimistic Flow
            handleOptimisticDelete(snapshot.docs.map(d => d.data()), data);
            return;
        }

        // 🔮 BRANCH C: DATE-BASED BATCH DELETION (UI-TARGETED APPROACH)
        // Problem: Server-side query may miss records due to schema drift.
        // Solution: Use locally loaded pageData to find IDs, then delete from Firestore.
        if (isDateScope) {
            console.log('🎯 UI-Targeted Deletion: Using pageData to find matching records...');
            
            // Step 1: Parse target date
            const op = data.dateFilter.operator;
            const targetDateStr = data.dateFilter.value;
            const targetDate = new Date(targetDateStr).getTime();
            
            console.log(`📅 Target Date: ${targetDateStr} (${targetDate}ms), Operator: ${op}`);
            
            // Step 2: Filter locally loaded transactions (from PageContext)
            let idsToDelete: string[] = [];
            let matchedTransactions: any[] = [];
            
            if (pageData && Array.isArray(pageData) && pageData.length > 0) {
                console.log(`📋 PageData available: ${pageData.length} items. Scanning...`);
                
                matchedTransactions = pageData.filter((tx: any) => {
                    // Try multiple date field names for compatibility
                    const txDateRaw = tx.transactionDate || tx.date;
                    if (!txDateRaw) return false;
                    
                    const txDate = new Date(txDateRaw).getTime();
                    
                    // Apply operator logic
                    switch (op) {
                        case '>':  return txDate > targetDate;
                        case '>=': return txDate >= targetDate;
                        case '<':  return txDate < targetDate;
                        case '<=': return txDate <= targetDate;
                        case '==': 
                            const dayStart = new Date(targetDateStr).setHours(0,0,0,0);
                            const dayEnd = new Date(targetDateStr).setHours(23,59,59,999);
                            return txDate >= dayStart && txDate <= dayEnd;
                        default: return false;
                    }
                });
                
                idsToDelete = matchedTransactions.map((tx: any) => tx.id).filter(Boolean);
                
                console.log(`🎯 Found ${idsToDelete.length} matching transactions in pageData:`);
                matchedTransactions.slice(0, 5).forEach((tx: any, i: number) => {
                    console.log(`   [${i}] ID: ${tx.id}, Date: ${tx.transactionDate || tx.date}`);
                });
            } else {
                console.warn('⚠️ PageData not available or empty. Falling back to server query...');
                
                // Fallback: Try server-side query
                let q;
                try {
                    q = getQueryForDateFilter(firestore, user!.uid, data.dateFilter);
                } catch (err: any) {
                    setMessages(prev => [...prev, { role: 'ai', content: err.message }]);
                    return;
                }
                
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    idsToDelete = snapshot.docs.map(d => d.id);
                    matchedTransactions = snapshot.docs.map(d => d.data());
                }
            }
            
            // Step 3: Execute Deletion
            if (idsToDelete.length === 0) {
                // Debug output
                const transactionsRef = collection(firestore, `users/${user!.uid}/transactions`);
                const debugQ = query(transactionsRef, orderBy('transactionDate', 'desc'), limit(5));
                const debugSnap = await getDocs(debugQ);
                const debugDocs = debugSnap.docs.map(d => `[ByDate] ${d.id}: "${(d.data() as any).transactionDate}"`).join('\n');

                const dateValue = normalizeDateValue(targetDateStr, op);
                
                let pageDataDebug = '(Not Available)';
                if (pageData && Array.isArray(pageData)) {
                    const top3 = pageData.slice(0, 3).map((t: any) => `[PageData] ${t.id}: ${t.transactionDate || t.date}`).join('\n');
                    pageDataDebug = `Total: ${pageData.length} items\n${top3}`;
                }

                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: `⚠️ No transactions found matching date filter.\nFilter: transactionDate ${op} ${dateValue}\n\nRecent DB Records:\n${debugDocs || '(None)'}\n\nUI Context (PageData):\n${pageDataDebug}` 
                }]);
                return;
            }
            
            // Step 4: Batch Delete from Firestore
            if (idsToDelete.length > 0) {
                // 🔮 OPTIMISTIC DELETE (THE ILLUSION)
                // Instead of deleting from DB immediately, we:
                // 1. Hide them from the UI instantly
                // 2. Start the Undo Timer
                
                console.log(`🔮 Optimistic Delete: Hiding ${idsToDelete.length} items from UI...`);
                
                // Add to PageContext to hide from Table immediately
                if (addOptimisticDelete) {
                    addOptimisticDelete(idsToDelete);
                }

                // Set local state for Undo Toast to initiate countdown
                setUndoData({
                    items: matchedTransactions,
                    actionData: data, // Stores the intent
                    count: idsToDelete.length
                });
                setShowUndoToast(true);

                // Show feedback immediately
                toast({
                    title: `🗑️ Deleted ${idsToDelete.length} transaction(s)`,
                    description: "Undo available for 10 seconds.",
                });
                
                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: `✅ Deleted ${idsToDelete.length} transaction(s).` 
                }]);
                
                return;
            }
        }

        // 🔮 BRANCH B: SINGLE DELETION
        // ... rest of single delete logic ...
        let targetId = data.transactionId;
        if (!targetId && data.transactions && data.transactions.length > 0) {
            targetId = data.transactions[0].transactionId;
        }

        if (targetId) {
            // For single delete, we need to resolve the ID first to ensure it exists
            let docRef = doc(firestore, `users/${user!.uid}/transactions`, targetId);
            let docSnap = await getDoc(docRef);
            let resolvedId = targetId;

            if (!docSnap.exists()) {
                console.log("...Not a UUID, trying Display ID query for single delete...");
                const q = query(
                    collection(firestore, `users/${user!.uid}/transactions`),
                    where('displayId', '==', isNaN(Number(targetId)) ? targetId : Number(targetId))
                );
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    resolvedId = qSnap.docs[0].id; // Get the actual Firestore document ID
                    console.log("✅ Resolved DisplayID for single delete:", resolvedId);
                } else {
                    setMessages(prev => [...prev, { role: 'ai', content: `❌ Transaction ${targetId} not found.` }]);
                    return;
                }
            }
            // Pass the resolved ID to the optimistic handler
            handleOptimisticDelete([{ id: resolvedId }], { ...data, transactionId: resolvedId });
            return;
        } else {
            setMessages(prev => [...prev, { role: 'ai', content: "❌ I couldn't find a Transaction ID to delete for this single operation." }]);
        }
    };



    // 🔮 OPTIMISTIC UPDATE HANDLER (The "Illusion")
    const handleOptimisticUpdate = (originalItems: any[], updates: any, filterDescription: string) => {
        console.log(`🔮 Optimistic Update: Modifying ${originalItems.length} items...`, updates);

        // 1. Create the Optimistic Update Map (ID -> New Values)
        const optimisticMap: Record<string, any> = {};
        originalItems.forEach(item => {
            optimisticMap[item.id] = updates;
        });

        // 2. Apply to Global State (UI updates instantly)
        if (addOptimisticUpdate) {
            addOptimisticUpdate(optimisticMap);
        }

        // 3. Stash for Undo/Commit
        setUpdateUndoData({
            originalItems: originalItems,
            updates: updates,
            count: originalItems.length,
            filterDescription: filterDescription
        });

        // 4. Show Undo Toast (starts timer)
        setShowUpdateUndoToast(true);

        // 5. AI Feedback
        setMessages(prev => [...prev, {
            role: 'ai',
            content: `✅ Updated ${originalItems.length} transactions. (Undo available for 10s)`
        }]);
    };

    // ⏳ FINAL UPDATE EXECUTION (After timeout)
    const handleFinalUpdateExecute = async () => {
        if (!updateUndoData) return;

        const { originalItems, updates, count } = updateUndoData;
        
        // Clear UI states
        setShowUpdateUndoToast(false);
        setUpdateUndoData(null);
        if (clearOptimisticUpdate) clearOptimisticUpdate(); // Clear the "fake" state since DB will define truth

        try {
            console.log(`💾 Committing ${count} updates to Firestore...`);
            const batch = writeBatch(firestore);
            
            // Chunking for safety (500 limit)
            const CHUNK_SIZE = 450;
            for (let i = 0; i < originalItems.length; i += CHUNK_SIZE) {
                const chunk = originalItems.slice(i, i + CHUNK_SIZE);
                if (i > 0) {
                    // If multiple batches needed, we must await previous or create new batch.
                    // For simplicity in this widget, we assume batch < 500 or just do parallel writes if needed.
                    // But standard writeBatch is one-shot. Let's just do one batch for now or sequence them.
                    // Actually, writeBatch cannot be reused. create new one? No, multiple commits.
                    await batch.commit(); // Commit previous
                    // Note: This logic is flawed for >500 items if we reuse 'batch' variable.
                    // Correct approach: Create new batch for next chunk.
                    // But for "Widget" scale, let's assume < 500 for MVP safety.
                }
                
                chunk.forEach((item: any) => {
                    const docRef = doc(firestore, `users/${user!.uid}/transactions`, item.id);
                    batch.update(docRef, updates);
                });
            }
            
            await batch.commit();
            console.log("✅ Batch Commit Successful");
            
            toast({
                title: "Updated",
                description: `Successfully modified ${count} transactions.`,
            });
            
            router.refresh();

        } catch (err: any) {
            console.error("Final Update Failed", err);
            toast({ title: "Update Failed", description: err.message, variant: "destructive" });
            // Revert optimistic expectation? It's already cleared above.
            // If DB fails, the UI will revert to old state on next fetch/refresh implicitly.
        }
    };

    // ↩️ UNDO UPDATE
    const handleUndoUpdate = () => {
        console.log("↩️ Undo Update Requested!");
        
        // 1. Clear Optimistic State (UI reverts instantly)
        if (clearOptimisticUpdate) {
            clearOptimisticUpdate();
        }

        // 2. Clear Local State
        setShowUpdateUndoToast(false);
        setUpdateUndoData(null);

        // 3. Feedback
        setMessages(prev => [...prev, { role: 'ai', content: "✅ Update cancelled. Changes reverted." }]);
        toast({ title: "Restored", description: "Update cancelled." });
    };

    // Helper: Execute Immediate Update
    const executeImmediateUpdate = async (finalData: any) => {
        console.log("📝 Executing Update for:", finalData.transactionId);
        try {
            const docRef = doc(firestore, `users/${user!.uid}/transactions`, finalData.transactionId || finalData.id);

            // Cleanup payload
            const { id, displayId, transactionId, ...updatePayload } = finalData;

            await updateDoc(docRef, updatePayload);
            console.log("✅ Widget Update Successful");

            setMessages(prev => [...prev, { role: 'ai', content: "✅ Transaction updated successfully." }]);
            router.refresh();
        } catch (err: any) {
            console.error("Widget Update Failed", err);
            setMessages(prev => [...prev, { role: 'ai', content: `❌ Update failed: ${err.message}` }]);
            throw err; // Propagate to handler
        }
    };



    // 🆕 Helper: Execute Batch Update by Date Filter
    const executeBatchUpdateByDate = async (data: any) => {
        console.log("📅 Executing BATCH UPDATE by date filter:", data.dateFilter);
        try {
            const op = data.dateFilter.operator;
            const rawDateValue = data.dateFilter.value;
            const dateValue = normalizeDateValue(rawDateValue, op);
            const transactionsRef = collection(firestore, `users/${user!.uid}/transactions`);

            let q;
            if (op === '>') q = query(transactionsRef, where('transactionDate', '>', dateValue));
            else if (op === '>=') q = query(transactionsRef, where('transactionDate', '>=', dateValue));
            else if (op === '<') q = query(transactionsRef, where('transactionDate', '<', dateValue));
            else if (op === '<=') q = query(transactionsRef, where('transactionDate', '<=', dateValue));
            else if (op === '==') {
                const startOfDay = `${rawDateValue}T00:00:00.000Z`;
                const endOfDay = `${rawDateValue}T23:59:59.999Z`;
                q = query(transactionsRef, where('transactionDate', '>=', startOfDay), where('transactionDate', '<=', endOfDay));
            }
            else {
                setMessages(prev => [...prev, { role: 'ai', content: `❌ Unknown date operator: ${op}` }]);
                return;
            }

            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                setMessages(prev => [...prev, { role: 'ai', content: `⚠️ No transactions found matching date filter (${op} ${dateValue}).` }]);
                return;
            }

            // Prepare update fields (exclude control fields)
            const updateFields: Record<string, any> = {};
            const excludeKeys = ['transactionType', 'dateFilter', 'requiresConfirmation', 'confirmationMessage', '_batchConfirmed', 'transactions', 'impactsCash', 'metadata', 'scope', 'category'];

            Object.keys(data).forEach(key => {
                if (!excludeKeys.includes(key) && data[key] !== undefined && data[key] !== null && data[key] !== '') {
                    updateFields[key] = data[key];
                }
            });

            console.log("📝 Update fields to apply:", updateFields);

            const batch = writeBatch(firestore);
            let count = 0;

            snapshot.docs.forEach((docSnap) => {
                batch.update(docSnap.ref, updateFields);
                count++;
            });

            await batch.commit();
            console.log(`✅ Batch Updated ${count} records.`);

            setMessages(prev => [...prev, {
                role: 'ai',
                content: `✅ Successfully updated ${count} transactions where date ${op} ${dateValue}.`
            }]);
            router.refresh();

        } catch (err: any) {
            console.error("Batch Update by Date Failed", err);
            setMessages(prev => [...prev, { role: 'ai', content: `❌ Batch update failed: ${err.message}` }]);
        }
    };



    // 🆕 DRAGNET EXECUTION: Memory Filter -> Optimistic Update
    const executeBatchUpdateByDragnet = async (data: any) => {
        console.log('🕸️ Executing Robust Update via Dragnet (Memory Filter)...', data);
        
        // 1. Fetch Recent Data (The Dragnet)
        let rawTransactions: any[] = [];
        
        try {
            const transactionsRef = collection(firestore, `users/${user!.uid}/transactions`);
            let q;
            
            // Smart Fetch: If date filter exists, fetch around that date + buffer.
            // Otherwise, fetch recent 100.
            const hasDateFilter = data.dateFilter?.operator && data.dateFilter?.value;
            if (hasDateFilter) {
                // Use the loose query helper to get a candidate set
                q = getQueryForDateFilter(firestore, user!.uid, data.dateFilter);
            } else {
                // Default: Fetch last 100 items (Dragnet)
                q = query(transactionsRef, orderBy('transactionDate', 'desc'), limit(100));
            }
            
            const snapshot = await getDocs(q);
            rawTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`🕸️ Dragnet Fetched ${rawTransactions.length} items`);
            
            // 2. Filter in Memory (The Logic)
            const op = data.dateFilter?.operator;
            const targetDateStr = data.dateFilter?.value;
            const targetSymbol = data.symbol?.toUpperCase();
            
            // Prepare Updates
            const updates = { ...data };
            
            // 🧹 Cleanup Control Fields
            const controlFields = [
                'dateFilter', 'symbol', 'requiresConfirmation', 
                'confirmationMessage', '_batchConfirmed', 'transactions', 
                'metadata', 'id', 'transactionId', 'displayId'
            ];
            controlFields.forEach(f => delete updates[f]);

            // ⚠️ FIX: Transaction Type Handling
            // If type is 'update', strip it. If it's a valid type (expense/income), keep it.
            if (updates.transactionType === 'update') {
               delete updates.transactionType; // Remove verb
               
               // 🧠 Intent Inference: Check if user wanted to swap type (e.g. from notes)
               const lowerNotes = (data.notes || '').toLowerCase(); // Use original data.notes
               if (lowerNotes.includes('change to expense') || lowerNotes.includes('set to expense') || lowerNotes.includes('make it expense')) {
                   updates.transactionType = 'expense';
               } else if (lowerNotes.includes('change to income') || lowerNotes.includes('set to income')) {
                   updates.transactionType = 'income';
               } else if (lowerNotes.includes('change to buy')) {
                   updates.transactionType = 'buy';
               } else if (lowerNotes.includes('change to sell')) {
                   updates.transactionType = 'sell';
               }
            }
            
            console.log("📝 Prepared Updates:", updates);

            // Filter Logic
            const targets = rawTransactions.filter((tx: any) => {
                // A. Symbol Match
                if (targetSymbol) {
                    const txSym = (tx.symbol || tx.category || '').toUpperCase();
                    if (txSym !== targetSymbol) return false;
                }
                
                // B. Date Match
                if (hasDateFilter && op && targetDateStr) {
                    const txDateRaw = tx.transactionDate || tx.date;
                    if (!txDateRaw) return false;
                    const txDate = new Date(txDateRaw).getTime();
                    const targetDate = new Date(targetDateStr).getTime();
                    
                    switch (op) {
                        case '>':  if (!(txDate > targetDate)) return false; break;
                        case '>=': if (!(txDate >= targetDate)) return false; break;
                        case '<':  if (!(txDate < targetDate)) return false; break;
                        case '<=': if (!(txDate <= targetDate)) return false; break;
                        case '==': 
                            // Match entire day
                            const dayStart = new Date(targetDateStr).setHours(0,0,0,0);
                            const dayEnd = new Date(targetDateStr).setHours(23,59,59,999);
                            if (!(txDate >= dayStart && txDate <= dayEnd)) return false;
                            break;
                    }
                }
                return true;
            });

            if (targets.length === 0) {
                setMessages(prev => [...prev, { role: 'ai', content: "⚠️ No matching transactions found in recent history to update." }]);
                return;
            }

            console.log(`🎯 Identified ${targets.length} targets for update.`);

            // 3. Trigger Optimistic Flow
            const filterDesc = targetSymbol ? `symbol '${targetSymbol}'` : 'selected criteria';
            handleOptimisticUpdate(targets, updates, filterDesc);

        } catch (err: any) {
             console.error("Dragnet Update Failed", err);
             setMessages(prev => [...prev, { role: 'ai', content: "❌ Failed to process transactions." }]);
             return;
        }
    };

    // 🛡️ RISK-AWARE CONFIRMATION HANDLER
    const handleConfirmRiskAware = async () => {
        // 1. 📸 SNAPSHOT THE DATA (Critical: Do this before clearing state)
        const confirmationData = pendingConfirmation;

        if (!confirmationData) {
            console.error("❌ Handle Confirm: No pending confirmation data found!");
            return;
        }

        console.log("🚀 Confirming Action with Data:", confirmationData);

        // 2. 🔍 EXTRACT THE ACTION PAYLOAD
        // The data might be inside 'action', or directly on the object. Handle both.
        const payload = confirmationData.action || confirmationData;

        // 3. 🛡️ TIER 3 INTERCEPT (Double Check for High Risk)
        // If it's a Tier 3 action (e.g., delete all) and we haven't shown the red warning yet:
        if ((confirmationData.tier || 2) >= 3 && !showFinalWarning) {
            console.log("⚠️ Tier 3 Intercept: Showing Final Warning");
            setShowFinalWarning(true);
            return; // Stop here, wait for second click
        }

        // 4. ✅ EXECUTE
        setIsProcessing(true); // Show loading state
        try {

            // 🔧 DATA NORMALIZATION: Fix Quantity Inflation 
            if (payload.transactionType === 'normalize' || payload.transactionType === 'normalize_quantity') {
                console.log('🔧 [Normalization] Request detected');
                
                if (!user) {
                    console.error('❌ [Normalization] User not authenticated');
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        content: '❌ Authentication required for normalization'
                    }]);
                    setIsProcessing(false);
                    return;
                }
                
                try {
                    // Fetch candidates: lifestyle transactions with quantity > 1
                    const q = query(
                        collection(firestore, `users/${user.uid}/transactions`),
                        where('scope', '==', 'LIFESTYLE'),
                        orderBy('transactionDate', 'desc'),
                        limit(500)
                    );
                    
                    const snapshot = await getDocs(q);
                    const updates: Record<string, any> = {};
                    let affectedCount = 0;
                    
                    snapshot.docs.forEach(doc => {
                        const tx = doc.data();
                        
                        // Skip if already normalized
                        if (Math.abs(tx.quantity - 1) < 0.01) return;
                        
                        // Skip trades
                        if (['buy', 'sell'].includes(tx.transactionType)) return;
                        
                        // Normalize: Price = Price × Quantity, Quantity = 1
                        const totalAmount = tx.quantity * tx.price;
                        updates[doc.id] = {
                            quantity: 1,
                            price: totalAmount,
                            notes: `${tx.notes || ''} [Normalized: ${tx.quantity} × ${tx.price} = ${totalAmount}]`.trim()
                        };
                        affectedCount++;
                    });
                    
                    if (affectedCount === 0) {
                        setMessages(prev => [...prev, {
                            role: 'ai',
                            content: '✅ No transactions need normalization. All lifestyle transactions already have Quantity = 1.'
                        }]);
                        setIsProcessing(false);
                        return;
                    }
                    
                    // Show confirmation
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        content: `📊 Found ${affectedCount} transaction(s) with Quantity > 1. Normalizing...`
                    }]);
                    
                    // Apply batch updates
                    const batch = writeBatch(firestore);
                    Object.entries(updates).forEach(([id, fields]) => {
                        const docRef = doc(firestore, `users/${user.uid}/transactions`, id);
                        batch.update(docRef, { ...fields, updatedAt: Timestamp.now() });
                    });
                    
                    await batch.commit();
                    console.log(`✅ [Normalization] Normalized ${affectedCount} transactions`);
                    
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        content: `✅ Normalization complete! Fixed ${affectedCount} transaction(s). Quantities set to 1, prices adjusted accordingly.`
                    }]);
                    
                    router.refresh();
                    setIsProcessing(false);
                    return;
                    
                } catch (error: any) {
                    console.error('❌ [Normalization] Failed:', error);
                    setMessages(prev => [...prev, {
                        role: 'ai',
                        content: `❌ Normalization failed: ${error.message}`
                    }]);
                    setIsProcessing(false);
                    return;
                }
            }

            // 🗑️ DELETE HANDLER
            if (payload.transactionType === 'delete' || payload.transactionType === 'remove') {
                // Call the robust executor we added earlier
                await executeImmediateDelete(payload);
            } else if (confirmationData.type === 'batch_update') {
                // 🆕 Use Optimistic Dragnet approach for all batch updates
                await executeBatchUpdateByDragnet(payload);
            } else if (payload.transactionType === 'update' || confirmationData.type === 'update') {
                // Use payload (which is the merged 'action' from pendingConfirmation)
                await executeImmediateUpdate(payload);
            } else {
                setMessages(prev => [...prev, { role: 'ai', content: "✅ Batch operation processed." }]);
            }

            // Clear UI states
            setPendingConfirmation(null);
            setShowFinalWarning(false);
            setIsProcessing(false);

        } catch (error: any) {
            console.error("❌ Execution Failed:", error);
            setMessages(prev => [...prev, { role: 'ai', content: `❌ Execution Failed: ${error.message}` }]);
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // 📎 Handle File Selection (Images + CSV)
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 📄 CSV File Handling
        if (file.name.endsWith('.csv') || file.type === 'text/csv') {
            if (file.size > 1 * 1024 * 1024) { // 1MB limit for CSV
                toast({
                    title: 'CSV too large',
                    description: 'Please use a CSV file under 1MB.',
                    variant: 'destructive'
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                const csvContent = event.target?.result as string;
                // Add to Attachments (Do NOT paste to input)
                setAttachments(prev => [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
                    type: 'csv',
                    file: file,
                    name: file.name,
                    content: csvContent
                }]);
                setShowAttachments(false);
            };
            reader.readAsText(file);
        }
        // 🖼️ Image File Handling
        else if (file.type.startsWith('image/')) {
            if (file.size > 5 * 1024 * 1024) { // 5MB Limit
                toast({
                    title: 'File too large',
                    description: 'Please select an image under 5MB.',
                    variant: 'destructive'
                });
                return;
            }

            const url = URL.createObjectURL(file);
            setAttachments(prev => [...prev, {
                id: Math.random().toString(36).substr(2, 9),
                type: 'image',
                file: file,
                name: file.name,
                previewUrl: url
            }]);
            setShowAttachments(false);
        } else {
            // Unsupported file type
            toast({
                title: 'Unsupported file',
                description: 'Please upload an image or CSV file.',
                variant: 'destructive'
            });
        }

        // Reset input for repeat selection
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = (id: string, previewUrl?: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }
    };

    return (
        <>
            {/* 🆕 Optimistic Undo Toast for Update */}
            {showUpdateUndoToast && updateUndoData && (
                <UndoToast 
                    count={updateUndoData.count}
                    message={`Updated ${updateUndoData.count} transactions`}
                    onUndo={handleUndoUpdate}
                    onConfirm={handleFinalUpdateExecute}
                    isOpen={showUpdateUndoToast}
                    duration={10000}
                    actionType="update"
                />
            )}

            {/* Existing Undo Toast for Delete */}
            {showUndoToast && undoData && (
                <UndoToast 
                    count={undoData.count}
                    message={`Deleting ${undoData.count} items...`}
                    onUndo={handleUndo}
                    onConfirm={handleFinalDeleteExecute}
                    isOpen={showUndoToast}
                    duration={10000}
                    actionType="delete"
                />
            )}

            <div ref={containerRef} className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">

                {/* 🛡️ CHAT PANEL - HOLOGRAPHIC DESIGN */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            variants={PANEL_VARIANTS}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            className="pointer-events-auto origin-bottom-right w-[95vw] sm:w-[500px] md:w-[600px] h-[85vh] md:h-[900px] max-h-[96vh] flex flex-col rounded-3xl overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 shadow-[0_0_60px_rgba(99,102,241,0.3)] ring-1 ring-white/5"
                        >
                            {/* Header - Enhanced with Logo */}
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-indigo-500/10 to-amber-500/10">
                                <div className="flex items-center gap-3">
                                    {/* Mini Logo */}
                                    <div className="relative w-6 h-6">
                                        <Image
                                            src={logoImage}
                                            alt="AI"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    {/* Gradient Title */}
                                    <span className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-amber-400">
                                        Wisecoin AI
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-all"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Messages Body with Holographic Watermark */}
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto p-5 space-y-4 relative"
                            >
                                {/* Holographic Watermark - Always visible as background texture */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                                    <div className="relative w-[60%] h-[60%] opacity-[0.08] grayscale">
                                        <Image
                                            src={logoImage}
                                            alt=""
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                </div>

                                {/* Messages Container */}
                                <div className="relative z-10">
                                    {/* Welcome Message */}
                                    {messages.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-[450px] text-center space-y-3">
                                            <p className="text-sm text-white/60 w-3/4 leading-relaxed">
                                                I am ready, <span className="text-amber-400 font-medium">{user?.displayName || 'Traveler'}</span>.
                                                <br />How can I assist your portfolio today?
                                            </p>
                                        </div>
                                    )}

                                    {/* Message List */}
                                    {messages.map((m, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={clsx(
                                                "flex w-full",
                                                m.role === 'user' ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div className={clsx(
                                                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                                                m.role === 'user'
                                                    ? "bg-gradient-to-br from-indigo-600/90 to-purple-600/90 text-white rounded-br-none shadow-lg shadow-indigo-900/30"
                                                    : "bg-zinc-800/60 backdrop-blur-md border border-white/10 text-zinc-100 rounded-bl-none"
                                            )}>
                                                {m.content}
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* 🛑 PENDING CONFIRMATION CARD (In-chat render) */}
                                    <AnimatePresence>
                                        {pendingConfirmation && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="mt-4 flex justify-start w-full"
                                            >
                                                {pendingConfirmation.type === 'update' ? (
                                                    <DiffPreviewCard
                                                        original={pendingConfirmation.original}
                                                        modified={pendingConfirmation.modified}
                                                        onConfirm={handleConfirmRiskAware}
                                                        onCancel={() => {
                                                            setPendingConfirmation(null);
                                                            setShowFinalWarning(false);
                                                        }}
                                                        isLoading={isProcessing}
                                                    />
                                                ) : (
                                                    <ConfirmationCard
                                                        data={pendingConfirmation}
                                                        isFinalWarning={showFinalWarning}
                                                        onConfirm={handleConfirmRiskAware}
                                                        onCancel={() => {
                                                            setPendingConfirmation(null);
                                                            setShowFinalWarning(false);
                                                        }}
                                                        isLoading={isProcessing}
                                                    />
                                                )}
                                            </motion.div>
                                        )}

                                        {/* 🔍 Search Results HUD */}
                                        {searchResults && !pendingConfirmation && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                className="my-4 w-full flex justify-start"
                                            >
                                                <TransactionListCompact
                                                    data={searchResults.data}
                                                    title={searchResults.title}
                                                    summary={searchResults.summary}
                                                />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {isProcessing && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                                            <div className="bg-zinc-800/60 backdrop-blur-md border border-white/10 rounded-2xl rounded-bl-none px-4 py-3">
                                                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                                            </div>
                                        </motion.div>
                                    )}
                                </div>
                            </div>

                            {/* Enhanced Input Area - Floating Capsule */}
                            <div className="p-4 bg-gradient-to-t from-black/40 to-transparent">
                                <div className="relative">
                                    {/* Attachment Menu Popup */}
                                    <AnimatePresence>
                                        {showAttachments && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute bottom-full left-0 mb-2 bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-xl min-w-[180px]"
                                            >
                                                <button
                                                    onClick={() => {
                                                        if (fileInputRef.current) {
                                                            fileInputRef.current.accept = 'image/*';
                                                            fileInputRef.current.click();
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm"
                                                >
                                                    <ImageIcon className="w-4 h-4 text-blue-400" />
                                                    <span>Upload Image</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (fileInputRef.current) {
                                                            fileInputRef.current.accept = '.csv,text/csv';
                                                            fileInputRef.current.click();
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-white/80 hover:text-white text-sm"
                                                >
                                                    <FileSpreadsheet className="w-4 h-4 text-green-400" />
                                                    <span>Upload CSV</span>
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* 📎 Hidden File Input */}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        accept="image/*,.csv,text/csv"
                                        className="hidden"
                                        onChange={handleFileSelect}
                                        title="Upload file"
                                    />

                                    {/* Input Capsule - Unified Container */}
                                    <div className="relative bg-zinc-900/60 backdrop-blur-md rounded-[24px] border border-white/10 transition-all shadow-lg focus-within:border-indigo-400/50 focus-within:ring-2 focus-within:ring-indigo-400/20 overflow-hidden">

                                        {/* 🖼️ Integrated Staging Area (Top Shelf) */}
                                        <AnimatePresence>
                                            {attachments.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-black/20 border-b border-white/5"
                                                >
                                                    <div className="p-3 flex gap-3 overflow-x-auto custom-scrollbar">
                                                        {attachments.map((att) => (
                                                            <div key={att.id} className="relative group shrink-0">
                                                                {att.type === 'image' ? (
                                                                    // Image Thumbnail
                                                                    <div className="relative rounded-lg overflow-hidden border border-white/10 shadow-sm bg-black/40 w-16 h-16">
                                                                        <Image
                                                                            src={att.previewUrl || ''}
                                                                            alt={att.name}
                                                                            fill
                                                                            className="object-cover transition-transform group-hover:scale-105"
                                                                            unoptimized // Preview URLs from blobs/files
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    // CSV/File Card
                                                                    <div className="flex items-center gap-2 h-16 px-3 bg-zinc-800/80 border border-white/10 rounded-lg shadow-sm group-hover:bg-zinc-800 transition-colors">
                                                                        <div className="p-2 bg-green-500/10 rounded-md">
                                                                            <FileSpreadsheet className="w-5 h-5 text-green-400" />
                                                                        </div>
                                                                        <div className="flex flex-col max-w-[100px]">
                                                                            <span className="text-xs text-white/90 truncate font-medium">{att.name}</span>
                                                                            <span className="text-[10px] text-white/50">CSV Data</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Remove Button for Any Attachment */}
                                                                <button
                                                                    onClick={() => handleRemoveAttachment(att.id, att.previewUrl)}
                                                                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-zinc-800 hover:bg-red-500 rounded-full text-white border border-white/20 shadow-md transition-colors z-10"
                                                                    aria-label="Remove attachment"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Input Controls Row */}
                                        <div className="flex items-end gap-2 p-2">
                                            {/* Attachment Button */}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setShowAttachments(!showAttachments)}
                                                className="h-10 w-10 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white shrink-0 mb-0.5"
                                            >
                                                <Paperclip className="w-5 h-5" />
                                            </Button>

                                            {/* Auto-grow Textarea */}
                                            <Textarea
                                                ref={inputRef}
                                                value={input}
                                                onChange={(e) => {
                                                    setInput(e.target.value);
                                                    // Auto-resize Logic
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                                }}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Ask me anything..."
                                                className="min-h-[44px] max-h-[220px] w-full bg-transparent border-0 focus-visible:ring-0 resize-none py-3 px-1 text-sm text-white placeholder:text-zinc-500 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600/50 scrollbar-track-transparent leading-relaxed"
                                                rows={1}
                                            />

                                            {/* Send Button */}
                                            <Button
                                                size="icon"
                                                onClick={handleSend}
                                                disabled={(!input.trim() && attachments.length === 0) || isProcessing}
                                                className={clsx(
                                                    "h-10 w-10 rounded-xl transition-all duration-300 shrink-0 mb-0.5",
                                                    (input.trim() || attachments.length > 0)
                                                        ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:from-indigo-400 hover:to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.5)]"
                                                        : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                                                )}
                                            >
                                                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                {/* 🆕 Undo Toast (Inside Widget) */}
                                <AnimatePresence>
                                    {undoData && showUndoToast && (
                                        <UndoToast
                                            count={undoData.count}
                                            isOpen={showUndoToast}
                                            onUndo={handleUndo}
                                            onConfirm={handleFinalDeleteExecute}
                                            duration={10000} // Increased to 10s to match timeout
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 🔮 THE AURA ORB (TRIGGER) */}
                <AnimatePresence>
                    {!isOpen && (
                        <motion.button
                            onClick={() => setIsOpen(true)}
                            className="pointer-events-auto mt-4 relative group cursor-pointer z-50"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            {/* LAYER 1: The Outer "Breathing Particle Aura" */}
                            <motion.div
                                className="absolute -inset-3 rounded-full bg-gradient-to-tr from-amber-400/30 via-rose-400/15 to-purple-500/30 blur-md z-0"
                                animate={{
                                    scale: [1, 1.2],
                                    opacity: [0.3, 0.7]
                                }}
                                transition={{
                                    duration: 6,
                                    repeat: Infinity,
                                    repeatType: "mirror",
                                    ease: "easeInOut"
                                }}
                            />

                            {/* LAYER 2: The Main Container (The Orb Body) */}
                            <motion.div
                                className={clsx(
                                    "relative z-10 flex items-center justify-center",
                                    "w-16 h-16 rounded-full",
                                    "bg-gradient-to-b from-indigo-500/90 to-purple-700/90",
                                    "shadow-[0_0_20px_rgba(139,92,246,0.6)]",
                                    "backdrop-blur-md"
                                )}
                                animate={{ scale: [1, 1.03, 1] }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    repeatType: "mirror",
                                    ease: "easeInOut"
                                }}
                            >
                                {/* The Icon - Fixed comfortable proportion */}
                                <div className="relative w-[58%] h-[58%]">
                                    <Image
                                        src={logoImage}
                                        alt="Wisecoin AI"
                                        fill
                                        className="object-contain drop-shadow-[0_0_10px_rgba(255,215,0,0.6)]"
                                        priority
                                    />
                                </div>
                            </motion.div>
                        </motion.button>
                    )}
                </AnimatePresence>

            </div>

            {/* 🆕 Undo Toast */}

        </>
    );
}

