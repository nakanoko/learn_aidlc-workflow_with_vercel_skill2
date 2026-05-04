# Infrastructure Design - backend-api

**プロジェクト**: 請求書チェック・承認Webシステム
**ユニット**: backend-api
**作成日**: 2026-05-04
**ステージ**: Construction - Infrastructure Design

---

## 0. 概要

backend-api ユニット (Next.js 15 + Prisma + SQLite) のローカル開発環境向けインフラ設計書。
本書は Dockerfile、環境変数、ボリューム、ヘルスチェック、起動シーケンス、`docker-compose.yml` フラグメント、`package.json`、`next.config.js` を定義する。

**前提**:
- ランタイム: Node.js 20 (alpine)
- DB: SQLite (Docker ボリューム `/data` に永続化)
- ポート: 3000 (HTTP)
- 用途: ローカル PoC (Vercel デプロイ非対象)

---

## 1. Dockerfile 設計

### 1.1 設計方針

| 項目 | 採用 | 理由 |
|---|---|---|
| ベースイメージ | `node:20-alpine` | 軽量、PoC に十分。`requirements.md` および `unit-of-work.md` で指定 |
| マルチステージ | 採用しない | PoC 簡素化優先。alpine + standalone のシムリンク問題回避 |
| 依存導入 | `npm ci` | `package-lock.json` 厳格再現 (CLAUDE.md 品質ゲート) |
| Prisma | `prisma generate` をビルド前、`prisma migrate deploy` を起動時実行 | スキーマ変更を確実反映、起動時マイグレーション |
| 起動コマンド | `npm start` | Next.js 標準起動 (本書 9 章で `output: 'standalone'` 不採用) |
| Expose | 3000 | API ポート |
| 非 root ユーザー | 採用 (`node` ユーザー) | Alpine 標準で `node` ユーザー (uid 1000) が同梱、セキュリティ推奨 |
| `.dockerignore` | 採用 | `node_modules`, `.next`, `tests`, `*.md` 除外でビルド高速化 |

### 1.2 Dockerfile 完全内容

```dockerfile
# syntax=docker/dockerfile:1.6

FROM node:20-alpine

# wget は HEALTHCHECK 用 (alpine には busybox wget が同梱されているため不要だが明示)
# openssl は Prisma が要求 (alpine では libssl が必要なケースがある)
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# 依存ファイルを先にコピーしキャッシュ最大化
COPY package.json package-lock.json ./
COPY prisma ./prisma

# 厳格再現: package-lock.json と完全一致した依存を導入
RUN npm ci

# Prisma Client を生成 (schema.prisma に基づく)
RUN npx prisma generate

# ソースコードコピー
COPY tsconfig.json next.config.js ./
COPY app ./app
COPY src ./src

# Next.js 本番ビルド
RUN npm run build

# /data ディレクトリを作成し node ユーザーが書き込めるようにする
RUN mkdir -p /data && chown -R node:node /data /app

# 非 root ユーザーで実行 (alpine 標準で node ユーザーが存在)
USER node

# 環境変数 (上書き可能なデフォルト)
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/invoices.db \
    CORS_ALLOW_ORIGIN=http://localhost:3001

EXPOSE 3000

# /api/health にアクセス可能になるまでのヘルスチェック
# I-02 対応: BusyBox `wget -qO-` は HTTP 5xx でも exit 0 を返すケースがあるため、
# 本文に `"status":"ok"` が含まれることを grep で検証する (確実な判定)。
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget -qO- http://localhost:3000/api/health | grep -q '"status":"ok"' || exit 1

# 起動シーケンス: prisma migrate deploy → npm start
# sh -c で 2 コマンド連結 (entrypoint script を別ファイルにせずインライン化、PoC 簡素化)
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

### 1.3 .dockerignore

```
node_modules
.next
tests
coverage
*.log
.env
.env.local
.git
.gitignore
README.md
*.md
.eslintcache
```

---

## 2. 環境変数

### 2.1 .env.example

`backend/.env.example` (リポジトリにコミット):

```dotenv
# データベース接続文字列 (SQLite ファイルパス)
DATABASE_URL=file:/data/invoices.db

