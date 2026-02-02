"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import type {
  Message,
  ToolCall,
  StreamEvent,
  ToolActivityItem,
  TextActivityItem,
  AskUserActivityItem,
  ChartActivityItem,
  PendingQuestionGroup,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function useChat(propertyId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [pendingQuestionGroup, setPendingQuestionGroup] =
    useState<PendingQuestionGroup | null>(null);
  const { getToken } = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const assistantIdRef = useRef<string | null>(null);
  const currentTextItemIdRef = useRef<string | null>(null);

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  const setConversationId = useCallback((id: string | null) => {
    setCurrentConversationId(id);
  }, []);

  const respondToQuestions = useCallback(
    async (groupId: string, responses: Record<string, string>) => {
      const token = await getToken();

      // Mark the ask_user activity item as responded
      const currentAssistantId = assistantIdRef.current;
      if (currentAssistantId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== currentAssistantId) return m;
            const items = (m.activityItems || []).map((it) =>
              it.kind === "ask_user" &&
              (it as AskUserActivityItem).groupId === groupId
                ? ({ ...it, responses } as AskUserActivityItem)
                : it
            );
            return { ...m, activityItems: items };
          })
        );
      }

      setPendingQuestionGroup(null);

      try {
        await fetch(`${API_URL}/api/chat/respond`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ group_id: groupId, responses }),
        });
      } catch (err) {
        console.error("Failed to respond to questions:", err);
      }
    },
    [getToken]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      seqRef.current = 0;
      currentTextItemIdRef.current = null;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantId = crypto.randomUUID();
      assistantIdRef.current = assistantId;
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
          activityItems: [],
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
              // Create a new text segment if none exists
              if (!currentTextItemIdRef.current) {
                const textId = crypto.randomUUID();
                const seq = ++seqRef.current;
                currentTextItemIdRef.current = textId;
                const newTextItem: TextActivityItem = {
                  id: textId,
                  kind: "text",
                  sequence: seq,
                  content: event.content,
                };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content + event.content,
                          activityItems: [
                            ...(m.activityItems || []),
                            newTextItem,
                          ],
                        }
                      : m
                  )
                );
              } else {
                // Append to existing text segment
                const textId = currentTextItemIdRef.current;
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const items = (m.activityItems || []).map((it) =>
                      it.id === textId
                        ? { ...it, content: (it as TextActivityItem).content + event.content } as TextActivityItem
                        : it
                    );
                    return {
                      ...m,
                      content: m.content + event.content,
                      activityItems: items,
                    };
                  })
                );
              }
            } else if (event.type === "response_created") {
              // New model turn — reset text segment so next text_delta starts a new one
              currentTextItemIdRef.current = null;
            } else if (event.type === "tool_call") {
              // Tool call breaks the text segment
              currentTextItemIdRef.current = null;
              const seq = ++seqRef.current;
              const tc: ToolCall = {
                type: "call",
                call_id: event.call_id,
                name: event.name || "unknown",
                arguments: event.arguments,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        activityItems: [
                          ...(m.activityItems || []),
                          {
                            id: crypto.randomUUID(),
                            kind: "tool" as const,
                            sequence: seq,
                            name: event.name || "unknown",
                            call_id: event.call_id,
                            arguments: event.arguments,
                            output: undefined,
                          },
                        ],
                        toolCalls: [...(m.toolCalls || []), tc],
                      }
                    : m
                )
              );
            } else if (event.type === "tool_result") {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;

                  const items = [...(m.activityItems || [])];
                  const aidx = event.call_id
                    ? items.findIndex(
                        (it) =>
                          it.kind === "tool" &&
                          (it as ToolActivityItem).call_id ===
                            event.call_id &&
                          !(it as ToolActivityItem).output
                      )
                    : items.findIndex(
                        (it) =>
                          it.kind === "tool" &&
                          !(it as ToolActivityItem).output
                      );
                  if (aidx !== -1) {
                    items[aidx] = {
                      ...items[aidx],
                      output: event.output,
                    } as ToolActivityItem;
                  }

                  const calls = [...(m.toolCalls || [])];
                  const cidx = event.call_id
                    ? calls.findIndex(
                        (c) => c.call_id === event.call_id && !c.output
                      )
                    : calls.findIndex((c) => !c.output);
                  if (cidx !== -1) {
                    calls[cidx] = { ...calls[cidx], output: event.output };
                  }

                  return { ...m, activityItems: items, toolCalls: calls };
                })
              );
            } else if (event.type === "reasoning" && event.content) {
              currentTextItemIdRef.current = null;
              const seq = ++seqRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        activityItems: [
                          ...(m.activityItems || []),
                          {
                            id: crypto.randomUUID(),
                            kind: "reasoning" as const,
                            sequence: seq,
                            content: event.content!,
                          },
                        ],
                        reasoningMessages: [
                          ...(m.reasoningMessages || []),
                          event.content!,
                        ],
                      }
                    : m
                )
              );
            } else if (event.type === "ask_user" && event.group_id && event.questions) {
              currentTextItemIdRef.current = null;
              const seq = ++seqRef.current;
              const askItem: AskUserActivityItem = {
                id: crypto.randomUUID(),
                kind: "ask_user",
                sequence: seq,
                groupId: event.group_id,
                questions: event.questions,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        activityItems: [
                          ...(m.activityItems || []),
                          askItem,
                        ],
                      }
                    : m
                )
              );
              setPendingQuestionGroup({
                groupId: event.group_id,
                questions: event.questions,
              });
            } else if (event.type === "chart" && event.spec) {
              currentTextItemIdRef.current = null;
              const seq = ++seqRef.current;
              const chartItem: ChartActivityItem = {
                id: crypto.randomUUID(),
                kind: "chart",
                sequence: seq,
                spec: event.spec,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        activityItems: [
                          ...(m.activityItems || []),
                          chartItem,
                        ],
                      }
                    : m
                )
              );
            } else if (event.type === "done") {
              currentTextItemIdRef.current = null;
              if (event.conversation_id) {
                setCurrentConversationId(event.conversation_id);
                window.history.replaceState(
                  {},
                  "",
                  `/dashboard/c/${event.conversation_id}`
                );
              }
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const items = (m.activityItems || []).map((it) =>
                    it.kind === "tool" && !(it as ToolActivityItem).output
                      ? ({ ...it, output: "(completed)" } as ToolActivityItem)
                      : it
                  );
                  const calls = (m.toolCalls || []).map((tc) =>
                    tc.output ? tc : { ...tc, output: "(completed)" }
                  );
                  return {
                    ...m,
                    isStreaming: false,
                    activityItems: items,
                    toolCalls: calls,
                  };
                })
              );
              setPendingQuestionGroup(null);
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
        assistantIdRef.current = null;
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
    setPendingQuestionGroup(null);
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
    pendingQuestionGroup,
    respondToQuestions,
  };
}
