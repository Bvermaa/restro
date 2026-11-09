'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ThemeToggle({ className = '', showLabel = false, size = 'md' }: ThemeToggleProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    const ph = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
    return <div className={`${ph} rounded-xl bg-muted animate-pulse`} />;
  }

  const isDark = resolvedTheme === 'dark';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const btnSize = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex items-center gap-2 rounded-xl bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95 ${showLabel ? 'px-3 py-2 text-sm font-medium' : `${btnSize} justify-center`} ${className}`}
    >
      {isDark ? (
        <Sun className={`${iconSize} text-amber-400`} />
      ) : (
        <Moon className={`${iconSize} text-indigo-500`} />
      )}
      {showLabel && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
