"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import type {
  Message,
  ActivityItem,
  ToolActivityItem,
  TextActivityItem,
  AskUserActivityItem,
  ChartActivityItem,
  PendingQuestionGroup,
} from "@/lib/types";
import { AskUserPrompt } from "./AskUserPrompt";
import { ChartRenderer } from "./charts/ChartRenderer";
import { Wrench, Loader2, BarChart3, Search, Database, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  message: Message;
  pendingQuestionGroup?: PendingQuestionGroup | null;
  onRespondToQuestions?: (groupId: string, responses: Record<string, string>) => void;
}

// ---------------------------------------------------------------------------
// Tool metadata maps
// ---------------------------------------------------------------------------

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
  render_chart: "チャート描画",
  get_site_details: "サイト情報",
  submit_sitemap: "サイトマップ送信",
  delete_sitemap: "サイトマップ削除",
};

// ---------------------------------------------------------------------------
// Shared markdown components (used by both text segments and legacy content)
// ---------------------------------------------------------------------------

const markdownComponents: Components = {
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
};

// ---------------------------------------------------------------------------
// Helpers: grouping for interleaved timeline
// ---------------------------------------------------------------------------

/** A section in the completed view: "activity" (reasoning/tools, collapsible) or "content" (text/chart/ask_user, visible) */
interface TimelineSection {
  type: "activity" | "content";
  items: ActivityItem[];
}

function groupIntoSections(items: ActivityItem[]): TimelineSection[] {
  const sections: TimelineSection[] = [];
  for (const item of items) {
    const isActivity = item.kind === "reasoning" || item.kind === "tool";
    const sectionType = isActivity ? "activity" : "content";
    const last = sections[sections.length - 1];
    if (last && last.type === sectionType) {
      last.items.push(item);
    } else {
      sections.push({ type: sectionType, items: [item] });
    }
  }
  return sections;
}

/** Group consecutive items of the same kind (for rendering within a section) */
interface ItemGroup {
  kind: ActivityItem["kind"];
  items: ActivityItem[];
}

