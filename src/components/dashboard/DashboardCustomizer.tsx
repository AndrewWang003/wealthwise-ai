'use client';

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export interface DashboardLayout {
    showAllocation: boolean;
    showPerformance: boolean;
    showConcentration: boolean;
    
    // 💰 Dividend Insights Modules
    showDividendSummary: boolean;
    showDividendChart: boolean;
    
    // 🎯 Risk Analytics Module
    showRiskMetrics: boolean;
}

const DEFAULT_LAYOUT: DashboardLayout = {
    showAllocation: true,
    showPerformance: true,
    showConcentration: true,
    showDividendSummary: false,  // 新功能默认关闭
    showDividendChart: false,     // 新功能默认关闭
    showRiskMetrics: false,       // 新功能默认关闭
};

interface DashboardSettingsProps {
    layout: DashboardLayout;
    onLayoutChange: (layout: DashboardLayout) => void;
}

export function DashboardSettings({ layout, onLayoutChange }: DashboardSettingsProps) {
    const user = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [alwaysShowBriefing, setAlwaysShowBriefing] = useState(false);

    // 🔔 Load alwaysShowBriefing setting
    useEffect(() => {
        if (!user?.user || !firestore) return;

        const settingsRef = doc(firestore, `users/${user.user.uid}/settings/config`);
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                setAlwaysShowBriefing(data?.alwaysShowBriefing || false);
            }
        });

        return () => unsubscribe();
    }, [user, firestore]);

    const handleToggle = async (key: keyof DashboardLayout) => {
        if (!user?.user || !firestore) return;

        const newLayout = {
            ...layout,
            [key]: !layout[key],
        };

        // 🔑 Optimistic UI update - immediate response
        onLayoutChange(newLayout);

        // 🔄 Async sync to Firestore
        setIsSaving(true);
        try {
            const settingsRef = doc(firestore, `users/${user.user.uid}/settings/config`);
            await setDoc(
                settingsRef,
                {
                    dashboardLayout: newLayout,
                },
                { merge: true }
            );
        } catch (error) {
            console.error('Failed to save dashboard layout:', error);
            toast({
                title: 'Failed to save settings',
                description: 'Your changes could not be saved. Please try again.',
                variant: 'destructive',
            });
            // Revert on error
            onLayoutChange(layout);
        } finally {
            setIsSaving(false);
        }
    };

    // 🔔 Handle briefing toggle
    const handleBriefingToggle = async () => {
        if (!user?.user || !firestore) return;

        const newValue = !alwaysShowBriefing;
        setAlwaysShowBriefing(newValue); // Optimistic update

        setIsSaving(true);
        try {
            const settingsRef = doc(firestore, `users/${user.user.uid}/settings/config`);
            await setDoc(
                settingsRef,
                {
                    alwaysShowBriefing: newValue,
                },
                { merge: true }
            );
        } catch (error) {
            console.error('Failed to save briefing setting:', error);
            toast({
                title: 'Failed to save settings',
                description: 'Your changes could not be saved. Please try again.',
                variant: 'destructive',
            });
            setAlwaysShowBriefing(!newValue); // Revert on error
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Customize</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <h4 className="font-medium leading-none">Dashboard Layout</h4>
                        <p className="text-sm text-muted-foreground">
                            Choose which modules to display. Changes sync across all devices.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* 🔔 SMART BRIEFING SETTING */}
                        <div className="flex items-center justify-between space-x-2">
                            <Label
                                htmlFor="always-show-briefing"
                                className="flex flex-col space-y-1 cursor-pointer"
                            >
                                <span className="font-medium">🔔 Wealth Pulse (Always Show)</span>
                                <span className="text-xs text-muted-foreground">
                                    Keep daily insights visible even with no alerts
                                </span>
                            </Label>
                            <Switch
                                id="always-show-briefing"
                                checked={alwaysShowBriefing}
                                onCheckedChange={handleBriefingToggle}
                                disabled={isSaving}
                            />
                        </div>

                        <div className="flex items-center justify-between space-x-2">
                            <Label
                                htmlFor="show-allocation"
                                className="flex flex-col space-y-1 cursor-pointer"
                            >
                                <span className="font-medium">Asset Allocation</span>
                                <span className="text-xs text-muted-foreground">
                                    Pie chart showing portfolio distribution
                                </span>
                            </Label>
                            <Switch
                                id="show-allocation"
                                checked={layout.showAllocation}
                                onCheckedChange={() => handleToggle('showAllocation')}
                                disabled={isSaving}
                            />
                        </div>

                        <div className="flex items-center justify-between space-x-2">
                            <Label
                                htmlFor="show-performance"
                                className="flex flex-col space-y-1 cursor-pointer"
                            >
                                <span className="font-medium">Performance Trend</span>
                                <span className="text-xs text-muted-foreground">
                                    Line chart showing profit/loss over time
                                </span>
                            </Label>
                            <Switch
                                id="show-performance"
                                checked={layout.showPerformance}
                                onCheckedChange={() => handleToggle('showPerformance')}
                                disabled={isSaving}
                            />
                        </div>

                        <div className="flex items-center justify-between space-x-2">
                            <Label
                                htmlFor="show-concentration"
                                className="flex flex-col space-y-1 cursor-pointer"
                            >
                                <span className="font-medium">Concentration Analysis</span>
                                <span className="text-xs text-muted-foreground">
                                    Top holdings and risk concentration
                                </span>
                            </Label>
                            <Switch
                                id="show-concentration"
                                checked={layout.showConcentration}
                                onCheckedChange={() => handleToggle('showConcentration')}
                                disabled={isSaving}
                            />
                        </div>

                        {/* 💰 DIVIDEND INSIGHTS MODULES */}
                        <div className="pt-2 border-t">
                            <p className="text-sm font-medium mb-3 text-muted-foreground">
                                💰 Dividend Insights
                            </p>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between space-x-2">
                                    <Label
                                        htmlFor="show-dividend-summary"
                                        className="flex flex-col space-y-1 cursor-pointer"
                                    >
                                        <span className="font-medium">Recent Income</span>
                                        <span className="text-xs text-muted-foreground">
                                            Latest income transactions overview
                                        </span>
                                    </Label>
                                    <Switch
                                        id="show-dividend-summary"
                                        checked={layout.showDividendSummary}
                                        onCheckedChange={() => handleToggle('showDividendSummary')}
                                        disabled={isSaving}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-2">
                                    <Label
                                        htmlFor="show-dividend-chart"
                                        className="flex flex-col space-y-1 cursor-pointer"
                                    >
                                        <span className="font-medium">Dividend Calendar</span>
                                        <span className="text-xs text-muted-foreground">
                                            Monthly dividend timeline chart
                                        </span>
                                    </Label>
                                    <Switch
                                        id="show-dividend-chart"
                                        checked={layout.showDividendChart}
                                        onCheckedChange={() => handleToggle('showDividendChart')}
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* 🎯 RISK ANALYTICS MODULE */}
                        <div className="pt-2 border-t">
                            <p className="text-sm font-medium mb-3 text-muted-foreground">
                                🎯 Risk Analytics
                            </p>

                            <div className="flex items-center justify-between space-x-2">
                                <Label
                                    htmlFor="show-risk-metrics"
                                    className="flex flex-col space-y-1 cursor-pointer"
                                >
                                    <span className="font-medium">Risk Metrics</span>
                                    <span className="text-xs text-muted-foreground">
                                        Volatility, drawdown, and Sharpe ratio analysis
                                    </span>
                                </Label>
                                <Switch
                                    id="show-risk-metrics"
                                    checked={layout.showRiskMetrics}
                                    onCheckedChange={() => handleToggle('showRiskMetrics')}
                                    disabled={isSaving}
                                />
                            </div>
                        </div>
                    </div>

                    {isSaving && (
                        <p className="text-xs text-muted-foreground text-center">
                            Saving...
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

/**
 * Hook to load and sync dashboard layout from Firestore
 * 
 * 🔑 KEY FEATURES:
 * 1. Real-time sync with onSnapshot (multi-device support)
 * 2. Anti-flicker loading state
 * 3. Automatic cleanup on unmount
 * 
 * @returns {object} { layout, setLayout, isLoading }
 */
export function useDashboardLayout() {
    const user = useUser();
    const firestore = useFirestore();
    const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // 🔒 ANTI-FLICKER: Don't render until we know the user's config
        if (!user?.user || !firestore) {
            // Avoid calling setState() directly within an effect
            const timer = setTimeout(() => setIsLoading(false), 0);
            return () => clearTimeout(timer);
        }

        const settingsRef = doc(firestore, `users/${user.user.uid}/settings/config`);

        // 🔄 REAL-TIME SYNC: Listen for changes across all devices
        const unsubscribe = onSnapshot(
            settingsRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    if (data?.dashboardLayout) {
                        // 💎 值稳定检查：合并默认值
                        const newLayout = {
                            ...DEFAULT_LAYOUT,
                            ...data.dashboardLayout,
                        };

                        // 🎯 仅在内容真正发生变化时才更新状态，防止引用变动导致的无限循环
                        setLayout((prevLayout) => {
                            if (JSON.stringify(prevLayout) !== JSON.stringify(newLayout)) {
                                return newLayout;
                            }
                            return prevLayout;
                        });
                    }
                }
                // ✅ Config loaded, safe to render
                setIsLoading(false);
            },
            (error) => {
                console.error('Failed to sync dashboard layout:', error);
                // Even on error, stop loading to prevent infinite skeleton
                setIsLoading(false);
            }
        );

        // 🧹 Cleanup: Unsubscribe when component unmounts
        return () => unsubscribe();
    }, [user, firestore]);

    return { layout, setLayout, isLoading };
}

/**
 * Alternative: Initial load with getDoc (no real-time sync)
 * Use this if you don't need multi-device sync
 */
export function useDashboardLayoutStatic() {
    const user = useUser();
    const firestore = useFirestore();
    const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadLayout() {
            if (!user?.user || !firestore) {
                setIsLoading(false);
                return;
            }

            try {
                const settingsRef = doc(firestore, `users/${user.user.uid}/settings/config`);
                const settingsSnap = await getDoc(settingsRef);

                if (settingsSnap.exists()) {
                    const data = settingsSnap.data();
                    if (data?.dashboardLayout) {
                        // 💎 值稳定检查：合并默认值
                        const newLayout = {
                            ...DEFAULT_LAYOUT,
                            ...data.dashboardLayout,
                        };

                        // 🎯 仅在内容真正发生变化时才更新状态
                        setLayout((prevLayout) => {
                            if (JSON.stringify(prevLayout) !== JSON.stringify(newLayout)) {
                                return newLayout;
                            }
                            return prevLayout;
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load dashboard layout:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadLayout();
    }, [user, firestore]);

    return { layout, setLayout, isLoading };
}