# サーバ Listen ポート
PORT=3000

# CORS 許可オリジン (フロントエンドの公開元 URL)
CORS_ALLOW_ORIGIN=http://localhost:3001

# Node 実行モード
NODE_ENV=production
```

### 2.2 環境変数一覧

| 変数 | デフォルト | 用途 | 設定箇所 |
|---|---|---|---|
| `DATABASE_URL` | `file:/data/invoices.db` | Prisma 接続文字列 | Dockerfile / docker-compose |
| `PORT` | `3000` | Next.js Listen ポート | Dockerfile |
| `HOSTNAME` | `0.0.0.0` | コンテナ外部公開のため `0.0.0.0` (`localhost` 不可) | Dockerfile |
| `CORS_ALLOW_ORIGIN` | `http://localhost:3001` | CORS ヘッダ `Access-Control-Allow-Origin` | docker-compose / withCors |
| `NODE_ENV` | `production` | Next.js 動作モード | Dockerfile |

### 2.3 ローカル開発時の上書き

- `npm run dev` 時は `.env.local` で `DATABASE_URL=file:./prisma/dev.db` を上書きする想定 (README に記載予定)
- docker-compose 経由では `environment:` ブロックで上書き

---

## 3. ボリューム設計

### 3.1 Docker ボリューム定義

| ボリューム名 | コンテナ内パス | 用途 | 永続化対象 |
|---|---|---|---|
| `backend-data` | `/data` | SQLite データファイル | `invoices.db`, `invoices.db-journal`, `invoices.db-wal` |

### 3.2 SQLite ファイル配置

```
/data/
├── invoices.db          # SQLite メインファイル
├── invoices.db-journal  # ロールバックジャーナル (PRAGMA journal_mode=DELETE 時)
└── invoices.db-wal      # WAL モード時 (要件側 PRAGMA journal_mode=WAL 推奨)
```

### 3.3 マウント設定 (compose 側)

- `backend-data:/data` (named volume)
- 初回 `docker-compose up` 時、`prisma migrate deploy` がファイルを生成
- ボリューム削除時の挙動: `docker-compose down -v` で破棄、`docker-compose down` のみではデータ保持

---

## 4. ヘルスチェック設計

### 4.1 ヘルスチェック仕様

| 項目 | 値 | 根拠 |
|---|---|---|
| エンドポイント | `GET /api/health` | application-design 7.1 で定義 |
| 期待レスポンス | HTTP 200 + `{"status":"ok"}` | api-contract.md 準拠 |
| ツール | `wget -qO- ... \| grep -q '"status":"ok"'` | alpine 標準 (busybox)、curl 追加不要。本文に `"status":"ok"` が含まれることまで検証する (I-02 対応) |
| `interval` | `10s` | PoC、起動失敗の早期検知 |
| `timeout` | `3s` | 軽量 GET、十分 |
| `retries` | `5` | 起動初期の DB 接続失敗を許容 |
| `start_period` | `20s` | `prisma migrate deploy` の実行時間を許容 |

### 4.2 Dockerfile 側 HEALTHCHECK

(本書 1.2 に記載済み)

### 4.3 docker-compose 側 healthcheck (重複定義可、compose 側を優先)

```yaml
healthcheck:
  # I-02: BusyBox `wget` は HTTP 5xx でも exit 0 を返すケースがあるため、
  # 本文の `"status":"ok"` を grep で確認する。`CMD-SHELL` でパイプを利用。
  test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health | grep -q '\"status\":\"ok\"'"]
  interval: 10s
  timeout: 3s
  retries: 5
  start_period: 20s
```

**設計判断**: Dockerfile と docker-compose の双方で定義。compose 側の定義が優先されるため、運用時は compose で調整可能。Dockerfile 単独 `docker run` 時にも動作するよう冗長定義する。

---

## 5. 起動シーケンス

### 5.1 起動フロー

