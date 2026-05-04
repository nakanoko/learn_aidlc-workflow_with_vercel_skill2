# Build Instructions

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. 前提条件

| 項目 | 推奨バージョン |
|---|---|
| Node.js | 20+ |
| npm | 10+ |
| Docker Desktop (or Docker Engine) | 24+ |
| OS | Windows 11 / macOS / Linux |

Docker Desktopが起動していない場合、本書の Docker 関連手順は実行できません。**ホストでDocker Desktopを起動してください**。

---

## 2. ローカルビルド (Docker未使用)

### 2.1 backend-api
```bash
cd backend
npm ci                          # package-lock.json から再現可能インストール
cp .env.example .env            # 環境変数ファイル作成
npx prisma generate             # Prisma Client 生成 (1回目のみ必須)
npx prisma migrate dev --name init    # init マイグレーションを適用 (DB ファイル作成)
npm run build                   # Next.js プロダクションビルド
npm start                       # http://localhost:3000 で起動
```

期待結果:
- `.next/` ディレクトリ生成
- ビルド成功ログ: `✓ Compiled successfully`

### 2.2 frontend-ui
```bash
cd frontend
npm ci
cp .env.example .env
npm run build                   # Vite プロダクションビルド (dist/ 生成)
npm run preview                 # http://localhost:3001 でプレビュー起動
```

期待結果:
- `dist/index.html` + `dist/assets/*.{js,css}` 生成
- ビルドログ: `✓ built in Xs`

---

## 3. Docker ビルド

### 3.1 個別ビルド
```bash
# backend
docker build -t invoice-backend-api:local ./backend

# frontend (build-arg で API base URL を埋め込む)
docker build --build-arg VITE_API_BASE_URL=http://localhost:3000 \
  -t invoice-frontend-ui:local ./frontend
```

### 3.2 docker-compose で一括ビルド (推奨)
```bash
# プロジェクトルートで
docker compose build
# または個別に
docker compose build backend-api
docker compose build frontend-ui
```

期待結果:
- `Image invoice-backend-api:local Built`
- `Image invoice-frontend-ui:local Built`

---

## 4. ビルド成功の確認方法

### 4.1 ローカルビルド
```bash
# backend
ls backend/.next/                # 存在すれば OK
# frontend
ls frontend/dist/                # index.html, assets/ があれば OK
```

### 4.2 Docker ビルド
```bash
docker images | grep invoice
# invoice-backend-api:local ... が表示されれば OK
# invoice-frontend-ui:local ... が表示されれば OK
```

---

## 5. ビルド失敗時のトラブルシュート

### Backend
| エラー | 原因 | 対処 |
|---|---|---|
| `Cannot find module '@prisma/client'` | Prisma Client未生成 | `npx prisma generate` 実行 |
| `npm error code ERESOLVE` | peer 依存衝突 | `npm install --legacy-peer-deps` (一時的) または依存バージョン更新 |
| `Type error: ...` | TypeScript エラー | `npx tsc --noEmit` で詳細確認 |
| `Migration directory not found` | init migration がコミットされていない | `cd backend && npx prisma migrate dev --name init` で生成 |

### Frontend
| エラー | 原因 | 対処 |
|---|---|---|
| `peer eslint@... required` | ESLint バージョン衝突 | `eslint-plugin-react-hooks@^5` を使用 |
| `EACCES: permission denied` (vite preview) | コンテナ内ユーザー権限 | Dockerfile で `--chown=node:node` 利用済 (修正済) |
| `vite-config not found` | tsconfig references 衝突 | tsconfig.json から `"references"` を削除 (修正済) |

### Docker
| エラー | 原因 | 対処 |
|---|---|---|
| `Cannot connect to the Docker daemon` | Docker未起動 | Docker Desktop 起動 |
| `unhealthy` (backend) | localhost が IPv6 解決され失敗 | healthcheck を `127.0.0.1` に変更 (修正済) |
| `port already in use` | ポート競合 | `docker compose down` 後にポートを確認 (`netstat -an | grep 3000`) |
