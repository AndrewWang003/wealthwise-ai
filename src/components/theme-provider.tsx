'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'aura' | 'aura-light' | 'aura-flux';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setTimeout(() => setMounted(true), 0);
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        if (savedTheme) {
            setTimeout(() => setTheme(savedTheme), 0);
        }
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const root = document.documentElement;

        // 移除所有主题类
        root.classList.remove('light', 'dark', 'theme-aura', 'theme-aura-light', 'theme-aura-flux');

        // 应用新主题
        if (theme === 'aura') {
            root.classList.add('theme-aura');
        } else if (theme === 'aura-light') {
            root.classList.add('theme-aura-light');
        } else if (theme === 'aura-flux') {
            root.classList.add('theme-aura-flux');
        } else if (theme === 'dark') {
            root.classList.add('dark');
        }
        // light 主题不需要添加类，使用默认的 :root

        localStorage.setItem('theme', theme);
    }, [theme, mounted]);

    const value = {
        theme,
        setTheme,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
