# Functional Design — backend-api Unit

**プロジェクト**: 請求書チェック・承認Webシステム
**ユニット**: `backend-api`
**作成日**: 2026-05-04
**バージョン**: 1.0
**ステージ**: Construction - Functional Design (per-unit)

このドキュメントは `backend-api` ユニットの機能設計詳細を、実装で参考になる TypeScript 擬似コードレベルで定義する。
上位設計成果物との対応:

- 要件: `aidlc-docs/inception/requirements/requirements.md`
- API契約: `aidlc-docs/inception/application-design/api-contract.md`
- 状態遷移マトリクス: `aidlc-docs/inception/application-design/services.md` §2.3
- メソッドシグネチャ: `aidlc-docs/inception/application-design/component-methods.md`

---

## 0. ディレクトリ構成 (実装ターゲット)

```
backend/
├── app/
│   └── api/
│       ├── invoices/
│       │   ├── route.ts                    # POST, GET (list)
│       │   └── [id]/
│       │       ├── route.ts                # GET, DELETE
│       │       ├── approve/route.ts        # POST
│       │       ├── reject/route.ts         # POST
│       │       └── resubmit/route.ts       # PATCH
│       ├── audit-logs/route.ts             # GET
│       └── health/route.ts                 # GET
├── src/
│   ├── services/
│   │   ├── invoiceService.ts
│   │   └── auditLogService.ts
│   ├── repositories/
│   │   ├── invoiceRepository.ts
│   │   └── auditLogRepository.ts
│   ├── schemas/
│   │   ├── actorHeader.ts
│   │   ├── createInvoice.ts
│   │   ├── listInvoicesQuery.ts
│   │   ├── approveInvoice.ts
│   │   ├── rejectInvoice.ts
│   │   ├── resubmitInvoice.ts
│   │   └── deleteInvoice.ts
│   ├── errors/
│   │   └── appError.ts
│   ├── middleware/
│   │   ├── withErrorHandler.ts
│   │   ├── withCors.ts
│   │   └── withActor.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   └── container.ts
│   └── types/
│       └── invoice.ts                       # InvoiceStatus enum 定義 (アプリ層)
├── prisma/
│   └── schema.prisma
├── tests/
│   ├── unit/
│   ├── helpers/
│   └── setup.ts
└── package.json
```

---

## 1. Prisma スキーマ詳細

### 1.1 設計判断

- **provider**: `sqlite` (PoC 要件)
- **InvoiceStatus enum**: Prisma SQLite は `enum` 未対応 (https://www.prisma.io/docs/orm/reference/database-features-matrix#enum) のため、DB は `String` で保持し、**アプリ層 (Zod / TypeScript union 型) で enum 値を検証**する。
- **ID**: `cuid()` を採用 (Prisma 標準で SQLite 上でも生成可、UUID と等価)。
- **UNIQUE INDEX**: SQLite は **partial index 対応**だが Prisma DSL で `WHERE` 句を直接書く機能が限定的。代替として:
  - **採用**: テーブル全体に `@@unique([vendor_id, invoice_number])` を貼る。論理削除 (`deleted_at` セット) 後に同一 `vendor_id + invoice_number` の再登録は **PoC では非ユースケース**として扱い、必要なら `softDelete` 時に invoice_number を `__deleted__<id>__<original>` のようにリネームする方針を補助運用とする。Functional Design レベルでは **単純な `@@unique`** を採用。
- **datetime**: SQLite では `DateTime` を ISO 8601 (UTC) で保持。Prisma が自動変換。
- **due_date**: SQLite に DATE 型はなく `DateTime` で保持。アプリ層で `YYYY-MM-DD` 文字列 ⇄ Date の変換 (UTC 0時として解釈)。

### 1.2 schema.prisma 完全版

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Invoice {
  id                    String    @id @default(cuid())
  invoice_number        String
  vendor_id             String
  invoice_amount        Int
  purchase_order_amount Int
  due_date              DateTime
  // status: アプリ層 enum 検証 ('pending' | 'approved' | 'rejected' | 'mismatch')
  status                String
  approver_id           String?
  approved_at           DateTime?
  rejection_reason      String?
  rejected_by           String?
  rejected_at           DateTime?
  deleted_at            DateTime?
  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt

  audit_logs            AuditLog[]

  @@unique([vendor_id, invoice_number])
  @@index([status])
  @@index([deleted_at])
  @@index([created_at])
}

model AuditLog {
  id            String   @id @default(cuid())
  // action: 'create' | 'approve' | 'reject' | 'resubmit' | 'delete'
  action        String
  actor_id      String
  invoice_id    String
  // before_status / after_status: InvoiceStatus | null
  before_status String?
  after_status  String?
  note          String?
  created_at    DateTime @default(now())

  invoice       Invoice  @relation(fields: [invoice_id], references: [id], onDelete: Cascade)

  @@index([invoice_id])
  @@index([action])
  @@index([created_at])
}
```

### 1.3 アプリ層 enum 定義 (`src/types/invoice.ts`)

```typescript
export const INVOICE_STATUSES = ['pending', 'approved', 'rejected', 'mismatch'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const AUDIT_ACTIONS = ['create', 'approve', 'reject', 'resubmit', 'delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isInvoiceStatus(v: unknown): v is InvoiceStatus {
  return typeof v === 'string' && (INVOICE_STATUSES as readonly string[]).includes(v);
}
```

---

## 2. Zod スキーマ定義

### 2.1 共通プリミティブ

```typescript
// src/schemas/primitives.ts
import { z } from 'zod';

// Actor ID: 1-50文字、英数字 + ハイフン + アンダースコア
export const actorIdSchema = z
  .string()
  .min(1, 'X-Actor-Id is required')
  .max(50, 'X-Actor-Id must be at most 50 characters')
  .regex(/^[A-Za-z0-9_-]+$/, 'X-Actor-Id contains invalid characters');

// Invoice Status (アプリ層 enum)
export const invoiceStatusSchema = z.enum(['pending', 'approved', 'rejected', 'mismatch']);

// 金額: 整数、非負、上限10億未満 (現実的上限)
export const amountSchema = z
  .number({ invalid_type_error: 'amount must be a number' })
  .int('amount must be an integer')
  .min(0, 'amount must be >= 0')
  .max(999_999_999_999, 'amount too large');

// 日付: YYYY-MM-DD 形式 (ISO 8601 date) のみ受け付け
export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), {
    message: 'due_date is not a valid date',
  });

