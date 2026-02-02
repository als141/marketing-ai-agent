"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { AppSidebar, type DashboardView } from "../components/AppSidebar";
import { HistoryPanel } from "../components/HistoryPanel";
import { SettingsView } from "../components/SettingsView";
import { ChatWindow } from "../components/ChatWindow";
import { PropertySelector } from "../components/PropertySelector";
import { GoogleConnectButton } from "../components/GoogleConnectButton";
import { useChat } from "@/lib/hooks/useChat";
import { apiJson } from "@/lib/api";
import type {
  PropertySummary,
  Conversation,
  GoogleAuthStatus,
  Message,
  MessageRecord,
  ActivityItem,
  ActivityItemRecord,
} from "@/lib/types";
import {
  Loader2,
  CheckCircle2,
  Clock,
  Menu,
  BarChart3,
  Settings,
  MessageSquarePlus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

/** Reconstruct ActivityItem[] from DB activity_items records */
function restoreActivityItems(records: ActivityItemRecord[] | null | undefined): ActivityItem[] | undefined {
  if (!records || records.length === 0) return undefined;
  return records.map((r) => ({
    ...r,
    id: crypto.randomUUID(),
  })) as ActivityItem[];
}

/** Convert a MessageRecord from the API into a frontend Message */
function recordToMessage(m: MessageRecord): Message {
  const msg: Message = {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
  };
  const items = restoreActivityItems(m.activity_items);
  if (items) {
    msg.activityItems = items;
  }
  return msg;
}

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export default function DashboardPage({ params }: PageProps) {
  const { slug } = use(params);
  const { getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSettingsPage = slug?.[0] === "settings";
  const initialConversationId =
    slug?.[0] === "c" && slug[1] ? slug[1] : null;

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [selectedProperty, setSelectedProperty] =
    useState<PropertySummary | null>(null);
  const [refreshSidebar, setRefreshSidebar] = useState(0);
  const [showConnectedBanner, setShowConnectedBanner] = useState(false);
  const currentView: DashboardView = isSettingsPage ? "settings" : "chat";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
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
        // Restore property_id from conversation so PropertySelector picks it up
        if (data.property_id) {
          setSelectedProperty((prev) =>
            prev?.property_id === data.property_id
              ? prev
              : { property_id: data.property_id!, property_name: "", account_name: "" }
          );
        }
        if (data.messages) {
          const msgs: Message[] = (data.messages as MessageRecord[])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map(recordToMessage);
          loadMessages(msgs);
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
        window.history.replaceState({}, "", "/dashboard");
      }
    }
    loadInitialConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversationId]);

  const navigateTo = useCallback(
    (view: DashboardView) => {
      if (view === "settings") {
        router.push("/dashboard/settings");
      } else {
        router.push("/dashboard");
      }
    },
    [router]
  );

  const handleSelectConversation = useCallback(
    async (conv: Conversation) => {
      setConversationId(conv.id);
      window.history.replaceState({}, "", `/dashboard/c/${conv.id}`);
      // Restore property_id from conversation
      if (conv.property_id) {
        setSelectedProperty((prev) =>
          prev?.property_id === conv.property_id
            ? prev
            : { property_id: conv.property_id!, property_name: "", account_name: "" }
        );
      }
      try {
        const token = await getToken();
        const data = await apiJson<Conversation>(
          `/api/conversations/${conv.id}`,
          token
        );
        if (data.messages) {
          const msgs: Message[] = (data.messages as MessageRecord[])
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map(recordToMessage);
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
    router.push("/dashboard");
    setRefreshSidebar((prev) => prev + 1);
  }, [clearMessages, router]);

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
      await apiJson("/api/auth/google-disconnect", token, { method: "POST" });
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
      <div className="flex items-center justify-center h-screen bg-background px-4">
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

      {/* Left sidebar: Desktop */}
      <AppSidebar
        currentView={currentView}
        onViewChange={navigateTo}
        onNewConversation={handleNewConversation}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />

      {/* Mobile sidebar: Sheet drawer */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" showCloseButton className="p-0 w-64 flex flex-col">
          <SheetTitle className="sr-only">メニュー</SheetTitle>
          {/* Mobile nav content */}
          <div className="flex items-center h-14 px-4 gap-3 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-[#1a1a2e] to-[#2d2d52] rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-[#1a1a2e] tracking-tight leading-tight">
                Analytics
              </span>
              <span className="text-[10px] text-[#9ca3af] leading-tight">
                GA4 & GSC Agent
              </span>
            </div>
          </div>
          <div className="mx-3 h-px bg-[#e5e7eb]" />
          <nav className="flex-1 py-3 px-3 space-y-1">
            <button
              onClick={() => {
                handleNewConversation();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 w-full px-3 h-10 rounded-lg text-[#e94560] hover:bg-[#e94560]/8 transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="w-[18px] h-[18px]" />
              <span className="text-[13px] font-medium">新しいチャット</span>
            </button>
            <div className="h-px bg-[#f0f1f5] my-2" />
            <button
              onClick={() => {
                navigateTo("chat");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-3 w-full px-3 h-10 rounded-lg transition-colors cursor-pointer ${
                currentView === "chat"
                  ? "bg-[#1a1a2e] text-white"
                  : "text-[#6b7280] hover:bg-[#f0f1f5]"
              }`}
            >
              <BarChart3 className="w-[18px] h-[18px]" />
              <span className="text-[13px] font-medium">チャット</span>
            </button>
            <button
              onClick={() => {
                navigateTo("settings");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-3 w-full px-3 h-10 rounded-lg transition-colors cursor-pointer ${
                currentView === "settings"
                  ? "bg-[#1a1a2e] text-white"
                  : "text-[#6b7280] hover:bg-[#f0f1f5]"
              }`}
            >
              <Settings className="w-[18px] h-[18px]" />
              <span className="text-[13px] font-medium">設定</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-12 border-b border-[#e5e7eb] bg-white flex items-center justify-between px-2 md:px-4 shrink-0">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#f0f1f5] transition-colors cursor-pointer"
              aria-label="メニューを開く"
            >
              <Menu className="w-5 h-5 text-[#1a1a2e]" />
            </button>

            {currentView === "chat" ? (
              <PropertySelector
                selectedPropertyId={selectedProperty?.property_id || null}
                onSelect={setSelectedProperty}
              />
            ) : (
              <div className="flex items-center gap-2 px-2">
                <Settings className="w-4 h-4 text-[#9ca3af]" />
                <span className="text-sm font-medium text-[#1a1a2e]">設定</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1">
            {/* History toggle */}
            {currentView === "chat" && (
              <button
                onClick={() => setHistoryOpen(true)}
                className={`
                  flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs
                  transition-all duration-200 cursor-pointer
                  ${
                    historyOpen
                      ? "bg-[#1a1a2e] text-white"
                      : "text-[#6b7280] hover:bg-[#f0f1f5] hover:text-[#1a1a2e]"
                  }
                `}
              >
                <Clock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline font-medium">履歴</span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className={`flex-1 ${currentView === "chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {currentView === "chat" ? (
            <ChatWindow
              messages={messages}
              isStreaming={isStreaming}
              onSend={handleSendMessage}
              onStop={stopStreaming}
              disabled={!selectedProperty}
              propertyName={selectedProperty?.property_name}
              pendingQuestionGroup={pendingQuestionGroup}
              onRespondToQuestions={respondToQuestions}
            />
          ) : (
            <SettingsView onReconnectGoogle={handleReconnectGoogle} />
          )}
        </div>
      </div>

      {/* Right history panel */}
      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        refreshTrigger={refreshSidebar}
      />
    </div>
  );
}
