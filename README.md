# 請求書チェック・承認Webシステム (Invoice Check & Approval Web System)

## 1. プロジェクト概要

経理担当者が取引先からの請求書を Excel で目視チェック・承認している運用を Web システム化し、
**確認漏れ・二重支払・監査証跡の手動管理** を解消するための社内向け PoC システムです。

主な業務フロー:

- 経理担当 (Accountant) が請求書を登録 (発注金額と請求金額を比較)
- 金額一致なら `pending`、不一致なら `mismatch` に自動分類
- 承認者 (Approver) が `pending` の請求書を承認
- 不備があれば差戻 (`rejected`) し、編集後再提出 (`resubmit`)
- すべての主要操作 (登録 / 承認 / 差戻 / 再提出 / 削除) を監査ログに記録

詳細な要件は `aidlc-docs/inception/requirements/requirements.md` を参照してください。

---

## 2. 技術スタック

| レイヤ | 技術 |
|---|---|
| フロントエンド | React 18 + Vite 5 + TypeScript + Tailwind CSS + React Router v6 |
| バックエンド | Next.js 15 (Route Handlers, App Router, API 専用) + TypeScript |
| ORM | Prisma 5 |
| データベース | SQLite (Docker volume `/data` に永続化) |
| バリデーション | Zod |
| テスト | Vitest |
| Lint / Format | ESLint + Prettier |
| コンテナ | Docker / docker-compose |
| ランタイム | Node.js 20 (alpine) |

**構成方針**: フロントエンドとバックエンドを **完全分離** し、HTTP/JSON で通信します。
それぞれを別コンテナで起動し、Vercel ではなくローカル開発環境を前提とした構成です。

---

## 3. アーキテクチャ図

```
        +-------------------+        HTTP/JSON         +--------------------+
        |   Browser         |  -------------------->   |  frontend-ui       |
        |  (localhost:3001) |  <--------------------   |  (Vite preview)    |
        +-------------------+                          +--------------------+
                                                                |
                                                                | fetch (CORS)
                                                                v
                                                       +--------------------+
                                                       |  backend-api       |
                                                       |  (Next.js 15)      |
                                                       |  (localhost:3000)  |
                                                       +--------------------+
                                                                |
                                                                | Prisma
                                                                v
                                                       +--------------------+
                                                       |  SQLite            |
                                                       |  /data/invoices.db |
                                                       |  (Docker volume)   |
                                                       +--------------------+
```

- ブラウザは `http://localhost:3000/api/...` を直接叩きます (BFF 経由ではありません)。
- `CORS_ALLOW_ORIGIN=http://localhost:3001` が backend-api に設定され、CORS が許可されます。

---

## 4. 前提条件

第三者がセットアップする際の必須環境:

| ツール | バージョン | 用途 |
|---|---|---|
| Node.js | 20 以上 | ローカル開発時 (`npm ci`, `npm run dev` 等) |
| npm | 10 以上 | Node.js 20 同梱版で OK |
| Docker | 24 以上 | コンテナビルド・起動 |
| Docker Compose | v2 以上 (`docker compose` または `docker-compose`) | マルチコンテナ起動 |
| Git | 任意 | リポジトリ取得 |

> **重要**: Docker が起動していない場合、`docker-compose` コマンドはエラーとなります。
> その場合は **「Docker Desktop を起動してください」** (もしくは Linux の場合は `systemctl start docker`)。
> Docker Desktop がインストールされていない場合は https://www.docker.com/products/docker-desktop/ からインストールしてください。

ポート要件: `3000` (backend), `3001` (frontend) が空いていること。
他プロセスが使用している場合は §13 トラブルシュートを参照。

---

## 5. ディレクトリ構成

```
.
├── backend/                      # backend-api ユニット (Next.js 15 + Prisma)
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json         # ← 必須コミット
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/           # ← 初回 migrate dev で生成、必須コミット
│   ├── app/                      # Route Handlers (App Router)
│   ├── src/                      # Service / Repository / Schemas
│   ├── tests/                    # Vitest
│   ├── .env.example
│   └── ...
├── frontend/                     # frontend-ui ユニット (React + Vite)
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json         # ← 必須コミット
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── src/                      # Pages / Primitives / apiClient
│   ├── tests/                    # Vitest
│   ├── .env.example
│   └── ...
├── aidlc-docs/                   # ドキュメント (要件・設計・本書サマリ等)
├── docker-compose.yml            # 本書 §6.4
├── .gitignore
└── README.md                     # 本書
```