// CUID (Prisma 既定) — 厳密な形式チェック用 (内部参考、現状ハンドラでは使用しない)
//
// I-04 対応方針: API契約上「ID形式不正は 404 (NotFound)」として扱う。
// 厳密な CUID 正規表現でパスに早期 400 を返すと、存在チェックの責務が
// Zod 層と Repository 層で二重化し、cuid v1/v2 切替時の不整合リスクも残る。
// したがってハンドラの path param 検証では `idParamSchema` (= 緩い `z.string().min(1)`) を採用し、
// 形式不正を含む「DB 上に存在しない id」は Repository の `findById` -> null
// → `NotFoundError(404)` に一任する (api-contract.md と整合)。
//
// 注: `cuidSchema` 自体は将来の用途 (ログ整合性チェック等) のため残置するが、
// path/query param 検証では使わない。
export const cuidSchema = z.string().regex(/^c[a-z0-9]{24,}$/, 'invalid id format');

// id path param 検証: 形式不正は 400 ではなく 404 として扱うため、最低限の存在性 (空文字防止) のみ検証。
// 詳細は I-04 解説 (cuidSchema コメント) 参照。
export const idParamPrimitive = z.string().min(1, 'id is required');
```

### 2.2 Actor ヘッダー検証

```typescript
// src/schemas/actorHeader.ts
import { z } from 'zod';
import { actorIdSchema } from './primitives';

// 単一の actor id (X-Actor-Id) を検証
export const actorHeaderSchema = z.object({
  'x-actor-id': actorIdSchema,
});

// 承認エンドポイント用 (X-Approver-Id)
export const approverHeaderSchema = z.object({
  'x-approver-id': actorIdSchema,
});
```

### 2.3 createInvoiceSchema

```typescript
// src/schemas/createInvoice.ts
import { z } from 'zod';
import { amountSchema, dueDateSchema } from './primitives';

// .strict() で未知フィールドを 400 で拒否 (誤操作の早期検知、I-03 対応)
export const createInvoiceSchema = z
  .object({
    invoice_number: z.string().min(1).max(50),
    vendor_id: z.string().min(1).max(50),
    invoice_amount: amountSchema,
    purchase_order_amount: amountSchema,
    due_date: dueDateSchema,
  })
  .strict();

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
```

### 2.4 listInvoicesQuerySchema

```typescript
// src/schemas/listInvoicesQuery.ts
import { z } from 'zod';
import { invoiceStatusSchema } from './primitives';

// URLSearchParams からの入力は string なので preprocess で number 化
const intCoerce = (defaultValue: number, min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === '' ? defaultValue : Number(v)),
    z.number().int().min(min).max(max),
  );