```
[コンテナ起動]
    │
    ▼
[CMD 実行: sh -c "npx prisma migrate deploy && npm start"]
    │
    ├─ Step 1: prisma migrate deploy
    │     ├─ /data/invoices.db を確認 (なければ作成)
    │     ├─ prisma/migrations/ の未適用マイグレーションを順次実行
    │     ├─ 失敗時: 終了コード 1 で停止 (npm start に進まない)
    │     └─ 成功時: 続行
    │
    ▼
    └─ Step 2: npm start (= next start -p 3000)
          ├─ HTTP サーバ起動 (PORT=3000)
          ├─ /api/health が 200 を返すまで HEALTHCHECK は failing
          └─ 起動完了後 HEALTHCHECK passing
```

### 5.2 マイグレーション失敗時の挙動

- `prisma migrate deploy` が非ゼロ終了 → コンテナが exit
- docker-compose の `restart: unless-stopped` により自動再起動 (要件不確定なため本書では `restart: on-failure` を推奨)
- ログに `Error: P3009` 等の Prisma エラーが出力される

### 5.3 マイグレーションファイル管理

- 開発時: `npm run prisma:migrate:dev -- --name <name>` でローカル生成
- 生成された `prisma/migrations/<timestamp>_<name>/` をコミット
- 本番起動時: `prisma migrate deploy` (新規生成しない、既存マイグレーションのみ適用)

#### 5.3.1 初回マイグレーション要件 (B-03 対応 — Code Generation 必須事項)

**背景**:
起動コマンドは `npx prisma migrate deploy && npm start` 固定だが、`prisma/migrations/` が空の状態で初回 `docker-compose up` を実行すると、`migrate deploy` は "No migration found" 警告のみで素通りし、SQLite ファイルにテーブルが作成されないまま `npm start` が立ち上がる。結果、API リクエストで `table not found` の 500 エラー (もしくは内部例外) が発生し、`restart: on-failure` と組み合わさってループ気味の挙動になる可能性がある。

**Code Generation 時の必須対応**:
1. **Code Generation の最終ステップで、Prisma スキーマに対して必ず 1 つ以上のマイグレーションを生成し、`backend/prisma/migrations/` 配下にコミットする**:
   ```bash
   cd backend
   # ローカルに dev 用 SQLite を作って初回マイグレーション SQL を生成
   DATABASE_URL='file:./prisma/dev.db' \
     npx prisma migrate dev --name init --create-only
   # (--create-only でファイル生成のみ。生成された SQL を確認後 commit)
   ```
   または `--create-only` を外して dev DB に適用までしてから生成物をコミットしてもよい。
2. **生成物としてコミットすべきもの**:
   - `backend/prisma/migrations/<timestamp>_init/migration.sql`
   - `backend/prisma/migrations/migration_lock.toml` (provider=sqlite を明示)
3. **検証**: `docker-compose build && docker-compose up backend-api` で、空ボリュームから起動した際に `prisma migrate deploy` が `1 migration applied` を出力し、`/api/health` が 200 を返すことを確認する。
4. **CI 観点**: `prisma/migrations/` ディレクトリが存在しないコミットはレビューでブロックする (Code Generation 完了基準)。

**README/起動手順への申し送り**:
- README の「初回起動手順」に **「`backend/prisma/migrations/` に 1 つ以上のマイグレーションがコミット済みであること」をチェックポイントとして明記** する。
- 起動失敗時のトラブルシュート節に「`migrate deploy` が `No migration found in prisma/migrations` を出力した場合、init マイグレーションが未生成 → Code Generation 手順をやり直す」旨を追記する。
- `.gitignore` で `backend/prisma/migrations/` が除外されていないことも確認する (除外されると Docker ビルド時にコピーされず再現性が壊れる)。

**フォールバック方針 (採用しない理由を明記)**:
- `prisma db push` を `migrate deploy` 前に実行する手も検討したが、PoC とはいえスキーマ進化の追跡性が落ちる (マイグレーション履歴が残らない) ため不採用。本書は **「init マイグレーションを必ずコミットする」運用** を採用する。

---

