# Infrastructure Design — frontend-ui

**プロジェクト**: 請求書チェック・承認Webシステム
**ユニット**: frontend-ui
**作成日**: 2026-05-04
**ステージ**: Construction - Infrastructure Design

---

## 0. 概要と前提

| 項目 | 値 |
|---|---|
| 種別 | Service (独立コンテナ) |
| 技術 | React 18 + Vite 5 + TypeScript + Tailwind CSS + React Router v6 + Zod |
| 公開ポート | 3001 |
| 配信方式 | `vite preview` (Vite 内蔵プレビューサーバ) |
| ベースイメージ | `node:20-alpine` (builder / runner 共通) |
| ビルド成果物 | `dist/` (静的ファイル) |
| 接続先 | backend-api (`http://localhost:3000`、CORS 許可前提) |
| 環境変数 | `VITE_API_BASE_URL` (build-time) |

### 0.1 配信方式の判断 — `vite preview` を採用する理由

候補は (1) `serve` などの軽量 HTTP サーバ (2) `vite preview` (3) `nginx:alpine` の3つ。本ユニットでは **`vite preview` を採用** する。

| 観点 | vite preview | serve | nginx |
|---|---|---|---|
| 追加依存 | 不要 (Vite 同梱) | `serve` 追加必要 | 別ベースイメージ |
| イメージサイズ | 中 (Node ランタイム同梱) | 中 (同上) | 小 |
| SPA history fallback | デフォルト対応 | `-s` フラグで対応 | 設定要 |
| 設定の単純さ | ◎ `vite.config.ts` に集約 | ○ | △ |
| PoC 用途への適性 | ◎ | ○ | △ |
| 本番性能 | △ (本番想定外) | △ | ◎ |

**判断**: PoC 用途であり、本番性能 / イメージサイズより **設定の単純さと開発体験の一貫性** を優先する。Vite が `vite preview` を「ビルド成果物の静的検証用サーバ」として明示的に提供しており、SPA のヒストリーフォールバックも自動で効く。Node 20-alpine ランタイムは builder と共通化できるためマルチステージのキャッシュも効きやすい。本番デプロイ時は nginx に置換する選択肢を README に注記する。

---

## 1. Dockerfile 設計 (マルチステージビルド)

### 1.1 完全な内容

`frontend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7

############################
# Stage 1: builder
############################
FROM node:20-alpine AS builder

WORKDIR /app

# package manifest を先にコピーして依存解決層をキャッシュ可能にする
COPY package.json package-lock.json ./

# 再現性のあるインストール (CLAUDE.md 品質ゲート要件)
RUN npm ci

# ソース一式をコピー
COPY . .

# build-time に Vite が VITE_* を埋め込むため、ARG 経由で受け取る
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Tailwind / TypeScript / Vite ビルド (出力: dist/)
RUN npm run build

############################
# Stage 2: runner
############################
FROM node:20-alpine AS runner

WORKDIR /app

# preview 実行に必要な最小限のみ
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# preview には Vite 自身が必要なので package.json/lock と node_modules を持ち込む
# devDependencies を含むがイメージ用途は PoC 内部限定なので許容
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# 非rootユーザーで起動 (node:20-alpine は標準で `node` ユーザー有り)
USER node

EXPOSE 3001

# HEALTHCHECK: preview サーバの "/" が 200 を返すこと
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null 2>&1 || exit 1

# strictPort:true なので 3001 が空いていない場合は即時失敗する
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3001"]
```

### 1.2 設計上のポイント

- **マルチステージ**: builder と runner を分離し、`dist/` のみが本番関心領域。ただし `vite preview` 実行のため `node_modules` は runner 段階にもコピー(`serve` を選ばなかった代償)。
- **依存解決層キャッシュ**: `package*.json` 先行コピー → `npm ci` → ソース → `build` の順で Docker レイヤキャッシュを最大化。
- **`npm ci` 採用**: CLAUDE.md 品質ゲート要件 (package-lock.json 整合性、再現性ある依存解決) に準拠。
- **build-time ARG**: Vite は `VITE_*` を **ビルド時** に埋め込む。runtime ENV では反映できないため `ARG` で受ける。docker-compose 側で `args:` を渡す。
- **HEALTHCHECK**: preview サーバの `/` が 200 を返すかを `wget` で確認 (alpine 標準同梱)。

