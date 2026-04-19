'use client';

import { useState, useId, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  /** When true, renders an extra "full-screen" toggle button. */
  onExpandFull?: () => void;
  expandLabel?: string;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
  onExpandFull,
  expandLabel,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl shadow-black/20 backdrop-blur-sm">
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8 text-slate-300">
          {icon}
        </span>

        <h2 className="flex-1 text-sm font-semibold text-white">{title}</h2>

        {badge && <span className="text-xs">{badge}</span>}

        {onExpandFull && (
          <button
            type="button"
            onClick={onExpandFull}
            aria-label={expandLabel ?? 'Expand to full screen'}
            className="
              flex h-7 w-7 items-center justify-center rounded-lg
              text-slate-400 transition hover:bg-white/10 hover:text-white
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
            "
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M13.28 7.78l3.22-3.22v2.69a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.69l-3.22 3.22a.75.75 0 001.06 1.06zM2 17.25v-4.5a.75.75 0 011.5 0v2.69l3.22-3.22a.75.75 0 011.06 1.06L4.56 16.5h2.69a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          className="
            flex h-7 w-7 items-center justify-center rounded-lg
            text-slate-400 transition hover:bg-white/10 hover:text-white
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
          "
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Collapsible content */}
      <div
        id={contentId}
        className={`transition-all duration-300 ${isOpen ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0'}`}
      >
        <div className="border-t border-white/8 p-4">
          {children}
        </div>
      </div>
    </section>
  );
}
