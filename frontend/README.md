# frontend-ui

請求書チェック・承認システムのフロントエンド (React 18 + Vite + TypeScript + Tailwind CSS)。

## 必要環境

- Node.js 20+
- npm 10+

## ローカル起動 (npm)

```bash
cd frontend
npm ci
cp .env.example .env  # 既に同梱
npm run dev   # http://localhost:3001
```

バックエンド (Next.js, port 3000) を別途 `cd backend && npm run dev` で起動しておく必要があります。CORS は backend 側で `http://localhost:3001` を許可する設定が必要です。

## ビルド + プレビュー

```bash
npm run build
npm run preview   # http://localhost:3001
```

## docker-compose 起動

ルートの `docker-compose.yml` で `frontend-ui` サービスとして起動します。

```bash
docker compose up --build
# ブラウザで http://localhost:3001
```

## 環境変数

| 変数 | デフォルト | 用途 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | バックエンド API のベース URL (build-time に bundle へ埋め込まれる) |

## スクリプト

| スクリプト | 用途 |
|---|---|
| `npm run dev` | 開発用ホットリロードサーバ (port 3001) |
| `npm run build` | 型チェック + Vite 本番ビルド (`dist/`) |
| `npm run preview` | ビルド成果物を静的配信 |
| `npm test` | Vitest 一回実行 |
| `npm run test:coverage` | カバレッジ計測付きテスト実行 |
| `npm run lint` | ESLint チェック |
| `npm run typecheck` | TypeScript 型チェック (`tsc --noEmit`) |

## ディレクトリ構成

```
frontend/
├── src/
│   ├── api/           # apiClient, AppApiError
│   ├── components/    # AppShell, StatusBadge, Button, FormField, Toast, ConfirmDialog
│   ├── lib/           # actor (localStorage), format, handleServerError
│   ├── pages/         # InvoiceListPage, InvoiceCreatePage, InvoiceDetailPage, NotFoundPage
│   ├── types/         # invoice, auditLog
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── setupTests.ts
├── tests/
│   ├── api/
│   ├── components/
│   └── pages/
├── Dockerfile
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## 動作確認シナリオ

1. ヘッダー右上で `Actor: user-001`, `Approver: approver-001` を保存
2. 「+ 新規登録」から請求書を登録 (金額一致 → 承認待ち、金額不一致 → 不一致)
3. 一覧で行をクリック → 詳細画面
4. ステータスに応じたアクション (承認・差戻し・削除・再提出) を実行
5. 重複登録 (同 vendor_id + invoice_number) で 409 banner 表示確認