---

## 2. vite.config.ts 設計

`frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
  },
  server: {
    // dev (vite) 用
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
  },
  preview: {
    // 本ユニットは preview をプロダクション配信に使う
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    // SPA のため history fallback はデフォルトで有効
  },
});
```

### 2.1 ポイント
- `host: '0.0.0.0'`: コンテナ内バインドが必須(127.0.0.1 だとホストから到達不可)。
- `strictPort: true`: ポート衝突時にフォールバックせず失敗させ、構成エラーを早期検知。
- `outDir: 'dist'`: Dockerfile の `COPY --from=builder /app/dist` と一致。
- `sourcemap: false`: PoC のため成果物サイズを抑制。

---

## 3. 環境変数

### 3.1 環境変数一覧

| 変数 | 必須 | デフォルト | スコープ | 用途 |
|---|---|---|---|---|
| `VITE_API_BASE_URL` | ○ | `http://localhost:3000` | build-time | apiClient のベース URL |
| `NODE_ENV` | - | `production` | runtime | preview サーバ標準 |
| `PORT` | - | `3001` | runtime | preview ポート (Dockerfile が固定) |
| `HOST` | - | `0.0.0.0` | runtime | preview バインド先 |

> **注意**: Vite の `import.meta.env.VITE_*` は **ビルド時** に文字列として埋め込まれる。runtime に変更しても反映されない。compose では `build.args` 経由で渡すこと。

### 3.2 `.env.example`

`frontend/.env.example`

```env
# Backend API Base URL (build-time, embedded into bundle)
# - Local docker-compose: http://localhost:3000
# - Browser will call this URL directly (CORS_ALLOW_ORIGIN must allow http://localhost:3001)
VITE_API_BASE_URL=http://localhost:3000
```

`.env` は Vite が build 時に自動読込する (`.env`, `.env.production` など)。

---

## 4. docker-compose サービス定義 (frontend-ui 部分)

ルートの `docker-compose.yml` に追加する `frontend-ui` フラグメント。

```yaml
services:
  frontend-ui:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        # build-time に Vite が import.meta.env.VITE_API_BASE_URL に埋め込む
        VITE_API_BASE_URL: http://localhost:3000
    image: invoice-frontend-ui:local
    container_name: invoice-frontend-ui
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
    depends_on:
      backend-api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/"]
      interval: 15s
      timeout: 3s
      retries: 5
      start_period: 10s
    restart: unless-stopped
    # ブラウザから http://localhost:3001 で到達
```

### 4.1 起動順序
- `backend-api` の `service_healthy` を待ってから起動 (CORS Preflight が即座に成功するように)。
- ただしブラウザは frontend を先に取得しても、初回 API 呼び出し時に backend が立ち上がっていれば良いので、`condition: service_started` でも実害は無い。本設計では UX 一貫性のため `service_healthy` を選ぶ。

### 4.2 ネットワーク
- compose のデフォルトブリッジネットワークで `backend-api` と同一セグメント。ただしブラウザが直接 `http://localhost:3000` を叩くため、フロントから backend へのコンテナ間 DNS は使わない (`VITE_API_BASE_URL` はホスト側 URL)。

---

## 5. package.json scripts

`frontend/package.json` の `scripts`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```

| スクリプト | 用途 |
|---|---|
| `dev` | 開発用ホットリロード (`http://localhost:3001`) |
| `build` | TypeScript 型チェック + Vite 本番ビルド (`dist/` 生成) |
| `preview` | ビルド成果物を Docker / ローカルで静的配信 |
| `test` | Vitest 一回実行 (CI 向け) |
| `test:watch` | Vitest watch モード |
| `lint` | ESLint チェック |
| `typecheck` | TypeScript 型チェック単独 (品質ゲート用) |

