'use client';

/**
 * components/RefreshButton.tsx
 *
 * A simple client component that reloads the page.
 * Extracted from app/dashboard/page.tsx so the Server Component
 * doesn't have to include an inline onClick event handler.
 */

export function RefreshButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      aria-label="Refresh queue status"
      className="
        flex items-center gap-2 rounded-xl border border-white/10 bg-white/5
        px-4 py-3 text-sm font-medium text-slate-300 transition
        hover:bg-white/10 hover:text-white focus-visible:outline-none
        focus-visible:ring-2 focus-visible:ring-indigo-400
      "
    >
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 shrink-0 text-indigo-400"
      >
        <path
          fillRule="evenodd"
          d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z"
          clipRule="evenodd"
        />
      </svg>
      Refresh
    </button>
  );
}
