/**
 * 🎨 Category to Emoji Mapping for Lifestyle Transactions
 * Maps transaction categories to appropriate emoji icons
 */

export function getCategoryEmoji(category: string | undefined): string {
  if (!category) return '📝';

  const categoryLower = category.toLowerCase();

  // Food & Dining
  if (categoryLower.includes('dining') || categoryLower.includes('restaurant') || categoryLower.includes('food')) {
    return '🍔';
  }
  if (categoryLower.includes('groceries') || categoryLower.includes('grocery') || categoryLower.includes('supermarket')) {
    return '🛒';
  }
  if (categoryLower.includes('coffee') || categoryLower.includes('cafe')) {
    return '☕';
  }

  // Transportation
  if (categoryLower.includes('transport') || categoryLower.includes('taxi') || categoryLower.includes('uber')) {
    return '🚗';
  }
  if (categoryLower.includes('gas') || categoryLower.includes('fuel') || categoryLower.includes('petrol')) {
    return '⛽';
  }

  // Income
  if (categoryLower.includes('salary') || categoryLower.includes('income') || categoryLower.includes('wage')) {
    return '💰';
  }
  if (categoryLower.includes('bonus')) {
    return '💎';
  }

  // Shopping
  if (categoryLower.includes('shopping') || categoryLower.includes('retail')) {
    return '🛍️';
  }
  if (categoryLower.includes('clothing') || categoryLower.includes('apparel')) {
    return '👕';
  }

  // Entertainment
  if (categoryLower.includes('entertainment') || categoryLower.includes('movie') || categoryLower.includes('cinema')) {
    return '🎬';
  }
  if (categoryLower.includes('music') || categoryLower.includes('concert')) {
    return '🎵';
  }

  // Health & Fitness
  if (categoryLower.includes('health') || categoryLower.includes('medical') || categoryLower.includes('doctor')) {
    return '🏥';
  }
  if (categoryLower.includes('gym') || categoryLower.includes('fitness') || categoryLower.includes('sport')) {
    return '💪';
  }

  // Bills & Utilities
  if (categoryLower.includes('bill') || categoryLower.includes('utility') || categoryLower.includes('utilities')) {
    return '📄';
  }
  if (categoryLower.includes('rent') || categoryLower.includes('housing')) {
    return '🏠';
  }

  // Education
  if (categoryLower.includes('education') || categoryLower.includes('course') || categoryLower.includes('tuition')) {
    return '📚';
  }

  // Travel
  if (categoryLower.includes('travel') || categoryLower.includes('vacation') || categoryLower.includes('holiday')) {
    return '✈️';
  }
  if (categoryLower.includes('hotel') || categoryLower.includes('accommodation')) {
    return '🏨';
  }

  // Technology
  if (categoryLower.includes('tech') || categoryLower.includes('software') || categoryLower.includes('subscription')) {
    return '💻';
  }

  // Gifts & Donations
  if (categoryLower.includes('gift') || categoryLower.includes('present')) {
    return '🎁';
  }
  if (categoryLower.includes('donation') || categoryLower.includes('charity')) {
    return '❤️';
  }

  // Default fallback
  return '📝';
}