---

## 6. セットアップ手順

### 6.1 リポジトリクローン

```bash
git clone <repository-url>
cd learn_aidlc-workflow_with_vercel_skill2
```

> **重要 (B-03 対応)**: `backend/prisma/migrations/` に初回マイグレーションが
> コミットされていることを確認してください (`ls backend/prisma/migrations/` で
> 1 つ以上のディレクトリが見えること)。空の場合は §6.2 で `prisma migrate dev` を実行してください。

### 6.2 backend セットアップ (ホスト直接起動 / 開発用)

```bash
cd backend

# 依存導入 (package-lock.json 厳格再現)
npm ci

# 環境変数ファイル準備
cp .env.example .env
# 必要なら .env を編集 (DATABASE_URL を file:./prisma/dev.db に変更するなど)

# Prisma Client 生成
npx prisma generate

# 初回マイグレーション (DB ファイルとテーブル作成)
# - SQLite ファイル: backend/prisma/dev.db (DATABASE_URL の指定先)
# - 同時に backend/prisma/migrations/<timestamp>_init/ も生成・コミットされます
npx prisma migrate dev --name init

# 開発サーバ起動 (ホットリロード、http://localhost:3000)
npm run dev

# あるいは本番ビルド + 起動
npm run build
npm start
```

ヘルスチェック (別ターミナル):

```bash
curl http://localhost:3000/api/health
# => {"status":"ok"}
```

### 6.3 frontend セットアップ (ホスト直接起動 / 開発用)

```bash
cd frontend

# 依存導入
npm ci

# 環境変数ファイル準備
cp .env.example .env
# 必要なら VITE_API_BASE_URL を編集

# 開発サーバ起動 (ホットリロード、http://localhost:3001)
npm run dev

# あるいは本番ビルド + プレビュー
npm run build
npm run preview
```

ブラウザで `http://localhost:3001/` を開いてください。

### 6.4 Docker 起動 (推奨、第三者の動作確認用)

> **事前確認**: Docker Desktop (Windows / macOS) もしくは Docker daemon (Linux) が起動済みであること。
> `docker info` がエラーなく応答することを確認してください。
>
> **エラーが出る場合**: 「**Docker Desktop を起動してください**」。
> Linux の場合は `sudo systemctl start docker` を実行してください。

```bash
# リポジトリ root にて
# 初回 (もしくは Dockerfile / 依存変更時) のみ --build を付ける
docker-compose up --build

# バックグラウンド起動
docker-compose up -d --build

# ログ確認
docker-compose logs -f backend-api
docker-compose logs -f frontend-ui

# 停止
docker-compose down
# データボリュームごと削除 (DB も初期化される)
docker-compose down -v
```

> **重要 (B-03 再掲)**: 初回 `docker-compose up --build` の前に、
> `backend/prisma/migrations/` に init マイグレーションがコミットされている必要があります。
> 空のままビルドすると `prisma migrate deploy` が "No migration found" で素通りし、
> SQLite にテーブルが作られず API が 500 エラーを返します (§13 トラブルシュート参照)。

`docker-compose up` 完了後の確認:

- ブラウザで http://localhost:3001/ → フロントエンド画面が表示される
- `curl http://localhost:3000/api/health` → `{"status":"ok"}`
- backend のヘルスチェックが healthy になってから frontend が起動 (`depends_on: service_healthy`)

---

## 7. 環境変数一覧

### 7.1 backend/.env.example

```dotenv
# データベース接続文字列 (SQLite ファイルパス)
# - Docker 起動時: file:/data/invoices.db (Docker volume にマウント)
# - ホスト直接起動: file:./prisma/dev.db に変更を推奨
DATABASE_URL=file:/data/invoices.db

# サーバ Listen ポート
PORT=3000

# CORS 許可オリジン (フロントエンドの公開元 URL)
# - フロント側ポートを変更した場合はここも合わせて変更
CORS_ALLOW_ORIGIN=http://localhost:3001

# Node 実行モード
NODE_ENV=production
```

| 変数 | デフォルト | 用途 |
|---|---|---|
| `DATABASE_URL` | `file:/data/invoices.db` | Prisma 接続文字列 |
| `PORT` | `3000` | Next.js Listen ポート |
| `HOSTNAME` | `0.0.0.0` | 外部公開用バインドアドレス (Dockerfile 既定) |
| `CORS_ALLOW_ORIGIN` | `http://localhost:3001` | CORS 許可オリジン |
| `NODE_ENV` | `production` | Next.js 動作モード |

