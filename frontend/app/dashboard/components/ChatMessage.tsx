"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { User, Bot, Wrench, Loader2 } from "lucide-react";

interface Props {
  message: Message;
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? "bg-[#1a1a2e]" : "bg-[#e94560]/10"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-[#e94560]" />
        )}
      </div>

      {/* Content */}
      <div
        className={`max-w-[75%] ${isUser ? "text-right" : ""}`}
      >
        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-1.5">
            {message.toolCalls.map((tc, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 bg-[#f0f1f5] border border-[#e5e7eb] rounded-md px-2.5 py-1 text-xs text-[#6b7280]"
              >
                <Wrench className="w-3 h-3" />
                <span className="font-medium">{tc.name}</span>
                {tc.output ? (
                  <span className="text-[#10b981]">完了</span>
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`inline-block text-left rounded-xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-[#1a1a2e] text-white"
              : "bg-white border border-[#e5e7eb] text-[#1a1a2e]"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none prose-headings:text-[#1a1a2e] prose-p:text-[#374151] prose-strong:text-[#1a1a2e] prose-code:text-[#e94560] prose-code:bg-[#f0f1f5] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || (message.isStreaming ? "" : "...")}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-[#e94560] animate-pulse ml-0.5 align-middle rounded-sm" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
