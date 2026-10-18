import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/clientApp';
import type { Insight, InsightPriority } from '@/lib/types';
import { formatCurrency } from '@/lib/utils/format';

/**
 * 🎩 WEALTH PULSE: Butler Persona Engine
 * 
 * Generates daily wealth insights with a specific "Calm & Reliable" persona.
 */

// 🎩 WEALTH PULSE: Butler Persona Engine (Optimized for Gentle Reliability)

/**
 * Generate a butler-style message based on daily change
 * Persona: Calm, Reliable, Gentle
 */
function generateButlerMessage(
  userName: string,
  currency: string,
  changeAmount: number,
  changePercent: number,
  contributingFactors: string[] = []
): { title: string; content: string; priority: InsightPriority } {
  const absChange = Math.abs(changeAmount);
  const formattedChange = formatCurrency(absChange, currency);
  
  // Use "Sir/Madam" if userName is empty/default, otherwise just reference by name or not at all for brevity?
  // Actually, requested format is: "Andrew, since midnight..."
  // If name exists, use it.
  const namePrefix = userName && userName !== 'Sir/Madam' ? `${userName}, ` : '';
  
  let title = "";
  let content = "";
  let priority: InsightPriority = "low";

  // 1. Determine Scenario & Gentle Phrasing
  if (changeAmount > 0) {
    // 🟢 GAIN (Gentle positive)
    title = `📈 Wealth Growth: +${formattedChange}`;
    
    // Logic for magnitude
    if (changePercent > 0.5) {
        content = `${namePrefix}since midnight today, your wealth has steadily grown by ${formattedChange}. Primarily influenced by positive movements in your holdings.`;
    } else {
        content = `${namePrefix}your portfolio shows a slight upward trend of ${formattedChange} since midnight.`;
    }

    if (changePercent > 5) priority = "high";
    else if (changePercent > 2) priority = "medium";

  } else if (changeAmount < 0) {
    // 🟣 LOSS (Calm, reassuring)
    title = `📉 Assessment Update`;
    
    if (Math.abs(changePercent) > 0.5) {
        content = `${namePrefix}asset values have adjusted by ${formattedChange} since midnight. This reflects normal market fluctuations.`;
    } else {
        content = `${namePrefix}your portfolio saw a minor variation of ${formattedChange} today, remaining largely stable.`;
    }

    // Don't alarm user unless critical
    if (Math.abs(changePercent) > 5) priority = "high"; 
    else if (Math.abs(changePercent) > 2) priority = "medium";
    
  } else {
    // 🔵 NEUTRAL
    title = `⚖️ Portfolio Stable`;
    content = `${namePrefix}your assets are running smoothly. No significant changes recorded since midnight.`;
  }

  // Future enhancement: Add specific stock names to "contributingFactors" logic here
  
  return { title, content, priority };
}

/**
 * Update the Daily Wealth Pulse Insight
 * 
 * Uses a fixed ID for the day (daily_pulse_YYYY-MM-DD) to assume "Singleton" behavior per day.
 * This prevents creating 100 insights if the user refreshes 100 times.
 */
export async function updateDailyWealthPulse(
  userId: string,
  userName: string,
  todayDate: string, // YYYY-MM-DD
  currency: string,
  currentValue: number,
  openValue: number
) {
  const changeAmount = currentValue - openValue;
  const changePercent = openValue !== 0 ? (changeAmount / openValue) * 100 : 0;
  
  // Don't generate insight for tiny changes (noise filter)
  // unless it's explicitly specifically requested or very early in the day
  if (Math.abs(changePercent) < 0.01 && Math.abs(changeAmount) < 1) {
    return; 
  }

  const { title, content, priority } = generateButlerMessage(
    userName || "Sir/Madam",
    currency,
    changeAmount,
    changePercent
  );

  const insightId = `daily_pulse_${todayDate}`;
  const insightRef = doc(db, `users/${userId}/insights/${insightId}`);

  const insightData: Omit<Insight, 'id'> = {
    userId,
    type: 'daily_change',
    title,
    content,
    status: 'unread', // We might want to keep it 'unread' or handle this carefully
    priority,
    createdAt: serverTimestamp(),
    metadata: {
      dailyChangeAmount: changeAmount || 0,
      dailyChangePercent: changePercent || 0,
      currentValue: currentValue || 0,
      previousValue: openValue ?? null,
    }
  };

  try {
    // We use setDoc with merge: true to avoid overwriting status if it was already acknowledged?
    // Actually, for a "Live" pulse, maybe we WANT to un-acknowledge it if it changes significantly?
    // For now, let's simple overwrite to keep the info fresh.
    await setDoc(insightRef, insightData, { merge: true });
    // console.log(`🎩 [Wealth Pulse] Updated daily insight: ${title}`);
  } catch (error) {
    console.error("Error updating wealth pulse:", error);
  }
}
