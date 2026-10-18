'use client';

import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import {
    TrendingUp,
    PieChart,
    RefreshCw,
    FileText,
    DollarSign,
    BarChart3
} from 'lucide-react';

export interface CommandChip {
    id: string;
    label: string;
    command: string;
    icon: React.ReactNode;
    color?: string;
}

const defaultCommands: CommandChip[] = [
    {
        id: 'record',
        label: '录入交易',
        command: '买入 ',
        icon: <DollarSign className="h-3 w-3" />,
        color: 'bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20'
    },
    {
        id: 'diagnose',
        label: '资产诊断',
        command: '分析我的投资组合风险分布',
        icon: <BarChart3 className="h-3 w-3" />,
        color: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 border-purple-500/20'
    },
    {
        id: 'overview',
        label: '持仓概览',
        command: '总结我的持仓情况',
        icon: <PieChart className="h-3 w-3" />,
        color: 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20'
    },
    {
        id: 'sync',
        label: '同步市价',
        command: 'refresh prices',
        icon: <RefreshCw className="h-3 w-3" />,
        color: 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20'
    },
    {
        id: 'performance',
        label: '盈亏分析',
        command: '分析我的投资收益表现',
        icon: <TrendingUp className="h-3 w-3" />,
        color: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20'
    },
    {
        id: 'audit',
        label: '账务审计',
        command: '检查我的交易记录是否有异常',
        icon: <FileText className="h-3 w-3" />,
        color: 'bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 border-pink-500/20'
    }
];

interface CommandChipsProps {
    onCommandSelect: (command: string) => void;
    commands?: CommandChip[];
}

export function CommandChips({ onCommandSelect, commands = defaultCommands }: CommandChipsProps) {
    return (
        <div className="w-full pb-2">
            <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-2 px-1">
                    {commands.map((cmd, index) => (
                        <motion.div
                            key={cmd.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <Badge
                                variant="outline"
                                className={`cursor-pointer transition-all hover:scale-105 active:scale-95 ${cmd.color || 'hover:bg-accent'} flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium shadow-sm`}
                                onClick={() => onCommandSelect(cmd.command)}
                            >
                                {cmd.icon}
                                {cmd.label}
                            </Badge>
                        </motion.div>
                    ))}
                </div>
                <ScrollBar orientation="horizontal" className="h-2" />
            </ScrollArea>
        </div>
    );
}
