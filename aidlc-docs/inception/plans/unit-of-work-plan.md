# Unit of Work Plan

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**目的**: システムを開発単位 (Units of Work) に分解し、並列開発を可能にする

---

## 提案するユニット分解

要件・Application Design から導かれる自然な分割:

| Unit Name | 種別 | 内容 | デプロイ単位 |
|---|---|---|---|
| **backend-api** | Service | Next.js Route Handlers + Service + Repository + Prisma + SQLite | 独立コンテナ (port 3000) |
| **frontend-ui** | Service | React + Vite + Tailwind + React Router + apiClient | 独立コンテナ (port 3001) |

両ユニットは API 契約 (`api-contract.md`) のみで結合され、独立して開発・テスト・デプロイが可能。

---

## 確認質問

### Question U1: ユニット分解の妥当性
上記2ユニット分解で進めますか?

A) Yes — backend-api / frontend-ui の2ユニット (推奨)
B) さらに分割 — 例: backend-api を invoice-service と audit-log-service に分ける
C) 統合 — Next.js フルスタック1ユニットに統合 (要件と齟齬あり、推奨せず)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question U2: リポジトリ構成 (ディレクトリ構造)
プロジェクトのディレクトリ構成は?

A) シンプル分離 — ルート直下に `backend/` と `frontend/` を配置 (PoC向け、推奨)
   ```
   /
   ├── backend/        (Next.js + Prisma)
   ├── frontend/       (Vite + React)
   ├── docker-compose.yml
   ├── README.md
   └── aidlc-docs/
   ```
B) Monorepo (npm workspaces) — `packages/backend/`, `packages/frontend/`
C) 別Gitリポジトリ — 1リポジトリ1ユニット (PoCではOver-engineering)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question U3: 共有コードの扱い
TypeScriptの型定義 (Invoice, AuditLog 等) は両ユニットで使うが、共有方法は?

A) 共有しない — 各ユニットで個別に型定義 (PoC、シンプル、ただし二重メンテ)
B) shared/ ディレクトリに置き、両ユニットからシンボリックリンク or 相対参照
C) npm workspaces で `packages/shared` として共通化
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 計画タスクチェックリスト (回答後実行)

- [〇] `unit-of-work.md` (ユニット定義、責務、コード組織方針)
- [〇] `unit-of-work-dependency.md` (ユニット間依存マトリクス、API契約参照)
- [〇] `unit-of-work-story-map.md` (要件 FR-XX とユニットの対応マップ)
- [〇] ユニット境界とリポジトリ・依存性が整合することの検証

---

## 補足

[Notes]: 
