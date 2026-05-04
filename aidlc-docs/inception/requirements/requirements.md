# 要件定義書 (Requirements)

**プロジェクト**: 請求書チェック・承認Webシステム (Invoice Check & Approval Web System)
**作成日**: 2026-05-04
**バージョン**: 1.0
**ステージ**: Inception - Requirements Analysis

---

## 1. Intent Analysis

| 項目 | 内容 |
|---|---|
| **User Request** | 経理担当の請求書目視チェックをAPI化し、確認漏れ・二重支払を防ぐ |
| **Request Type** | New Project (Greenfield) |
| **Scope Estimate** | System-wide(フルスタックWebシステム + DB + Docker) |
| **Complexity Estimate** | Moderate(承認ワークフロー、状態遷移、監査ログ) |
| **Depth Level** | Standard |
| **Project Profile** | 社内向けPoCレベルの小規模システム |

---

## 2. 業務背景 (Business Context)

経理担当が、取引先から届いた請求書を目視で以下のチェックをして承認している:
- 発注金額と請求金額の一致確認
- 請求番号の重複チェック
- 承認者の承認記録

これをExcelで管理しているが、以下の問題がある:
- 確認漏れによる過誤払い
- 二重支払のリスク
- 監査証跡の手動管理コスト

本システムは、これらをAPIベースで自動化し、確認・承認のワークフローを電子化する。

---

## 3. ステークホルダー & ペルソナ

| ペルソナ | 役割 | 主な操作 |
|---|---|---|
| 経理担当 (Accountant) | 請求書登録・一覧確認・差戻し起票 | 請求書登録、ステータス検索、差戻し |
| 承認者 (Approver) | 請求書承認 | 一覧確認、承認 |
| 監査担当 (Auditor) | 監査ログの確認 | 監査ログ閲覧 |

---

## 4. 機能要件 (Functional Requirements)

### 4.1 請求書登録 (FR-01)
- 請求書を登録できる
- 入力項目:
  - 請求番号 (invoice_number, 文字列, 必須)
  - 取引先ID (vendor_id, 文字列, 必須)
  - 請求金額 (invoice_amount, JPY整数, 必須, ≥0)
  - 発注金額 (purchase_order_amount, JPY整数, 必須, ≥0)
  - 支払期限 (due_date, 日付, 必須)
- 登録時に以下のバリデーション:
  - 重複チェック: 同じ取引先ID + 請求番号の組み合わせが既に存在する場合は登録不可(409 Conflict)
  - 必須項目欠落・型不正は 400 Bad Request
- 登録時の自動判定:
  - 請求金額 = 発注金額 ⇒ ステータス `pending`
  - 請求金額 ≠ 発注金額 ⇒ ステータス `mismatch`
- 登録イベントは監査ログに記録

### 4.2 請求書承認 (FR-02)
- 承認者IDを指定して請求書を承認できる
- 制約:
  - `mismatch` ステータスの請求書は承認不可(422 Unprocessable Entity)
  - `approved` 済みの請求書は再度承認不可(409 Conflict)
  - `rejected` の請求書は承認不可(編集後再提出 → pending 経由のみ)
- 承認時記録:
  - 承認者ID (approver_id)
  - 承認日時 (approved_at, ISO 8601 UTC)
  - ステータス → `approved`
- 承認イベントは監査ログに記録

### 4.3 請求書差戻し (FR-03)
- 請求書を差戻しできる
- 必須入力:
  - 差戻し理由 (rejection_reason, 文字列, 必須, 1文字以上)
  - 差戻し者ID (rejected_by, 文字列, 必須)
- 差戻し可能な対象:
  - `pending` または `mismatch` の請求書
  - `approved` の請求書は差戻し不可(409 Conflict)
- 差戻し時記録:
  - 差戻し理由、差戻し者ID、差戻し日時
  - ステータス → `rejected`
- 差戻しイベントは監査ログに記録

### 4.4 差戻し後の再提出 (FR-04)
- `rejected` ステータスの請求書は編集して再提出できる
- 編集可能なフィールド: 請求金額、発注金額、支払期限
- 編集不可: 請求番号、取引先ID(IDシップを保つため)
- 再提出時:
  - 金額一致 ⇒ ステータス `pending`
  - 金額不一致 ⇒ ステータス `mismatch`
- 再提出イベントは監査ログに記録(操作種別: `resubmit`)

### 4.5 請求書削除 (FR-05)
- 請求書を削除できる(物理削除ではなく論理削除を採用)
- `approved` 済みの請求書は削除不可(409 Conflict)
- 削除イベントは監査ログに記録

### 4.6 ステータス検索 (FR-06)
- ステータスをクエリパラメータとして請求書を一覧検索できる
- パラメータ:
  - `status` (任意): `pending` / `approved` / `rejected` / `mismatch`
  - 未指定の場合は削除済みを除く全件
- レスポンス:
  - 配列形式(請求書情報)
  - 件数(total)
  - ページング(limit/offset)対応(任意・デフォルト limit=50)

### 4.7 監査ログ記録 (FR-07)
- 主要操作(登録・承認・差戻・再提出・削除)を監査ログに記録する
- 記録項目:
  - イベントID (UUID)
  - 操作種別 (action: `create`, `approve`, `reject`, `resubmit`, `delete`)
  - 操作者ID (actor_id)
  - 対象請求書ID (invoice_id)
  - 操作日時 (created_at, ISO 8601 UTC)
  - 操作前ステータス (before_status, 任意)
  - 操作後ステータス (after_status, 任意)
  - 補足 (note: 差戻し理由など, 任意)

