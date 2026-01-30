"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { Sidebar } from "../components/Sidebar";
import { ChatWindow } from "../components/ChatWindow";
import { PropertySelector } from "../components/PropertySelector";
import { GoogleConnectButton } from "../components/GoogleConnectButton";
import { useChat } from "@/lib/hooks/useChat";
import { apiJson } from "@/lib/api";
import type { PropertySummary, Conversation, GoogleAuthStatus, Message } from "@/lib/types";
import { Loader2, CheckCircle2, Wifi, RefreshCw } from "lucide-react";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default function DashboardPage({ params }: PageProps) {
  const { slug } = use(params);
  const { getToken } = useAuth();
  const searchParams = useSearchParams();

  // Extract conversationId from slug: /dashboard/c/{id}
  const initialConversationId =
    slug?.[0] === "c" && slug[1] ? slug[1] : null;

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [selectedProperty, setSelectedProperty] =
    useState<PropertySummary | null>(null);
  const [refreshSidebar, setRefreshSidebar] = useState(0);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);

  const {
    messages,
    sendMessage,
    isStreaming,
    stopStreaming,
    clearMessages,
    loadMessages,
    currentConversationId,
    setConversationId,
  } = useChat(selectedProperty?.property_id || "");

  // Check Google connection status
  useEffect(() => {
    async function checkGoogle() {
      try {
        const token = await getToken();
        const status = await apiJson<GoogleAuthStatus>(
          "/api/auth/google-status",
          token
        );
        setGoogleConnected(status.connected);
      } catch {
        setGoogleConnected(false);
      }
    }
    checkGoogle();
  }, [getToken]);

  // Handle google_connected query param
  useEffect(() => {
    if (searchParams.get("google_connected") === "true") {
      setGoogleConnected(true);
      setShowConnectedBanner(true);
      setTimeout(() => setShowConnectedBanner(false), 4000);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  // Load conversation when navigating directly to /dashboard/c/{id}
  useEffect(() => {
    if (!initialConversationId) return;
    if (currentConversationId === initialConversationId) return;

    async function loadInitialConversation() {
      try {
        const token = await getToken();
        const data = await apiJson<Conversation>(
          `/api/conversations/${initialConversationId}`,
          token
        );
        setConversationId(initialConversationId!);
        if (data.messages) {
          const msgs: Message[] = data.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
          loadMessages(msgs);
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
        // Invalid conversation ID - redirect to /dashboard
        window.history.replaceState({}, "", "/dashboard");
      }
    }
    loadInitialConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  const handleSelectConversation = useCallback(
    async (conv: Conversation) => {
      setConversationId(conv.id);
      window.history.replaceState({}, "", `/dashboard/c/${conv.id}`);
      try {
        const token = await getToken();
        const data = await apiJson<Conversation>(
          `/api/conversations/${conv.id}`,
          token
        );
        if (data.messages) {
          const msgs: Message[] = data.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
          loadMessages(msgs);
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
      }
    },
    [getToken, loadMessages, setConversationId]
  );

  const handleNewConversation = useCallback(() => {
    clearMessages();
    setRefreshSidebar((prev) => prev + 1);
  }, [clearMessages]);

  const handleSendMessage = useCallback(
    (content: string) => {
      sendMessage(content);
      setTimeout(() => setRefreshSidebar((prev) => prev + 1), 2000);
    },
    [sendMessage]
  );

  const handleReconnectGoogle = useCallback(async () => {
    try {
      const token = await getToken();
      // Disconnect first
      await apiJson("/api/auth/google-disconnect", token, { method: "POST" });
      // Then start new OAuth flow
      const data = await apiJson<{ auth_url: string }>(
        "/api/auth/google-connect",
        token,
        { method: "POST" }
      );
      window.location.href = data.auth_url;
    } catch (err) {
      console.error("Failed to reconnect Google:", err);
    }
  }, [getToken]);

  // Loading state
  if (googleConnected === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#6b7280]" />
          <p className="text-sm text-[#6b7280]">読み込み中...</p>
        </div>
      </div>
    );
  }

  // Google not connected
  if (!googleConnected) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="bg-white border border-[#e5e7eb] rounded-2xl shadow-sm max-w-md w-full overflow-hidden">
          <GoogleConnectButton onConnected={() => setGoogleConnected(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      {/* Connected banner */}
      {showConnectedBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#10b981] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-4 h-4" />
          Googleアカウントが連携されました
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        refreshTrigger={refreshSidebar}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="h-14 border-b border-[#e5e7eb] bg-white flex items-center justify-between px-5">
          <PropertySelector
            selectedPropertyId={selectedProperty?.property_id || null}
            onSelect={setSelectedProperty}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleReconnectGoogle}
              className="flex items-center gap-1.5 text-xs text-[#6b7280] hover:text-[#1a1a2e] transition-colors cursor-pointer"
              title="Google権限を更新（GSC追加）"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Google再連携</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              <Wifi className="w-3.5 h-3.5 text-[#10b981]" />
              <span>MCP接続中</span>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <ChatWindow
            messages={messages}
            isStreaming={isStreaming}
            onSend={handleSendMessage}
            onStop={stopStreaming}
            disabled={!selectedProperty}
            propertyName={selectedProperty?.property_name}
          />
        </div>
      </div>
    </div>
  );
}