export const listInvoicesQuerySchema = z.object({
  status: invoiceStatusSchema.optional(),
  limit: intCoerce(50, 1, 100),
  offset: intCoerce(0, 0, Number.MAX_SAFE_INTEGER),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
```

### 2.5 approveInvoiceSchema

```typescript
// src/schemas/approveInvoice.ts
import { z } from 'zod';

// ボディは空または {} を許容 (将来拡張のため空オブジェクトを受け取れるようにする)
export const approveInvoiceSchema = z.object({}).strict().optional().default({});

export type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema>;
```

### 2.6 rejectInvoiceSchema

```typescript
// src/schemas/rejectInvoice.ts
import { z } from 'zod';

export const rejectInvoiceSchema = z.object({
  rejection_reason: z
    .string()
    .min(1, 'rejection_reason is required')
    .max(500, 'rejection_reason must be at most 500 characters'),
});

export type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema>;
```

### 2.7 resubmitInvoiceSchema

```typescript
// src/schemas/resubmitInvoice.ts
import { z } from 'zod';
import { amountSchema, dueDateSchema } from './primitives';

// .strict() で `invoice_number` / `vendor_id` などの変更不可フィールドを含む未知フィールドを
// 400 で拒否する (FR-04: 請求番号・取引先IDは変更不可 / I-03 対応)。
export const resubmitInvoiceSchema = z
  .object({
    invoice_amount: amountSchema.optional(),
    purchase_order_amount: amountSchema.optional(),
    due_date: dueDateSchema.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.invoice_amount !== undefined ||
      v.purchase_order_amount !== undefined ||
      v.due_date !== undefined,
    { message: 'At least one of invoice_amount, purchase_order_amount, due_date must be provided' },
  );

export type ResubmitInvoiceInput = z.infer<typeof resubmitInvoiceSchema>;
```

### 2.8 deleteInvoiceParamsSchema

```typescript
// src/schemas/deleteInvoice.ts
import { z } from 'zod';
import { idParamPrimitive } from './primitives';

// path param のみ。
// I-04: ID 形式の厳密チェックは行わず、存在しない ID は Repository → NotFoundError(404) で処理する。
export const deleteInvoiceParamsSchema = z.object({
  id: idParamPrimitive,
});

// 共通: id をパスから取り出す検証 (形式不正は 404 に一任)
export const idParamSchema = z.object({ id: idParamPrimitive });
```

### 2.9 audit-logs クエリ

```typescript
// src/schemas/auditLogQuery.ts
import { z } from 'zod';
import { idParamPrimitive } from './primitives';

// I-04: invoice_id の形式チェックは緩く (空文字のみ拒否)、存在しない ID は単に空配列を返す
// (auditLog の list は filter なので 404 にはしない)。
export const auditLogQuerySchema = z.object({
  invoice_id: idParamPrimitive.optional(),
  limit: z.preprocess(
    (v) => (v === undefined || v === '' ? 50 : Number(v)),
    z.number().int().min(1).max(200),
  ),
});
```

---

## 3. 状態遷移ロジックの詳細擬似コード

すべてのハンドラ共通:

- ミドルウェアチェイン: `withCors → withErrorHandler → (handler)`。`withActor` はハンドラ内で明示的に呼ぶ。
- レスポンスは `NextResponse.json(...)`。
- `now()` は UTC 現在時刻 (`new Date()`)。

### 3.1 POST /api/invoices (請求書登録)

```typescript
// app/api/invoices/route.ts
export const POST = withCors(
  withErrorHandler(async (req: NextRequest) => {
    // 1) X-Actor-Id ヘッダー検証
    const actorId = requireActorId(req); // -> 400 if missing/invalid

    // 2) JSON パース + Zod 検証
    const json = await safeJson(req); // throws ValidationError on parse failure -> 400
    const input = createInvoiceSchema.parse(json); // throws ZodError -> 400

    // 3) Service 呼び出し
    const invoice = await invoiceService.create(input, actorId);

    // 4) 201 Created
    return NextResponse.json(toInvoiceDTO(invoice), { status: 201 });
  }),
);
```

`InvoiceService.create()` の擬似コード:

```typescript
async create(input: CreateInvoiceInput, actorId: string): Promise<Invoice> {
  // a) 重複チェック
  const dup = await this.invoiceRepo.findByVendorAndNumber(
    input.vendor_id,
    input.invoice_number,
  );
  if (dup) {
    throw new ConflictError(
      `Invoice already exists for vendor=${input.vendor_id}, number=${input.invoice_number}`,
    );
  }

  // b) ビジネスルール: 金額一致判定
  const status: InvoiceStatus =
    input.invoice_amount === input.purchase_order_amount ? 'pending' : 'mismatch';

  // c) トランザクションで Invoice 作成 + AuditLog 記録
  return await this.prisma.$transaction(async (tx) => {
    const invoice = await this.invoiceRepo.create(
      {
        invoice_number: input.invoice_number,
        vendor_id: input.vendor_id,
        invoice_amount: input.invoice_amount,
        purchase_order_amount: input.purchase_order_amount,
        due_date: new Date(`${input.due_date}T00:00:00Z`),
        status,
      },
      tx,
    );

    await this.auditService.record(
      {
        action: 'create',
        actor_id: actorId,
        invoice_id: invoice.id,
        before_status: null,
        after_status: status,
        note: null,
      },
      tx,
    );

    return invoice;
  });
}
```

| エラー条件 | HTTPステータス | エラークラス |
|---|---|---|
| X-Actor-Id 欠落 / 形式不正 | 400 | `ValidationError` |
| JSON パース失敗 / 必須項目欠落 / 型不正 | 400 | `ValidationError` |
| (vendor_id, invoice_number) 重複 | 409 | `ConflictError` |

### 3.2 GET /api/invoices (一覧)

```typescript
// app/api/invoices/route.ts (同ファイル)
export const GET = withCors(
  withErrorHandler(async (req: NextRequest) => {
    // 1) クエリ検証 (X-Actor-Id 不要、読み取り系)
    const url = new URL(req.url);
    const query = listInvoicesQuerySchema.parse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    // 2) Service
    const { items, total } = await invoiceService.list(query);

    // 3) 200
    return NextResponse.json({ items: items.map(toInvoiceDTO), total });
  }),
);
```

`InvoiceService.list()`:

```typescript
async list(query: ListInvoicesQuery): Promise<{ items: Invoice[]; total: number }> {
  return this.invoiceRepo.list(
    { status: query.status }, // deleted_at IS NULL は Repository で常時付与
    { limit: query.limit, offset: query.offset },
  );
}
```

| エラー条件 | HTTPステータス |
|---|---|
| status が enum 外、limit/offset 範囲外 | 400 |

### 3.3 GET /api/invoices/:id (詳細)

```typescript
// app/api/invoices/[id]/route.ts
// Next.js 15: 動的ルートの params は Promise<{...}> 化されているため await が必須。
export const GET = withCors(
  withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const invoice = await invoiceService.getById(id);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);
```

`getById`:

```typescript
async getById(id: string): Promise<Invoice> {
  const invoice = await this.invoiceRepo.findById(id, { includeDeleted: false });
  if (!invoice) throw new NotFoundError(`Invoice not found: id=${id}`);
  return invoice;
}
```

| エラー条件 | HTTPステータス |
|---|---|
| 該当なし / 削除済 / 形式不正な id (= DB 上で見つからない) | 404 |
| 空文字 id (URL 上で `/invoices//` 等) | 400 |

### 3.4 POST /api/invoices/:id/approve (承認)

```typescript
// app/api/invoices/[id]/approve/route.ts
// Next.js 15: ctx.params は Promise なので await ctx.params で解決する。
export const POST = withCors(
  withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const approverId = requireApproverId(req); // -> 400 if missing/invalid
    // ボディは空でも OK
    const json = await safeJsonOptional(req); // 空ボディなら {}
    approveInvoiceSchema.parse(json);

    const invoice = await invoiceService.approve(id, approverId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);
```

`InvoiceService.approve()`:

```typescript
async approve(id: string, approverId: string): Promise<Invoice> {
  // a) 取得
  const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
  if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

  // b) 状態遷移チェック (services.md §2.3 マトリクス準拠)
  switch (current.status as InvoiceStatus) {
    case 'mismatch':
      throw new UnprocessableError(
        `Cannot approve mismatched invoice (id=${id}). Status=mismatch.`,
      );
    case 'rejected':
    case 'approved':
      throw new ConflictError(
        `Cannot approve invoice in status=${current.status} (id=${id}).`,
      );
    case 'pending':
      break; // 進行
    default:
      throw new ConflictError(`Unknown status: ${current.status}`);
  }

  // c) トランザクション
  const now = new Date();
  return await this.prisma.$transaction(async (tx) => {
    const updated = await this.invoiceRepo.update(
      id,
      { status: 'approved', approver_id: approverId, approved_at: now },
      tx,
    );
    await this.auditService.record(
      {
        action: 'approve',
        actor_id: approverId,
        invoice_id: id,
        before_status: 'pending',
        after_status: 'approved',
        note: null,
      },
      tx,
    );
    return updated;
  });
}
```

| エラー条件 | HTTPステータス |
|---|---|
| X-Approver-Id 欠落/形式不正 | 400 |
| 該当なし / 形式不正な id (DB 上で見つからない) | 404 |
| status=mismatch | 422 |
| status=rejected/approved | 409 |

### 3.5 POST /api/invoices/:id/reject (差戻し)

```typescript
// app/api/invoices/[id]/reject/route.ts
// Next.js 15: ctx.params は Promise なので await ctx.params で解決する。
export const POST = withCors(
  withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const actorId = requireActorId(req);
    const json = await safeJson(req);
    const input = rejectInvoiceSchema.parse(json);

    const invoice = await invoiceService.reject(id, input, actorId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);
```

`InvoiceService.reject()`:

```typescript
async reject(id: string, input: RejectInvoiceInput, actorId: string): Promise<Invoice> {
  const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
  if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

  // 状態遷移マトリクス準拠
  switch (current.status as InvoiceStatus) {
    case 'approved':
    case 'rejected':
      throw new ConflictError(
        `Cannot reject invoice in status=${current.status} (id=${id}).`,
      );
    case 'pending':
    case 'mismatch':
      break; // 進行
    default:
      throw new ConflictError(`Unknown status: ${current.status}`);
  }

  const now = new Date();
  const beforeStatus = current.status as InvoiceStatus;

  return await this.prisma.$transaction(async (tx) => {
    const updated = await this.invoiceRepo.update(
      id,
      {
        status: 'rejected',
        rejection_reason: input.rejection_reason,
        rejected_by: actorId,
        rejected_at: now,
      },
      tx,
    );
    await this.auditService.record(
      {
        action: 'reject',
        actor_id: actorId,
        invoice_id: id,
        before_status: beforeStatus,
        after_status: 'rejected',
        note: input.rejection_reason,
      },
      tx,
    );
    return updated;
  });
}
```

| エラー条件 | HTTPステータス |
|---|---|
| X-Actor-Id 欠落/形式不正 | 400 |
| rejection_reason 欠落/空文字/501文字以上 | 400 |
| 該当なし | 404 |
| status=approved/rejected | 409 |

### 3.6 PATCH /api/invoices/:id/resubmit (再提出)

```typescript
// app/api/invoices/[id]/resubmit/route.ts
// Next.js 15: ctx.params は Promise なので await ctx.params で解決する。
export const PATCH = withCors(
  withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = idParamSchema.parse(await ctx.params);
    const actorId = requireActorId(req);
    const json = await safeJson(req);
    const input = resubmitInvoiceSchema.parse(json);

    const invoice = await invoiceService.resubmit(id, input, actorId);
    return NextResponse.json(toInvoiceDTO(invoice));
  }),
);
```

`InvoiceService.resubmit()`:

```typescript
async resubmit(id: string, input: ResubmitInvoiceInput, actorId: string): Promise<Invoice> {
  const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
  if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

  if (current.status !== 'rejected') {
    throw new ConflictError(
      `Cannot resubmit invoice in status=${current.status} (id=${id}). Only rejected invoices can be resubmitted.`,
    );
  }

  // 編集後の値を計算 (未指定は現状維持)
  const newInvoiceAmount = input.invoice_amount ?? current.invoice_amount;
  const newPoAmount = input.purchase_order_amount ?? current.purchase_order_amount;
  const newDueDate = input.due_date
    ? new Date(`${input.due_date}T00:00:00Z`)
    : current.due_date;

  // ステータス再判定
  const nextStatus: InvoiceStatus =
    newInvoiceAmount === newPoAmount ? 'pending' : 'mismatch';

  return await this.prisma.$transaction(async (tx) => {
    const updated = await this.invoiceRepo.update(
      id,
      {
        invoice_amount: newInvoiceAmount,
        purchase_order_amount: newPoAmount,
        due_date: newDueDate,
        status: nextStatus,
        // rejection_reason / rejected_by / rejected_at は監査履歴として残す (services.md §5.4)
      },
      tx,
    );
    await this.auditService.record(
      {
        action: 'resubmit',
        actor_id: actorId,
        invoice_id: id,
        before_status: 'rejected',
        after_status: nextStatus,
        note: null,
      },
      tx,
    );
    return updated;
  });
}
```

| エラー条件 | HTTPステータス |
|---|---|
| X-Actor-Id 欠落/形式不正 | 400 |
| 全フィールド未指定 / 型不正 | 400 |
| 該当なし | 404 |
| status≠rejected | 409 |

### 3.7 DELETE /api/invoices/:id (論理削除)

```typescript
// app/api/invoices/[id]/route.ts (同ファイルの DELETE エクスポート)
// Next.js 15: ctx.params は Promise なので await ctx.params で解決する。
export const DELETE = withCors(
  withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = deleteInvoiceParamsSchema.parse(await ctx.params);
    const actorId = requireActorId(req);

    await invoiceService.softDelete(id, actorId);
    return new NextResponse(null, { status: 204 });
  }),
);
```

`InvoiceService.softDelete()`:

```typescript
async softDelete(id: string, actorId: string): Promise<void> {
  const current = await this.invoiceRepo.findById(id, { includeDeleted: false });
  if (!current) throw new NotFoundError(`Invoice not found: id=${id}`);

  if (current.status === 'approved') {
    throw new ConflictError(
      `Cannot delete approved invoice (id=${id}).`,
    );
  }

  const now = new Date();
  const beforeStatus = current.status as InvoiceStatus;

  await this.prisma.$transaction(async (tx) => {
    await this.invoiceRepo.softDelete(id, tx); // sets deleted_at = now
    await this.auditService.record(
      {
        action: 'delete',
        actor_id: actorId,
        invoice_id: id,
        before_status: beforeStatus,
        after_status: null,
        note: null,
      },
      tx,
    );
  });
}
```

| エラー条件 | HTTPステータス |
|---|---|
| X-Actor-Id 欠落/形式不正 | 400 |
| 該当なし / 既削除 | 404 |
| status=approved | 409 |

### 3.8 GET /api/audit-logs

```typescript
// app/api/audit-logs/route.ts
export const GET = withCors(
  withErrorHandler(async (req: NextRequest) => {
    const url = new URL(req.url);
    const query = auditLogQuerySchema.parse({
      invoice_id: url.searchParams.get('invoice_id') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    const items = await auditLogService.list(query);
    return NextResponse.json({ items: items.map(toAuditLogDTO) });
  }),
);
```

`AuditLogService.list()` の擬似コード:

```typescript
// src/services/auditLogService.ts
async list(query: { invoice_id?: string; limit: number }): Promise<AuditLog[]> {
  // 読み取り単発のため tx 不要 (§6.4)。
  // filter / paging を Repository のメソッドシグネチャにマッピング。
  return this.auditRepo.list(
    { invoice_id: query.invoice_id }, // 未指定時は全件取得
    { limit: query.limit },
  );
}
```

`AuditLogRepository.list()` の擬似コード (component-methods.md §4 と整合):

```typescript
// src/repositories/auditLogRepository.ts
async list(
  filter: { invoice_id?: string },
  paging: { limit: number },
  tx?: TxClient,
): Promise<AuditLog[]> {
  const where = filter.invoice_id ? { invoice_id: filter.invoice_id } : {};
  return (tx ?? this.prisma).auditLog.findMany({
    where,
    orderBy: { created_at: 'desc' }, // テスト 8.9 の並び順要件 (必須)
    take: paging.limit,
  });
}
```

**設計ノート**:
- 既存 `listByInvoice(invoiceId, limit)` は **削除し、新 `list(filter, paging)` に統一**する。後方互換が必要な箇所がないため、シンプルなインタフェース置換とする。
- `invoice_id` 未指定時は全件 (削除済 Invoice の AuditLog も対象、`AuditLog.invoice` は `onDelete: Cascade` のため Invoice 物理削除時には消えるが、論理削除時は残る)。
- ソート順 `created_at desc` を Repository に集約 (テスト 8.9 の保証点)。

| エラー条件 | HTTPステータス |
|---|---|
| `invoice_id` 形式不正 / `limit` 範囲外 | 400 |

### 3.9 状態遷移マトリクスとの整合 (まとめ)

| Current → Action | create | approve | reject | resubmit | delete |
|---|---|---|---|---|---|
| (新規) | →pending/mismatch (201) | - | - | - | - |
| pending | - | →approved (200) | →rejected (200) | - | →deleted (204) |
| mismatch | - | 422 | →rejected (200) | - | →deleted (204) |
| rejected | - | 409 | 409 | →pending/mismatch (200) | →deleted (204) |
| approved | - | 409 | 409 | - | 409 |

services.md §2.3 と完全一致。

---

## 4. エラークラス階層

```typescript
// src/errors/appError.ts

/**
 * 業務エラーの基底クラス。すべての業務由来エラーはこれを継承する。
 * httpStatus は withErrorHandler が自動的に HTTP レスポンスに反映する。
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // V8 stack trace 補正
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * 400 Bad Request — 入力バリデーション失敗、JSON パース失敗、必須ヘッダー欠落など。
 */
export class ValidationError extends AppError {
  readonly httpStatus = 400 as const;
  readonly code = 'VALIDATION_ERROR' as const;
}

/**
 * 404 Not Found — 指定IDのリソースが存在しない、または論理削除済。
 */
export class NotFoundError extends AppError {
  readonly httpStatus = 404 as const;
  readonly code = 'NOT_FOUND' as const;
}

/**
 * 409 Conflict — 重複登録、状態遷移上禁止された操作 (例: approved の削除)。
 */
export class ConflictError extends AppError {
  readonly httpStatus = 409 as const;
  readonly code = 'CONFLICT' as const;
}

/**
 * 422 Unprocessable Entity — 業務ルール上、現状態では処理不可
 *  (例: mismatch の請求書を承認しようとした)。
 */
export class UnprocessableError extends AppError {
  readonly httpStatus = 422 as const;
  readonly code = 'UNPROCESSABLE' as const;
}

// type guard
export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
```

| クラス | HTTP | 主な使用箇所 |
|---|---|---|
| `ValidationError` | 400 | Zod parse 失敗、JSON parse 失敗、X-Actor-Id/X-Approver-Id 欠落 |
| `NotFoundError` | 404 | `findById` で null 返却時、論理削除済 |
| `ConflictError` | 409 | 重複登録、approved の削除/再操作、rejected の再 reject、status≠rejected の resubmit |
| `UnprocessableError` | 422 | mismatch の approve |

---

## 5. Middleware

### 5.1 withErrorHandler

```typescript
// src/middleware/withErrorHandler.ts
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, ValidationError, isAppError } from '@/errors/appError';

type Handler = (req: NextRequest, ctx: any) => Promise<NextResponse> | Promise<Response>;

/**
 * Route Handler をラップし、AppError / ZodError / 未知例外を統一フォーマットの JSON に変換する。
 *
 * 変換ルール:
 *   - AppError       : { error: <message> } を httpStatus で返す
 *   - ZodError       : ValidationError 相当の 400 にマップ
 *   - SyntaxError    : JSON パース失敗として 400
 *   - その他 Error   : 500 (本番では詳細を伏せる、PoC ではメッセージを返してデバッグ容易に)
 *   - すべてのエラーは console.error にログ出力 (PII 注意)
 */
export function withErrorHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) {
        const message = e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        return NextResponse.json({ error: message }, { status: 400 });
      }
      if (e instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      if (isAppError(e)) {
        return NextResponse.json({ error: e.message }, { status: e.httpStatus });
      }
      console.error('[unhandled]', e);
      const message = e instanceof Error ? e.message : 'Internal Server Error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
```

### 5.2 withCors

```typescript
// src/middleware/withCors.ts
import { NextRequest, NextResponse } from 'next/server';

const ALLOW_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? 'http://localhost:3001';
const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, X-Actor-Id, X-Approver-Id';

type Handler = (req: NextRequest, ctx: any) => Promise<NextResponse> | Promise<Response>;

/**
 * CORS ヘッダーを付与し、OPTIONS preflight を 204 で短絡する。
 * 環境変数 CORS_ALLOW_ORIGIN でオリジン制御 (default: http://localhost:3001)。
 */
export function withCors(handler: Handler): Handler {
  return async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }
    const res = await handler(req, ctx);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
    return new NextResponse(res.body, { status: res.status, headers });
  };
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
  };
}

// プリフライト用のエクスポート (各 route.ts から `export const OPTIONS = corsOptions;` で利用可)
export const corsOptions = withCors(async () => new NextResponse(null, { status: 204 }));
```

### 5.3 withActor

```typescript
// src/middleware/withActor.ts
import { NextRequest } from 'next/server';
import { ValidationError } from '@/errors/appError';
import { actorIdSchema } from '@/schemas/primitives';

/**
 * X-Actor-Id ヘッダーを取り出して検証。欠落・形式不正は ValidationError(400)。
 */
export function requireActorId(req: NextRequest): string {
  const raw = req.headers.get('x-actor-id');
  if (raw === null) throw new ValidationError('X-Actor-Id header is required');
  const result = actorIdSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`X-Actor-Id is invalid: ${result.error.issues[0].message}`);
  }
  return result.data;
}

/**
 * X-Approver-Id ヘッダーを取り出して検証。承認エンドポイントでのみ使用。
 */
export function requireApproverId(req: NextRequest): string {
  const raw = req.headers.get('x-approver-id');
  if (raw === null) throw new ValidationError('X-Approver-Id header is required');
  const result = actorIdSchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`X-Approver-Id is invalid: ${result.error.issues[0].message}`);
  }
  return result.data;
}

/**
 * JSON ボディの安全パース。空ボディ / 非 JSON は SyntaxError として上位 (withErrorHandler) で 400 化。
 */
export async function safeJson(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) throw new SyntaxError('Empty body');
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

/**
 * オプショナルJSONパース。空ボディの場合は {} を返す (approve 用)。
 */
export async function safeJsonOptional(req: NextRequest): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}
```

### 5.4 ミドルウェア合成順序

```
withCors( withErrorHandler( handler ) )
```

理由:
- **CORS は最外側**: エラー応答 (4xx/5xx) にも CORS ヘッダーを付与する必要がある。withErrorHandler がエラーを 4xx に変換した後、withCors がヘッダーを付与する。
- **OPTIONS 短絡**: withCors が最初に OPTIONS を処理することで、preflight は handler/error 処理を経由しない。

---

## 6. トランザクション境界と AuditLog 記録

### 6.1 設計原則

- **すべての書き込み操作 (create/approve/reject/resubmit/delete)** は Invoice の更新と AuditLog の挿入を **1つの `prisma.$transaction` で実行**する。
- **インタラクティブトランザクション** (`prisma.$transaction(async (tx) => { ... })`) を採用し、クロージャ内で複数の Repository メソッドを呼ぶ。これにより条件分岐や読み書き混在も同一トランザクション内で安全に行える。
- **配列形式** (`prisma.$transaction([promise1, promise2])`) は静的なオペレーションのみで複合分岐に弱いため、本ユニットでは採用しない。

### 6.2 Repository の `tx?` 引数

```typescript
// src/repositories/invoiceRepository.ts
import { Prisma, PrismaClient } from '@prisma/client';

type TxClient = PrismaClient | Prisma.TransactionClient;

export class InvoiceRepository {
  constructor(private prisma: PrismaClient) {}

  private db(tx?: TxClient): TxClient {
    return tx ?? this.prisma;
  }

  async create(data: InvoiceCreateData, tx?: TxClient) {
    return this.db(tx).invoice.create({ data });
  }

  async findById(id: string, opts?: { includeDeleted?: boolean }, tx?: TxClient) {
    return this.db(tx).invoice.findFirst({
      where: {
        id,
        ...(opts?.includeDeleted ? {} : { deleted_at: null }),
      },
    });
  }

  async findByVendorAndNumber(vendorId: string, invoiceNumber: string, tx?: TxClient) {
    return this.db(tx).invoice.findFirst({
      where: {
        vendor_id: vendorId,
        invoice_number: invoiceNumber,
        deleted_at: null,
      },
    });
  }

  async list(
    filter: { status?: InvoiceStatus },
    paging: { limit: number; offset: number },
    tx?: TxClient,
  ) {
    const where = {
      deleted_at: null,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.db(tx).invoice.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: paging.limit,
        skip: paging.offset,
      }),
      this.db(tx).invoice.count({ where }),
    ]);
    return { items, total };
  }

  async update(id: string, data: Partial<InvoiceUpdateData>, tx?: TxClient) {
    return this.db(tx).invoice.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: TxClient) {
    await this.db(tx).invoice.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
```

### 6.3 トランザクション利用例 (approve)

```typescript
// InvoiceService.approve() の中身 (再掲ベースの完全例)
const now = new Date();
const updated = await this.prisma.$transaction(async (tx) => {
  // 1. Invoice 更新
  const invoice = await this.invoiceRepo.update(
    id,
    { status: 'approved', approver_id: approverId, approved_at: now },
    tx,
  );
  // 2. AuditLog 追加 (同一 tx)
  await this.auditService.record(
    {
      action: 'approve',
      actor_id: approverId,
      invoice_id: id,
      before_status: 'pending',
      after_status: 'approved',
      note: null,
    },
    tx,
  );
  return invoice;
});
```

`AuditLogService.record()`:

```typescript
async record(input: AuditLogInput, tx?: TxClient): Promise<void> {
  await this.auditRepo.create(input, tx);
}
```

`AuditLogRepository.create()`:

```typescript
async create(data: AuditLogCreateData, tx?: TxClient) {
  return (tx ?? this.prisma).auditLog.create({
    data: {
      action: data.action,
      actor_id: data.actor_id,
      invoice_id: data.invoice_id,
      before_status: data.before_status ?? null,
      after_status: data.after_status ?? null,
      note: data.note ?? null,
    },
  });
}
```

**保証**: Invoice の更新と AuditLog の挿入はアトミック。途中で例外が投げられた場合、Prisma がロールバックし、両方とも書き込まれない。

### 6.4 トランザクションが不要な操作

| 操作 | tx 要否 | 理由 |
|---|---|---|
| GET /api/invoices (list) | 不要 | 読み取り単発、count + findMany は `Promise.all` で並列でも整合性問題は PoC レベルでは無視可 |
| GET /api/invoices/:id | 不要 | 単一 SELECT |
| GET /api/audit-logs | 不要 | 単一 SELECT |
| GET /api/health | 不要 | `SELECT 1` のみ |

---

## 7. ヘルスチェック (`GET /api/health`)

### 7.1 仕様

- DB 接続確認のため `SELECT 1` を発行。
- 成功: 200 `{ "status": "ok" }`
- 失敗: 503 `{ "status": "degraded", "error": "<message>" }`

### 7.2 実装擬似コード

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { withCors } from '@/middleware/withCors';
import { prisma } from '@/lib/prisma';

export const GET = withCors(async () => {
  try {
    // SQLite に対する軽量な ping。Prisma の $queryRaw でテンプレートリテラル使用。
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (e) {
    const error = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ status: 'degraded', error }, { status: 503 });
  }
});
```

**注**: ヘルスチェックは `withErrorHandler` を使わず、明示的に try/catch でハンドリングする (失敗時のステータスを 500 ではなく 503 にしたいため)。

---

## 8. テストケース一覧 (Vitest 前提)

すべて `tests/unit/` 配下に配置。Repository は **テスト用 SQLite (`file:./test.db`) 上の本物の Prisma** を使い、各テスト前に `beforeEach` でテーブル truncate するアプローチを採用 (PoC 規模のため)。Service/Handler 層のテストは Repository をモック (`vi.fn()`) する。

### 8.1 共通テストヘルパー

- `tests/helpers/buildRequest.ts`: `NextRequest` の組立 (URL/method/headers/body)
- `tests/helpers/factories.ts`: Invoice/AuditLog のファクトリ
- `tests/helpers/dbReset.ts`: `await prisma.auditLog.deleteMany(); await prisma.invoice.deleteMany();`

### 8.2 FR-01 請求書登録 (POST /api/invoices)

**正常系**
- [ ] `invoice_amount === purchase_order_amount` で登録すると status=`pending`、201、AuditLog (action=create, after_status=pending) が記録される
- [ ] `invoice_amount !== purchase_order_amount` で登録すると status=`mismatch`、201、AuditLog (action=create, after_status=mismatch) が記録される
- [ ] `due_date` が `YYYY-MM-DD` 形式で受理され、レスポンスに同形式で返る
- [ ] レスポンスから `deleted_at` が露出しない (`toInvoiceDTO` の検証)

**異常系**
- [ ] X-Actor-Id ヘッダーなし → 400, `error: "X-Actor-Id header is required"`
- [ ] X-Actor-Id が空文字 → 400
- [ ] X-Actor-Id が 51 文字以上 → 400
- [ ] X-Actor-Id に許可外文字 (`!`, `@`, スペース等) → 400
- [ ] body が空 → 400
- [ ] body が壊れた JSON → 400 (`Invalid JSON body`)
- [ ] `invoice_number` 欠落 → 400
- [ ] `vendor_id` 欠落 → 400
- [ ] `invoice_amount` が文字列 → 400
- [ ] `invoice_amount` が負数 → 400
- [ ] `invoice_amount` が小数 → 400 (整数バリデーション)
- [ ] `due_date` が `2026/06/30` → 400
- [ ] `due_date` が存在しない日付 (`2026-02-30`) → 400
- [ ] 同じ (vendor_id, invoice_number) で 2 度目の登録 → 409, `error` メッセージに `already exists` 含む
- [ ] `invoice_number` が 51 文字 → 400
- [ ] body に未知フィールド (`extra: 'x'`) を含める → 400 (I-03: `.strict()` 適用)

### 8.3 FR-06 一覧検索 (GET /api/invoices)

**正常系**
- [ ] status 未指定で全件 (削除済除外) が返る
- [ ] `status=pending` で pending のみフィルタされる
- [ ] `status=approved` で approved のみフィルタされる
- [ ] `limit=10` で 10 件まで返る
- [ ] `offset=10` で 11 件目以降が返る
- [ ] `total` が DB の件数と一致 (limit/offset の影響を受けない)
- [ ] 削除済 (`deleted_at` セット) の Invoice が `items` に含まれない
- [ ] 並び順は `created_at desc`

**異常系**
- [ ] `status=invalid` → 400
- [ ] `limit=0` → 400
- [ ] `limit=101` → 400
- [ ] `limit=abc` → 400
- [ ] `offset=-1` → 400

### 8.4 FR-01相当 詳細取得 (GET /api/invoices/:id)

**正常系**
- [ ] 存在する id で 200, Invoice 返却
- [ ] レスポンスから `deleted_at` が露出しない

**異常系**
- [ ] 存在しない id → 404
- [ ] 削除済 id → 404
- [ ] 不正な id 形式 (CUID でない文字列等) → 404 (I-04: 形式チェックは行わず Repository の NotFound 判定に一任)

### 8.5 FR-02 承認 (POST /api/invoices/:id/approve)

**正常系**
- [ ] status=pending を承認 → status=approved, approver_id=X-Approver-Id, approved_at がセット, 200
- [ ] AuditLog (action=approve, actor_id=approver_id, before=pending, after=approved) が記録される

**異常系**
- [ ] X-Approver-Id 欠落 → 400
- [ ] X-Approver-Id 形式不正 (51文字、特殊文字) → 400
- [ ] 存在しない id → 404
- [ ] status=mismatch → 422
- [ ] status=approved → 409 (`already approved` 含む)
- [ ] status=rejected → 409
- [ ] 承認後、Invoice の updated_at が変化、AuditLog が 1 件挿入されている (DB 確認)
- [ ] DB エラー時 (例: tx 失敗) は Invoice も AuditLog も更新されない (アトミック性)

### 8.6 FR-03 差戻し (POST /api/invoices/:id/reject)

**正常系**
- [ ] status=pending を差戻し → status=rejected, rejection_reason/rejected_by/rejected_at セット, 200
- [ ] status=mismatch を差戻し → status=rejected
- [ ] AuditLog (action=reject, before=pending or mismatch, after=rejected, note=rejection_reason) 記録

**異常系**
- [ ] X-Actor-Id 欠落 → 400
- [ ] body 欠落 / `rejection_reason` 欠落 → 400
- [ ] `rejection_reason` 空文字 → 400
- [ ] `rejection_reason` 501 文字 → 400
- [ ] 存在しない id → 404
- [ ] status=approved → 409
- [ ] status=rejected → 409 (二重差戻し防止)

### 8.7 FR-04 再提出 (PATCH /api/invoices/:id/resubmit)

**正常系**
- [ ] rejected の Invoice を金額一致値で再提出 → status=pending, 金額/期日が更新, 200
- [ ] rejected の Invoice を金額不一致値で再提出 → status=mismatch
- [ ] `invoice_amount` のみ指定 → 他フィールドは現状維持、status は再判定
- [ ] `due_date` のみ指定 → 金額不変なので status はそのまま (rejected→pending か mismatch かは元の金額一致状況に依存) — 元 reject 時に金額一致だった場合 pending、不一致だった場合 mismatch
- [ ] 再提出後、`rejection_reason`/`rejected_by`/`rejected_at` は履歴として保持される
- [ ] AuditLog (action=resubmit, before=rejected, after=pending or mismatch) 記録

**異常系**
- [ ] X-Actor-Id 欠落 → 400
- [ ] body が空オブジェクト `{}` → 400 (`refine` でブロック)
- [ ] `invoice_amount` が負数 → 400
- [ ] `due_date` 不正形式 → 400
- [ ] status=pending の Invoice を再提出 → 409
- [ ] status=mismatch の Invoice を再提出 → 409
- [ ] status=approved の Invoice を再提出 → 409
- [ ] 存在しない id → 404
- [ ] body に `vendor_id` や `invoice_number` 等の未知フィールドを含める → 400 (FR-04 / I-03: `.strict()` で拒否)

### 8.8 FR-05 削除 (DELETE /api/invoices/:id)

**正常系**
- [ ] status=pending を削除 → 204, deleted_at セット, GET /api/invoices/:id が 404 を返すようになる
- [ ] status=mismatch を削除 → 204
- [ ] status=rejected を削除 → 204
- [ ] AuditLog (action=delete, before=元status, after=null) 記録

**異常系**
- [ ] X-Actor-Id 欠落 → 400
- [ ] 存在しない id → 404
- [ ] 既削除 id → 404
- [ ] status=approved → 409

### 8.9 FR-07 監査ログ (GET /api/audit-logs)

**正常系**
- [ ] `invoice_id` 指定で当該 Invoice の AuditLog のみ返る
- [ ] `invoice_id` 未指定で全 AuditLog が返る (limit デフォルト 50)
- [ ] `limit=10` で 10 件まで返る
- [ ] 並び順は `created_at desc`

**異常系**
- [ ] `limit=0` → 400
- [ ] `limit=201` → 400
- [ ] `invoice_id` が空文字 → 400 (I-04: 形式チェックは緩いが空文字は拒否)
- [ ] `invoice_id` が DB 上に存在しない CUID → 200 (空配列。filter なので 404 にしない)

### 8.10 ヘルスチェック (GET /api/health)

**正常系**
- [ ] DB 接続正常 → 200, `{ status: 'ok' }`

**異常系**
- [ ] Prisma の `$queryRaw` がエラー時 (mock で reject) → 503, `{ status: 'degraded', error: ... }`

### 8.11 ミドルウェア単体

**withErrorHandler**
- [ ] AppError サブクラスを投げると httpStatus に変換される (Validation→400, NotFound→404, Conflict→409, Unprocessable→422)
- [ ] ZodError を投げると 400 に変換され、`error` メッセージに path: msg 形式が含まれる
- [ ] SyntaxError を投げると 400 (`Invalid JSON body`)
- [ ] 一般 Error を投げると 500
- [ ] ハンドラの正常レスポンスはそのまま素通り

**withCors**
- [ ] OPTIONS リクエストに 204 を返し、CORS ヘッダーが含まれる
- [ ] 他メソッドのレスポンスに `Access-Control-Allow-Origin` が含まれる
- [ ] エラーレスポンス (4xx/5xx) にも CORS ヘッダーが含まれる

**withActor / requireActorId / requireApproverId**
- [ ] 正常な X-Actor-Id を抽出できる
- [ ] X-Actor-Id 欠落で ValidationError
- [ ] X-Actor-Id 形式不正で ValidationError
- [ ] X-Approver-Id でも同様

### 8.12 Service 層単体 (Repository モック)

- [ ] `InvoiceService.create()` が Repository.findByVendorAndNumber → ConflictError チェック → tx でcreate + audit を順に呼ぶ
- [ ] `InvoiceService.approve()` が status=mismatch で UnprocessableError, status=approved/rejected で ConflictError を投げる
- [ ] `InvoiceService.reject()` が status=approved/rejected で ConflictError を投げる
- [ ] `InvoiceService.resubmit()` が status≠rejected で ConflictError を投げる
- [ ] `InvoiceService.softDelete()` が status=approved で ConflictError を投げる
- [ ] 各 Service が `prisma.$transaction` のクロージャを呼んでいる (mock でアサート)

### 8.13 Repository 層単体 (実DB、テストSQLite)

- [ ] `InvoiceRepository.create` が UNIQUE 制約違反で例外
- [ ] `InvoiceRepository.findByVendorAndNumber` が削除済を返さない
- [ ] `InvoiceRepository.list` が `deleted_at IS NOT NULL` を除外
- [ ] `InvoiceRepository.softDelete` が deleted_at をセットする (物理削除しない)
- [ ] 全 Repository メソッドが tx 引数を渡されたとき tx 上で動く (mock の prisma client 差し替えで確認)

### 8.14 トランザクション境界 (E2E in-process)

- [ ] approve 中に AuditLogRepository.create が throw すると Invoice の status も approver_id も更新されない (ロールバック確認)
- [ ] reject 中に Invoice.update が throw すると AuditLog も挿入されない

---

## 9. DTO 変換

```typescript
// src/lib/dto.ts
import type { Invoice, AuditLog } from '@prisma/client';

/** API レスポンス用に Invoice を整形。deleted_at を除去し、due_date を YYYY-MM-DD に整形。 */
export function toInvoiceDTO(i: Invoice) {
  const { deleted_at: _omit, due_date, approved_at, rejected_at, created_at, updated_at, ...rest } = i;
  return {
    ...rest,
    due_date: due_date.toISOString().slice(0, 10), // YYYY-MM-DD
    approved_at: approved_at?.toISOString() ?? null,
    rejected_at: rejected_at?.toISOString() ?? null,
    created_at: created_at.toISOString(),
    updated_at: updated_at.toISOString(),
  };
}

export function toAuditLogDTO(a: AuditLog) {
  return {
    ...a,
    created_at: a.created_at.toISOString(),
  };
}
```

---

## 10. DI コンテナと Prisma シングルトン

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}
// dev 環境のホットリロードによるコネクション増殖を防ぐ
export const prisma = globalThis.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;
```

```typescript
// src/lib/container.ts
import { prisma } from './prisma';
import { InvoiceRepository } from '@/repositories/invoiceRepository';
import { AuditLogRepository } from '@/repositories/auditLogRepository';
import { InvoiceService } from '@/services/invoiceService';
import { AuditLogService } from '@/services/auditLogService';

const invoiceRepo = new InvoiceRepository(prisma);
const auditRepo = new AuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditRepo);
const invoiceService = new InvoiceService(invoiceRepo, auditLogService, prisma);

export { invoiceService, auditLogService, prisma };
```

---

## 11. 設計確認チェックリスト (Functional Design 完了基準)

- [x] Prisma スキーマが Invoice / AuditLog 双方を網羅し、status/action は String + アプリ層 enum 検証で扱う
- [x] Zod スキーマが API 契約の全エンドポイントをカバー (header / body / query / param)
- [x] 各ハンドラの状態遷移チェックが services.md §2.3 マトリクスと一致
- [x] エラークラス (Validation/NotFound/Conflict/Unprocessable) と HTTP ステータスのマッピングが api-contract.md と一致
- [x] withErrorHandler / withCors / withActor の責務が分離
- [x] $transaction で Invoice 更新と AuditLog 挿入をアトミック化
- [x] /api/health が `SELECT 1` で疎通確認、失敗時 503
- [x] FR-01〜FR-07 をすべてカバーするテストケース一覧

---

## 修正履歴
- 2026-05-04 R1 → R2: B-01/B-02/B-03 解消、I-02/I-03/I-04 反映
  - B-01: §3.3〜§3.7 の `[id]` 系ハンドラを `ctx: { params: Promise<{ id: string }> }` + `await ctx.params` に変更 (Next.js 15 対応)
  - B-02: §3.8 に `AuditLogService.list()` / `AuditLogRepository.list(filter, paging, tx?)` の擬似コードを追加 (`orderBy: created_at desc` 明記、`invoice_id` 未指定時は全件)。既存 `listByInvoice` は新 `list` に統一
  - B-03: 詳細は infrastructure-design.md §5.3 を参照 (init マイグレーション必須化)
  - I-03: `createInvoiceSchema` / `resubmitInvoiceSchema` に `.strict()` を付与し、未知フィールドを 400 で拒否
  - I-04: `idParamPrimitive` (= `z.string().min(1)`) を導入し、ID 形式不正を 400 ではなく Repository の NotFound 判定 (404) に一任。テスト 8.4 / 8.9 を整合更新
