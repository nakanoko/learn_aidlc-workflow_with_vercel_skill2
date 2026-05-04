# Components

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                    システム全体                              │
│                                                              │
│  ┌──────────────────┐         ┌──────────────────────────┐  │
│  │  Frontend        │ ──HTTP→ │  Backend (Next.js)       │  │
│  │  (React + Vite)  │         │  Route Handlers          │  │
│  │  :3001           │ ←JSON── │  :3000                   │  │
│  └──────────────────┘         └──────────────────────────┘  │
│                                          │                   │
│                                          ▼                   │
│                                ┌──────────────────────┐      │
│                                │  SQLite              │      │
│                                │  (Prisma client)     │      │
│                                │  /data/invoices.db   │      │
│                                └──────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Components (Unit: frontend-ui)

### 2.1 App Shell
| 項目 | 内容 |
|---|---|
| **コンポーネント名** | `AppShell` |
| **責務** | アプリ全体のレイアウト、ヘッダー、ルータ、エラー境界の提供 |
| **インタフェース** | React Component (BrowserRouterを内包) |

### 2.2 InvoiceListPage
| 項目 | 内容 |
|---|---|
| **コンポーネント名** | `InvoiceListPage` |
| **責務** | 請求書一覧表示、ステータスフィルタ、新規登録への導線 |
| **インタフェース** | React Page Component (path: `/`) |

### 2.3 InvoiceCreatePage
| 項目 | 内容 |
|---|---|
| **コンポーネント名** | `InvoiceCreatePage` |
| **責務** | 請求書登録フォーム、バリデーション、登録APIコール |
| **インタフェース** | React Page Component (path: `/invoices/new`) |

### 2.4 InvoiceDetailPage
| 項目 | 内容 |
|---|---|
| **コンポーネント名** | `InvoiceDetailPage` |
| **責務** | 請求書詳細表示、承認・差戻しアクション、rejected時の編集再提出 |
| **インタフェース** | React Page Component (path: `/invoices/:id`) |

### 2.5 共通UIプリミティブ
| コンポーネント | 責務 |
|---|---|
| `StatusBadge` | ステータス(`pending`/`approved`/`rejected`/`mismatch`) を色分けバッジ表示 |
| `Button` | プライマリ/セカンダリ/危険系ボタンのバリエーション |
| `FormField` | ラベル + 入力 + エラーメッセージ |
| `Toast` | 操作結果の通知 (成功/エラー) |
| `ConfirmDialog` | 削除・差戻しなどの確認ダイアログ |

### 2.6 API Client (`apiClient`)
| 項目 | 内容 |
|---|---|
| **モジュール名** | `apiClient.ts` |
| **責務** | バックエンドAPIへのfetch呼び出し、エラーハンドリング、X-Actor-Idヘッダー付与 |
| **インタフェース** | 関数群 (createInvoice, listInvoices, getInvoice, approveInvoice, rejectInvoice, resubmitInvoice, deleteInvoice) |

---

## 3. Backend Components (Unit: backend-api)

### 3.1 Route Handlers (`app/api/...`)
| ハンドラ | パス | 責務 |
|---|---|---|
| `POST /api/invoices` | 請求書登録 | リクエスト検証 → InvoiceServiceに委譲 |
| `GET /api/invoices` | 請求書一覧 (status filter) | クエリ検証 → InvoiceServiceに委譲 |
| `GET /api/invoices/:id` | 請求書詳細 | パスパラ検証 → InvoiceServiceに委譲 |
| `POST /api/invoices/:id/approve` | 承認 | リクエスト検証 → InvoiceServiceに委譲 |
| `POST /api/invoices/:id/reject` | 差戻し | リクエスト検証 → InvoiceServiceに委譲 |
| `PATCH /api/invoices/:id/resubmit` | 再提出 | リクエスト検証 → InvoiceServiceに委譲 |
| `DELETE /api/invoices/:id` | 論理削除 | InvoiceServiceに委譲 |
| `GET /api/audit-logs` | 監査ログ取得 (任意) | AuditLogServiceに委譲 |
| `GET /api/health` | ヘルスチェック | DBへのpingを行い200/503を返す |

### 3.2 Service Layer
| サービス | 責務 |
|---|---|
| `InvoiceService` | 請求書のCRUD・状態遷移ロジック (mismatch判定、approve可否、reject必須項目)、AuditLogServiceの呼び出し |
| `AuditLogService` | 監査ログの記録、取得 |

### 3.3 Repository Layer
| リポジトリ | 責務 |
|---|---|
| `InvoiceRepository` | Prismaを介したInvoiceテーブルの永続化、UNIQUE制約処理 |
| `AuditLogRepository` | Prismaを介したAuditLogテーブルへの追記 |

### 3.4 Validation Schemas (`schemas/`)
| スキーマ | 用途 |
|---|---|
| `createInvoiceSchema` | POST /api/invoices |
| `listInvoicesQuerySchema` | GET /api/invoices |
| `approveInvoiceSchema` | POST /api/invoices/:id/approve |
| `rejectInvoiceSchema` | POST /api/invoices/:id/reject (rejection_reason必須) |
| `resubmitInvoiceSchema` | PATCH /api/invoices/:id/resubmit |

### 3.5 Errors (`errors.ts`)
| クラス | 用途 |
|---|---|
| `AppError` | 業務エラー基底クラス (httpStatus, message を持つ) |
| `ValidationError` | 400 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `UnprocessableError` | 422 |

### 3.6 Middleware
| ミドルウェア | 責務 |
|---|---|
| `withErrorHandler` | Route Handlerをラップし AppErrorを適切なHTTPステータス・JSONに変換 |
| `withCors` | 開発環境でフロント (localhost:3001) からのアクセスを許可 |
| `withActor` | `X-Actor-Id` / `X-Approver-Id` ヘッダーを抽出してハンドラに渡す |

### 3.7 Database Layer (Prisma)
| 項目 | 内容 |
|---|---|
| `prisma/schema.prisma` | Invoice + AuditLog モデル定義 |
| `lib/prisma.ts` | PrismaClientのシングルトン |
| `prisma/migrations/` | マイグレーションファイル |

---

## 4. Component Boundaries (Unit分割の根拠)

| Unit | 含まれるコンポーネント | 依存物 |
|---|---|---|
| **backend-api** | Route Handlers, Service, Repository, Schemas, Errors, Middleware, Prisma | SQLite |
| **frontend-ui** | AppShell, Pages, UIプリミティブ, apiClient | backend-api (HTTP) |

両ユニットは別コンテナで起動し、HTTP API を介して通信する。
