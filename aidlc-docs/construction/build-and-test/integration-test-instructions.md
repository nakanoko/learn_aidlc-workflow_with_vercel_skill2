# Integration Test Instructions

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. 統合テストの位置付け
PoC スコープのため自動E2E (Playwright/Cypress) は対象外。ここでは **docker-compose 起動 + curl による主要シナリオ手動確認** を統合テストとして定義する。

---

## 2. 前提

```bash
# Docker Desktop が起動していること
docker version

# 起動
cd <workspace-root>
docker compose up -d

# 起動確認
docker ps --format "{{.Names}}: {{.Status}}"
# 期待: 両方とも (healthy)
```

---

## 3. 主要シナリオテスト

### 3.1 ヘルスチェック
```bash
curl http://localhost:3000/api/health
# 期待: {"status":"ok"}
```

### 3.2 請求書登録 - 金額一致
```bash
curl -X POST http://localhost:3000/api/invoices \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{
    "invoice_number": "INV-2026-0001",
    "vendor_id": "VENDOR-A",
    "invoice_amount": 100000,
    "purchase_order_amount": 100000,
    "due_date": "2026-06-30"
  }'
# 期待: 201 Created, status="pending"
```

### 3.3 請求書登録 - 金額不一致
```bash
curl -X POST http://localhost:3000/api/invoices \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{
    "invoice_number": "INV-2026-0002",
    "vendor_id": "VENDOR-A",
    "invoice_amount": 50000,
    "purchase_order_amount": 100000,
    "due_date": "2026-06-30"
  }'
# 期待: 201 Created, status="mismatch"
```

### 3.4 重複登録の拒否
```bash
curl -X POST http://localhost:3000/api/invoices \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{
    "invoice_number": "INV-2026-0001",
    "vendor_id": "VENDOR-A",
    "invoice_amount": 100000,
    "purchase_order_amount": 100000,
    "due_date": "2026-06-30"
  }'
# 期待: 409 Conflict, {"error":"...重複..."}
```

### 3.5 mismatch の承認試行
```bash
# まず mismatch ID を取得
MM_ID=$(curl -s 'http://localhost:3000/api/invoices?status=mismatch' | jq -r '.items[0].id')

curl -X POST "http://localhost:3000/api/invoices/$MM_ID/approve" \
  -H 'X-Approver-Id: approver-001'
# 期待: 422 Unprocessable Entity
```

### 3.6 承認 (pending)
```bash
PD_ID=$(curl -s 'http://localhost:3000/api/invoices?status=pending' | jq -r '.items[0].id')
curl -X POST "http://localhost:3000/api/invoices/$PD_ID/approve" \
  -H 'X-Approver-Id: approver-001'
# 期待: 200 OK, status="approved", approver_id and approved_at set
```

### 3.7 差戻し (rejection_reason 必須)
```bash
# 必須項目欠落 → 400
curl -X POST "http://localhost:3000/api/invoices/$MM_ID/reject" \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{}'
# 期待: 400 Bad Request

# 正常系
curl -X POST "http://localhost:3000/api/invoices/$MM_ID/reject" \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{"rejection_reason":"金額に誤りがあります"}'
# 期待: 200 OK, status="rejected"
```

### 3.8 再提出 (rejected → pending)
```bash
curl -X PATCH "http://localhost:3000/api/invoices/$MM_ID/resubmit" \
  -H 'Content-Type: application/json' \
  -H 'X-Actor-Id: user-001' \
  -d '{"invoice_amount":100000}'
# 期待: 200 OK, status="pending" (金額一致のため)
```

### 3.9 承認済の削除試行 (拒否)
```bash
AP_ID=$(curl -s 'http://localhost:3000/api/invoices?status=approved' | jq -r '.items[0].id')
curl -X DELETE "http://localhost:3000/api/invoices/$AP_ID" \
  -H 'X-Actor-Id: user-001'
# 期待: 409 Conflict
```

### 3.10 監査ログ取得
```bash
curl "http://localhost:3000/api/audit-logs?invoice_id=$MM_ID"
# 期待: 200 OK, items[] に create, reject, resubmit などが含まれる
```

### 3.11 UI 動作確認
1. ブラウザで `http://localhost:3001/` を開く
2. ヘッダーで Actor ID を設定
3. 「+ 新規登録」で請求書を登録 (金額一致 → pending、不一致 → mismatch)
4. 一覧で StatusBadge が日本語ラベル(承認待ち/承認済/差戻し済/不一致)で表示されることを確認
5. ステータスフィルタを切り替え、表示が更新されることを確認
6. 詳細画面でステータスに応じたアクションボタン (承認・差戻し・再提出・削除) が表示されることを確認
7. 差戻しダイアログで rejection_reason 入力欄が必須であることを確認

---

## 4. 確認結果(2026-05-04 実施)

| シナリオ | 結果 |
|---|---|
| 3.1 ヘルスチェック | ✅ `{"status":"ok"}` |
| 3.2 金額一致登録 → pending | ✅ |
| 3.3 金額不一致登録 → mismatch | ✅ |
| 3.4 重複登録 → 409 | ✅ |
| 3.5 mismatch 承認 → 422 | ✅ |
| 3.6 pending 承認 → 200 + approver_id 記録 | ✅ |
| 3.7 差戻し (rejection_reason 必須) | ✅ |
| 3.8 再提出 (rejected → pending) | ✅ |
| 3.10 監査ログ取得 (resubmit/reject 履歴) | ✅ |

---

## 5. 既知の制約

- 自動E2E (Playwright/Cypress) は対象外
- 上記シナリオは手動 curl テスト
- 文字エンコーディング: ターミナルが Shift-JIS の場合、curl 出力で日本語が文字化けして見えるが、データは UTF-8 で正常に保存されている (ブラウザで確認可能)