### 4.8 ステータス定義
```
pending     ─登録時(金額一致)─►
mismatch    ─登録時(金額不一致)─► (承認不可)
approved    ─承認後─► (削除・差戻し不可)
rejected    ─差戻し後─► (再提出可能 → pending または mismatch に戻る)
```

---

## 5. 非機能要件 (Non-Functional Requirements)

### 5.1 パフォーマンス
- 同時接続: 10ユーザー以下
- データ規模: 請求書数 < 10,000件
- API応答時間: 95パーセンタイル < 500ms (ローカル環境基準)

### 5.2 セキュリティ
- 認証: 簡易認証(ヘッダー `X-Actor-Id`、`X-Approver-Id` で操作者を識別、PoC向け)
- セキュリティベースライン拡張: **無効**(PoC向け)
- ただし基本的な対策は実施:
  - SQL Injection防止(Prisma ORM経由)
  - 入力バリデーション(Zod等のスキーマライブラリ)
  - CORS適切設定
  - CSRF対策はSession非利用のためAPI設計上不要

### 5.3 可用性 / 信頼性
- ローカル開発環境での動作を保証
- データ永続化: SQLite(コンテナマウントボリューム)

### 5.4 保守性
- TypeScript で型安全
- 型チェック・Lintが成功すること
- ユニットテストが成功すること

### 5.5 テスト戦略
- **範囲**: 主要ハンドラ(API)のユニットテストのみ
- **PBT拡張**: 無効
- **カバレッジ目標**: 主要ビジネスロジック(登録/承認/差戻/再提出/監査ログ)を正常系・異常系で網羅

### 5.6 デプロイ
- ローカル開発環境のみ(docker-compose 起動)
- Vercel・本番デプロイは対象外

---

## 6. 技術構成 (Technical Stack)

| レイヤ | 技術 |
|---|---|
| フロントエンド | React + Vite + TypeScript |
| バックエンド | Next.js 15 (Route Handlers, App Router, API専用) + TypeScript |
| ORM | Prisma |
| データベース | SQLite |
| バリデーション | Zod |
| テスト | Vitest |
| Lint/Format | ESLint + Prettier |
| コンテナ | Docker / docker-compose |

**構成方針**: フロントエンド・バックエンドを完全分離。それぞれ別コンテナで起動する。

---

## 7. データモデル (Logical)

### 7.1 Invoice
| Field | Type | Constraints |
|---|---|---|
| id | UUID/CUID | PK |
| invoice_number | string | NOT NULL, unique with vendor_id |
| vendor_id | string | NOT NULL, unique with invoice_number |
| invoice_amount | int (JPY) | NOT NULL, ≥0 |
| purchase_order_amount | int (JPY) | NOT NULL, ≥0 |
| due_date | date | NOT NULL |
| status | enum | NOT NULL (`pending`/`approved`/`rejected`/`mismatch`) |
| approver_id | string | NULL (set at approval) |
| approved_at | datetime | NULL |
| rejection_reason | string | NULL |
| rejected_by | string | NULL |
| rejected_at | datetime | NULL |
| deleted_at | datetime | NULL (soft delete) |
| created_at | datetime | NOT NULL |
| updated_at | datetime | NOT NULL |

UNIQUE INDEX: (vendor_id, invoice_number) WHERE deleted_at IS NULL

### 7.2 AuditLog
| Field | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| action | enum | NOT NULL (`create`/`approve`/`reject`/`resubmit`/`delete`) |
| actor_id | string | NOT NULL |
| invoice_id | string | NOT NULL (FK Invoice.id) |
| before_status | enum | NULL |
| after_status | enum | NULL |
| note | string | NULL |
| created_at | datetime | NOT NULL |

---

## 8. デザイン要件
- 参考サイト: https://www.fsi.co.jp/
- フロントエンドのデザインガイドラインを `design.md` として作成する(Application Design ステージにて)

---

## 9. 成果物
- ソースコード(フロント、バックエンド、Prismaスキーマ)
- ユニットテスト(正常系・異常系)
- README.md(セットアップ手順、起動方法、確認方法)
- API仕様書(OpenAPI形式 または Markdown)
- design.md(UI/デザインガイド)
- docker-compose.yml(フロント・バック・DB)

---

## 10. 受入基準 (Acceptance Criteria)
- [ ] docker-compose up でフロント・バック・DBが起動する
- [ ] 請求書を登録できる(金額一致 → pending、不一致 → mismatch)
- [ ] 同一 vendor_id + invoice_number の重複登録が拒否される
- [ ] mismatch の請求書を承認しようとすると拒否される
- [ ] 承認時に approver_id と approved_at が記録される
- [ ] 差戻し時に rejection_reason 必須が強制される
- [ ] rejected → 編集再提出 → pending または mismatch の状態遷移が動作する
- [ ] ステータスでフィルタした一覧APIが動作する
- [ ] 主要操作が監査ログに記録される
- [ ] 正常系・異常系のユニットテストが全て成功する
- [ ] 型チェック・Lintが成功する
- [ ] README手順だけで第三者がセットアップ・動作確認できる
- [ ] package-lock.json が生成済、Dockerfileで npm ci が使われる

---

## 11. Out of Scope (対象外)
- ユーザーマスタ管理画面
- 取引先マスタ管理画面
- ロールベースアクセス制御 (RBAC)
- 通知機能(メール、Slack等)
- 多通貨対応(JPY整数のみ)
- ファイルアップロード(請求書PDF等の添付)
- 帳票出力 / ExcelエクスポートのUI機能
- 本番デプロイ・監視・ログ集約

---

## 12. 拡張機能設定
| 拡張 | 適用 | 理由 |
|---|---|---|
| Security Baseline | 無効 | PoC向け、社内利用、最小構成 |
| Property-Based Testing | 無効 | シンプルなCRUD + 状態遷移、ユニットテストで充足 |
