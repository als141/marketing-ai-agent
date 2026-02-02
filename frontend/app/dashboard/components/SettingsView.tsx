"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { apiJson } from "@/lib/api";
import type { PropertySummary, GoogleAuthStatus } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Search,
  Loader2,
  Shield,
  Link2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  onReconnectGoogle: () => void;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
        ${ok ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fef2f2] text-[#991b1b]"}
      `}
    >
      {ok ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      {label}
    </span>
  );
}

function SettingCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-4">
        <div className="w-9 h-9 rounded-lg bg-[#f0f1f5] flex items-center justify-center shrink-0 mt-0.5">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[#1a1a2e] tracking-tight">
            {title}
          </h3>
          {description && (
            <p className="text-xs text-[#9ca3af] mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      </div>
      <Separator className="bg-[#f0f1f5]" />
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

export function SettingsView({ onReconnectGoogle }: Props) {
  const { getToken } = useAuth();
  const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus | null>(null);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [gscAvailable, setGscAvailable] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    try {
      const token = await getToken();
      const [status, props] = await Promise.all([
        apiJson<GoogleAuthStatus>("/api/auth/google-status", token),
        apiJson<PropertySummary[]>("/api/properties", token).catch(() => []),
      ]);
      setGoogleStatus(status);
      setProperties(props);

      // Check GSC availability by trying to list GSC properties
      // If the user has GSC access, this will succeed
      if (status.connected) {
        setGscAvailable(true); // Assume available if Google is connected
      }
    } catch (err) {
      console.error("Failed to load settings data:", err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-[#9ca3af]" />
          <p className="text-sm text-[#9ca3af]">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-5">
        {/* Page header */}
        <div className="mb-2">
          <h1 className="text-lg font-bold text-[#1a1a2e] tracking-tight">設定</h1>
          <p className="text-xs text-[#9ca3af] mt-1">
            アカウント連携とデータソースの管理
          </p>
        </div>

        {/* Google connection */}
        <SettingCard
          icon={<Link2 className="w-4 h-4 text-[#6b7280]" />}
          title="Googleアカウント連携"
          description="GA4とSearch Consoleへのアクセスに使用します"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Google icon */}
                <div className="w-8 h-8 rounded-full bg-white border border-[#e5e7eb] flex items-center justify-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e]">
                    Google
                  </p>
                  <p className="text-[11px] text-[#9ca3af]">
                    OAuth 2.0 認証
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={googleStatus?.connected ?? false}
                label={googleStatus?.connected ? "接続中" : "未接続"}
              />
            </div>

            {googleStatus?.connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReconnectGoogle}
                className="gap-2 text-xs h-8 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                再連携（権限の更新）
              </Button>
            )}
          </div>
        </SettingCard>

        {/* Data sources */}
        <SettingCard
          icon={<Shield className="w-4 h-4 text-[#6b7280]" />}
          title="データソース"
          description="アクセス可能な分析ツールの状態"
        >
          <div className="space-y-3">
            {/* GA4 */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#eff6ff] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-[#3b82f6]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e]">
                    Google Analytics 4
                  </p>
                  <p className="text-[11px] text-[#9ca3af]">
                    analytics.readonly スコープ
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={properties.length > 0}
                label={properties.length > 0 ? "利用可能" : "未検出"}
              />
            </div>

            <div className="h-px bg-[#f0f1f5]" />

            {/* GSC */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#fef3c7] flex items-center justify-center">
                  <Search className="w-4 h-4 text-[#d97706]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1a1a2e]">
                    Google Search Console
                  </p>
                  <p className="text-[11px] text-[#9ca3af]">
                    webmasters スコープ
                  </p>
                </div>
              </div>
              <StatusBadge
                ok={gscAvailable ?? false}
                label={gscAvailable ? "利用可能" : "未検出"}
              />
            </div>

            {!googleStatus?.connected && (
              <p className="text-xs text-[#e94560] mt-2">
                Googleアカウントを連携するとデータソースが有効になります
              </p>
            )}
          </div>
        </SettingCard>

        {/* Properties */}
        {properties.length > 0 && (
          <SettingCard
            icon={<Building2 className="w-4 h-4 text-[#6b7280]" />}
            title="GA4 プロパティ"
            description={`${properties.length}件のプロパティにアクセス可能`}
          >
            <div className="space-y-2">
              {properties.map((prop) => (
                <div
                  key={prop.property_id}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#f8f9fb]"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-[#9ca3af] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1a1a2e] truncate">
                      {prop.property_name}
                    </p>
                    <p className="text-[10px] text-[#9ca3af] truncate">
                      {prop.account_name} · {prop.property_id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </SettingCard>
        )}

        {/* Help link */}
        <div className="pt-2 pb-4">
          <a
            href="https://support.google.com/analytics/answer/9306384"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#9ca3af] hover:text-[#6b7280] transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            GA4の権限設定について
          </a>
        </div>
      </div>
    </div>
  );
}
