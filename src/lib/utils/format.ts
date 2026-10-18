
/**
 * 格式化货币
 * @param amount - 金额
 * @param currency - 货币代码 (默认 USD)
 * @param options - 选项
 * @param options.fromCents - 如果为 true，则先将 amount 除以 100
 */
export function formatCurrency(
    amount: number,
    currency: string = 'USD',
    options?: { fromCents?: boolean } & Intl.NumberFormatOptions
): string {
    const value = options?.fromCents ? amount / 100 : amount;

    // 针对不同货币使用对应的 locale
    const localeMap: Record<string, string> = {
        'AUD': 'en-AU',
        'USD': 'en-US',
        'CNY': 'zh-CN'
    };
    const locale = localeMap[currency] || 'en-US';

    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        ...options // Spread remaining options like maximumFractionDigits
    }).format(value);
}
