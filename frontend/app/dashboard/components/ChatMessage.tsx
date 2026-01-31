"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Message } from "@/lib/types";
import { User, Wrench, Loader2, BarChart3, Search, Database } from "lucide-react";

interface Props {
  message: Message;
}

const TOOL_ICONS: Record<string, typeof BarChart3> = {
  run_report: BarChart3,
  run_realtime_report: BarChart3,
  get_search_analytics: Search,
  get_performance_overview: Search,
  get_advanced_search_analytics: Search,
  compare_search_periods: Search,
  get_search_by_page_query: Search,
  inspect_url_enhanced: Search,
  batch_url_inspection: Search,
  check_indexing_issues: Search,
  list_properties: Database,
  get_property_details: Database,
  get_account_summaries: Database,
  get_custom_dimensions_and_metrics: Database,
  list_google_ads_links: Database,
  get_sitemaps: Database,
};

const TOOL_LABELS: Record<string, string> = {
  run_report: "レポート取得",
  run_realtime_report: "リアルタイム取得",
  get_search_analytics: "検索分析",
  get_performance_overview: "パフォーマンス概要",
  get_advanced_search_analytics: "詳細検索分析",
  compare_search_periods: "期間比較",
  get_search_by_page_query: "ページ別クエリ",
  inspect_url_enhanced: "URL検査",
  batch_url_inspection: "一括URL検査",
  check_indexing_issues: "インデックス確認",
  list_properties: "プロパティ一覧",
  get_property_details: "プロパティ詳細",
  get_account_summaries: "アカウント概要",
  get_custom_dimensions_and_metrics: "カスタム定義",
  list_google_ads_links: "広告リンク",
  get_sitemaps: "サイトマップ",
  get_site_details: "サイト情報",
  submit_sitemap: "サイトマップ送信",
  delete_sitemap: "サイトマップ削除",
};

function ToolCallBadges({ toolCalls }: { toolCalls: Message["toolCalls"] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 sm:gap-1.5 mb-3 sm:mb-4">
      {toolCalls.map((tc, i) => {
        const Icon = TOOL_ICONS[tc.name] || Wrench;
        const label = TOOL_LABELS[tc.name] || tc.name;
        const isDone = !!tc.output;

        return (
          <div
            key={i}
            className={`
              inline-flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-2.5 py-0.5 sm:py-1 text-[11px] sm:text-xs
              transition-all duration-300
              ${isDone
                ? "bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]"
                : "bg-[#f0f1f5] text-[#6b7280] border border-[#e5e7eb]"
              }
            `}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="font-medium">{label}</span>
            {isDone ? (
              <span className="text-[#10b981] font-semibold">&#10003;</span>
            ) : (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end overflow-hidden">
      <div className="flex items-start gap-2 sm:gap-2.5 max-w-[85%] sm:max-w-[70%] min-w-0">
        <div className="bg-[#1a1a2e] text-white rounded-2xl rounded-br-md px-3 sm:px-4 py-2 sm:py-2.5 text-[13px] sm:text-sm leading-relaxed min-w-0">
          <p className="whitespace-pre-wrap break-words overflow-hidden">{message.content}</p>
        </div>
        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#1a1a2e] flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: Message }) {
  return (
    <div className="assistant-response overflow-hidden min-w-0">
      <ToolCallBadges toolCalls={message.toolCalls} />

      <div className="report-content overflow-hidden min-w-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-lg sm:text-xl font-bold text-[#1a1a2e] mt-6 sm:mt-8 mb-2 sm:mb-3 pb-2 border-b-2 border-[#e94560]/20 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm sm:text-base font-bold text-[#1a1a2e] mt-5 sm:mt-6 mb-2 sm:mb-2.5 flex items-center gap-2 first:mt-0">
                <span className="w-1 h-4 sm:h-5 bg-[#e94560] rounded-full inline-block shrink-0" />
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-[13px] sm:text-sm font-bold text-[#374151] mt-3 sm:mt-4 mb-1.5 sm:mb-2 first:mt-0">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="text-[13px] sm:text-sm text-[#374151] leading-[1.8] mb-2.5 sm:mb-3 last:mb-0 break-words">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-bold text-[#1a1a2e]">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="text-[#6b7280] not-italic text-[11px] sm:text-xs">{children}</em>
            ),
            ul: ({ children }) => (
              <ul className="space-y-1 mb-2.5 sm:mb-3 pl-0 list-none">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="space-y-1 mb-2.5 sm:mb-3 pl-0 list-none counter-reset-item">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-[13px] sm:text-sm text-[#374151] leading-relaxed flex items-start gap-1.5 sm:gap-2">
                <span className="text-[#e94560] mt-1.5 shrink-0 text-[8px]">&#9679;</span>
                <span className="min-w-0 break-words">{children}</span>
              </li>
            ),
            table: ({ children }) => (
              <div className="my-3 sm:my-4 rounded-lg border border-[#e5e7eb] overflow-hidden shadow-sm">
                <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                  <table className="min-w-full text-xs sm:text-sm">{children}</table>
                </div>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[#f8f9fb]">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-2 sm:px-3.5 py-2 sm:py-2.5 text-left text-[11px] sm:text-xs font-bold text-[#1a1a2e] uppercase tracking-wider border-b border-[#e5e7eb] whitespace-nowrap">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-2 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm text-[#374151] border-b border-[#f0f1f5] tabular-nums whitespace-nowrap">
                {children}
              </td>
            ),
            tr: ({ children, ...props }) => {
              const isInBody = !props.node?.position || true;
              return (
                <tr className={isInBody ? "hover:bg-[#f8f9fb]/60 transition-colors" : ""}>
                  {children}
                </tr>
              );
            },
            code: ({ children, className }) => {
              const isBlock = className?.includes("language-");
              if (isBlock) {
                return (
                  <div className="my-2.5 sm:my-3 rounded-lg bg-[#1a1a2e] overflow-hidden">
                    <div className="px-3 sm:px-4 py-1.5 bg-[#2a2a4e] text-[10px] text-[#9ca3af] uppercase tracking-wider font-medium">
                      {className?.replace("language-", "") || "code"}
                    </div>
                    <pre className="px-3 sm:px-4 py-2.5 sm:py-3 overflow-x-auto text-[11px] sm:text-xs leading-relaxed">
                      <code className="text-[#e5e7eb]">{children}</code>
                    </pre>
                  </div>
                );
              }
              return (
                <code className="text-[#e94560] bg-[#fef2f2] px-1 sm:px-1.5 py-0.5 rounded text-[11px] sm:text-xs font-medium break-all">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <>{children}</>,
            blockquote: ({ children }) => (
              <blockquote className="my-2.5 sm:my-3 pl-3 sm:pl-4 border-l-3 border-[#e94560]/30 text-[#6b7280]">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-4 sm:my-5 border-t border-[#e5e7eb]" />,
            a: ({ children, href }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#3b82f6] underline underline-offset-2 hover:text-[#2563eb] transition-colors break-all"
              >
                {children}
              </a>
            ),
          }}
        >
          {message.content || (message.isStreaming ? "" : "...")}
        </ReactMarkdown>

        {message.isStreaming && (
          <span className="inline-block w-0.5 h-5 bg-[#e94560] animate-pulse ml-0.5 align-middle rounded-full" />
        )}
      </div>
    </div>
  );
}

export function ChatMessage({ message }: Props) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  return <AssistantMessage message={message} />;
}
