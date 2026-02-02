import type { Metadata } from "next";
import { PublicPageLayout } from "@/components/public-page-layout";

export const metadata: Metadata = {
  title: "プライバシーポリシー | GA4 Analytics Agent",
  description: "GA4 Analytics Agent のプライバシーポリシー",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicPageLayout>
      <article className="prose-policy">
        <h1>プライバシーポリシー</h1>
        <p className="text-sm text-[#6b7280] mb-8">
          最終更新日: 2025年1月31日
        </p>

        <section>
          <h2>1. はじめに</h2>
          <p>
            GA4 Analytics
            Agent（以下「本サービス」）は、【運営者名】（以下「運営者」）が提供するAIベースのマーケティング分析サービスです。本プライバシーポリシーは、本サービスにおける個人情報およびユーザーデータの取り扱いについて説明します。
          </p>
        </section>

        <section>
          <h2>2. 収集する情報</h2>
          <p>本サービスでは、以下の情報を収集・利用します。</p>

          <h3>2.1 アカウント情報</h3>
          <p>
            ユーザー認証サービス（Clerk）を通じて、メールアドレス・表示名等のアカウント情報を取得します。
          </p>

          <h3>2.2 Google アナリティクスデータ</h3>
          <p>
            ユーザーの同意に基づき、Google Analytics 4（GA4）API
            を通じて、ウェブサイトのアクセス解析データ（ページビュー数、セッション数、ユーザー数、トラフィックソース等）を取得します。
          </p>

          <h3>2.3 Google Search Console データ</h3>
          <p>
            ユーザーの同意に基づき、Google Search Console API
            を通じて、検索パフォーマンスデータ（検索クエリ、表示回数、クリック数、CTR、平均掲載順位等）を取得します。
          </p>
        </section>

        <section>
          <h2>3. Google ユーザーデータの取り扱い</h2>
          <p>
            本サービスは、Google OAuth 2.0
            を使用して以下のスコープへのアクセス許可をユーザーに求めます。
          </p>
          <ul>
            <li>
              <strong>analytics.readonly</strong>: Google Analytics 4
              のレポートデータを読み取り専用で取得するために使用します。
            </li>
            <li>
              <strong>webmasters</strong>: Google Search Console
              の検索パフォーマンスデータを取得するために使用します。
            </li>
          </ul>

          <h3>3.1 データの利用目的</h3>
          <p>
            取得したGoogleユーザーデータは、AIエージェントがユーザーの質問に回答するために、オンデマンドで取得・分析する目的でのみ使用します。
          </p>

          <h3>3.2 データの保存</h3>
          <ul>
            <li>
              GA4データおよびSearch
              Consoleデータは、サーバーに永続的に保存しません。チャットセッション中にリアルタイムで取得し、応答生成後に破棄されます。
            </li>
            <li>
              OAuthリフレッシュトークンのみ、再認証なしでのアクセスを可能にするためにデータベースに暗号化して保存します。
            </li>
          </ul>

          <h3>3.3 データの非共有</h3>
          <ul>
            <li>
              Googleユーザーデータを第三者に販売、貸与、提供することはありません。
            </li>
            <li>広告目的でGoogleユーザーデータを使用することはありません。</li>
            <li>
              ユーザーの質問に回答するためにOpenAI
              APIを利用しますが、この際に送信されるのは質問コンテキストのみであり、Googleの生データ全体が送信されることはありません。
            </li>
          </ul>

          <h3>3.4 Google API Services User Data Policy への準拠</h3>
          <p>
            本サービスにおけるGoogleユーザーデータの使用および第三者への転送は、
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#e94560] hover:underline"
            >
              Google API Services User Data Policy
            </a>
            （Limited Use の要件を含む）に準拠します。
          </p>
        </section>

        <section>
          <h2>4. データの保存と保護</h2>
          <ul>
            <li>
              アカウント情報およびOAuthトークンは、Supabase（PostgreSQL）に暗号化して保存します。
            </li>
            <li>
              通信はすべてHTTPS（TLS）で暗号化されます。
            </li>
            <li>
              一時的な認証情報ファイルは、セッション終了後に自動削除されます。
            </li>
          </ul>
        </section>

        <section>
          <h2>5. データの共有</h2>
          <p>
            本サービスは、以下の場合を除き、ユーザーの個人情報を第三者と共有しません。
          </p>
          <ul>
            <li>ユーザーの明示的な同意がある場合</li>
            <li>法令に基づく開示要求がある場合</li>
          </ul>
          <p>
            なお、AIによる回答生成のためにOpenAI
            APIを利用しています。OpenAIへのデータ送信は、ユーザーの質問とその回答に必要な最小限のコンテキストに限定されます。
          </p>
        </section>

        <section>
          <h2>6. ユーザーの権利</h2>
          <ul>
            <li>
              <strong>Google連携の解除</strong>:
              ダッシュボードからいつでもGoogleアカウントの連携を解除できます。解除時にリフレッシュトークンは即座に削除されます。
            </li>
            <li>
              <strong>アカウントの削除</strong>:
              アカウントを削除することで、関連するすべてのデータが削除されます。
            </li>
            <li>
              <strong>データへのアクセス</strong>:
              保有する個人情報の開示を請求することができます。
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Cookie の使用</h2>
          <p>
            本サービスでは、ユーザー認証（Clerk）のためにセッションCookieを使用します。第三者のトラッキングCookieは使用しません。
          </p>
        </section>

        <section>
          <h2>8. プライバシーポリシーの変更</h2>
          <p>
            本ポリシーを変更する場合は、本ページにて更新日とともに公開します。重要な変更がある場合は、サービス内で通知します。
          </p>
        </section>

        <section>
          <h2>9. お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせは、以下までご連絡ください。
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