---

## 6. package.json 必要依存

### 6.1 dependencies

| パッケージ | バージョン目安 | 用途 |
|---|---|---|
| `react` | `^18.3.0` | UI ライブラリ本体 |
| `react-dom` | `^18.3.0` | DOM レンダラ |
| `react-router-dom` | `^6.26.0` | クライアント側ルーティング |
| `zod` | `^3.23.0` | フォーム入力バリデーション |

### 6.2 devDependencies

| パッケージ | バージョン目安 | 用途 |
|---|---|---|
| `vite` | `^5.4.0` | バンドラ / dev サーバ / preview サーバ |
| `@vitejs/plugin-react` | `^4.3.0` | React JSX / Fast Refresh プラグイン |
| `typescript` | `^5.5.0` | 型システム |
| `@types/react` | `^18.3.0` | React 型 |
| `@types/react-dom` | `^18.3.0` | React DOM 型 |
| `@types/node` | `^20.14.0` | Node 型 (vite.config.ts の `path` 用) |
| `tailwindcss` | `^3.4.0` | ユーティリティ CSS |
| `postcss` | `^8.4.0` | Tailwind の前提 |
| `autoprefixer` | `^10.4.0` | ベンダープレフィックス |
| `vitest` | `^2.0.0` | テストランナー |
| `@vitest/ui` | `^2.0.0` | Vitest UI (任意、ローカル用) |
| `jsdom` | `^25.0.0` | テスト用 DOM |
| `@testing-library/react` | `^16.0.0` | コンポーネントテスト |
| `@testing-library/jest-dom` | `^6.5.0` | アサーション拡張 |
| `@testing-library/user-event` | `^14.5.0` | ユーザー操作シミュレート |
| `eslint` | `^9.9.0` | Lint |
| `@typescript-eslint/parser` | `^8.0.0` | TypeScript ESLint パーサ |
| `@typescript-eslint/eslint-plugin` | `^8.0.0` | TypeScript ESLint ルール |
| `eslint-plugin-react` | `^7.35.0` | React Lint ルール |
| `eslint-plugin-react-hooks` | `^4.6.0` | Hooks Lint ルール |
| `prettier` | `^3.3.0` | フォーマッタ |

> **注**: 厳密なバージョンは `npm install` 時に解決し、`package-lock.json` を生成・コミットする (CLAUDE.md 品質ゲート要件)。

---

## 7. tailwind.config.js + postcss.config.js

### 7.1 `frontend/tailwind.config.js`

design.md のカラートークンのうち **primary 4階調のみ** を `theme.extend.colors` に反映する。