function groupConsecutive(items: ActivityItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.kind === item.kind) {
      last.items.push(item);
    } else {
      groups.push({ kind: item.kind, items: [item] });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// ToolBadge — single tool indicator
// ---------------------------------------------------------------------------

function ToolBadge({ item }: { item: ToolActivityItem }) {
  const Icon = TOOL_ICONS[item.name] || Wrench;
  const label = TOOL_LABELS[item.name] || item.name;
  const isDone = !!item.output;

  return (
    <div
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
}

// ---------------------------------------------------------------------------
// ReasoningLine — single reasoning entry
// ---------------------------------------------------------------------------

function ReasoningLine({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="shrink-0 mt-[5px] w-[3px] h-[3px] rounded-full bg-[#c0c4cc]" />
      <div className="min-w-0 text-[11px] text-[#9ca3af] leading-relaxed [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:text-[11px] [&_li]:text-[#9ca3af] [&_strong]:text-[#7f8694] [&_*]:text-[11px] [&_p]:last:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextSegment — renders a markdown text block in the timeline
// ---------------------------------------------------------------------------

function TextSegment({ content, isLast, isStreaming }: { content: string; isLast: boolean; isStreaming?: boolean }) {
  return (
    <div className="report-content overflow-hidden min-w-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
      {isLast && isStreaming && (
        <span className="inline-block w-0.5 h-5 bg-[#e94560] animate-pulse ml-0.5 align-middle rounded-full" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityGroupInline — collapsible reasoning+tool group (for completed view)
// ---------------------------------------------------------------------------

function ActivityGroupInline({ items }: { items: ActivityItem[] }) {
  const [isOpen, setIsOpen] = useState(false);

  const toolCount = items.filter((it) => it.kind === "tool").length;
  const reasoningCount = items.filter((it) => it.kind === "reasoning").length;

  const parts: string[] = [];
  if (reasoningCount > 0) parts.push(`思考 ${reasoningCount}`);
  if (toolCount > 0) parts.push(`ツール ${toolCount}`);
  const summaryLabel = parts.join(" · ");
  if (!summaryLabel) return null;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group inline-flex items-center gap-1 text-[11px] text-[#b0b5bd] hover:text-[#6b7280] transition-colors cursor-pointer"
      >
        <ChevronRight
          className={`w-2.5 h-2.5 transition-transform duration-150 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <span className="tracking-wide">{summaryLabel}</span>
      </button>
      {isOpen && (
        <div className="mt-1.5 ml-[14px] border-l border-[#e5e7eb] pl-2.5">
          <ActivityItemsRenderer items={items} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActivityItemsRenderer — renders a flat list of activity items grouped by kind
// ---------------------------------------------------------------------------

function ActivityItemsRenderer({
  items,
  pendingQuestionGroup,
  onRespondToQuestions,
  isStreaming,
}: {
  items: ActivityItem[];
  pendingQuestionGroup?: PendingQuestionGroup | null;
  onRespondToQuestions?: (groupId: string, responses: Record<string, string>) => void;
  isStreaming?: boolean;
}) {
  const groups = groupConsecutive(items);

  return (
    <div className="space-y-1.5">
      {groups.map((group, gi) => {
        if (group.kind === "reasoning") {
          return (
            <div key={`r-${gi}`} className="space-y-1">
              {group.items.map((item) => (
                <ReasoningLine
                  key={item.id}
                  content={(item as { content: string }).content}
                />
              ))}
            </div>
          );
        }
        if (group.kind === "text") {
          return (
            <div key={`x-${gi}`}>
              {group.items.map((item, idx) => {
                const textItem = item as TextActivityItem;
                const isLastText = gi === groups.length - 1 && idx === group.items.length - 1;
                return (
                  <TextSegment
                    key={item.id}
                    content={textItem.content}
                    isLast={isLastText}
                    isStreaming={isStreaming}
                  />
                );
              })}
            </div>
          );
        }
        if (group.kind === "ask_user") {
          return (
            <div key={`a-${gi}`}>
              {group.items.map((item) => {
                const askItem = item as AskUserActivityItem;
                const isAnswered = askItem.responses !== undefined;
                return (
                  <AskUserPrompt
                    key={item.id}
                    group={{
                      groupId: askItem.groupId,
                      questions: askItem.questions,
                    }}
                    onRespond={onRespondToQuestions || (() => {})}
                    answered={isAnswered}
                    answeredResponses={askItem.responses}
                  />
                );
              })}
            </div>
          );
        }
        if (group.kind === "chart") {
          return (
            <div key={`c-${gi}`} className="space-y-2">
              {group.items.map((item) => (
                <ChartRenderer
                  key={item.id}
                  spec={(item as ChartActivityItem).spec}
                />
              ))}
            </div>
          );
        }
        return (
          <div key={`t-${gi}`} className="flex flex-wrap gap-1 sm:gap-1.5">
            {group.items.map((item) => (
              <ToolBadge key={item.id} item={item as ToolActivityItem} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InterleavedTimeline — full timeline with text segments inline
// ---------------------------------------------------------------------------

function InterleavedTimeline({
  items,
  isStreaming,
  pendingQuestionGroup,
  onRespondToQuestions,
}: {
  items: ActivityItem[];
  isStreaming?: boolean;
  pendingQuestionGroup?: PendingQuestionGroup | null;
  onRespondToQuestions?: (groupId: string, responses: Record<string, string>) => void;
}) {
  if (!items || items.length === 0) return null;

  // --- Streaming: show full interleaved timeline ---
  if (isStreaming) {
    return (
      <div>
        <ActivityItemsRenderer
          items={items}
          pendingQuestionGroup={pendingQuestionGroup}
          onRespondToQuestions={onRespondToQuestions}
          isStreaming={isStreaming}
        />
      </div>
    );
  }

  // --- Completed: text/chart/ask_user always visible, reasoning/tools collapsed inline ---
  const sections = groupIntoSections(items);

  return (
    <div className="space-y-2">
      {sections.map((section, si) => {
        if (section.type === "activity") {
          return (
            <ActivityGroupInline key={`act-${si}`} items={section.items} />
          );
        }
        // Content section: render text, charts, ask_user directly
        return (
          <div key={`cnt-${si}`}>
            <ActivityItemsRenderer
              items={section.items}
              pendingQuestionGroup={pendingQuestionGroup}
              onRespondToQuestions={onRespondToQuestions}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legacy ActivityTimeline — for messages without TextActivityItems (backward compat)
// ---------------------------------------------------------------------------

function LegacyActivityTimeline({
  items,
  isStreaming,
  pendingQuestionGroup,
  onRespondToQuestions,
}: {
  items: ActivityItem[];
  isStreaming?: boolean;
  pendingQuestionGroup?: PendingQuestionGroup | null;
  onRespondToQuestions?: (groupId: string, responses: Record<string, string>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!items || items.length === 0) return null;

  if (isStreaming) {
    return (
      <div className="mb-2.5 sm:mb-3">
        <ActivityItemsRenderer
          items={items}
          pendingQuestionGroup={pendingQuestionGroup}
          onRespondToQuestions={onRespondToQuestions}
        />
      </div>
    );
  }

  // Completed: charts always visible, rest in collapsible
  const chartItems = items.filter((it) => it.kind === "chart");
  const nonChartItems = items.filter((it) => it.kind !== "chart");

  const toolCount = nonChartItems.filter((it) => it.kind === "tool").length;
  const reasoningCount = nonChartItems.filter((it) => it.kind === "reasoning").length;
  const askCount = nonChartItems.filter((it) => it.kind === "ask_user").length;

  const parts: string[] = [];
  if (reasoningCount > 0) parts.push(`思考 ${reasoningCount}`);
  if (toolCount > 0) parts.push(`ツール ${toolCount}`);
  if (askCount > 0) parts.push(`確認 ${askCount}`);
  const summaryLabel = parts.join(" · ");

  return (
    <div className="mb-2.5 sm:mb-3">
      {chartItems.length > 0 && (
        <div className="space-y-2 mb-2">
          {chartItems.map((item) => (
            <ChartRenderer
              key={item.id}
              spec={(item as ChartActivityItem).spec}
            />
          ))}
        </div>
      )}
      {nonChartItems.length > 0 && summaryLabel && (
        <>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="group inline-flex items-center gap-1 text-[11px] text-[#b0b5bd] hover:text-[#6b7280] transition-colors cursor-pointer"
          >
            <ChevronRight
              className={`w-2.5 h-2.5 transition-transform duration-150 ${
                isOpen ? "rotate-90" : ""
              }`}
            />
            <span className="tracking-wide">{summaryLabel}</span>
          </button>
          {isOpen && (
            <div className="mt-1.5 ml-[14px] border-l border-[#e5e7eb] pl-2.5">
              <ActivityItemsRenderer items={nonChartItems} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserMessage
// ---------------------------------------------------------------------------

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex justify-end overflow-hidden">
      <div className="max-w-[85%] sm:max-w-[70%] min-w-0">
        <div className="bg-[#f0f1f5] text-[#1a1a2e] rounded-2xl px-4 py-2.5 text-[14px] sm:text-sm leading-relaxed">
          <p className="whitespace-pre-wrap break-words overflow-hidden">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------

function AssistantMessage({
  message,
  pendingQuestionGroup,
  onRespondToQuestions,
}: {
  message: Message;
  pendingQuestionGroup?: PendingQuestionGroup | null;
  onRespondToQuestions?: (groupId: string, responses: Record<string, string>) => void;
}) {
  const items = message.activityItems || [];
  const hasTextItems = items.some((it) => it.kind === "text");

  // --- New interleaved mode: text segments are in activityItems ---
  if (hasTextItems) {
    return (
      <div className="assistant-response overflow-hidden min-w-0">
        <InterleavedTimeline
          items={items}
          isStreaming={message.isStreaming}
          pendingQuestionGroup={pendingQuestionGroup}
          onRespondToQuestions={onRespondToQuestions}
        />
      </div>
    );
  }

  // --- Legacy mode: text in message.content, activity items separate ---
  return (
    <div className="assistant-response overflow-hidden min-w-0">
      <LegacyActivityTimeline
        items={items}
        isStreaming={message.isStreaming}
        pendingQuestionGroup={pendingQuestionGroup}
        onRespondToQuestions={onRespondToQuestions}
      />

      <div className="report-content overflow-hidden min-w-0">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={markdownComponents}
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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function ChatMessage({ message, pendingQuestionGroup, onRespondToQuestions }: Props) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }
  return (
    <AssistantMessage
      message={message}
      pendingQuestionGroup={pendingQuestionGroup}
      onRespondToQuestions={onRespondToQuestions}
    />
  );
}
