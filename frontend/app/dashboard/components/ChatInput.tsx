"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Square } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, isStreaming, onStop, disabled }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle mobile keyboard: adjust position using visualViewport API
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      if (!containerRef.current) return;
      // Calculate how much the keyboard is covering
      // visualViewport.height shrinks when keyboard is open
      const keyboardOffset = window.innerHeight - vv.height - vv.offsetTop;
      if (keyboardOffset > 0) {
        containerRef.current.style.paddingBottom = `${keyboardOffset}px`;
      } else {
        containerRef.current.style.paddingBottom = "";
      }
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  };

  return (
    <div ref={containerRef} className="px-3 sm:px-6 pb-3 sm:pb-5 pt-2 bg-background safe-bottom">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-0 bg-white border border-[#d1d5db] rounded-2xl shadow-sm focus-within:border-[#9ca3af] focus-within:shadow-md transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="GA4データについて質問..."
            disabled={disabled}
            rows={1}
            className="flex-1 min-h-[44px] max-h-[150px] resize-none bg-transparent px-4 py-3 text-[14px] sm:text-sm leading-relaxed placeholder:text-[#9ca3af] text-[#1a1a2e] outline-none disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              className="shrink-0 w-9 h-9 m-1.5 rounded-xl flex items-center justify-center bg-[#f0f1f5] hover:bg-[#e5e7eb] transition-colors cursor-pointer"
              aria-label="停止"
            >
              <Square className="w-4 h-4 text-[#e94560]" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || disabled}
              className="shrink-0 w-9 h-9 m-1.5 rounded-xl flex items-center justify-center bg-[#1a1a2e] hover:bg-[#2a2a4e] disabled:opacity-20 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="送信"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
        <p className="hidden sm:block text-center text-[11px] text-[#9ca3af] mt-2">
          Shift+Enter で改行 / Enter で送信
        </p>
      </div>
    </div>
  );
}
