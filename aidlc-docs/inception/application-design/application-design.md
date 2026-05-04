# Application Design (Consolidated)

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**ステージ**: Inception - Application Design

このドキュメントは下記の各設計書を統合した概要版です。詳細はそれぞれの個別ファイルを参照してください。

| 個別ファイル | 内容 |
|---|---|
| [components.md](./components.md) | コンポーネント定義と責務 |
| [component-methods.md](./component-methods.md) | 各コンポーネントの主要メソッドのシグネチャ |
| [services.md](./services.md) | サービス層、トランザクション、オーケストレーション |
| [component-dependency.md](./component-dependency.md) | コンポーネント依存関係、データフロー |
| [api-contract.md](./api-contract.md) | REST API仕様 |
| [design.md](./design.md) | UI/UXデザインガイド (FSI参考) |

---

## 1. アーキテクチャ概要

### 1.1 システム構成
- **Frontend container** (Vite + React, port 3001)
- **Backend container** (Next.js Route Handlers, port 3000)
- **Database**: SQLite (Backendコンテナ内のマウントボリューム `/data/invoices.db`)

フロントエンドとバックエンドは**完全分離**(別コンテナ)、HTTP/JSONで通信する。

### 1.2 バックエンドレイヤ構造
```
Route Handler (HTTP/JSON) → Service (ビジネスロジック・トランザクション)
  → Repository (Prisma経由DB操作) → Prisma → SQLite
```

### 1.3 フロントエンド構造
```
AppShell → BrowserRouter → Pages (List / Create / Detail)
  → apiClient (fetch + JSON) → Backend
  → 共通UIプリミティブ (StatusBadge, Button, FormField, Toast, ConfirmDialog)
```

---

## 2. 主要コンポーネント

### Backend
- **Route Handlers**: `/api/invoices` (POST/GET), `/api/invoices/:id` (GET/DELETE), `/api/invoices/:id/approve`, `/api/invoices/:id/reject`, `/api/invoices/:id/resubmit`, `/api/audit-logs`, `/api/health`
- **Services**: `InvoiceService` (状態遷移、トランザクション), `AuditLogService` (監査ログ記録)
- **Repositories**: `InvoiceRepository`, `AuditLogRepository`
- **Schemas**: Zod (createInvoice, listInvoicesQuery, reject, resubmit など)
- **Errors**: AppError 階層 (Validation/NotFound/Conflict/Unprocessable)
- **Middleware**: withErrorHandler, withCors, withActor

### Frontend
- **Pages**: `InvoiceListPage`, `InvoiceCreatePage`, `InvoiceDetailPage`
- **Primitives**: `StatusBadge`, `Button`, `FormField`, `Toast`, `ConfirmDialog`
- **API Client**: `apiClient.ts` (fetch wrapper)
- **Routing**: React Router v6
- **State**: useState/useReducer (PoC構成)
- **Styling**: Tailwind CSS (デザイントークンは design.md 参照)

---

## 3. ステータス・状態遷移

| Current → Action | create | approve | reject | resubmit | delete |
|---|---|---|---|---|---|
| (新規) | → pending/mismatch | - | - | - | - |
| pending | - | → approved | → rejected | - | → deleted |
| mismatch | - | ❌ 422 | → rejected | - | → deleted |
| rejected | - | ❌ 409 | ❌ 409 | → pending/mismatch | → deleted |
| approved | - | ❌ 409 | ❌ 409 | - | ❌ 409 |

詳細は [services.md](./services.md) の「状態遷移マトリクス」参照。

---

## 4. データモデル

### Invoice
- id, invoice_number, vendor_id, invoice_amount, purchase_order_amount, due_date
- status (pending/approved/rejected/mismatch)
- approver_id, approved_at, rejection_reason, rejected_by, rejected_at
- deleted_at (soft delete), created_at, updated_at
- UNIQUE INDEX: (vendor_id, invoice_number) WHERE deleted_at IS NULL

### AuditLog
- id, action (create/approve/reject/resubmit/delete)
- actor_id, invoice_id (FK)
- before_status, after_status, note
- created_at

詳細は [requirements.md](../requirements/requirements.md) のデータモデルを参照。

---

## 5. API契約 (サマリ)

| Method | Path | 用途 |
|---|---|---|
| POST | /api/invoices | 請求書登録 |
| GET | /api/invoices | 一覧 (status filter) |
| GET | /api/invoices/:id | 詳細取得 |
| POST | /api/invoices/:id/approve | 承認 |
| POST | /api/invoices/:id/reject | 差戻し |
| PATCH | /api/invoices/:id/resubmit | 再提出 |
| DELETE | /api/invoices/:id | 論理削除 |
| GET | /api/audit-logs | 監査ログ取得 |
| GET | /api/health | ヘルスチェック |

詳細仕様は [api-contract.md](./api-contract.md) 参照。

---

## 6. デザインガイドライン (サマリ)

参考サイト: https://www.fsi.co.jp/

- **トーン**: 堅牢・信頼感・業務効率重視
- **プライマリカラー**: 深紺系 (`#0B2545` / `#13315C` / `#1E5DB1`)
- **ステータスカラー**: pending=amber, approved=emerald, rejected=gray, mismatch=red
- **タイポグラフィ**: Noto Sans JP / Hiragino Sans 系、見出し700 / 本文400
- **角丸**: 抑制的 (4-8px)、シャドウ微細
- **ベースフレームワーク**: Tailwind CSS

詳細は [design.md](./design.md) 参照。

---

## 7. 設計判断のサマリ (Q&A)

| 判断項目 | 採用案 | 根拠 |
|---|---|---|
| バックエンドレイヤ構造 | 3層 (route → service → repository) | PoC、明確な責務分離 |
| API パス | `/api/...` (バージョンなし) | PoC、シンプルさ優先 |
| フロント状態管理 | useState/useReducer + fetch | PoC、依存最小化 |
| Zodスキーマ共有 | 共有しない | フロント・バック完全分離方針に合致 |
| エラーレスポンス形式 | `{ "error": "..." }` (シンプル) | PoCに必要十分 |
| CORS | `CORS_ALLOW_ORIGIN` 環境変数(デフォルト localhost:3001) | フロント-バック分離構成 |
| UIライブラリ | Tailwind CSS のみ | 軽量、設計柔軟性 |
| ルーター | React Router v6 | デファクト |

### 7.1 セキュリティ注記
本設計の `X-Actor-Id` / `X-Approver-Id` ヘッダーベース認証はクライアントから自由に詐称可能であり、**PoC 用途に限定**される。本番運用ではセッション/JWT/OIDC等の検証可能な認証方式に置換する必要がある (Out of Scope)。

---

## 8. Unit分割 (次ステージ向け)

| Unit | 含まれる成果物 |
|---|---|
| **backend-api** | Next.jsプロジェクト、Route Handlers、Service、Repository、Schemas、Prismaスキーマ、テスト、Dockerfile |
| **frontend-ui** | Viteプロジェクト、React Pages、UIプリミティブ、apiClient、Tailwind設定、テスト、Dockerfile |

両ユニットは並列に開発可能(API契約が事前確定済みのため)。
