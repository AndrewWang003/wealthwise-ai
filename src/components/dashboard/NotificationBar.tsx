'use client';

import { useState, useMemo } from 'react';
import { 
  Bell, 
  ChevronDown, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Info,
  TrendingUp,
  CreditCard,
  ShoppingBag
} from 'lucide-react';

type NotificationType = 'critical' | 'warning' | 'success' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: string;
  icon?: React.ReactNode;
}

// Mock notifications - Replace with real data later
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Large Transaction Detected',
    description: 'Apple Store -$1,299 (Yesterday)',
    timestamp: '1h ago',
    icon: <ShoppingBag className="w-4 h-4" />
  },
  {
    id: '2',
    type: 'warning',
    title: 'Upcoming Bill',
    description: 'Chase Credit Card due in 2 days',
    timestamp: '3h ago',
    icon: <CreditCard className="w-4 h-4" />
  },
  {
    id: '3',
    type: 'success',
    title: 'All Time High! 🎉',
    description: 'Net Worth crossed $90,000',
    timestamp: '1d ago',
    icon: <TrendingUp className="w-4 h-4" />
  },
];

const TYPE_CONFIG: Record<NotificationType, { color: string; bgColor: string; icon: React.ReactNode }> = {
  critical: {
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
    icon: <XCircle className="w-4 h-4" />
  },
  warning: {
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    icon: <AlertTriangle className="w-4 h-4" />
  },
  success: {
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    icon: <CheckCircle2 className="w-4 h-4" />
  },
  info: {
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: <Info className="w-4 h-4" />
  },
};

// Priority order: critical > warning > success > info
const PRIORITY_ORDER: NotificationType[] = ['critical', 'warning', 'success', 'info'];

export function NotificationBar() {
  const [isExpanded, setIsExpanded] = useState(false);

  // Sort notifications by priority
  const sortedNotifications = useMemo(() => {
    return [...MOCK_NOTIFICATIONS].sort((a, b) => {
      return PRIORITY_ORDER.indexOf(a.type) - PRIORITY_ORDER.indexOf(b.type);
    });
  }, []);

  // Get highest priority notification for collapsed view
  const primaryNotification = sortedNotifications[0];

  if (!primaryNotification) return null;

  const primaryConfig = TYPE_CONFIG[primaryNotification.type];

  return (
    <div 
      className="relative w-full z-50 mb-4 group"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Collapsed Bar */}
      <div className={`
        w-full px-4 py-2.5 
        bg-zinc-900/60 backdrop-blur-md 
        border border-white/10 
        rounded-lg
        flex items-center justify-between
        cursor-pointer
        transition-all duration-200
        ${isExpanded ? 'rounded-b-none border-b-white/5' : ''}
      `}>
        {/* Left: Icon + Message */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={`
            flex-shrink-0 w-7 h-7 rounded-full 
            ${primaryConfig.bgColor} 
            flex items-center justify-center
            ${primaryConfig.color}
          `}>
            {primaryNotification.icon || primaryConfig.icon}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`text-sm font-medium ${primaryConfig.color}`}>
              {primaryNotification.title}
            </span>
            <span className="text-sm text-muted-foreground ml-2 hidden sm:inline">
              {primaryNotification.description}
            </span>
          </div>
        </div>

        {/* Right: Bell + Chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground hidden md:block">
            {sortedNotifications.length} notification{sortedNotifications.length !== 1 ? 's' : ''}
          </span>
          <Bell className="w-4 h-4 text-muted-foreground" />
          <ChevronDown className={`
            w-4 h-4 text-muted-foreground 
            transition-transform duration-200
            ${isExpanded ? 'rotate-180' : ''}
          `} />
        </div>
      </div>

      {/* Expanded Panel - Glassmorphism style */}
      <div className={`
        absolute top-full left-0 right-0
        bg-zinc-950/70 backdrop-blur-xl
        border border-t-0 border-white/10
        rounded-b-lg
        shadow-2xl shadow-black/50
        transition-all duration-200 ease-out
        max-h-72 overflow-y-auto
        notification-scrollbar
        ${isExpanded 
          ? 'opacity-100 translate-y-0 pointer-events-auto' 
          : 'opacity-0 -translate-y-2 pointer-events-none'
        }
      `}>
        {sortedNotifications.map((notification) => {
          const config = TYPE_CONFIG[notification.type];
          
          return (
            <div 
              key={notification.id}
              className="px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={`
                  flex-shrink-0 w-8 h-8 rounded-full 
                  ${config.bgColor} 
                  flex items-center justify-center mt-0.5
                  ${config.color}
                `}>
                  {notification.icon || config.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-sm font-medium ${config.color}`}>
                      {notification.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {notification.timestamp}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {notification.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 bg-zinc-900/30">
          <button className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
            View all notifications →
          </button>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx global>{`
        .notification-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .notification-scrollbar::-webkit-scrollbar-track {
          background: rgba(39, 39, 42, 0.5);
          border-radius: 2px;
        }
        .notification-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(113, 113, 122, 0.5);
          border-radius: 2px;
        }
        .notification-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(113, 113, 122, 0.8);
        }
      `}</style>
    </div>
  );
}
