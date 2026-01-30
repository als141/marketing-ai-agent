"use client";

import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { Message } from "@/lib/types";
import { BarChart3, Search, Zap, TrendingUp } from "lucide-react";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  onSend: (message: string) => void;
  onStop: () => void;
  disabled?: boolean;
  propertyName?: string;
}

function EmptyState({
  propertyName,
  onSend,
}: {
  propertyName?: string;
  onSend: (msg: string) => void;
}) {
  const suggestions = [
    {
      icon: TrendingUp,
      text: "過去7日間のアクセス状況をまとめて",
    },
    {
      icon: Search,
      text: "SEOのパフォーマンスを分析して",
    },
    {
      icon: BarChart3,
      text: "今月のトップページを教えて",
    },
    {
      icon: Zap,
      text: "リアルタイムの状況は？",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-12 h-12 bg-gradient-to-br from-[#1a1a2e] to-[#2a2a4e] rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-[#1a1a2e]/10">
        <BarChart3 className="w-6 h-6 text-white" />
      </div>
      <h2 className="text-lg font-bold text-[#1a1a2e] mb-1.5 tracking-tight">
        {propertyName
          ? `${propertyName}`
          : "GA4 & Search Console 分析"}
      </h2>
      <p className="text-sm text-[#6b7280] mb-8 max-w-md leading-relaxed">
        GA4とSearch Consoleのデータをもとに分析します。何でも聞いてください。
      </p>
      <div className="grid grid-cols-2 gap-2.5 max-w-lg w-full">
        {suggestions.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={i}
              onClick={() => onSend(s.text)}
              className="group text-left px-3.5 py-3 bg-white border border-[#e5e7eb] rounded-xl text-xs text-[#374151] hover:border-[#1a1a2e]/20 hover:shadow-sm transition-all duration-200 cursor-pointer leading-relaxed flex items-start gap-2.5"
            >
              <Icon className="w-3.5 h-3.5 text-[#9ca3af] group-hover:text-[#e94560] transition-colors mt-0.5 shrink-0" />
              <span>{s.text}</span>
            </button>
          );
        })}
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
          <EmptyState propertyName={propertyName} onSend={onSend} />
        ) : (
          <div className="max-w-4xl mx-auto py-6 px-6 space-y-6">
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
