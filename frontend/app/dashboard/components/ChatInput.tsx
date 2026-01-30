"use client";

import { useState, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div className="border-t border-[#e5e7eb] bg-white p-2.5 sm:p-4">
      <div className="flex items-end gap-2 sm:gap-3 max-w-4xl mx-auto">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="GA4データについて質問してください..."
          disabled={disabled}
          className="min-h-[44px] max-h-[160px] resize-none border-[#e5e7eb] bg-[#f8f9fb] rounded-xl text-sm leading-relaxed placeholder:text-[#9ca3af] focus-visible:ring-[#1a1a2e] focus-visible:ring-1 focus-visible:ring-offset-0"
          rows={1}
        />
        {isStreaming ? (
          <Button
            onClick={onStop}
            variant="outline"
            size="icon"
            className="shrink-0 w-11 h-11 rounded-xl border-[#e5e7eb] hover:bg-[#f0f1f5] cursor-pointer"
          >
            <Square className="w-4 h-4 text-[#e94560]" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || disabled}
            size="icon"
            className="shrink-0 w-11 h-11 rounded-xl bg-[#1a1a2e] hover:bg-[#2a2a4e] disabled:opacity-30 cursor-pointer"
          >
            <Send className="w-4 h-4 text-white" />
          </Button>
        )}
      </div>
      <p className="hidden sm:block text-center text-xs text-[#9ca3af] mt-2.5">
        Shift+Enter で改行 / Enter で送信
      </p>
    </div>
  );
}
