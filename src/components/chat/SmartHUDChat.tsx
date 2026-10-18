'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, User, Bot, ChevronDown, Sparkles } from 'lucide-react';
import {
    parseTransactionFromNaturalLanguage,
    ParseTransactionOutput,
} from '@/ai/flows/parse-transaction-from-natural-language';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import {
    doc,
    getDoc,
    writeBatch,
    runTransaction,
    collection,
    serverTimestamp,
    deleteDoc,
    getDocs,
    query,
    where,
    setDoc,
} from 'firebase/firestore';
import { UserSettings } from '@/lib/types';
import { usePageContext } from '@/contexts/PageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import clsx from 'clsx';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { toCents, toUnits, calculateCostBasis } from '@/lib/currencyMath';

type ConversationMessage = {
    role: 'user' | 'ai';
    content: string;
};

type PendingConfirmation = {
    action: ParseTransactionOutput;
    expectedInput: string;
    message: string;
} | null;

// 🎯 物理弹簧参数 - 高端流畅的动画感
const SPRING_CONFIG = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8,
};

// 📏 尺寸常量
const COLLAPSED_HEIGHT = 56; // Pill 模式高度
const EXPANDED_HEIGHT = 480; // 展开后高度
const DRAG_THRESHOLD = 50; // 拖拽阈值

