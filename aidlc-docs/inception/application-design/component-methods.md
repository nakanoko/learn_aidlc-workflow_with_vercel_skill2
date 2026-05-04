# Component Methods

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**注**: 詳細なビジネスルールは Functional Design (CONSTRUCTION フェーズ) で定義する。

---

## 1. Backend - InvoiceService

```typescript
class InvoiceService {
  // prisma はトランザクション境界 ($transaction) を Service 層で扱うために必要。
  // Repository のメソッドは `tx?: PrismaClient | Prisma.TransactionClient` を受け取り、
  // Service が tx を渡すことで AuditLog 記録と Invoice 更新を 1 トランザクションで実行する。
  constructor(
    private invoiceRepo: InvoiceRepository,
    private auditService: AuditLogService,
    private prisma: PrismaClient
  ) {}

  // 請求書を新規作成
  // - 同じ vendor_id + invoice_number は ConflictError
  // - 金額一致 → status=pending、不一致 → status=mismatch
  // - 監査ログ: action=create
  async create(input: CreateInvoiceInput, actorId: string): Promise<Invoice>;

  // ステータス・ページングで一覧取得
  // - 削除済み (deleted_at IS NOT NULL) は除外
  async list(query: ListInvoicesQuery): Promise<{ items: Invoice[]; total: number }>;

  // ID指定で取得 (削除済みは除外)
  async getById(id: string): Promise<Invoice>;  // not found → NotFoundError

  // 承認 (mismatch / rejected / approved は承認不可)
  // - 承認可能なのは pending のみ
  // - approver_id, approved_at を記録
  // - 監査ログ: action=approve
  async approve(id: string, approverId: string): Promise<Invoice>;

  // 差戻し (rejection_reason 必須、approved 不可)
  // - 監査ログ: action=reject
  async reject(id: string, input: RejectInput, actorId: string): Promise<Invoice>;

  // 再提出 (rejected のみ可能、金額再判定で pending or mismatch に戻る)
  // - 監査ログ: action=resubmit
  async resubmit(id: string, input: ResubmitInput, actorId: string): Promise<Invoice>;

  // 論理削除 (approved は削除不可)
  // - 監査ログ: action=delete
  async softDelete(id: string, actorId: string): Promise<void>;
}
```

### Input型 (Zodで定義)
```typescript
type CreateInvoiceInput = {
  invoice_number: string;        // 1-50 chars
  vendor_id: string;             // 1-50 chars
  invoice_amount: number;        // integer, ≥0
  purchase_order_amount: number; // integer, ≥0
  due_date: string;              // ISO 8601 date (YYYY-MM-DD)
};

type ListInvoicesQuery = {
  status?: 'pending' | 'approved' | 'rejected' | 'mismatch';
  limit?: number;   // 1-100, default 50
  offset?: number;  // ≥0, default 0
};

type RejectInput = {
  rejection_reason: string;  // 1-500 chars, required
};

type ResubmitInput = {
  invoice_amount?: number;
  purchase_order_amount?: number;
  due_date?: string;
};
```

---

## 2. Backend - AuditLogService

```typescript
class AuditLogService {
  constructor(private auditRepo: AuditLogRepository) {}

  // 監査ログを記録
  async record(input: AuditLogInput): Promise<void>;

  // 監査ログ一覧取得 (将来拡張用、PoCではinvoice_id絞り込みのみサポート)
  async list(query: { invoice_id?: string; limit?: number }): Promise<AuditLog[]>;
}

type AuditLogInput = {
  action: 'create' | 'approve' | 'reject' | 'resubmit' | 'delete';
  actor_id: string;
  invoice_id: string;
  before_status?: InvoiceStatus;
  after_status?: InvoiceStatus;
  note?: string;
};
```

---

## 3. Backend - InvoiceRepository

```typescript
// 各メソッドはトランザクションクライアント (tx) を任意で受け取り、
// 渡された場合はそれを、未指定の場合は this.prisma を使う。
type TxClient = PrismaClient | Prisma.TransactionClient;

class InvoiceRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: InvoiceCreateData, tx?: TxClient): Promise<Invoice>;
  async findById(id: string, options?: { includeDeleted?: boolean }, tx?: TxClient): Promise<Invoice | null>;
  async findByVendorAndNumber(vendorId: string, invoiceNumber: string, tx?: TxClient): Promise<Invoice | null>;
  async list(filter: { status?: InvoiceStatus }, paging: { limit: number; offset: number }, tx?: TxClient):
    Promise<{ items: Invoice[]; total: number }>;
  async update(id: string, data: Partial<InvoiceUpdateData>, tx?: TxClient): Promise<Invoice>;
  async softDelete(id: string, tx?: TxClient): Promise<void>;
}
```

---

## 4. Backend - AuditLogRepository

```typescript
class AuditLogRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: AuditLogCreateData, tx?: TxClient): Promise<AuditLog>;
  async listByInvoice(invoiceId: string, limit: number): Promise<AuditLog[]>;
}
```

---

## 5. Backend - Route Handler 共通シグネチャ

各 Route Handler は次のような形をとる:

```typescript
export const POST = withErrorHandler(withCors(async (req: NextRequest) => {
  const actorId = requireActorId(req);
  const body = createInvoiceSchema.parse(await req.json());
  const result = await invoiceService.create(body, actorId);
  return NextResponse.json(result, { status: 201 });
}));
```

---

## 6. Frontend - apiClient

```typescript
// すべて Promise を返し、4xx/5xx は AppApiError を throw
export const apiClient = {
  listInvoices(params: { status?: InvoiceStatus }): Promise<{ items: Invoice[]; total: number }>;
  getInvoice(id: string): Promise<Invoice>;
  createInvoice(payload: CreateInvoicePayload, actorId: string): Promise<Invoice>;
  approveInvoice(id: string, approverId: string): Promise<Invoice>;
  rejectInvoice(id: string, payload: { rejection_reason: string }, actorId: string): Promise<Invoice>;
  resubmitInvoice(id: string, payload: ResubmitPayload, actorId: string): Promise<Invoice>;
  deleteInvoice(id: string, actorId: string): Promise<void>;
};
```

---

## 7. Frontend - Page Components

### 7.1 InvoiceListPage
```typescript
function InvoiceListPage(): JSX.Element;
// - useEffect で apiClient.listInvoices() を呼び出し
// - status フィルタ select で再フェッチ
// - 行クリックで /invoices/:id へ遷移
// - 「新規登録」ボタンで /invoices/new へ遷移
```

### 7.2 InvoiceCreatePage
```typescript
function InvoiceCreatePage(): JSX.Element;
// - フォーム state を useState で管理
// - サブミット時に apiClient.createInvoice() を呼ぶ
// - 成功時は一覧画面へ遷移、Toastで通知
// - エラー時はエラーメッセージを表示
```

### 7.3 InvoiceDetailPage
```typescript
function InvoiceDetailPage(): JSX.Element;
// - useParams で id 取得、useEffect で apiClient.getInvoice()
// - status に応じて以下のアクションボタンを切替表示:
//   - pending → [承認] [差戻し] [削除]
//   - mismatch → [差戻し] [削除] (承認はdisabled)
//   - rejected → [編集して再提出]
//   - approved → アクションなし (情報表示のみ)
// - 差戻し時は ConfirmDialog で rejection_reason 入力を必須化
```

---

## 8. Frontend - Actor識別

ヘッダーから取得する Actor ID は、簡易的に `localStorage` に保持し、画面右上に切替UIを置く(PoC向け)。承認時のみ `X-Approver-Id` として別途送信する。
