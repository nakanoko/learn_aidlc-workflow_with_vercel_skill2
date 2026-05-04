# API 仕様サマリ

> 詳細仕様は `aidlc-docs/inception/application-design/api-contract.md` を参照してください。
> 本書はクイックリファレンス用の要約版です。

## ベースURL

`http://localhost:3000`

## 共通

### リクエストヘッダー

| ヘッダー | 必須 | 用途 |
|---|---|---|
| `Content-Type: application/json` | 書き込み系で必須 | リクエストボディ形式 |
| `X-Actor-Id` | 承認以外の書き込み系で必須 | 操作者ID(監査ログ用) |
| `X-Approver-Id` | 承認エンドポイントのみ必須 (X-Actor-Id は不要) | 承認者ID。監査ログでは `actor_id` として記録 |

`X-Actor-Id` / `X-Approver-Id` は `1〜50文字`、`英数字 / - / _` のみ。

### エラーレスポンス

```json
{ "error": "エラーメッセージ" }
```

| HTTP | 意味 |
|---|---|
| 400 | バリデーションエラー、必須ヘッダー欠落、JSON パース失敗 |
| 404 | リソース未発見 / 論理削除済 |
| 409 | リソース競合(重複登録、状態不正) |
| 422 | 業務不可(mismatch を承認等) |
| 500 | サーバ内部エラー |

### ステータス値

`pending` / `approved` / `rejected` / `mismatch`

---

## エンドポイント一覧

| # | Method | Path | 用途 | 必須ヘッダー | 必須ボディ |
|---|---|---|---|---|---|
| 1 | POST | `/api/invoices` | 請求書登録 | `X-Actor-Id` | invoice_number, vendor_id, invoice_amount, purchase_order_amount, due_date |
| 2 | GET | `/api/invoices` | 一覧取得 | - | (クエリ: status, limit, offset) |
| 3 | GET | `/api/invoices/:id` | 詳細取得 | - | - |
| 4 | POST | `/api/invoices/:id/approve` | 承認 | `X-Approver-Id` | (空または `{}`) |
| 5 | POST | `/api/invoices/:id/reject` | 差戻 | `X-Actor-Id` | rejection_reason |
| 6 | PATCH | `/api/invoices/:id/resubmit` | 再提出 | `X-Actor-Id` | invoice_amount / purchase_order_amount / due_date のいずれか1つ以上 |
| 7 | DELETE | `/api/invoices/:id` | 論理削除 | `X-Actor-Id` | - |
| 8 | GET | `/api/audit-logs` | 監査ログ取得 | - | (クエリ: invoice_id, limit) |
| 9 | GET | `/api/health` | ヘルスチェック | - | - |

---

## 状態遷移マトリクス

| Current → Action | create | approve | reject | resubmit | delete |
|---|---|---|---|---|---|
| (新規) | → pending/mismatch | - | - | - | - |
| pending | - | → approved (200) | → rejected (200) | - | → deleted (204) |
| mismatch | - | 422 不可 | → rejected (200) | - | → deleted (204) |
| rejected | - | 409 不可 | 409 不可 | → pending/mismatch | → deleted (204) |
| approved | - | 409 不可 | 409 不可 | - | 409 不可 |

---

## CORS

| 設定 | デフォルト |
|---|---|
| `Access-Control-Allow-Origin` | `${CORS_ALLOW_ORIGIN}` (デフォルト `http://localhost:3001`) |
| `Access-Control-Allow-Methods` | `GET, POST, PATCH, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, X-Actor-Id, X-Approver-Id` |

`OPTIONS` リクエストには 204 を返す preflight 対応を含む。