## 6. ログ出力

### 6.1 出力先

- **stdout**: 通常ログ (Next.js リクエストログ、`console.log`)
- **stderr**: エラーログ (`console.error`、未捕捉例外)

### 6.2 フォーマット

- Next.js デフォルトの非構造化ログ (PoC として十分)
- 将来構造化したい場合は `pino` 等を導入可能だが、本書スコープ外

### 6.3 ログレベル制御

- `NODE_ENV=production` 時は `console.debug` 抑制 (アプリ実装側責務)
- Prisma クエリログは `prisma.$on('query', ...)` で制御 (DEBUG=`prisma:*` 環境変数で詳細化可能)

### 6.4 ログ収集

- PoC: `docker-compose logs backend-api` で参照
- 集約 (CloudWatch / Loki 等) はスコープ外

---

## 7. docker-compose サービス定義 (backend-api 部分のみ)

リポジトリ root `docker-compose.yml` に追加するフラグメント。

```yaml
services:
  backend-api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: invoice-backend-api
    image: invoice-backend-api:local
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: file:/data/invoices.db
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      CORS_ALLOW_ORIGIN: http://localhost:3001
      NODE_ENV: production
    volumes:
      - backend-data:/data
    healthcheck:
      # I-02: 本文に "status":"ok" が含まれることまで検証 (BusyBox wget の判定不備対策)
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health | grep -q '\"status\":\"ok\"'"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
    restart: on-failure
    # frontend-ui 側で depends_on.condition: service_healthy を設定する想定

volumes:
  backend-data:
    driver: local
```

### 7.1 補足

- `container_name` 固定により `docker-compose logs backend-api` 等が安定動作
- `image` 指定により `docker-compose build` が再現可能なタグを生成
- `restart: on-failure`: マイグレーション失敗時の自動復旧
- frontend-ui の依存関係 (`depends_on`) は frontend-ui 側のインフラ設計書で定義

---

## 8. package.json scripts

`backend/package.json` の `scripts` セクション:

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "prisma generate && next build",
    "start": "next start -p 3000 -H 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio"
  }
}
```

### 8.1 スクリプト責務

| スクリプト | 用途 | 実行タイミング |
|---|---|---|
| `dev` | 開発用ホットリロード起動 | ローカル開発 |
| `build` | 本番ビルド (Prisma Client 生成 → Next ビルド) | Docker ビルド時 |
| `start` | 本番起動 | コンテナ起動時 |
| `test` | Vitest ユニットテスト (一回実行) | CI / 品質ゲート |
| `lint` | ESLint (警告ゼロ強制) | CI / 品質ゲート |
| `typecheck` | TypeScript 型チェック (出力なし) | CI / 品質ゲート |
| `prisma:generate` | Prisma Client 再生成 | スキーマ変更後 |
| `prisma:migrate:dev` | 開発用マイグレーション作成・適用 | スキーマ変更時 |
| `prisma:migrate:deploy` | 本番用マイグレーション適用 | コンテナ起動時 |
| `prisma:studio` | Prisma Studio (DB GUI) | 任意 (開発支援) |

---

## 9. next.config.js

### 9.1 設計判断

| 観点 | 採用案 | 理由 |
|---|---|---|
| `output: 'standalone'` | **不採用** | PoC、`npm start` 起動でシンプル。standalone は `.next/standalone/server.js` 起動が必要で、Prisma の `node_modules/.prisma/client` を手動コピーする必要があり alpine + Prisma 環境で複雑化する |
| `reactStrictMode` | `true` | React 18 の StrictMode で潜在バグを早期検知 |
| `poweredByHeader` | `false` | `X-Powered-By` ヘッダ削除 (情報隠蔽) |
| `experimental.serverComponentsExternalPackages` | `['@prisma/client', 'prisma']` | Server Component で Prisma を扱う場合のバンドル除外 (Next 15 では `serverExternalPackages` に変更されている可能性あり) |

### 9.2 next.config.js 完全内容

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Prisma / Next 15 互換 (Next 15 では `serverExternalPackages` がトップレベル)
  serverExternalPackages: ['@prisma/client', 'prisma'],

  // Vercel 非対象、ローカル docker-compose のみのため standalone は不採用
  // output: 'standalone',  // ← 採用しない (理由: 9.1 参照)

  // ロギングはデフォルト (PoC)
  logging: {
    fetches: {
      fullUrl: false
    }
  }
};

module.exports = nextConfig;
```

