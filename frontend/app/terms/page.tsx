import type { Metadata } from "next";
import { PublicPageLayout } from "@/components/public-page-layout";

export const metadata: Metadata = {
  title: "利用規約 | GA4 Analytics Agent",
  description: "GA4 Analytics Agent の利用規約",
};

export default function TermsPage() {
  return (
    <PublicPageLayout>
      <article className="prose-policy">
        <h1>利用規約</h1>
        <p className="text-sm text-[#6b7280] mb-8">
          最終更新日: 2025年1月31日
        </p>

        <section>
          <h2>1. サービスの概要</h2>
          <p>
            GA4 Analytics
            Agent（以下「本サービス」）は、Google Analytics 4 および Google
            Search Console
            のデータをAIエージェントが分析し、自然言語で回答するマーケティング分析サービスです。
          </p>
        </section>

        <section>
          <h2>2. 利用条件</h2>
          <ul>
            <li>本サービスの利用にはアカウント登録が必要です。</li>
            <li>
              GA4データの分析機能を利用するには、有効なGoogle Analytics
              4プロパティへのアクセス権を持つGoogleアカウントとの連携が必要です。
            </li>
            <li>
              ユーザーは、自身が管理権限を持つGoogleアナリティクスプロパティおよびSearch
              Consoleプロパティのみを本サービスで利用するものとします。
            </li>
          </ul>
        </section>

        <section>
          <h2>3. 禁止事項</h2>
          <p>ユーザーは、以下の行為を行ってはなりません。</p>
          <ul>
            <li>本サービスの不正利用、または他のユーザーへの妨害行為</li>
            <li>
              本サービスを通じて取得したデータの無断転売または不正な商業利用
            </li>
            <li>本サービスのリバースエンジニアリングまたは不正アクセス</li>
            <li>法令に違反する行為</li>
          </ul>
        </section>

        <section>
          <h2>4. 免責事項</h2>
          <ul>
            <li>
              本サービスが提供するAIによる分析結果は参考情報であり、その正確性、完全性、最新性を保証するものではありません。
            </li>
            <li>
              本サービスの分析結果に基づく意思決定は、ユーザー自身の責任で行うものとします。
            </li>
            <li>
              Google API
              の仕様変更やサービス停止等により、本サービスの一部または全部が利用できなくなる場合があります。
            </li>
            <li>
              本サービスの利用により生じた損害について、運営者は法令上許容される範囲で責任を負いません。
            </li>
          </ul>
        </section>

        <section>
          <h2>5. サービスの変更・停止</h2>
          <p>
            運営者は、事前の通知なく本サービスの内容を変更、または一時的もしくは永続的に停止することができます。
          </p>
        </section>

        <section>
          <h2>6. 知的財産権</h2>
          <p>
            本サービスに関する知的財産権は運営者に帰属します。ユーザーが本サービスを通じて取得した自身のアナリティクスデータに関する権利は、ユーザーに帰属します。
          </p>
        </section>

        <section>
          <h2>7. 準拠法・管轄裁判所</h2>
          <p>
            本規約の解釈および適用は日本法に準拠します。本サービスに関連する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </section>

        <section>
          <h2>8. お問い合わせ</h2>
          <p>
            本規約に関するお問い合わせは、以下までご連絡ください。
          </p>
          <p>
            運営者: 【運営者名】
            <br />
            メール: 【メールアドレス】
          </p>
        </section>
      </article>
    </PublicPageLayout>
  );
}
