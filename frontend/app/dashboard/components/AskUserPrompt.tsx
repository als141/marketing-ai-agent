"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageCircleQuestion, Check, Send, CheckCircle2 } from "lucide-react";
import type { AskUserQuestionItem, PendingQuestionGroup } from "@/lib/types";

interface Props {
  group: PendingQuestionGroup;
  onRespond: (groupId: string, responses: Record<string, string>) => void;
  answered?: boolean;
  answeredResponses?: Record<string, string>;
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: AskUserQuestionItem;
  value: string;
  onChange: (val: string) => void;
}) {
  if (q.type === "choice" && q.options.length > 0) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {q.options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`
              px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer border
              ${
                value === option
                  ? "bg-[#1a1a2e] text-white border-[#1a1a2e] shadow-sm"
                  : "bg-white text-[#374151] border-[#d1d5db] hover:border-[#1a1a2e]/40 hover:bg-[#f8f9fb]"
              }
            `}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "confirm") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => onChange("はい")}
          className={`
            px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer border
            ${
              value === "はい"
                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                : "bg-white text-[#374151] border-[#d1d5db] hover:border-[#1a1a2e]/40"
            }
          `}
        >
          はい
        </button>
        <button
          onClick={() => onChange("いいえ")}
          className={`
            px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer border
            ${
              value === "いいえ"
                ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                : "bg-white text-[#374151] border-[#d1d5db] hover:border-[#1a1a2e]/40"
            }
          `}
        >
          いいえ
        </button>
      </div>
    );
  }

  // text
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="回答を入力..."
      className="w-full px-3 py-1.5 rounded-lg border border-[#d1d5db] text-[13px] text-[#1a1a2e] placeholder:text-[#b0b3b8] focus:outline-none focus:border-[#1a1a2e] focus:ring-1 focus:ring-[#1a1a2e]/10 transition-all"
    />
  );
}

function AnsweredView({
  group,
  responses,
}: {
  group: PendingQuestionGroup;
  responses: Record<string, string>;
}) {
  return (
    <div className="my-3 rounded-xl border border-[#d1d5db]/60 bg-[#f8f9fb] px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" />
        <span className="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">
          回答済み
        </span>
      </div>
      {group.questions.map((q) => (
        <div key={q.id} className="flex items-baseline gap-2">
          <span className="text-[11px] text-[#9ca3af] shrink-0">Q.</span>
          <div className="min-w-0">
            <p className="text-[12px] text-[#6b7280]">{q.question}</p>
            <p className="text-[13px] font-medium text-[#1a1a2e]">
              {responses[q.id] || "（未回答）"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AskUserPrompt({
  group,
  onRespond,
  answered,
  answeredResponses,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (answered && answeredResponses) {
    return <AnsweredView group={group} responses={answeredResponses} />;
  }

  const updateAnswer = (qId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }));
  };

  const hasAnyAnswer = Object.values(answers).some((v) => v.trim() !== "");

  const handleSubmit = () => {
    // Fill unanswered questions with empty string
    const responses: Record<string, string> = {};
    for (const q of group.questions) {
      responses[q.id] = answers[q.id]?.trim() || "";
    }
    onRespond(group.groupId, responses);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="my-3 rounded-xl border-2 border-[#e94560]/15 bg-gradient-to-br from-white to-[#fef8f8]/40 px-4 py-4 shadow-sm"
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3.5">
        <div className="w-6 h-6 rounded-lg bg-[#e94560]/10 flex items-center justify-center">
          <MessageCircleQuestion className="w-3.5 h-3.5 text-[#e94560]" />
        </div>
        <span className="text-[11px] font-semibold text-[#e94560] uppercase tracking-wider">
          確認事項
        </span>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {group.questions.map((q, idx) => (
          <div key={q.id}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold text-[#9ca3af] bg-[#f0f1f5] rounded-full w-4.5 h-4.5 flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <div className="text-[13px] font-medium text-[#1a1a2e] leading-snug [&_p]:my-0 [&_strong]:font-bold [&_code]:text-[#e94560] [&_code]:bg-[#fef2f2] [&_code]:px-1 [&_code]:rounded [&_code]:text-[11px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {q.question}
                </ReactMarkdown>
              </div>
            </div>
            <div className="ml-6.5">
              <QuestionField
                q={q}
                value={answers[q.id] || ""}
                onChange={(val) => updateAnswer(q.id, val)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Submit button */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-[#b0b3b8]">
          ※ わからない項目はスキップできます
        </span>
        <button
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer bg-[#1a1a2e] text-white hover:bg-[#2d2d52] shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
          回答を送信
        </button>
      </div>
    </div>
  );
}
