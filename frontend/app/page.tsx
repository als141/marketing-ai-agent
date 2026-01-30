"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { BarChart3, MessageSquare, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#1a1a2e 1px, transparent 1px), linear-gradient(90deg, #1a1a2e 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <nav className="relative z-10 flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1a1a2e] rounded-md flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#1a1a2e]">
            GA4 Agent
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <Link href="/dashboard">
              <Button className="bg-[#1a1a2e] hover:bg-[#2a2a4e] text-white rounded-lg px-5 h-10 text-sm font-medium">
                ダッシュボード
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <Button
                  variant="ghost"
                  className="text-[#1a1a2e] hover:bg-[#1a1a2e]/5 rounded-lg h-10 text-sm font-medium"
                >
                  ログイン
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button className="bg-[#1a1a2e] hover:bg-[#2a2a4e] text-white rounded-lg px-5 h-10 text-sm font-medium">
                  無料で始める
                </Button>
              </Link>
            </>
          )}
        </div>
      </nav>

      <main className="relative z-10 max-w-6xl mx-auto px-8 pt-24 pb-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#e94560]/8 border border-[#e94560]/15 text-[#e94560] rounded-full px-4 py-1.5 text-xs font-medium mb-8 tracking-wide">
            <Zap className="w-3.5 h-3.5" />
            GPT-5.2 + Google Analytics 4
          </div>

          <h1 className="text-5xl leading-tight font-bold text-[#1a1a2e] tracking-tight mb-6">
            アナリティクスデータを、
            <br />
            <span className="relative inline-block">
              会話で分析する
              <span className="absolute bottom-1 left-0 w-full h-2.5 bg-[#e94560]/15 -z-10" />
            </span>
          </h1>

          <p className="text-lg text-[#6b7280] leading-relaxed mb-10 max-w-xl">
            Google Analytics
            4のデータにAIエージェントが直接アクセス。自然言語でレポート取得、リアルタイムデータ分析、トレンド把握がチャットだけで完結します。
          </p>

          <div className="flex items-center gap-4">
            <Link href={isSignedIn ? "/dashboard" : "/sign-up"}>
              <Button className="bg-[#e94560] hover:bg-[#d63850] text-white rounded-lg px-7 h-12 text-sm font-medium shadow-lg shadow-[#e94560]/20 cursor-pointer">
                今すぐ始める
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-24">
          {[
            {
              icon: MessageSquare,
              title: "自然言語クエリ",
              desc: "「先月のPV数は？」と聞くだけで、GA4データを自動取得して回答します。",
            },
            {
              icon: BarChart3,
              title: "リアルタイム分析",
              desc: "GA4のリアルタイムレポートにもアクセス。今この瞬間のデータを把握。",
            },
            {
              icon: Zap,
              title: "MCP連携",
              desc: "Google Analytics MCPサーバー経由で、安全にあなたのGA4データにアクセス。",
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="group p-6 bg-white border border-[#e5e7eb] rounded-xl hover:border-[#1a1a2e]/20 transition-all duration-300 hover:shadow-sm"
            >
              <div className="w-10 h-10 bg-[#f0f1f5] rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#1a1a2e] transition-colors duration-300">
                <feature.icon className="w-5 h-5 text-[#1a1a2e] group-hover:text-white transition-colors duration-300" />
              </div>
              <h3 className="font-bold text-[#1a1a2e] mb-2 text-sm">
                {feature.title}
              </h3>
              <p className="text-sm text-[#6b7280] leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
