# Unit of Work

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. ユニット一覧

### Unit 1: `backend-api`

| 項目 | 内容 |
|---|---|
| **種別** | Service (独立コンテナ) |
| **責務** | 請求書管理APIの提供。Route Handlers、ビジネスロジック、データ永続化、監査ログ記録 |
| **技術** | Next.js 15 (Route Handlers) + TypeScript + Prisma + SQLite + Zod |
| **ポート** | 3000 |
| **デプロイ単位** | Docker コンテナ (1個) |
| **永続化** | SQLite (`/data/invoices.db`、Docker ボリュームマウント) |
| **テストフレームワーク** | Vitest |
| **公開インタフェース** | REST API (`api-contract.md` 準拠) |

**含まれる成果物**:
- `app/api/**/*` — Route Handlers
- `src/services/` — InvoiceService, AuditLogService
- `src/repositories/` — InvoiceRepository, AuditLogRepository
- `src/schemas/` — Zod スキーマ
- `src/errors/` — AppError 階層
- `src/middleware/` — withErrorHandler, withCors, withActor
- `src/lib/prisma.ts` — Prisma シングルトン
- `src/lib/container.ts` — DI コンテナ
- `prisma/schema.prisma` — スキーマ
- `prisma/migrations/` — マイグレーション
- `tests/` — Vitest ユニットテスト
- `Dockerfile` — `node:20-alpine` ベース
- `package.json` + `package-lock.json`
- `tsconfig.json`, `eslint.config.*`, `.prettierrc`

---

### Unit 2: `frontend-ui`

| 項目 | 内容 |
|---|---|
| **種別** | Service (独立コンテナ) |
| **責務** | 請求書管理UIの提供。ユーザー操作受付、APIへの委譲、結果の表示 |
| **技術** | React 18 + Vite + TypeScript + Tailwind CSS + React Router v6 + Zod |
| **ポート** | 3001 |
| **デプロイ単位** | Docker コンテナ (1個、`vite preview` または静的配信) |
| **永続化** | なし(ステートはページ単位で管理、`localStorage` で actor_id 保持) |
| **テストフレームワーク** | Vitest + @testing-library/react |
| **依存** | backend-api の REST API (HTTP/JSON) |

**含まれる成果物**:
- `src/App.tsx` — AppShell + Router
- `src/pages/InvoiceListPage.tsx`
- `src/pages/InvoiceCreatePage.tsx`
- `src/pages/InvoiceDetailPage.tsx`
- `src/components/` — StatusBadge, Button, FormField, Toast, ConfirmDialog
- `src/api/apiClient.ts`
- `src/types/` — Invoice, AuditLog 型定義 (本ユニット内で個別定義)
- `src/main.tsx` — エントリポイント
- `index.html`, `tailwind.config.js`, `postcss.config.js`, `vite.config.ts`
- `tests/` — Vitest テスト
- `Dockerfile` — マルチステージビルド (build → preview)
- `package.json` + `package-lock.json`
- `tsconfig.json`, `eslint.config.*`, `.prettierrc`

---

## 2. リポジトリ構成 (Greenfield - Code Organization Strategy)

```
learn_aidlc-workflow_with_vercel_skill2/  ← Workspace Root
├── backend/                  ← Unit: backend-api
│   ├── app/
│   │   └── api/
│   ├── src/
│   ├── prisma/
│   ├── tests/
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/                 ← Unit: frontend-ui
│   ├── src/
│   ├── public/
│   ├── tests/
│   ├── Dockerfile
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── .env.example
│
├── docker-compose.yml         ← フロント・バック共通起動定義
├── README.md                  ← プロジェクト全体の起動手順
├── .gitignore
├── aidlc-docs/                ← AI-DLC ドキュメント (このディレクトリ)
└── aidlc-rule-details/        ← AI-DLC ルール詳細 (既存)
```

### 2.1 共有コード方針 (回答 U3=A)
両ユニットで型定義 (`Invoice`, `AuditLog` 等) を **個別に定義** する。理由:
- PoC 規模では二重メンテのコストが小さい
- 共有依存を作らないことでフロント・バックの完全分離原則を強化
- 環境構築が単純(npm workspaces 不要)
- 型はAPI契約で同期させる(契約がドキュメント化されているため整合性を保ちやすい)

### 2.2 ビルド・依存戦略
- 各ユニットは独立して `npm ci` で依存解決
- Docker ビルド時、それぞれのコンテキストは `./backend/` または `./frontend/`
- `package-lock.json` は両ユニットで生成・コミット
- ルートには `package.json` を置かない (PoC、Monorepo 不採用)

---

## 3. ユニットの並列開発可能性

| 局面 | 並列可能性 | 備考 |
|---|---|---|
| Functional Design | ◎ 並列可 | API契約 (`api-contract.md`) が確定済 |
| Infrastructure Design | ◎ 並列可 | Dockerfile、docker-compose は別ファイル |
| Code Generation | ◎ 並列可 | API契約に従う限り独立 |
| ユニットテスト | ◎ 並列可 | 互いを参照しない |
| Build | ◎ 並列可 | 別Dockerfile |
| 統合確認 (docker-compose up) | × 順序あり | 両ユニット完成後 |

---

## 4. ユニット境界の検証

### 4.1 結合点
- HTTP API (REST/JSON) のみ
- 認証ヘッダー (`X-Actor-Id`, `X-Approver-Id`)
- CORS 設定 (`CORS_ALLOW_ORIGIN`)

### 4.2 依存方向
```
frontend-ui  ──HTTP──▶  backend-api  ──Prisma──▶  SQLite
```
循環依存なし、一方向。

### 4.3 共有しないもの
- データベース (frontend は直接アクセスしない)
- 型定義 (回答 U3=A により個別管理)
- ビルドツールチェーン (別 package.json)

---

## 5. ユニットの完了定義 (Definition of Done)

### backend-api
- [ ] すべての API エンドポイントが api-contract.md 通りに動作
- [ ] 主要シナリオの正常系・異常系ユニットテスト全成功
- [ ] 型チェック (tsc) 成功
- [ ] Lint (eslint) 成功
- [ ] `npm ci && npm run build` 成功
- [ ] `docker build` 成功
- [ ] `docker run` 単独でヘルスチェック (`/api/health`) が 200 を返す

### frontend-ui
- [ ] 一覧 / 登録 / 詳細 (承認・差戻・再提出) の3画面が動作
- [ ] apiClient が backend-api と通信成功
- [ ] 主要コンポーネントの単体テスト成功
- [ ] 型チェック・Lint 成功
- [ ] `npm ci && npm run build` 成功
- [ ] `docker build` + `docker run` で `:3001` から画面が表示される
