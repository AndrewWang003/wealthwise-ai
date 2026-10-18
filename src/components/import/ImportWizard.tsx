'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, CheckCircle2, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { mapCSVColumns, MapCSVColumnsOutput } from '@/ai/flows/map-csv-columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { processRows, DateFormat, ProcessedRow } from '@/lib/import/csvProcessor';
import { format } from 'date-fns';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { collection, writeBatch, Timestamp, doc, arrayUnion, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { UserSettings } from '@/lib/types';

interface CSVData {
  headers: string[];
  rows: string[][];
  fileName: string;
}

type FieldMapping = {
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
  keywordMap?: Record<string, string>; // 🆕 AI Keyword Map
};

export function ImportWizard() {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  
  // Fetch custom categories
  const settingsRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, `users/${user.uid}/settings/config`);
  }, [firestore, user]);
  
  const { data: settings } = useDoc<UserSettings>(settingsRef);
  const customCategories = useMemo(() => settings?.customCategories || [], [settings]);

  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [mapping, setMapping] = useState<FieldMapping | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'mapping' | 'preview'>('upload');

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (!file.name.endsWith('.csv')) {
        toast({
          title: '文件类型错误',
          description: '请上传 CSV 文件',
          variant: 'destructive',
        });
        return;
      }

      // Parse CSV
      Papa.parse(file, {
        complete: async (results) => {
          const data = results.data as string[][];
          
          if (data.length < 2) {
            toast({
              title: '文件内容不足',
              description: 'CSV 文件至少需要包含表头和一行数据',
              variant: 'destructive',
            });
            return;
          }

          // Clean headers: replace empty/whitespace with default names
          const headers = data[0].map((header, idx) => {
            const cleaned = header.trim();
            return cleaned || `Untitled Column ${idx + 1}`;
          });
          const allRows = data.slice(1).filter(row => row.some(cell => cell.trim())); // Filter empty rows

          setCsvData({
            headers,
            rows: allRows,
            fileName: file.name,
          });

          // Automatically analyze with AI
          setIsAnalyzing(true);

          // Heuristic Mapping (Client-side fast path)
          const detectColumnMapping = (headers: string[]): Partial<FieldMapping> => {
            const lowerHeaders = headers.map(h => h.toLowerCase());
            const mapping: Partial<FieldMapping> = {};

            const findHeader = (keywords: string[]) => 
              headers.find((_, i) => keywords.some(k => lowerHeaders[i].includes(k)));

            mapping.date = findHeader(['date', 'time', '日期', '时间']);
            mapping.amount = findHeader(['amount', 'value', 'price', 'cost', '金额', '数值']);
            mapping.description = findHeader(['description', 'note', 'memo', 'detail', '描述', '备注', 'narrative']);
            mapping.category = findHeader(['category', 'cat', 'class', '分类', '类别']);
            mapping.type = findHeader(['type', 'direction', '类型', '收支']);
            mapping.symbol = findHeader(['symbol', 'ticker', 'code', '股票']);
            
            return mapping;
          };

          const heuristicMap = detectColumnMapping(headers);
          // Set initial heuristic map immediately
          setMapping(prev => ({ ...prev, ...heuristicMap } as FieldMapping));
          
          try {
            const aiMapping = await mapCSVColumns({
              headers,
              sampleRows: allRows.slice(0, 5),
            });
            
            // Merge AI mapping with heuristic (AI takes precedence for core fields, but heuristic fills gaps)
            setMapping(prev => {
                const merged = { ...prev };
                // Ensure required fields are set
                merged.date = aiMapping.date || heuristicMap.date || merged.date || '';
                merged.amount = aiMapping.amount || heuristicMap.amount || merged.amount || '';
                merged.description = aiMapping.description || heuristicMap.description || merged.description || '';
                // Optional fields: Prefer AI, fall back to heuristic
                merged.category = aiMapping.category || heuristicMap.category || merged.category;
                merged.type = aiMapping.type || heuristicMap.type || merged.type;
                merged.symbol = aiMapping.symbol || heuristicMap.symbol || merged.symbol;
                
                // Add AI extras
                if (aiMapping.quantity) merged.quantity = aiMapping.quantity;
                if (aiMapping.price) merged.price = aiMapping.price;
                if (aiMapping.fee) merged.fee = aiMapping.fee;
                if (aiMapping.currency) merged.currency = aiMapping.currency;
                
                // Store keyword map
                if (aiMapping.keywordMap) merged.keywordMap = aiMapping.keywordMap;

                return merged as FieldMapping;
            });

            setCurrentStep('mapping');
            
            toast({
              title: '✅ AI 分析完成',
              description: '已自动识别列映射，请检查并确认',
            });
          } catch (error: any) {
            console.error('AI mapping failed:', error);
            
            // Fallback to Heuristic if AI fails
            setMapping(prev => {
                const fallback = { ...prev };
                 // Ensure basics
                if (!fallback.date) fallback.date = headers[0] || '';
                if (!fallback.amount) fallback.amount = headers[1] || '';
                if (!fallback.description) fallback.description = headers[2] || '';
                return fallback as FieldMapping;
            });

            toast({
              title: '智能分析失败',
              description: 'AI 响应异常，已切换至基础映射模式，请手动校对。',
              variant: 'destructive',
            });
            setCurrentStep('mapping');
          } finally {
            setIsAnalyzing(false);
          }
        },
        error: (error) => {
          toast({
            title: '解析失败',
            description: `无法解析 CSV 文件: ${error.message}`,
            variant: 'destructive',
          });
        },
      });
    },
    [toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const resetWizard = () => {
    setCsvData(null);
    setMapping(null);
    setCurrentStep('upload');
    setDateFormat('DD/MM/YYYY');
  };

  const updateMapping = (field: keyof FieldMapping, value: string) => {
    if (!mapping) return;
    // Convert "__unmapped__" to empty string for internal state
    const actualValue = value === '__unmapped__' ? '' : value;
    setMapping({ ...mapping, [field]: actualValue });
  };

  const proceedToPreview = () => {
    if (!mapping?.date || !mapping?.amount || !mapping?.description) {
      toast({
        title: '映射不完整',
        description: '请映射所有必需字段',
        variant: 'destructive',
      });
      return;
    }
    setCurrentStep('preview');
  };

  // Process rows for preview
  const processedRows = useMemo(() => {
    if (!csvData || !mapping || currentStep !== 'preview') return [];
    // Pass keywordMap from AI mapping to processor
    return processRows(csvData.rows, csvData.headers, mapping, dateFormat, customCategories, mapping.keywordMap);
  }, [csvData, mapping, dateFormat, currentStep, customCategories]);

  const validRows = processedRows.filter(row => row.isValid);
  const invalidRows = processedRows.filter(row => !row.isValid);

  // Handle batch import with 3-Step Logic
  const handleImport = async () => {
    if (!user || !validRows.length) return;

    setIsImporting(true);
    let totalImported = 0;
    let failedImports = 0;
    const errors: string[] = [];
    try {
      const transactionsRef = collection(firestore, `users/${user.uid}/transactions`);
      
      // =================================================================================
      // 🟢 PHASE 1: PRE-PROCESSING (Extract & Resolve)
      // =================================================================================
      
      // 1. Extract distinct category candidates from rows
      // These are already standardized (Title Case) by processRows, but may define new ones.
      const categoryMap = new Map<string, string>(); // Raw/Candidate -> Final ID (Name)
      const categoriesToCreate = new Set<string>();

      validRows.forEach(row => {
        if (row.category) {
          if (row.isNewCategory) {
            categoriesToCreate.add(row.category);
          }
          // Default mapping: candidate -> candidate
          categoryMap.set(row.category, row.category);
        }
      });

      // =================================================================================
      // 🟡 PHASE 2: REGISTRATION (Build the Map)
      // =================================================================================

      // 2. Register new categories if any
      if (categoriesToCreate.size > 0 && settingsRef) {
        console.log(`[Import] Registering ${categoriesToCreate.size} new categories...`);
        const newCatsArray = Array.from(categoriesToCreate);
        
        await setDoc(settingsRef, {
          customCategories: arrayUnion(...newCatsArray)
        }, { merge: true });

        toast({
          title: '📦 分类库已更新',
          description: `已自动注册 ${newCatsArray.length} 个新分类。`,
        });
      }

      // =================================================================================
      // 🔴 PHASE 3: REPLACE & SAVE
      // =================================================================================

      const BATCH_SIZE = 500;
      let rowIndex = 0;

      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const chunk = validRows.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestore);

        for (const row of chunk) {
          try {
            console.log(`[Import] Processing row:`, row); // Log each row being processed
            const docRef = doc(transactionsRef, row.id);
            
            // Determine type
            let transactionType = row.type?.toLowerCase();
            if (transactionType === 'trade') { // Map 'trade' to 'buy' or 'sell' based on amount
              transactionType = (row.amount || 0) < 0 ? 'sell' : 'buy';
            } else {
              const isExpense = (row.amount || 0) < 0;
              transactionType = transactionType || (isExpense ? 'expense' : 'income');
            }

            // Time Jitter
            const finalDate = new Date(row.date!);
            finalDate.setHours(12, 0, rowIndex % 60);
            rowIndex++;

            // 🏷️ FINAL MAPPING LOOKUP
            // Use the map to find the registered ID. If raw row had no category, map returns undefined -> use fallback.
            // Note: row.category is the "Key" we used in Phase 1.
            let finalCategory = 'General';
            if (row.category) {
              finalCategory = categoryMap.get(row.category) || 'General';
            }

            const transactionData = {
              userId: user.uid,
              transactionType,
              symbol: row.symbol || 'LIFESTYLE',
              quantity: Math.abs(row.quantity || row.amount || 0), // Use quantity if available, else amount
              price: row.price || 1,
              fee: row.fee || 0,
              transactionDate: Timestamp.fromDate(finalDate),
              currency: row.currency || 'AUD',
              notes: row.description,
              assetClass: row.symbol ? 'Stock' : 'AUD Cash',
              market: 'ASX',
              createdAt: Timestamp.now(),
              scope: row.symbol ? 'INVESTMENT' : 'LIFESTYLE',
              category: finalCategory, // ✅ Using resolved ID
              impactsCash: true,
            };

            batch.set(docRef, transactionData, { merge: true });
            totalImported++;
          } catch (rowError: any) {
            console.error(`[Import] Failed to process row ${row.id}:`, rowError, row);
            failedImports++;
            errors.push(`行 ${row.id} 处理失败: ${rowError.message}`);
            // Continue to next row even if one fails
          }
        }

        if (chunk.length > 0) { // Only commit if there are items in the batch
          await batch.commit();
        }
      }

      if (totalImported > 0) {
        toast({
          title: '✅ 导入完成',
          description: `成功处理 ${totalImported} 条交易。`,
        });
      }

      if (failedImports > 0) {
        toast({
          title: '⚠️ 部分导入失败',
          description: `有 ${failedImports} 条交易未能导入。请检查控制台获取详情。`,
          variant: 'destructive',
        });
      }

      if (totalImported > 0) {
        setTimeout(() => {
          router.push('/transactions');
        }, 1500);
      }

    } catch (error: any) {
      console.error('Import failed:', error);
      toast({
        title: '导入失败',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const transactionFields = [
    { key: 'date', label: '日期 (Date)', required: true },
    { key: 'amount', label: '金额 (Amount)', required: true },
    { key: 'category', label: '类别 (Category)', required: false },
    { key: 'type', label: '类型 (Type)', required: false },
    { key: 'symbol', label: '股票代码 (Symbol)', required: false },
    { key: 'quantity', label: '数量 (Quantity)', required: false },
    { key: 'price', label: '价格 (Price)', required: false },
    { key: 'fee', label: '手续费 (Fee)', required: false },
    { key: 'currency', label: '币种 (Currency)', required: false },
  ] as const;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle>CSV 批量导入</CardTitle>
          </div>
          {csvData && (
            <Button variant="outline" size="sm" onClick={resetWizard}>
              重新上传
            </Button>
          )}
        </div>
        <CardDescription>
          {currentStep === 'upload' && '上传 CSV 文件，AI 将自动识别列映射关系'}
          {currentStep === 'mapping' && '确认列映射配置'}
          {currentStep === 'preview' && '预览并验证数据'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: File Upload */}
        {currentStep === 'upload' && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-sm text-primary font-medium">释放文件以上传...</p>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">
                  拖拽 CSV 文件到此处，或点击选择文件
                </p>
                <p className="text-xs text-muted-foreground">
                  支持 .csv 格式，文件需包含表头
                </p>
              </>
            )}
          </div>
        )}

        {/* Step 2: AI Analysis Loading */}
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              AI 正在分析 CSV 结构...
            </p>
          </div>
        )}

        {/* Step 3: Mapping Configuration */}
        {currentStep === 'mapping' && csvData && mapping && (
          <div className="space-y-6">
            {/* File Info */}
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{csvData.fileName}</span>
              <span className="text-xs text-muted-foreground">
                ({csvData.headers.length} 列, {csvData.rows.length} 行)
              </span>
            </div>

            {/* Column Mapping */}
            <div className="space-y-4">
              <h3 className="font-semibold text-sm">列映射配置</h3>
              <div className="grid gap-4">
                {transactionFields.map(({ key, label, required }) => (
                  <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <Label htmlFor={key} className="flex items-center space-x-2">
                      <span>{label}</span>
                      {required ? (
                        <span className="text-xs text-destructive">*</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">(可选)</span>
                      )}
                    </Label>
                    <Select
                      value={(mapping[key as keyof FieldMapping] as string) || '__unmapped__'}
                      onValueChange={(value) => updateMapping(key as keyof FieldMapping, value)}
                    >
                      <SelectTrigger id={key}>
                        <SelectValue placeholder="选择对应列" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unmapped__">未映射</SelectItem>
                        {csvData.headers.map((header, idx) => (
                          <SelectItem key={`${header}-${idx}`} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {/* Sample Data Preview */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">数据预览 (前 5 行)</h3>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {csvData.headers.map((header, idx) => (
                        <th key={idx} className="px-3 py-2 text-left font-medium border-b">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.rows.slice(0, 5).map((row, rowIdx) => (
                      <tr key={rowIdx} className="border-b last:border-0">
                        {row.map((cell, cellIdx) => (
                          <td key={cellIdx} className="px-3 py-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Validation Status */}
            <div className="flex items-center justify-between space-x-2 p-3 bg-muted/30 rounded-lg">
              {mapping.date && mapping.amount && mapping.description ? (
                <>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600 font-medium">
                      映射配置有效
                    </span>
                  </div>
                  <Button onClick={proceedToPreview} size="sm">
                    下一步：预览数据
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive font-medium">
                    请映射所有必需字段 (日期、金额、描述)
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Preview & Validate */}
        {currentStep === 'preview' && csvData && mapping && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">数据预览与验证</h3>
                <p className="text-sm text-muted-foreground">
                  检查数据格式是否正确，确认后即可导入
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentStep('mapping')}>
                返回映射
              </Button>
            </div>

            {/* Date Format Selector */}
            <div className="flex items-center space-x-4 p-4 bg-muted/30 rounded-lg">
              <Label htmlFor="dateFormat" className="shrink-0">
                日期格式 (Source Date Format):
              </Label>
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                <SelectTrigger id="dateFormat" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (澳洲/英国)</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (美国)</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Statistics Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">总行数</p>
                <p className="text-2xl font-bold">{processedRows.length}</p>
              </div>
              <div className="p-4 bg-green-500/10 rounded-lg">
                <p className="text-xs text-green-600">有效数据</p>
                <p className="text-2xl font-bold text-green-600">{validRows.length}</p>
              </div>
              <div className="p-4 bg-red-500/10 rounded-lg">
                <p className="text-xs text-red-600">错误数据</p>
                <p className="text-2xl font-bold text-red-600">{invalidRows.length}</p>
              </div>
            </div>

            {/* Preview Table */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">预览数据 (前 20 行)</h4>
              <div className="border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium border-b">状态</th>
                      <th className="px-3 py-2 text-left font-medium border-b">日期</th>
                      <th className="px-3 py-2 text-left font-medium border-b">描述</th>
                      <th className="px-3 py-2 text-right font-medium border-b">金额</th>
                      {mapping.category && <th className="px-3 py-2 text-left font-medium border-b">类别</th>}
                      {mapping.symbol && <th className="px-3 py-2 text-left font-medium border-b">股票</th>}
                      {mapping.type && <th className="px-3 py-2 text-left font-medium border-b">类型</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {processedRows.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className={`border-b last:border-0 ${!row.isValid ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <div className="flex items-center space-x-1" title={row.errors.join(', ')}>
                              <XCircle className="h-4 w-4 text-red-600" />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.date ? format(row.date, 'yyyy-MM-dd') : (
                            <span className="text-red-600">{row.dateStr}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{row.description}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {row.amount !== null ? row.amount.toFixed(2) : (
                            <span className="text-red-600">{row.amountStr}</span>
                          )}
                        </td>
                        {mapping.category && <td className="px-3 py-2">{row.category || '-'}</td>}
                        {mapping.symbol && <td className="px-3 py-2">{row.symbol || '-'}</td>}
                        {mapping.type && <td className="px-3 py-2">{row.type || '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Error Summary (if any) */}
            {invalidRows.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-medium text-red-900 dark:text-red-100">发现 {invalidRows.length} 行错误数据</h4>
                    <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                      请检查日期格式是否正确，或修改 CSV 文件后重新上传
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Import Button */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center space-x-2">
                {invalidRows.length === 0 ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">
                      数据验证通过，可以导入
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      存在错误数据，无法导入
                    </span>
                  </>
                )}
              </div>
              <Button
                disabled={invalidRows.length > 0 || isImporting}
                onClick={handleImport}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    导入中... ({validRows.length} 行)
                  </>
                ) : (
                  <>
                    导入数据 ({validRows.length} 行)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