### 7.2 frontend/.env.example

```dotenv
# Backend API のベース URL (Vite が build-time に bundle に埋め込み)
# - 変更時は再ビルドが必要 (import.meta.env.VITE_API_BASE_URL)
# - ブラウザから直接叩くため、コンテナ内 DNS ではなくホスト URL を指定する
VITE_API_BASE_URL=http://localhost:3000
```

| 変数 | デフォルト | 用途 | スコープ |
|---|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | apiClient のベース URL | build-time (バンドルに埋込) |
| `NODE_ENV` | `production` | preview サーバ既定 | runtime |
| `PORT` | `3001` | preview ポート (Dockerfile 固定) | runtime |
| `HOST` | `0.0.0.0` | preview バインド先 | runtime |

> **注意**: `VITE_*` は **ビルド時に文字列として埋め込まれます**。
> 変更時は Docker イメージの再ビルドが必要です (`docker-compose up --build`)。

---

## 8. 動作確認手順

### 8.1 起動確認

| 項目 | URL | 期待結果 |
|---|---|---|
| フロントエンド | http://localhost:3001/ | 一覧画面が表示される |
| バックエンドヘルスチェック | http://localhost:3000/api/health | `{"status":"ok"}` |
| バックエンド一覧 API | http://localhost:3000/api/invoices | `{"items":[],"total":0}` (初期状態) |

### 8.2 シナリオテスト (UI)

1. http://localhost:3001/ を開く → 一覧 (空) 表示
2. 「請求書登録」ボタンから新規登録画面へ遷移
3. 請求番号 / 取引先ID / 請求金額 / 発注金額 / 支払期限 を入力して送信
   - 金額一致 → ステータス `pending`
   - 金額不一致 → ステータス `mismatch`
4. 一覧画面に戻り、ステータスフィルタで絞込
5. 詳細画面から「承認」 (X-Approver-Id 必要) もしくは「差戻」 (理由必須)
6. 差戻後 → 「再提出」で金額編集 → `pending` または `mismatch` に再分類

### 8.3 curl での API 動作確認例

```bash
# 1. ヘルスチェック
curl -s http://localhost:3000/api/health
# => {"status":"ok"}

# 2. 請求書登録 (金額一致 → pending)
curl -s -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-001" \
  -d '{
    "invoice_number": "INV-2026-0001",
    "vendor_id": "VENDOR-A",
    "invoice_amount": 100000,
    "purchase_order_amount": 100000,
    "due_date": "2026-06-30"
  }'
# => {"id":"...","status":"pending",...}

# 3. 請求書登録 (金額不一致 → mismatch)
curl -s -X POST http://localhost:3000/api/invoices \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-001" \
  -d '{
    "invoice_number": "INV-2026-0002",
    "vendor_id": "VENDOR-A",
    "invoice_amount": 100000,
    "purchase_order_amount": 90000,
    "due_date": "2026-06-30"
  }'
# => {"id":"...","status":"mismatch",...}

# 4. 一覧取得 (status フィルタ)
curl -s "http://localhost:3000/api/invoices?status=pending&limit=50&offset=0"
# => {"items":[...],"total":1}

# 5. 詳細取得
INVOICE_ID=<上記のid>
curl -s "http://localhost:3000/api/invoices/${INVOICE_ID}"

# 6. 承認 (※承認は X-Approver-Id ヘッダー必須、X-Actor-Id 不要)
curl -s -X POST "http://localhost:3000/api/invoices/${INVOICE_ID}/approve" \
  -H "X-Approver-Id: approver-001"
# => {"id":"...","status":"approved","approver_id":"approver-001",...}

# 7. 差戻 (X-Actor-Id 必須、rejection_reason 必須)
curl -s -X POST "http://localhost:3000/api/invoices/${INVOICE_ID}/reject" \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-001" \
  -d '{"rejection_reason":"金額に誤りがあります"}'

# 8. 再提出 (rejected → pending/mismatch)
curl -s -X PATCH "http://localhost:3000/api/invoices/${INVOICE_ID}/resubmit" \
  -H "Content-Type: application/json" \
  -H "X-Actor-Id: user-001" \
  -d '{"invoice_amount":95000,"purchase_order_amount":95000}'

# 9. 論理削除
curl -s -X DELETE "http://localhost:3000/api/invoices/${INVOICE_ID}" \
  -H "X-Actor-Id: user-001" -i
# => HTTP/1.1 204 No Content

# 10. 監査ログ取得
curl -s "http://localhost:3000/api/audit-logs?invoice_id=${INVOICE_ID}&limit=50"
# => {"items":[{"action":"create",...},{"action":"approve",...},...]}
```

