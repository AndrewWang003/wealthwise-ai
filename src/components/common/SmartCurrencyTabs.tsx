'use client';

import { useMemo } from 'react';
import { Currency } from '@/lib/types';
import { usePortfolio } from '@/contexts/PortfolioContext';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

/**
 * 🎯 智能动态币种选择器
 * 
 * 功能：
 * - 自动识别用户持仓中的币种，按资产总额排序
 * - 仅显示前3个币种作为独立按钮
 * - 超过3个币种时，第4个位置显示"更多"按钮，点击展开剩余币种
 * - 自动兜底：无持仓时显示用户偏好本位币
 * 
 * 应用场景：Dashboard 和 Position 页面
 */
export function SmartCurrencyTabs() {
  const { displayCurrency, setDisplayCurrency, sortedCurrencies, settings } = usePortfolio();

  // 🎯 自动兜底：如果没有持仓，默认使用用户偏好本位币或 AUD
  const availableCurrencies = useMemo(() => {
    if (sortedCurrencies.length > 0) {
      return sortedCurrencies;
    }
    // 无持仓时，提供默认选项
    const preferredCurrency = settings?.displayCurrency || 'AUD';
    return [preferredCurrency, 'USD', 'CNY'].filter((v, i, a) => a.indexOf(v) === i) as Currency[];
  }, [sortedCurrencies, settings]);

  // 前3个币种显示为按钮
  const topCurrencies = availableCurrencies.slice(0, 3);
  // 剩余币种在"更多"中显示
  const moreCurrencies = availableCurrencies.slice(3);

  const handleCurrencyChange = async (currency: Currency) => {
    await setDisplayCurrency(currency);
  };

  return (
    <div className="flex items-center h-9 bg-white/5 px-1 rounded-lg border border-white/10 shrink-0">
      {/* 💎 前3个币种按钮 */}
      {topCurrencies.map((cur) => (
        <button
          key={cur}
          onClick={() => handleCurrencyChange(cur)}
          className={clsx(
            "px-3 py-1 text-xs font-bold rounded-md transition-all h-7 flex items-center",
            displayCurrency === cur
              ? "bg-primary text-primary-foreground shadow-lg scale-105"
              : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          )}
        >
          {cur}
        </button>
      ))}

      {/* 🎯 "更多"按钮（仅当币种数 > 3 时显示） */}
      {moreCurrencies.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-32 p-1 bg-card/95 backdrop-blur-md" align="end">
            <div className="flex flex-col gap-1">
              {moreCurrencies.map((cur) => (
                <button
                  key={cur}
                  onClick={() => handleCurrencyChange(cur)}
                  className={clsx(
                    "px-3 py-2 text-xs font-bold rounded-md text-left transition-all",
                    displayCurrency === cur
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                  )}
                >
                  {cur}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
