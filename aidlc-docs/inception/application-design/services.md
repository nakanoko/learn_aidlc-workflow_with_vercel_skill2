# Services & Orchestration

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. サービス層概要

サービス層はビジネスロジックを集約し、Route Handlerからは委譲を受けるだけの薄い層に保つ。

```
[Route Handler] → [Service] → [Repository] → [Prisma] → [SQLite]
                       ↓
                  [Service]   (依存サービス、例: AuditLogService)
                       ↓
                  [Repository]
```

---

## 2. InvoiceService

**役割**: 請求書のCRUD・状態遷移を統括するドメインサービス

### 2.1 オーケストレーション

すべての書き込み系メソッドは以下のフローを踏む:

```
1. 入力バリデーション (Route HandlerでZod検証済みを前提)
2. 既存データ取得 / 重複チェック
3. ビジネスルール検証 (状態遷移許可、mismatch判定など)
4. トランザクション開始
   4.1 Invoice の永続化
   4.2 AuditLog の記録 (AuditLogService 経由)
5. トランザクションコミット
6. 結果を返却
```

### 2.2 トランザクション境界

- Prismaの `$transaction([...])` でInvoice更新とAuditLog記録をアトミックに実行
- Repository層はトランザクション中の `tx` クライアントを受け取れるよう設計

### 2.3 状態遷移マトリクス

| Current → Action | create | approve | reject | resubmit | delete |
|---|---|---|---|---|---|
| (新規) | → pending/mismatch | - | - | - | - |
| pending | - | → approved | → rejected | - | → deleted |
| mismatch | - | ❌ 422 | → rejected | - | → deleted |
| rejected | - | ❌ 409 | ❌ 409 | → pending/mismatch | → deleted |
| approved | - | ❌ 409 | ❌ 409 | - | ❌ 409 |

---

## 3. AuditLogService

**役割**: 監査ログの記録と検索

### 3.1 記録対象イベント
- `create` (請求書登録) — `before_status=null`, `after_status=登録時status`
- `approve` (承認) — `before_status='pending'`, `after_status='approved'`
- `reject` (差戻し) — `before_status='pending' or 'mismatch'`, `after_status='rejected'`, `note=rejection_reason`
- `resubmit` (再提出) — `before_status='rejected'`, `after_status='pending' or 'mismatch'`
- `delete` (論理削除) — `before_status=削除前status`, `after_status=null`

### 3.2 記録項目
- action / actor_id / invoice_id / before_status / after_status / note / created_at

### 3.3 利用方針
- `InvoiceService` のみが書き込みを呼び出す
- API読取エンドポイントは将来拡張用 (PoCでは GET /api/audit-logs?invoice_id=... のみ提供)

---

## 4. サービスのDI (依存性注入)

シンプルなコンストラクタ注入を採用 (フレームワークなし)

```typescript
// lib/container.ts
import { PrismaClient } from '@prisma/client';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { InvoiceService } from '@/services/invoiceService';
import { AuditLogService } from '@/services/auditLogService';

const prisma = new PrismaClient();
const invoiceRepo = new InvoiceRepository(prisma);
const auditRepo = new AuditLogRepository(prisma);
const auditService = new AuditLogService(auditRepo);
export const invoiceService = new InvoiceService(invoiceRepo, auditService, prisma);
export const auditLogService = auditService;
```

テスト時は別の `PrismaClient` インスタンス (テスト用DB) と各リポジトリのMockを差し込めるよう、サービスは具象ではなくインタフェース経由で依存を持つことを推奨する。

---

## 5. クロスサービスフロー例

### 5.1 請求書登録フロー (FR-01)

```
HTTP POST /api/invoices
  ↓ (X-Actor-Id ヘッダー、JSON ボディ)
Route Handler
  ↓ withCors / withErrorHandler / withActor
  ↓ createInvoiceSchema.parse(body)
InvoiceService.create(body, actorId)
  ↓ 重複チェック: invoiceRepo.findByVendorAndNumber()
  ↓ → 存在 → throw ConflictError
  ↓ ビジネスルール: amount判定 → status = pending or mismatch
  ↓ prisma.$transaction:
  ↓   invoiceRepo.create(...)
  ↓   auditService.record({ action: 'create', actor_id, invoice_id, after_status })
  ↓ return invoice
Route Handler
  ↓ NextResponse.json(invoice, { status: 201 })
HTTP Response 201 Created
```

### 5.2 承認フロー (FR-02)

```
HTTP POST /api/invoices/:id/approve
  ↓ (X-Approver-Id ヘッダー)
Route Handler → InvoiceService.approve(id, approverId)
  ↓ invoiceRepo.findById(id) → not found → 404
  ↓ status check:
  ↓   mismatch  → throw UnprocessableError 422
  ↓   rejected  → throw ConflictError 409
  ↓   approved  → throw ConflictError 409
  ↓   pending → 進行
  ↓ prisma.$transaction:
  ↓   invoiceRepo.update(id, { status: 'approved', approver_id, approved_at: now })
  ↓   auditService.record({ action: 'approve', actor_id: approverId, invoice_id, before='pending', after='approved' })
  ↓ return updated invoice
HTTP Response 200 OK
```

### 5.3 差戻しフロー (FR-03)

```
HTTP POST /api/invoices/:id/reject (body: { rejection_reason })
Route Handler → InvoiceService.reject(id, body, actorId)
  ↓ rejectInvoiceSchema.parse(body)  → rejection_reason 必須
  ↓ invoiceRepo.findById(id)
  ↓ status check:
  ↓   approved → 409
  ↓   rejected → 409 (already rejected)
  ↓   pending/mismatch → 進行
  ↓ prisma.$transaction:
  ↓   invoiceRepo.update(id, { status: 'rejected', rejection_reason, rejected_by: actorId, rejected_at: now })
  ↓   auditService.record({ action: 'reject', ..., note: rejection_reason })
HTTP Response 200 OK
```

### 5.4 再提出フロー (FR-04)

```
HTTP PATCH /api/invoices/:id/resubmit (body: { invoice_amount?, purchase_order_amount?, due_date? })
Route Handler → InvoiceService.resubmit(id, body, actorId)
  ↓ status === 'rejected' でなければ ConflictError 409
  ↓ 新しい金額で mismatch 判定
  ↓ status は 'pending' か 'mismatch' に更新
  ↓ rejection_reason / rejected_by / rejected_at は履歴として残す or クリア (要決定)
    → 仕様: 残す (監査履歴のため)、ただし status は遷移
  ↓ prisma.$transaction:
  ↓   invoiceRepo.update(...)
  ↓   auditService.record({ action: 'resubmit', ... })
HTTP Response 200 OK
```

---

## 6. レイヤ境界の原則

| レイヤ | 担当 | やってはいけない |
|---|---|---|
| Route Handler | HTTP↔JSON変換、Zod検証、ステータス決定 | DB直接アクセス、ビジネスルール |
| Service | ビジネスルール、トランザクション境界、状態遷移 | HTTPに直接触れる、Prismaを直接使う |
| Repository | Prisma経由のDB操作のみ | 業務判定 |
