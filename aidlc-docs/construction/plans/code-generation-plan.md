# Code Generation Plan

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**対象**: backend-api + frontend-ui の2ユニット並列実装

---

## 1. 実装方針

### 1.1 並列実装戦略
- 2 つの実装エージェントを並列起動 (実装エージェント・backend / 実装エージェント・frontend)
- API契約 (`api-contract.md`) が確定済のため、互いを参照せずに開発可能
- 設計書(FD + ID + Application Design)に厳密に従って実装

### 1.2 サブエージェントロール
| エージェント | 役割 | 入力 | 出力 | 完了条件 |
|---|---|---|---|---|
| 実装エージェント (backend) | backend-api コードと設定の生成 | requirements.md, application-design/*, construction/backend-api/* | `backend/` 配下一式 | 全ファイル生成、構成完了 |
| 実装エージェント (frontend) | frontend-ui コードと設定の生成 | requirements.md, application-design/*, construction/frontend-ui/* | `frontend/` 配下一式 | 全ファイル生成、構成完了 |
| ルート設定エージェント | docker-compose.yml, README, .gitignore 等のルート構成 | application-design, unit-of-work-dependency | ルート直下一式 | docker-compose で両ユニット起動可能 |
| レビューエージェント | 第三者レビュー(コード+設計の整合性チェック) | 実装結果 + 設計書 | review-report-code.md | 全観点でレビュー完了 |
| 修正エージェント | 指摘対応 | review-report-code.md | 修正後コード | 全Blocking解消 |

### 1.3 Pre-Code Generation チェックリスト

- [ ] backend-api: design 完了、レビュー Pass (R2)
- [ ] frontend-ui: design 完了、レビュー Pass (R2)
- [ ] application-design + api-contract が確定
- [ ] CLAUDE.md 品質ゲート要件を実装で満たす:
  - [ ] `package-lock.json` を両ユニットで生成
  - [ ] Dockerfile で `npm ci` を使用
  - [ ] 型チェック・Lint が通る
  - [ ] ユニットテストが正常系・異常系を網羅

---

## 2. 実装タスク (backend-api)

### 2.1 プロジェクトセットアップ
- [ ] `backend/package.json` (scripts: dev/build/start/test/lint/typecheck/prisma:*)
- [ ] `backend/package-lock.json` (npm install で生成)
- [ ] `backend/tsconfig.json`
- [ ] `backend/next.config.js`
- [ ] `backend/eslint.config.mjs`
- [ ] `backend/.prettierrc`
- [ ] `backend/.env.example`
- [ ] `backend/.gitignore`
- [ ] `backend/Dockerfile` (node:20-alpine, npm ci, prisma generate, healthcheck)

### 2.2 Prisma
- [ ] `backend/prisma/schema.prisma` (Invoice, AuditLog モデル、SQLiteプロバイダ)
- [ ] `backend/prisma/migrations/<timestamp>_init/migration.sql` (init マイグレーション、`prisma migrate dev --name init` で生成)
- [ ] `backend/prisma/migrations/migration_lock.toml`

### 2.3 ライブラリ層
- [ ] `backend/src/lib/prisma.ts` (Prisma シングルトン)
- [ ] `backend/src/lib/container.ts` (DI コンテナ)
- [ ] `backend/src/lib/constants.ts` (INVOICE_STATUSES, AUDIT_ACTIONS など)

### 2.4 エラー
- [ ] `backend/src/errors/AppError.ts` (基底 + ValidationError/NotFoundError/ConflictError/UnprocessableError)

### 2.5 スキーマ (Zod)
- [ ] `backend/src/schemas/invoiceSchemas.ts` (createInvoiceSchema (.strict), listInvoicesQuerySchema, approveInvoiceSchema, rejectInvoiceSchema, resubmitInvoiceSchema (.strict, .refine), idParamPrimitive, actorIdSchema)
- [ ] `backend/src/schemas/auditLogSchemas.ts` (listAuditLogsQuerySchema)

### 2.6 リポジトリ
- [ ] `backend/src/repositories/invoiceRepository.ts`
- [ ] `backend/src/repositories/auditLogRepository.ts` (list メソッド with orderBy desc)

### 2.7 サービス
- [ ] `backend/src/services/invoiceService.ts` (create/list/getById/approve/reject/resubmit/softDelete)
- [ ] `backend/src/services/auditLogService.ts` (record/list)

### 2.8 ミドルウェア
- [ ] `backend/src/middleware/withErrorHandler.ts`
- [ ] `backend/src/middleware/withCors.ts`
- [ ] `backend/src/middleware/requireActorId.ts` / `requireApproverId.ts`

### 2.9 Route Handlers (Next.js App Router)
- [ ] `backend/app/api/invoices/route.ts` (POST, GET)
- [ ] `backend/app/api/invoices/[id]/route.ts` (GET, DELETE) — params Promise化
- [ ] `backend/app/api/invoices/[id]/approve/route.ts` (POST)
- [ ] `backend/app/api/invoices/[id]/reject/route.ts` (POST)
- [ ] `backend/app/api/invoices/[id]/resubmit/route.ts` (PATCH)
- [ ] `backend/app/api/audit-logs/route.ts` (GET)
- [ ] `backend/app/api/health/route.ts` (GET — prisma.$queryRaw\`SELECT 1\`)
- [ ] OPTIONS preflight 対応 (各 route で OPTIONS handler または共通 middleware)

### 2.10 テスト (Vitest)
- [ ] `backend/vitest.config.ts`
- [ ] `backend/tests/services/invoiceService.test.ts` (正常系: create/approve/reject/resubmit/delete + mismatch判定)
- [ ] `backend/tests/services/invoiceService.error.test.ts` (異常系: 重複 409, mismatch承認 422, 状態不正 409, not found 404)
- [ ] `backend/tests/services/auditLogService.test.ts`
- [ ] `backend/tests/repositories/invoiceRepository.test.ts` (実 SQLite で UNIQUE 制約等検証)
- [ ] `backend/tests/schemas/invoiceSchemas.test.ts` (Zod バリデーション、未知フィールド拒否)
- [ ] `backend/tests/middleware/withErrorHandler.test.ts`
- [ ] `backend/tests/api/invoices.route.test.ts` (Route Handler 統合テスト) — 任意

### 2.11 Next.js エントリ
- [ ] `backend/app/layout.tsx` (最小、API専用なので簡潔)
- [ ] `backend/app/page.tsx` (ダミー)

---

## 3. 実装タスク (frontend-ui)

### 3.1 プロジェクトセットアップ
- [ ] `frontend/package.json` (scripts: dev/build/preview/test/lint/typecheck)
- [ ] `frontend/package-lock.json`
- [ ] `frontend/tsconfig.json` + `tsconfig.node.json`
- [ ] `frontend/vite.config.ts` (preview port 3001)
- [ ] `frontend/tailwind.config.js` (primary 4階調、status は標準パレット使用なのでカスタムはprimaryのみ)
- [ ] `frontend/postcss.config.js`
- [ ] `frontend/eslint.config.mjs`
- [ ] `frontend/.prettierrc`
- [ ] `frontend/.env.example`
- [ ] `frontend/.gitignore`
- [ ] `frontend/Dockerfile` (multi-stage: builder + runner, npm ci, vite preview)
- [ ] `frontend/index.html`

### 3.2 エントリ
- [ ] `frontend/src/main.tsx` (React 18, BrowserRouter)
- [ ] `frontend/src/App.tsx` (AppShell, Routes)
- [ ] `frontend/src/index.css` (Tailwind base/components/utilities)

### 3.3 型定義
- [ ] `frontend/src/types/invoice.ts` (Invoice, InvoiceStatus, CreateInvoicePayload, ResubmitPayload など)
- [ ] `frontend/src/types/auditLog.ts`

### 3.4 ライブラリ
- [ ] `frontend/src/lib/actor.ts` (getActorId, setActorId, getApproverId, setApproverId)
- [ ] `frontend/src/lib/format.ts` (金額フォーマット、日付フォーマット)

### 3.5 API クライアント
- [ ] `frontend/src/api/apiClient.ts` (createInvoice, listInvoices, getInvoice, approve, reject, resubmit, deleteInvoice)
- [ ] `frontend/src/api/AppApiError.ts`

### 3.6 共通コンポーネント
- [ ] `frontend/src/components/StatusBadge.tsx` (4ステータス、日本語ラベル)
- [ ] `frontend/src/components/Button.tsx` (5バリエーション)
- [ ] `frontend/src/components/FormField.tsx` (label/input/error, aria-*)
- [ ] `frontend/src/components/Toast.tsx` + `ToastProvider.tsx` (variant別 role/aria-live)
- [ ] `frontend/src/components/ConfirmDialog.tsx` (Tab フォーカストラップ、ESCで閉じる)
- [ ] `frontend/src/components/AppShell.tsx` (header with actor switcher)

### 3.7 ページ
- [ ] `frontend/src/pages/InvoiceListPage.tsx`
- [ ] `frontend/src/pages/InvoiceCreatePage.tsx`
- [ ] `frontend/src/pages/InvoiceDetailPage.tsx`

### 3.8 ユーティリティ
- [ ] `frontend/src/lib/handleServerError.ts` (フォールバック、コンテキスト引数で画面別マッピング)

### 3.9 テスト (Vitest + RTL)
- [ ] `frontend/vitest.config.ts` (coverage thresholds: statements 70 / branches 60)
- [ ] `frontend/src/setupTests.ts`
- [ ] `frontend/tests/api/apiClient.test.ts` (fetch モック、エラーハンドリング)
- [ ] `frontend/tests/components/StatusBadge.test.tsx`
- [ ] `frontend/tests/components/Button.test.tsx`
- [ ] `frontend/tests/components/ConfirmDialog.test.tsx` (フォーカストラップ含む)
- [ ] `frontend/tests/pages/InvoiceListPage.test.tsx`
- [ ] `frontend/tests/pages/InvoiceCreatePage.test.tsx` (バリデーション、409エラー)
- [ ] `frontend/tests/pages/InvoiceDetailPage.test.tsx` (各ステータスのアクション切替)

---

## 4. 実装タスク (ルート構成)

- [ ] `docker-compose.yml` (backend-api + frontend-ui + named volume `backend-data`)
- [ ] `README.md` (起動手順、環境変数、確認方法、APIエンドポイント、トラブルシュート、デザイン要件、`npm ci` 利用確認)
- [ ] `.gitignore` (root)
- [ ] `docs/api.md` (API仕様書、api-contract.mdをベースに整形 — 任意、READMEに参照リンクでも可)

---

## 5. レビューと修正サイクル

- [ ] 実装完了後、レビューエージェントが第三者視点でコード+設計整合性をレビュー
- [ ] レビューレポートを `aidlc-docs/construction/code/review-report.md` に出力
- [ ] 重大指摘がある場合は修正エージェントが対応 → 再レビュー
- [ ] 最大3回まで。3回でも残る場合は人間判断を仰ぐ

---

## 6. 完了条件 (Definition of Done)

- [ ] 全タスクの [ ] が [x] にマークされている
- [ ] backend/ と frontend/ が独立してビルド可能 (`npm ci && npm run build`)
- [ ] 全テストが正常系・異常系を網羅し、`npm test` で成功
- [ ] 型チェック (`tsc --noEmit`) 成功
- [ ] Lint 成功
- [ ] Dockerfile が `docker build` 成功
- [ ] `docker-compose up` で両ユニットが起動可能 (※ docker未起動時は人間に通知)
- [ ] README手順だけで第三者がセットアップ可能
- [ ] レビュー指摘ゼロ または 人間判断待ち