**カスタムトークン方針 (FD §3.1.2 / §3.4.2 と整合、I-05 / I-06 反映)**:
- StatusBadge / Toast は **Tailwind 標準パレット** (`bg-amber-100`, `bg-emerald-50`, `bg-red-50` 等) を使用する。
- そのため、以前の R1 案にあった `colors.status.*` (pending/approved/rejected/mismatch) と `successBg` / `errorBg` / `warningBg` の **カスタムトークンは定義しない**(未使用化を防ぐためトークン側を削除)。
- design.md §2.3 のセマンティック値 (例: warning 背景 `#FFFBEB`) と Tailwind 標準パレット (`amber-50` = `#FFFBEB`) は等価のため、意味上の整合は保たれる。

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // === Primary brand (design.md §2.1) ===
        primary: {
          900: '#0B2545', // ヘッダー背景、強い見出し
          700: '#13315C', // プライマリボタン、ナビ強調
          500: '#1E5DB1', // リンク、アクセント
          100: '#E6EEFA', // primary hover背景、薄背景
        },
        // status / 補助背景は Tailwind 標準パレット (amber/emerald/red/gray) を直接使用する方針のため
        // ここではカスタムトークンを定義しない (FD §3.1.2 / §3.4.2 と整合、I-05 / I-06)
      },
      fontFamily: {
        sans: [
          'Noto Sans JP',
          'Hiragino Sans',
          'Yu Gothic',
          'Meiryo',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'Noto Sans Mono',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      borderRadius: {
        // design.md §5.1
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
```

### 7.2 `frontend/postcss.config.js`

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## 8. index.html / src/main.tsx / src/index.css (最小骨格)

### 8.1 `frontend/index.html`

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>請求書チェック・承認システム</title>
    <link
      rel="preconnect"
      href="https://fonts.googleapis.com"
    />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap"
    />
  </head>
  <body class="bg-gray-50 text-gray-900 font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 8.2 `frontend/src/main.tsx`

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

### 8.3 `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* design.md §3.1 タイポグラフィ既定値 */
@layer base {
  html {
    font-family:
      'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo',
      system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply bg-gray-50 text-gray-900;
    line-height: 1.6;
  }

  /* フォーカスリング標準 (design.md §9) */
  :focus-visible {
    @apply outline-none ring-2 ring-primary-500 ring-offset-2;
  }

  /* 数値用等幅 */
  .num {
    font-family: 'Noto Sans Mono', 'Menlo', 'Consolas', monospace;
    font-variant-numeric: tabular-nums;
  }
}
```

---

## 9. ヘルスチェック

### 9.1 Docker レベル
Dockerfile および docker-compose にて `wget -qO- http://127.0.0.1:3001/` が 200 を返すかをチェック。
- `vite preview` は SPA の history fallback により `/` で常に `index.html` を 200 で返すため、ヘルス指標として有効。
- `wget` は alpine 標準 (`busybox` 提供) なので追加インストール不要。

### 9.2 パラメータ理由

| パラメータ | 値 | 理由 |
|---|---|---|
| `interval` | 15s | preview は軽量、過度なポーリング不要 |
| `timeout` | 3s | ローカル `127.0.0.1` への接続は瞬時 |
| `start-period` | 10s | Vite preview は数秒で起動 |
| `retries` | 5 | 一時的な遅延を許容、計75秒で unhealthy |

### 9.3 アプリケーションレベル
本ユニットには専用の `/health` エンドポイントは設けない (静的配信 SPA のため)。`/` の 200 応答を以ってヘルスとみなす。

---

## 10. CORS への期待

本ユニットは backend-api 側で **CORS が以下のように設定されていることを前提** とする。

| 項目 | 期待値 |
|---|---|
| `Access-Control-Allow-Origin` | `http://localhost:3001` |
| `Access-Control-Allow-Methods` | `GET, POST, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, X-Actor-Id, X-Approver-Id` |
| `Access-Control-Max-Age` | 600 (推奨、preflight キャッシュ) |
| `Access-Control-Allow-Credentials` | 不要 (本 PoC は cookie/session 未使用) |

backend-api の `withCors` ミドルウェア + 環境変数 `CORS_ALLOW_ORIGIN=http://localhost:3001` で実現。

### 10.1 frontend-ui 側の責務

- Origin ヘッダーは fetch が自動付与するためコード対応不要。
- `apiClient.ts` は `credentials: 'omit'` を明示し、preflight 範囲を最小化。
- `X-Actor-Id` / `X-Approver-Id` カスタムヘッダーが preflight 対象になることを認識。

---

## 11. ファイル一覧 (本ユニットで生成・配置するもの)

```
frontend/
├── Dockerfile                      ← §1
├── .dockerignore                   ← node_modules, dist, tests, .env など
├── .env.example                    ← §3.2
├── index.html                      ← §8.1
├── package.json                    ← §5, §6
├── package-lock.json               ← npm install で自動生成 (要コミット)
├── postcss.config.js               ← §7.2
├── tailwind.config.js              ← §7.1
├── tsconfig.json                   ← (functional-design 側)
├── vite.config.ts                  ← §2
└── src/
    ├── index.css                   ← §8.3
    ├── main.tsx                    ← §8.2
    └── ...                         ← (functional-design / code-generation 側)
```

### 11.1 推奨 `.dockerignore`

```dockerignore
node_modules
dist
.git
.gitignore
.env
.env.local
.env.development
.env.production
.vscode
.idea
tests/__snapshots__
coverage
*.log
README.md
```

`.env*` は `.dockerignore` に含めて、ビルド時に意図せず混入することを防ぐ。`VITE_API_BASE_URL` は `build.args` 経由のみとする。

---

## 12. 品質ゲート対応マトリクス (CLAUDE.md §5)

| 要件 | 対応 |
|---|---|
| ビルド成功 | `npm run build` (TypeScript + Vite) |
| テスト成功 | `npm test` (Vitest) |
| Lint / 静的解析成功 | `npm run lint` (ESLint) |
| 型チェック成功 | `npm run typecheck` (`tsc --noEmit`) |
| docker-compose 起動可能 | §4 で定義、`depends_on: service_healthy` |
| README 手順で再現 | §3.2 .env.example、`npm ci` 前提を README に記載 |
| package-lock.json 生成 | §6 注記、`npm install` 後にコミット |
| Dockerfile で `npm ci` 使用 | §1.1 builder 段階で `npm ci` |
| `npm ci` 成功確認 | builder 段階で失敗するとビルドが進まないため強制保証 |
| package.json と lock 整合 | `npm ci` が整合性を機械的に検証 |

---

## 13. リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| `VITE_API_BASE_URL` 変更時にイメージ再ビルドが必要 | 環境ごとに別イメージ | 本番では nginx + 環境変数置換 (envsubst) パターンに移行 (Out of Scope) |
| `vite preview` は本番想定外 | 高負荷時に未検証 | PoC 範囲では問題なし、本番は nginx 化を README に注記 |
| node_modules を runner にコピー | イメージサイズ増 | 本 PoC では許容、本番は serve または nginx に置換 |
| CORS 設定漏れ | API 呼び出し全失敗 | docker-compose で `CORS_ALLOW_ORIGIN` を一元管理、起動チェックを README に記載 |
| `strictPort:true` でポート衝突時に即時失敗 | 起動失敗 | 早期検知のため意図的、エラー時は README で `lsof -i :3001` を案内 |

---

## 14. 完了定義 (Infrastructure 観点)

- [ ] `frontend/Dockerfile` がマルチステージで定義され、`npm ci` を使用している
- [ ] `frontend/vite.config.ts` の preview/server が `0.0.0.0:3001` strictPort で定義済
- [ ] `frontend/.env.example` に `VITE_API_BASE_URL` が記載
- [ ] `frontend/tailwind.config.js` に design.md のカラートークンが反映
- [ ] `frontend/postcss.config.js` が tailwindcss + autoprefixer を読込
- [ ] `frontend/index.html` / `src/main.tsx` / `src/index.css` の最小骨格が用意
- [ ] ルート `docker-compose.yml` に frontend-ui サービス定義が追加され、`backend-api` の service_healthy を待つ
- [ ] HEALTHCHECK が `/` 200 応答で判定される
- [ ] `package.json` に dev/build/preview/test/lint/typecheck スクリプト存在
- [ ] `package-lock.json` 生成済 (要コミット)

---

## 修正履歴
- 2026-05-04 R1 → R2: B-01/B-02 解消、I-04/I-05/I-06/I-10 反映 (FD と整合)
  - I-05 / I-06: §7.1 `tailwind.config.js` から `colors.status.*` (pending/approved/rejected/mismatch) と `successBg` / `errorBg` / `warningBg` のカスタムトークン定義を削除。FD §3.1.2 / §3.4.2 で採用した Tailwind 標準パレット使用方針に整合させ、未使用トークンによる乖離を解消。
  - B-01 / B-02 / I-04 / I-10 は FD 側の修正に閉じる (ID 側に直接の影響なし)。
  - その他 §1〜§6, §8〜§14 は変更なし。
