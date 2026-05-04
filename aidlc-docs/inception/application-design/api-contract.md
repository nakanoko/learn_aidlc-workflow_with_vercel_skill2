# API Contract (REST)

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**バージョン**: 1.0
**ベースURL**: `http://localhost:3000`

---

## 共通仕様

### Request Headers
| ヘッダー | 必須 | 用途 |
|---|---|---|
| `Content-Type: application/json` | 書き込み系で必須 | リクエストボディ形式 |
| `X-Actor-Id` | 承認以外の書き込み系で必須 | 操作者ID(監査ログ用) |
| `X-Approver-Id` | 承認エンドポイントで必須 (X-Actor-Id は不要) | 承認者ID。承認時の監査ログでは `actor_id` として記録される |

### Actor ID 形式
`X-Actor-Id` / `X-Approver-Id` は次の制約を満たすこと:
- 1〜50文字
- 英数字、ハイフン (`-`)、アンダースコア (`_`) のみ
- 空文字、規定外文字は 400 Bad Request

### レスポンス共通
- `deleted_at` は内部的なソフトデリートマーカーであり、**APIレスポンスには露出しない**(GETは未削除のものだけを返す)。

### Error Response
すべてのエラー応答は次の形式:
```json
{ "error": "エラーメッセージ" }
```

| HTTP | 意味 |
|---|---|
| 400 | バリデーションエラー(必須項目欠落、型不正、JSONパース失敗) |
| 401 | (PoCでは未使用、X-Actor-Id 欠落は400として扱う) |
| 404 | リソース未発見 |
| 409 | リソース競合(重複登録、状態不正による拒否) |
| 422 | 業務不可(mismatch請求書の承認試行など) |
| 500 | サーバ内部エラー |

### Status 値
`pending` / `approved` / `rejected` / `mismatch`

---

## 1. POST /api/invoices

請求書を新規登録する。

### Request
```http
POST /api/invoices
Content-Type: application/json
X-Actor-Id: user-001
```
```json
{
  "invoice_number": "INV-2026-0001",
  "vendor_id": "VENDOR-A",
  "invoice_amount": 100000,
  "purchase_order_amount": 100000,
  "due_date": "2026-06-30"
}
```

### Response
**201 Created**
```json
{
  "id": "clx...",
  "invoice_number": "INV-2026-0001",
  "vendor_id": "VENDOR-A",
  "invoice_amount": 100000,
  "purchase_order_amount": 100000,
  "due_date": "2026-06-30",
  "status": "pending",
  "approver_id": null,
  "approved_at": null,
  "rejection_reason": null,
  "rejected_by": null,
  "rejected_at": null,
  "created_at": "2026-05-04T10:00:00.000Z",
  "updated_at": "2026-05-04T10:00:00.000Z"
}
```

### Errors
- 400: バリデーションエラー
- 409: 同じ vendor_id + invoice_number が既に存在

---

## 2. GET /api/invoices

ステータスで一覧検索。

### Request
```http
GET /api/invoices?status=pending&limit=50&offset=0
```

| Query | 必須 | 型 | 説明 |
|---|---|---|---|
| status | × | string | pending / approved / rejected / mismatch のいずれか |
| limit | × | int (1-100) | デフォルト 50 |
| offset | × | int (≥0) | デフォルト 0 |

### Response
**200 OK**
```json
{
  "items": [ { /* Invoice */ }, ... ],
  "total": 42
}
```

### Errors
- 400: クエリ不正(status の値が enum 外、limit/offset が範囲外)

---

## 3. GET /api/invoices/:id

請求書詳細取得。

### Request
```http
GET /api/invoices/clx...
```

### Response
**200 OK**: Invoice オブジェクト

### Errors
- 404: 該当ID未発見、または論理削除済

---

## 4. POST /api/invoices/:id/approve

承認。