---

## 9. API 仕様サマリ

| Method | Path | 用途 | 必須ヘッダー |
|---|---|---|---|
| POST | `/api/invoices` | 請求書登録 | `X-Actor-Id`, `Content-Type: application/json` |
| GET | `/api/invoices` | 一覧取得 (`status`, `limit`, `offset` クエリ) | なし |
| GET | `/api/invoices/:id` | 詳細取得 | なし |
| POST | `/api/invoices/:id/approve` | 承認 | `X-Approver-Id` |
| POST | `/api/invoices/:id/reject` | 差戻 (`rejection_reason` 必須) | `X-Actor-Id`, `Content-Type` |
| PATCH | `/api/invoices/:id/resubmit` | 再提出 (金額・支払期限編集) | `X-Actor-Id`, `Content-Type` |
| DELETE | `/api/invoices/:id` | 論理削除 | `X-Actor-Id` |
| GET | `/api/audit-logs` | 監査ログ取得 (`invoice_id`, `limit` クエリ) | なし |
| GET | `/api/health` | ヘルスチェック | なし |

エラーレスポンス形式: `{ "error": "..." }`

| HTTP | 意味 |
|---|---|
| 400 | バリデーションエラー、必須ヘッダー欠落、JSON パース失敗 |
| 404 | リソース未発見 / 論理削除済 |
| 409 | 重複登録、状態不正 (例: approved 済を再承認) |
| 422 | 業務不可 (例: mismatch を承認) |
| 500 | サーバ内部エラー |

詳細な仕様は `aidlc-docs/inception/application-design/api-contract.md`、要約は `docs/api.md` を参照してください。

---

## 10. テスト実行

```bash
# backend ユニットテスト
cd backend
npm test          # 一回実行
npm run test:watch  # watch モード

# frontend ユニットテスト
cd frontend
npm test
npm run test:watch
```

カバレッジ計測 (任意):

```bash
cd backend && npm test -- --coverage
cd frontend && npm test -- --coverage
```

---

## 11. 品質ゲート確認手順

CLAUDE.md §5 の品質ゲートに準拠。第三者が以下の手順をすべてパスできることを確認してください。

### 11.1 各ユニット個別確認

```bash
# backend
cd backend
npm ci                # ✓ package-lock.json 厳格整合
npm run typecheck     # ✓ TypeScript 型チェック (tsc --noEmit)
npm run lint          # ✓ ESLint (--max-warnings 0)
npm test              # ✓ Vitest 全テスト成功
npm run build         # ✓ Prisma generate + Next build 成功

# frontend
cd ../frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build         # ✓ tsc -b + vite build 成功
```

### 11.2 Docker 起動確認

```bash
docker-compose up --build
# 別ターミナルで
curl -f http://localhost:3000/api/health   # 200 OK
curl -f http://localhost:3001/             # 200 OK (HTML)

# 一覧取得 (フロントから API 呼び出しと等価)
curl -f http://localhost:3000/api/invoices
```

すべて成功すれば品質ゲートクリアです。

---

## 12. デザインガイド

UI / UX デザインガイドラインは以下を参照してください。

- `aidlc-docs/inception/application-design/design.md`
- 参考サイト: https://www.fsi.co.jp/
- カラートークン: 深紺系 (`#0B2545` / `#13315C` / `#1E5DB1` / `#E6EEFA`)
- ステータスカラー: pending=amber, approved=emerald, rejected=gray, mismatch=red (Tailwind 標準パレット採用)
- タイポグラフィ: Noto Sans JP / Hiragino Sans
- 角丸: 4-8px (抑制的)、シャドウ微細

---

## 13. トラブルシュート

### 13.1 Docker が起動していない

| 症状 | 対処 |
|---|---|
| `Cannot connect to the Docker daemon` / `error during connect` | **Docker Desktop を起動してください** (Windows/macOS)。Linux: `sudo systemctl start docker` |
| `command not found: docker` / `docker-compose` | Docker Desktop をインストールしてください: https://www.docker.com/products/docker-desktop/ |

### 13.2 `prisma migrate dev` / `prisma migrate deploy` エラー

