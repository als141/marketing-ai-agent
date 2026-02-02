import Link from "next/link";
import { BarChart3 } from "lucide-react";

export function PublicPageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 max-w-6xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1a1a2e] rounded-md flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#1a1a2e]">
            GA4 Agent
          </span>
        </Link>
        <Link
          href="/sign-in"
          className="text-sm text-[#6b7280] hover:text-[#1a1a2e] transition-colors"
        >
          ログイン
        </Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">
        {children}
      </main>

      <footer className="border-t border-[#e5e7eb] py-6 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-[#6b7280]">
          <span>&copy; {new Date().getFullYear()} GA4 Agent</span>
          <div className="flex gap-4">
            <Link
              href="/privacy-policy"
              className="hover:text-[#1a1a2e] transition-colors"
            >
              プライバシーポリシー
            </Link>
            <Link
              href="/terms"
              className="hover:text-[#1a1a2e] transition-colors"
            >
              利用規約
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
