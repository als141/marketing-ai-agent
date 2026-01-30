"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { Message } from "@/lib/types";
import { MessageSquare } from "lucide-react";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  disabled?: boolean;
  propertyName?: string;
}

function EmptyState({ propertyName }: { propertyName?: string }) {
  const suggestions = [
    "過去7日間のページビュー数を教えて",
    "今月のトップページを表示して",
    "リアルタイムのアクティブユーザー数は？",
    "先月と比較してセッション数はどう変化した？",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 bg-[#f0f1f5] rounded-2xl flex items-center justify-center mb-5">
        <MessageSquare className="w-7 h-7 text-[#6b7280]" />
      </div>
      <h2 className="text-lg font-bold text-[#1a1a2e] mb-2">
        GA4データを分析しましょう
      </h2>
      <p className="text-sm text-[#6b7280] mb-8 max-w-md leading-relaxed">
        {propertyName
          ? `「${propertyName}」のデータについて質問できます。`
          : "プロパティを選択して、GA4データについて質問してください。"}
      </p>
      <div className="grid grid-cols-2 gap-2.5 max-w-lg w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="text-left px-3.5 py-2.5 bg-white border border-[#e5e7eb] rounded-lg text-xs text-[#374151] hover:border-[#1a1a2e]/30 hover:bg-[#f8f9fb] transition-all duration-200 cursor-pointer leading-relaxed"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatWindow({
  messages,
  isStreaming,
  onSend,
  onStop,
  disabled,
  propertyName,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState propertyName={propertyName} />
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSend}
        isStreaming={isStreaming}
        onStop={onStop}
        disabled={disabled}
      />
    </div>
  );
}