| 症状 | 対処 |
|---|---|
| `Error: P1003: Database file does not exist` | `backend/.env` の `DATABASE_URL` を確認。`file:./prisma/dev.db` のように相対パスにする (ホスト直接起動時) |
| `Environment variable not found: DATABASE_URL` | `backend/.env` が存在するか確認 (`cp .env.example .env`) |
| Docker 起動時 `migrate deploy` が `No migration found in prisma/migrations` を出力 | `backend/prisma/migrations/` が空 → §6.2 で `npx prisma migrate dev --name init` を実行してマイグレーションを生成 → コミットしてから `docker-compose up --build` を再実行 |
| `migrate dev` が `Drift detected` でエラー | dev.db を一旦削除: `rm backend/prisma/dev.db && npx prisma migrate dev` |

### 13.3 CORS エラー (ブラウザコンソールに `CORS policy: ...`)

| 症状 | 対処 |
|---|---|
| `Access to fetch ... has been blocked by CORS policy` | backend-api の `CORS_ALLOW_ORIGIN` がフロント URL と一致しているか確認 (`http://localhost:3001`) |
| frontend を別ポートで起動した場合 | `docker-compose.yml` の `CORS_ALLOW_ORIGIN` と frontend の `VITE_API_BASE_URL` を整合させて再ビルド |

### 13.4 ポート競合 (3000 / 3001)

| 症状 | 対処 |
|---|---|
| `bind: address already in use` | 使用中プロセスを停止: Linux/macOS `lsof -i :3000` / Windows `netstat -ano \| findstr :3000` で PID 特定 → 終了 |
| 別ポートで起動したい | `docker-compose.yml` の `ports` (`"3000:3000"` → `"3010:3000"` 等) と `CORS_ALLOW_ORIGIN` / `VITE_API_BASE_URL` を整合修正 |

### 13.5 `npm ci` が失敗する

| 症状 | 対処 |
|---|---|
| `npm ci can only install packages when ... package-lock.json` | `package-lock.json` がコミットされていない → `npm install` で生成してコミット |
| `lockfile and package.json mismatch` | `package.json` を変更後 `package-lock.json` を更新していない → `npm install` で再生成 |

### 13.6 ヘルスチェックが healthy にならない

| 症状 | 対処 |
|---|---|
| `backend-api` が unhealthy のまま | `docker-compose logs backend-api` でエラー確認。多くは migrate 失敗 (§13.2) |
| `frontend-ui` が起動しない | `backend-api` の healthy 待ち。先に backend のエラー解消 |

---

## 14. 既知の制約 (PoC 範囲)

- **認証**: `X-Actor-Id` / `X-Approver-Id` ヘッダーベースの簡易認証のみ。クライアントから自由に詐称可能で、**本番運用では使用しないでください**。本番ではセッション / JWT / OIDC 等への置換が必要です。
- **データベース**: SQLite を採用 (PoC、シングルノード)。本番では PostgreSQL / MySQL への置換を推奨します。
- **監査ログ閲覧 UI**: 提供しません。`GET /api/audit-logs` API のみ提供 (運用者が直接 API を叩く前提)。
- **ロール管理 (RBAC)**: 未実装。誰でも全エンドポイントを呼べます。
- **通知**: メール / Slack 等の通知機能は未実装。
- **ファイル添付**: 請求書 PDF 等の添付機能は未実装。
- **多通貨**: JPY 整数のみサポート。
- **フロント配信**: `vite preview` を使用 (本番性能未検証)。本番は nginx 等への置換を推奨。
- **Vercel デプロイ**: 対象外。docker-compose によるローカル起動のみ。

詳細は `aidlc-docs/inception/requirements/requirements.md` §11 (Out of Scope) を参照してください。

---

## 15. ライセンス・寄稿

社内 PoC のため、ライセンスと寄稿ガイドラインは未定です。
本プロジェクトの利用・拡張は社内ガイドラインに従ってください。

---

## 関連ドキュメント

| ドキュメント | パス |
|---|---|
| 要件定義 | `aidlc-docs/inception/requirements/requirements.md` |
| アプリケーション設計 (統合) | `aidlc-docs/inception/application-design/application-design.md` |
| API 仕様 | `aidlc-docs/inception/application-design/api-contract.md` |
| デザインガイド | `aidlc-docs/inception/application-design/design.md` |
| ユニット分割 | `aidlc-docs/inception/application-design/unit-of-work.md` |
| backend インフラ設計 | `aidlc-docs/construction/backend-api/infrastructure-design/infrastructure-design.md` |
| frontend インフラ設計 | `aidlc-docs/construction/frontend-ui/infrastructure-design/infrastructure-design.md` |