**補足**: Next 15 系列では `serverExternalPackages` が `experimental` から昇格しているため、Next 15.0+ ではトップレベル指定。Next 14 系を使う場合は `experimental.serverComponentsExternalPackages` に変更。

---

## 10. package.json 必要依存

### 10.1 dependencies

| パッケージ | 推奨バージョン | 用途 |
|---|---|---|
| `next` | `^15.0.0` | フレームワーク (Route Handlers) |
| `react` | `^18.3.0` | Next 15 の peerDep (バックエンドでも要求される) |
| `react-dom` | `^18.3.0` | 同上 |
| `@prisma/client` | `^5.20.0` | Prisma ランタイム |
| `zod` | `^3.23.0` | バリデーションスキーマ |

### 10.2 devDependencies

| パッケージ | 推奨バージョン | 用途 |
|---|---|---|
| `prisma` | `^5.20.0` | Prisma CLI / マイグレーション |
| `typescript` | `^5.5.0` | TypeScript コンパイラ |
| `@types/node` | `^20.14.0` | Node 型定義 |
| `@types/react` | `^18.3.0` | React 型定義 |
| `@types/react-dom` | `^18.3.0` | React DOM 型定義 |
| `vitest` | `^2.1.0` | テストランナー |
| `@vitest/coverage-v8` | `^2.1.0` | カバレッジ計測 (任意) |
| `eslint` | `^9.10.0` | Lint |
| `eslint-config-next` | `^15.0.0` | Next.js 推奨 ESLint 設定 |
| `@typescript-eslint/parser` | `^8.5.0` | TS Lint パーサ |
| `@typescript-eslint/eslint-plugin` | `^8.5.0` | TS Lint ルール |
| `prettier` | `^3.3.0` | フォーマッタ |

### 10.3 package.json 雛形

```json
{
  "name": "invoice-backend-api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "prisma generate && next build",
    "start": "next start -p 3000 -H 0.0.0.0",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings 0",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate:dev": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.20.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^8.5.0",
    "@typescript-eslint/parser": "^8.5.0",
    "@vitest/coverage-v8": "^2.1.0",
    "eslint": "^9.10.0",
    "eslint-config-next": "^15.0.0",
    "prettier": "^3.3.0",
    "prisma": "^5.20.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 10.4 package-lock.json

- **必ず生成・コミット** (CLAUDE.md 品質ゲート要件)
- 生成方法: ローカルで `npm install` を一度実行し、生成された `package-lock.json` をコミット
- Dockerfile 内では `npm ci` のみを使用 (lock 整合性チェックが入る)
- バージョン整合性チェック: CI で `npm ci` が成功することを検証

---

## 11. ビルド・実行手順 (README 用サマリ)

### 11.1 docker-compose 経由 (推奨)

```bash
# 事前チェック (B-03): backend/prisma/migrations/ に init マイグレーションがコミット済みであること
ls backend/prisma/migrations/   # 1 つ以上のディレクトリが見えること

# リポジトリ root にて
docker-compose build backend-api
docker-compose up backend-api
# 別ターミナルで
curl http://localhost:3000/api/health
# → {"status":"ok"} が返れば成功
```

**注 (B-03)**: `backend/prisma/migrations/` が空のままビルドすると、`prisma migrate deploy` が "No migration found" で素通りし、テーブル不在で API が 500 になる。Code Generation 時に init マイグレーションが生成・コミットされていることを必ず確認する。

### 11.2 単体 Docker 起動 (検証用)

```bash
cd backend
docker build -t invoice-backend-api:local .
docker volume create backend-data
docker run --rm -p 3000:3000 \
  -v backend-data:/data \
  -e CORS_ALLOW_ORIGIN=http://localhost:3001 \
  invoice-backend-api:local
