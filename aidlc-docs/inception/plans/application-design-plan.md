# Application Design Plan & Questions

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**目的**: アプリケーション設計に必要な追加判断ポイントを確認する

---

## 設計タスクチェックリスト

- [〇] components.md (コンポーネント定義と責務)
- [〇] component-methods.md (各コンポーネントの主要メソッド)
- [〇] services.md (サービス層、オーケストレーション)
- [〇] component-dependency.md (コンポーネント依存関係)
- [〇] application-design.md (上記を統合した設計書)
- [〇] design.md (FSI参考デザインガイド、UI/UXトーン&マナー)
- [〇] api-contract.md (フロント・バック分離のため、API仕様を先行確定)

---

## 確認質問

### Question A1: バックエンドのレイヤ構造
バックエンド (Next.js Route Handlers) の内部レイヤ構成は?

A) シンプル3層 — `route → service → repository` (Prisma直接) ※ 推奨
B) 詳細4層 — `route → controller → service → repository`
C) 最小構成 — `route` 内に直接ロジック (PoCのみ、推奨せず)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A2: APIパス・バージョニング
APIエンドポイントのパス設計は?

A) `/api/invoices`, `/api/audit-logs` (バージョンなし、シンプル)
B) `/api/v1/invoices`, `/api/v1/audit-logs` (バージョニングあり)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A3: フロントエンドのデータ取得
フロントエンドのAPI呼び出し・状態管理は?

A) fetch + React useState/useReducer (PoC向け、最小構成)
B) TanStack Query (React Query) でキャッシュ・再フェッチ管理
C) SWR
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A4: バリデーションスキーマの共有
Zodスキーマをフロント・バック間で共有しますか?

A) 共有しない — フロント・バックでそれぞれ別途Zodスキーマを定義 (シンプル、依存なし)
B) 共有する — 共有パッケージ (workspaces または npm pack 利用) 経由で共通化
C) 型のみ共有 — TypeScriptの型定義のみコピー、Zodスキーマは別管理
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A5: エラーレスポンスフォーマット
APIエラーレスポンスの形式は?

A) シンプル — `{ "error": "メッセージ" }` + 適切なHTTPステータス
B) 構造化 — `{ "error": { "code": "...", "message": "...", "details": [...] } }` + HTTPステータス
C) RFC 7807 (Problem Details) 準拠
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A6: CORS設定
フロントエンドとバックエンドが別オリジンで動くため、CORSの方針は?

A) 開発環境では緩く、Originヘッダーで許可 (フロント `http://localhost:3001` を許可)
B) すべてのオリジンを許可 (`*`、PoCのみ、推奨せず)
C) 環境変数で許可オリジンを制御
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A7: フロントUIフレームワーク
React + Vite 上で利用するUIライブラリは?

A) Tailwind CSS のみ (ユーティリティCSS、軽量)
B) Tailwind CSS + shadcn/ui (コンポーネント集、モダン)
C) Material-UI (MUI)
D) UIライブラリ未使用 (素のCSS/CSS Modules)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question A8: ルーティング (フロントエンド)
画面遷移用のルータは?

A) React Router v6 (シングルページアプリのデファクト)
B) TanStack Router
C) ルータ無し — 単一画面で表示切替 (PoCのみ)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 補足
特記事項があれば自由記述してください。

[Notes]: 

---

**回答完了後、application-design.md / design.md / api-contract.md などを生成し、設計レビューに進みます。**
