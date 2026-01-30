"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import { apiJson } from "@/lib/api";
import type { Conversation } from "@/lib/types";
import {
  MessageSquare,
  Plus,
  Trash2,
  BarChart3,
  Loader2,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

interface Props {
  currentConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  refreshTrigger?: number;
}

function SidebarContent({
  conversations,
  loading,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDelete,
}: {
  conversations: Conversation[];
  loading: boolean;
  currentConversationId: string | null;
  onSelectConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="p-4 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-[#1a1a2e] rounded-md flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-bold tracking-tight text-[#1a1a2e]">
          GA4 Agent
        </span>
      </div>

      <div className="px-3 mb-2">
        <Button
          onClick={onNewConversation}
          variant="outline"
          className="w-full justify-start gap-2 h-9 text-sm border-[#e5e7eb] hover:bg-[#f0f1f5] rounded-lg cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新しい会話
        </Button>
      </div>

      <Separator className="bg-[#e5e7eb]" />

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 animate-spin text-[#6b7280]" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-[#9ca3af] text-center py-8 px-4">
            会話履歴はまだありません
          </p>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectConversation(conv)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectConversation(conv);
                }}
                className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors duration-150 cursor-pointer ${
                  currentConversationId === conv.id
                    ? "bg-[#f0f1f5] text-[#1a1a2e]"
                    : "text-[#374151] hover:bg-[#f8f9fb]"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-[#9ca3af] shrink-0" />
                <span className="text-xs truncate flex-1 font-medium">
                  {conv.title}
                </span>
                <button
                  onClick={(e) => onDelete(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[#dc2626] transition-opacity duration-150 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User section */}
      <Separator className="bg-[#e5e7eb]" />
      <div className="p-3 flex items-center gap-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
            },
          }}
        />
        <span className="text-xs text-[#6b7280] truncate">アカウント</span>
      </div>
    </>
  );
}

export function Sidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  refreshTrigger,
}: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { getToken } = useAuth();

  const loadConversations = useCallback(async () => {
    try {
      const token = await getToken();
      const data = await apiJson<Conversation[]>(
        "/api/conversations",
        token
      );
      setConversations(data);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, refreshTrigger]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = await getToken();
      await apiJson(`/api/conversations/${id}`, token, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentConversationId === id) {
        onNewConversation();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const handleSelectMobile = (conv: Conversation) => {
    onSelectConversation(conv);
    setMobileOpen(false);
  };

  const handleNewMobile = () => {
    onNewConversation();
    setMobileOpen(false);
  };

  const contentProps = {
    conversations,
    loading,
    currentConversationId,
    onDelete: handleDelete,
  };

  return (
    <>
      {/* Mobile: Hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 flex items-center justify-center bg-white border border-[#e5e7eb] rounded-lg shadow-sm cursor-pointer"
        aria-label="メニューを開く"
      >
        <Menu className="w-5 h-5 text-[#1a1a2e]" />
      </button>

      {/* Mobile: Sheet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton className="p-0 w-72 flex flex-col">
          <SheetTitle className="sr-only">ナビゲーション</SheetTitle>
          <SidebarContent
            {...contentProps}
            onSelectConversation={handleSelectMobile}
            onNewConversation={handleNewMobile}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop: Static sidebar */}
      <div className="hidden md:flex w-72 bg-white border-r border-[#e5e7eb] flex-col h-full">
        <SidebarContent
          {...contentProps}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      </div>
    </>
  );
}
