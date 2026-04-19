'use client';

/**
 * components/ChatInterface.tsx
 *
 * Conversational assistant powered by Gemini with function calling.
 * Supports full-screen expansion on tap/click.
 */

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import type { Content } from '@google/generative-ai';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: 'user' | 'model';
  text: string;
}

interface ChatInterfaceProps {
  eventId: string;
  gateId: string;
  ticketId: string;
  /** Pre-fills the first assistant greeting. */
  welcomeMessage?: string;
  /** If true, renders in full-screen overlay mode. */
  isFullScreen?: boolean;
  onExitFullScreen?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatInterface({
  eventId,
  gateId,
  ticketId,
  welcomeMessage,
  isFullScreen = false,
  onExitFullScreen,
}: ChatInterfaceProps) {
  const defaultGreeting =
    welcomeMessage ??
    "Hi! I'm GateFlow — your AI entry assistant. Ask me about your gate, wait times, or anything about today's event.";

  const [messages, setMessages] = useState<DisplayMessage[]>([
    { role: 'model', text: defaultGreeting },
  ]);
  const [history, setHistory] = useState<Content[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Re-focus input when entering fullscreen
  useEffect(() => {
    if (isFullScreen) inputRef.current?.focus();
  }, [isFullScreen]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text: text.trim() }]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          history,
          context: { eventId, gateId, ticketId },
        }),
      });

      const data = await response.json() as { reply?: string; history?: Content[]; error?: string };

      if (!response.ok) throw new Error(data.error ?? 'The assistant encountered an error.');

      setMessages((prev) => [...prev, { role: 'model', text: data.reply ?? '' }]);
      setHistory(data.history ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const shell = (
    <section
      aria-label="GateFlow AI assistant"
      className="flex h-full flex-col"
    >
      {/* Message list */}
      <ol
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto space-y-3 px-4 py-3"
      >
        {messages.map((msg, index) => (
          <li
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'model' && (
              <span
                aria-hidden="true"
                className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow"
              >
                GF
              </span>
            )}
            <div
              className={`
                max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
                ${msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white/10 text-slate-200 rounded-bl-sm'}
              `}
            >
              {msg.text}
            </div>
          </li>
        ))}

        {isLoading && (
          <li className="flex justify-start" aria-label="Assistant is typing">
            <span aria-hidden="true" className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow">GF</span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/10 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </li>
        )}

        <div ref={bottomRef} aria-hidden="true" />
      </ol>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mx-4 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20"
        >
          {error}
        </div>
      )}

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 p-3 flex gap-2 items-end"
      >
        <label htmlFor="chat-input" className="sr-only">Message GateFlow</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about wait time, directions, trivia…"
          rows={1}
          disabled={isLoading}
          aria-multiline="true"
          className="
            flex-1 resize-none rounded-xl border border-white/10 bg-white/5
            px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none
            transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40
            disabled:opacity-50 max-h-28 overflow-y-auto
          "
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
          className="
            flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
            bg-indigo-600 text-white transition hover:bg-indigo-500
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
          "
        >
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </section>
  );

  // Full-screen overlay
  if (isFullScreen) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="GateFlow AI assistant — full screen"
        className="fixed inset-0 z-50 flex flex-col bg-slate-950"
      >
        {/* Full-screen header */}
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 bg-slate-900/80 backdrop-blur-sm">
          <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white shadow">GF</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">GateFlow Assistant</p>
            <p className="text-xs text-slate-400">Powered by Gemini</p>
          </div>
          <span aria-label="Connected" className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]" />
          <button
            type="button"
            onClick={onExitFullScreen}
            aria-label="Exit full screen"
            className="
              ml-2 flex h-8 w-8 items-center justify-center rounded-lg
              text-slate-400 transition hover:bg-white/10 hover:text-white
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
            "
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-hidden">{shell}</div>
      </div>
    );
  }

  return shell;
}