```

### 11.3 ホスト直接起動 (開発)

```bash
cd backend
cp .env.example .env.local
# .env.local の DATABASE_URL を file:./prisma/dev.db に書き換え
npm ci
npm run prisma:migrate:dev
npm run dev
```

---

## 12. セキュリティ留意点 (PoC 範囲)

| 項目 | 対応 |
|---|---|
| 非 root 実行 | `USER node` で実施 (Dockerfile 1.2) |
| シークレット | 環境変数で注入、コンテナイメージに焼き込まない |
| `.env` のコミット | `.gitignore` で除外、`.env.example` のみコミット |
| `X-Powered-By` ヘッダ | `next.config.js` で `false` (9.2) |
| CORS | `CORS_ALLOW_ORIGIN` を明示指定、`*` を使わない |
| SQL Injection | Prisma 利用で防止 (生 SQL は使わない) |
| 認証強度 | 簡易ヘッダ認証 (PoC、本番は要置換) — application-design 7.1 参照 |

---

## 13. 制約・前提・スコープ外

### 13.1 スコープ内
- ローカル `docker-compose` での起動
- `Dockerfile` 単体での `docker build` / `docker run`
- 単一ノード SQLite

### 13.2 スコープ外
- Vercel デプロイ最適化
- Kubernetes / ECS / Cloud Run マニフェスト
- マルチノードレプリケーション
- ログ集約・APM 連携
- TLS 終端 (リバースプロキシは設けない、PoC)

---

## 14. 設計判断サマリ

| # | 判断項目 | 採用 | 理由 |
|---|---|---|---|
| 1 | ベースイメージ | `node:20-alpine` | 軽量、要件指定 |
| 2 | マルチステージ | 不採用 | PoC 簡素化 |
| 3 | `output: 'standalone'` | 不採用 | alpine + Prisma の複雑化回避 |
| 4 | 非 root 実行 | 採用 (`node`) | セキュリティ推奨 |
| 5 | マイグレーション | 起動時 `prisma migrate deploy` | 確実反映、自動化 |
| 6 | ヘルスチェック | `wget /api/health` (compose + Dockerfile 二重) | alpine 標準、堅牢 |
| 7 | ボリューム | `backend-data:/data` (named) | データ永続化、再構築耐性 |
| 8 | ログ | stdout/stderr 非構造化 | PoC 必要十分 |
| 9 | ロックファイル | `package-lock.json` 必須 + `npm ci` | CLAUDE.md 品質ゲート |
| 10 | 環境変数管理 | `.env.example` コミット、`.env` は除外 | 標準プラクティス |

---

## 15. 関連ドキュメント

- `aidlc-docs/inception/application-design/application-design.md`
- `aidlc-docs/inception/application-design/unit-of-work.md`
- `aidlc-docs/inception/application-design/unit-of-work-dependency.md`
- `aidlc-docs/inception/requirements/requirements.md`
- (将来) `aidlc-docs/construction/frontend-ui/infrastructure-design/infrastructure-design.md`
- (将来) ルート `docker-compose.yml`、`README.md`

---

## 修正履歴
- 2026-05-04 R1 → R2: B-01/B-02/B-03 解消、I-02/I-03/I-04 反映
  - B-03: §5.3.1 を新設し、Code Generation 時に最低 1 つのマイグレーション (`prisma migrate dev --name init` 由来) を `backend/prisma/migrations/` にコミットする要件を明記。README/起動手順 (§11.1) と起動失敗時のトラブルシュート手順への申し送りを追加
  - I-02: Dockerfile (§1.2) と docker-compose (§4.3 / §7) のヘルスチェックを `wget -qO- ... | grep -q '"status":"ok"'` に変更し、HTTP 5xx 誤判定を防止 (compose 側は `CMD-SHELL` でパイプを利用)
  - B-01 / B-02 / I-03 / I-04: Functional Design 側で対応 (`functional-design.md` 修正履歴参照)
