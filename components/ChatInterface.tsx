'use client';

/**
 * components/ChatInterface.tsx
 *
 * Conversational assistant powered by Gemini with function calling.
 * Messages are sent to /api/chat which maintains the multi-turn history.
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
  /** Pre-fill the first message (e.g., "Which gate am I assigned to?"). */
  initialMessage?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChatInterface({ eventId, initialMessage }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'model',
      text: "Hi! I'm GateFlow — your AI entry assistant. Ask me about your gate, wait times, or anything about today's event.",
    },
  ]);
  const [history, setHistory] = useState<Content[]>([]);
  const [input, setInput] = useState(initialMessage ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || isLoading) return;

    const userMessage: DisplayMessage = { role: 'user', text: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          history,
          message: text.trim(),
        }),
      });

      const data = await response.json() as { reply?: string; history?: Content[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'The assistant encountered an error.');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'model', text: data.reply ?? '' },
      ]);
      setHistory(data.history ?? []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
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

  return (
    <section
      aria-label="GateFlow AI assistant"
      className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-xl shadow-black/20 overflow-hidden"
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow"
        >
          GF
        </div>
        <div>
          <p className="text-sm font-semibold text-white">GateFlow Assistant</p>
          <p className="text-xs text-slate-400">Powered by Gemini</p>
        </div>
        <span
          aria-label="Connected"
          className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]"
        />
      </header>

      {/* Message list */}
      <ol
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto space-y-4 px-4 py-4"
      >
        {messages.map((msg, index) => (
          <li
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-white/10 text-slate-200 rounded-bl-sm'
                }
              `}
            >
              {msg.text}
            </div>
          </li>
        ))}

        {isLoading && (
          <li className="flex justify-start" aria-label="Assistant is typing">
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
        className="border-t border-white/10 p-4 flex gap-3 items-end"
      >
        <label htmlFor="chat-input" className="sr-only">
          Message GateFlow
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your gate, wait time…"
          rows={1}
          disabled={isLoading}
          aria-multiline="true"
          className="
            flex-1 resize-none rounded-xl border border-white/10 bg-white/5
            px-4 py-3 text-sm text-white placeholder-slate-500 outline-none
            transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40
            disabled:opacity-50 max-h-32 overflow-y-auto
          "
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          aria-label="Send message"
          className="
            flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
            bg-indigo-600 text-white transition hover:bg-indigo-500
            disabled:opacity-50 disabled:cursor-not-allowed
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
          "
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </section>
  );
}
