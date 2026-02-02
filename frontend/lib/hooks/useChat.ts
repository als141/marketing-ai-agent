"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Message, ToolCall, StreamEvent } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useChat(propertyId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const { getToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const setConversationId = useCallback((id: string | null) => {
    setCurrentConversationId(id);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
          toolCalls: [],
          reasoningMessages: [],
        },
      ]);

      const token = await getToken();
      abortRef.current = new AbortController();

      try {
        const response = await fetch(`${API_URL}/api/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: content,
            conversation_id: currentConversationId,
            property_id: propertyId,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.type === "text_delta" && event.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              );
            } else if (event.type === "tool_call") {
              const tc: ToolCall = {
                type: "call",
                call_id: event.call_id,
                name: event.name || "unknown",
                arguments: event.arguments,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), tc] }
                    : m
                )
              );
            } else if (event.type === "tool_result") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const calls = [...(m.toolCalls || [])];
                  // call_idでマッチング
                  if (event.call_id) {
                    const idx = calls.findIndex(
                      (c) => c.call_id === event.call_id && !c.output
                    );
                    if (idx !== -1) {
                      calls[idx] = { ...calls[idx], output: event.output };
                    }
                  } else {
                    // call_idがない場合はoutputが未設定の最初のツールに割り当て
                    const idx = calls.findIndex((c) => !c.output);
                    if (idx !== -1) {
                      calls[idx] = { ...calls[idx], output: event.output };
                    }
                  }
                  return { ...m, toolCalls: calls };
                })
              );
            } else if (event.type === "reasoning" && event.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        reasoningMessages: [
                          ...(m.reasoningMessages || []),
                          event.content!,
                        ],
                      }
                    : m
                )
              );
            } else if (event.type === "done") {
              if (event.conversation_id) {
                setCurrentConversationId(event.conversation_id);
                // Update URL seamlessly without reload
                window.history.replaceState(
                  {},
                  "",
                  `/dashboard/c/${event.conversation_id}`
                );
              }
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  // ストリーム完了: 未完了のツールを全て完了扱いにする
                  const calls = (m.toolCalls || []).map((tc) =>
                    tc.output ? tc : { ...tc, output: "(completed)" }
                  );
                  return { ...m, isStreaming: false, toolCalls: calls };
                })
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content:
                          m.content +
                          `\n\nエラーが発生しました: ${event.message}`,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `接続エラーが発生しました。再度お試しください。`,
                    isStreaming: false,
                  }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [currentConversationId, propertyId, getToken]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    window.history.replaceState({}, "", "/dashboard");
  }, []);

  return {
    messages,
    sendMessage,
    isStreaming,
    stopStreaming,
    clearMessages,
    loadMessages,
    currentConversationId,
    setConversationId,
  };
}