export function SmartHUDChat() {
    const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
    const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const { toast } = useToast();
    const { user } = useUser();
    const firestore = useFirestore();
    const { pageName, pageData } = usePageContext();

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 🎨 状态管理
    const [isExpanded, setIsExpanded] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null);

    // 🎭 拖拽动画
    const dragY = useMotionValue(0);
    const opacity = useTransform(dragY, [-100, 0, 100], [0.5, 1, 0.5]);

    // 📜 自动滚动到底部
    useEffect(() => {
        if (scrollRef.current && isExpanded) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [conversationHistory, isExpanded]);

    // 🎯 展开逻辑
    const handleExpand = useCallback(() => {
        setIsExpanded(true);
        setTimeout(() => inputRef.current?.focus(), 300);
    }, []);

    // 🎯 收起逻辑
    const handleCollapse = useCallback(() => {
        setIsExpanded(false);
        setIsFocused(false);
    }, []);

    // 🖱️ 点击外部收起
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node) &&
                isExpanded &&
                !isFocused
            ) {
                handleCollapse();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isExpanded, isFocused, handleCollapse]);

    // 📱 滚动页面时收起
    useEffect(() => {
        let lastScrollY = window.scrollY;

        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY > lastScrollY + 50 && isExpanded && !isFocused) {
                handleCollapse();
            }
            lastScrollY = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [isExpanded, isFocused, handleCollapse]);

    // 🎨 拖拽手势处理
    const handleDragEnd = (_: any, info: PanInfo) => {
        const { offset, velocity } = info;

        if (offset.y < -DRAG_THRESHOLD || velocity.y < -500) {
            // 向上拖拽 → 展开
            handleExpand();
        } else if (offset.y > DRAG_THRESHOLD || velocity.y > 500) {
            // 向下拖拽 → 收起
            handleCollapse();
        }

        dragY.set(0);
    };

    // 🔄 处理输入
    const handleProcessInput = async () => {
        if (!user) {
            toast({
                title: 'Authentication Required',
                description: 'Please sign in to continue.',
                variant: 'destructive',
            });
            return;
        }

        if (!naturalLanguageInput.trim()) return;

        const userInput = naturalLanguageInput;
        setNaturalLanguageInput('');
        setConversationHistory(prev => [...prev, { role: 'user', content: userInput }]);
        setIsParsing(true);

        try {
            // TODO: 实现完整的交易处理逻辑（从原组件迁移）
            const parsedData = await parseTransactionFromNaturalLanguage({
                naturalLanguageInput: userInput,
                pageContext: pageName,
                pageData: pageData ? JSON.stringify(pageData) : undefined,
            });

            let aiResponse = parsedData.contextualContent || '✅ Transaction processed successfully.';
            setConversationHistory(prev => [...prev, { role: 'ai', content: aiResponse }]);

            // 触觉反馈
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(20);
            }
        } catch (error: any) {
            console.error('Failed to process:', error);
            setConversationHistory(prev => [
                ...prev,
                { role: 'ai', content: `Error: ${error.message}` }
            ]);
        } finally {
            setIsParsing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleProcessInput();
        }
    };

    const getInitials = (name?: string | null) => {
        if (!name) return "U";
        const parts = name.split(" ");
        if (parts.length > 1) {
            return parts[0][0] + parts[parts.length - 1][0];
        }
        return name[0];
    };

    return (
        <motion.div
            ref={containerRef}
            id="smart-hud-chat"
            className="fixed bottom-6 left-1/2 z-50 w-full max-w-2xl px-4"
            style={{
                x: '-50%',
            }}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...SPRING_CONFIG, delay: 0.2 }}
        >
            <motion.div
                className={clsx(
                    "relative overflow-hidden rounded-3xl shadow-2xl transition-all duration-300",
                    "bg-gradient-to-br from-background/95 via-background/90 to-background/95",
                    "backdrop-blur-xl backdrop-saturate-150",
                    "border border-white/10",
                    isExpanded && "ring-2 ring-primary/20"
                )}
                animate={{
                    height: isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT,
                }}
                transition={SPRING_CONFIG}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                style={{ y: dragY, opacity }}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
            >
                {/* 💎 发光边框效果 */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100 blur-xl" />

                {/* 🎨 顶部拖拽指示器 */}
                <motion.div
                    className="absolute top-2 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-white/20"
                    animate={{
                        opacity: isExpanded ? 0 : (isHovered ? 1 : 0.5),
                        scaleX: isHovered ? 1.2 : 1,
                    }}
                    transition={{ duration: 0.2 }}
                />

                {/* 📜 对话历史区域 - 只在展开时显示 */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            ref={scrollRef}
                            className="absolute top-0 left-0 right-0 h-[calc(100%-120px)] overflow-y-auto px-6 pt-8 pb-4"
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ ...SPRING_CONFIG, delay: 0.1 }}
                            style={{
                                // 🎯 隐藏滚动条但保持功能
                                scrollbarWidth: 'none',
                                msOverflowStyle: 'none',
                                WebkitOverflowScrolling: 'touch',
                            }}
                        >
                            {/* 隐藏 WebKit 滚动条 */}
                            <style jsx>{`
                div::-webkit-scrollbar {
                  display: none;
                }
              `}</style>

                            <div className="space-y-4">
                                <AnimatePresence mode="popLayout">
                                    {conversationHistory.map((msg, index) => (
                                        <motion.div
                                            key={index}
                                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={SPRING_CONFIG}
                                            className={clsx(
                                                "flex items-start gap-3",
                                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                                            )}
                                        >
                                            {msg.role === 'ai' && (
                                                <Avatar className="h-8 w-8 bg-gradient-to-br from-purple-500 to-primary shadow-lg ring-2 ring-purple-500/20">
                                                    <AvatarFallback className="bg-transparent">
                                                        <Bot size={16} className="text-white" />
                                                    </AvatarFallback>
                                                </Avatar>
                                            )}

                                            <motion.div
                                                className={clsx(
                                                    "max-w-[80%] rounded-2xl px-4 py-3 shadow-lg",
                                                    msg.content.startsWith("Error:")
                                                        ? "bg-destructive/90 text-destructive-foreground"
                                                        : msg.role === 'user'
                                                            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                                                            : "bg-card/80 backdrop-blur-sm border border-white/10"
                                                )}
                                                whileHover={{ scale: 1.02 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                                    {msg.content}
                                                </p>
                                            </motion.div>

                                            {msg.role === 'user' && (
                                                <Avatar className="h-8 w-8 shadow-lg ring-2 ring-primary/20">
                                                    <AvatarImage src={user?.photoURL || undefined} />
                                                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                                                        {getInitials(user?.displayName)}
                                                    </AvatarFallback>
                                                </Avatar>
                                            )}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                {isParsing && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="flex items-start gap-3"
                                    >
                                        <Avatar className="h-8 w-8 bg-gradient-to-br from-purple-500 to-primary shadow-lg">
                                            <AvatarFallback className="bg-transparent">
                                                <Bot size={16} className="text-white" />
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="bg-card/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-3 shadow-lg">
                                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ⌨️ 输入区域 - 始终显示 */}
                <div
                    className={clsx(
                        "absolute bottom-0 left-0 right-0 p-4",
                        isExpanded && "border-t border-white/5"
                    )}
                >
                    <div className="relative">
                        {/* 🎨 Pill 模式占位符 */}
                        {!isExpanded && !naturalLanguageInput && (
                            <motion.div
                                className="absolute inset-0 flex items-center px-6 pointer-events-none"
                                initial={{ opacity: 1 }}
                                animate={{ opacity: isFocused ? 0 : 1 }}
                                transition={{ duration: 0.2 }}
                            >
                                <Sparkles className="h-4 w-4 text-primary mr-2" />
                                <span className="text-muted-foreground text-sm">
                                    Ask WiseCoin...
                                </span>
                            </motion.div>
                        )}

                        <Textarea
                            ref={inputRef}
                            value={naturalLanguageInput}
                            onChange={(e) => setNaturalLanguageInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => {
                                setIsFocused(true);
                                if (!isExpanded) handleExpand();
                            }}
                            onBlur={() => setIsFocused(false)}
                            placeholder={isExpanded ? "Type your message..." : ""}
                            className={clsx(
                                "w-full resize-none border-0 bg-transparent pr-14 focus-visible:ring-0",
                                "text-base placeholder:text-muted-foreground/50",
                                !isExpanded && "cursor-pointer"
                            )}
                            rows={isExpanded ? 2 : 1}
                            disabled={!user || isParsing}
                            onClick={() => !isExpanded && handleExpand()}
                        />

                        {/* 🚀 发送按钮 */}
                        <motion.div
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Button
                                type="button"
                                size="icon"
                                className="h-10 w-10 rounded-full shadow-lg"
                                onClick={handleProcessInput}
                                disabled={!user || isParsing || !naturalLanguageInput.trim()}
                            >
                                {isParsing ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Send className="h-5 w-5" />
                                )}
                            </Button>
                        </motion.div>
                    </div>

                    {/* 🎯 展开/收起按钮 */}
                    {isExpanded && (
                        <motion.button
                            className="absolute -top-10 left-1/2 -translate-x-1/2 p-2 rounded-full bg-card/80 backdrop-blur-sm border border-white/10 shadow-lg hover:bg-card transition-colors"
                            onClick={handleCollapse}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </motion.button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