### Request
```http
POST /api/invoices/clx.../approve
X-Approver-Id: approver-001
```
※ ボディは空または `{}`
※ `X-Actor-Id` は不要。`X-Approver-Id` の値が監査ログの `actor_id` に記録される。

### Response
**200 OK**: 更新後の Invoice (status=approved, approver_id, approved_at が設定)

### Errors
- 400: X-Approver-Id 欠落 / 形式不正
- 404: 該当ID未発見
- 409: 既に approved または rejected (※承認可能なのは pending のみ)
- 422: status が mismatch (承認不可)

---

## 5. POST /api/invoices/:id/reject

差戻し。

### Request
```http
POST /api/invoices/clx.../reject
Content-Type: application/json
X-Actor-Id: user-001
```
```json
{
  "rejection_reason": "金額に誤りがあります、再確認をお願いします"
}
```

### Response
**200 OK**: 更新後の Invoice (status=rejected, rejection_reason, rejected_by, rejected_at)

### Errors
- 400: rejection_reason 欠落 / 空文字、X-Actor-Id 欠落
- 404: 該当ID未発見
- 409: 既に approved または rejected (※差戻し可能なのは pending または mismatch のみ)

---

## 6. PATCH /api/invoices/:id/resubmit

差戻された請求書を編集して再提出。

### Request
```http
PATCH /api/invoices/clx.../resubmit
Content-Type: application/json
X-Actor-Id: user-001
```
```json
{
  "invoice_amount": 95000,
  "purchase_order_amount": 95000,
  "due_date": "2026-07-15"
}
```

※ いずれかのフィールドを最低1つ含める(Zod の `refine()` で強制)。請求番号・取引先IDは変更不可。

### Response
**200 OK**: 更新後の Invoice (status=pending または mismatch、金額に応じて自動判定)

### Errors
- 400: バリデーションエラー、すべてのフィールドが未指定
- 404: 該当ID未発見
- 409: status が rejected 以外

---

## 7. DELETE /api/invoices/:id

論理削除。

### Request
```http
DELETE /api/invoices/clx...
X-Actor-Id: user-001
```

### Response
**204 No Content**

### Errors
- 404: 該当ID未発見、または既に削除済
- 409: status が approved (削除不可)

---

## 8. GET /api/audit-logs

監査ログ取得。

### Request
```http
GET /api/audit-logs?invoice_id=clx...&limit=50
```

| Query | 必須 | 型 | 説明 |
|---|---|---|---|
| invoice_id | × | string | 請求書IDで絞り込み |
| limit | × | int (1-200) | デフォルト 50 |

### Response
**200 OK**
```json
{
  "items": [
    {
      "id": "...",
      "action": "create",
      "actor_id": "user-001",
      "invoice_id": "clx...",
      "before_status": null,
      "after_status": "pending",
      "note": null,
      "created_at": "2026-05-04T10:00:00.000Z"
    }
  ]
}
```

---

## 9. GET /api/health

ヘルスチェック (運用・監視向け)。

### Request
```http
GET /api/health
```

### Response
- **200 OK**: `{ "status": "ok" }`
- **503 Service Unavailable**: `{ "status": "degraded", "error": "..." }`

---

## 10. CORS

許可オリジンは環境変数 `CORS_ALLOW_ORIGIN` で制御する。

| 設定 | デフォルト |
|---|---|
| `CORS_ALLOW_ORIGIN` | `http://localhost:3001` |

レスポンスヘッダー:
- `Access-Control-Allow-Origin: ${CORS_ALLOW_ORIGIN}`
- `Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, X-Actor-Id, X-Approver-Id`

`OPTIONS` リクエストに 204 を返す preflight 対応を含む。

---

## 11. 監査ログ閲覧UI

PoCでは `/api/audit-logs` の API は提供するが、フロントエンドからの監査ログ閲覧画面は **Out of Scope**。
バックエンド単独機能として運用者が直接APIを呼ぶ想定。
