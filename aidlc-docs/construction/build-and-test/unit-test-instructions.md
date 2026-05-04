# Unit Test Instructions

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04

---

## 1. テストフレームワーク

| ユニット | テストフレームワーク |
|---|---|
| backend-api | Vitest |
| frontend-ui | Vitest + React Testing Library + jsdom |

両ユニットで `npm test` (= `vitest run`) を実行する。

---

## 2. backend-api ユニットテスト

### 2.1 実行
```bash
cd backend
npm test                        # 全テスト1回実行
npm run test:watch              # 変更検知モード
npm run test:coverage           # カバレッジレポート付き
```

### 2.2 テストファイル一覧 (88 tests, 7 files)
| ファイル | テスト数 | 内容 |
|---|---|---|
| `tests/services/invoiceService.test.ts` | 12 | 正常系: create, list, getById, approve, reject, resubmit, softDelete + mismatch自動判定 |
| `tests/services/invoiceService.error.test.ts` | 17 | 異常系: 重複409, mismatch承認422, 状態不正409, not found 404 |
| `tests/services/auditLogService.test.ts` | 6 | 監査ログ記録・取得 |
| `tests/repositories/invoiceRepository.test.ts` | 10 | Prisma経由のCRUD、UNIQUE制約検証 (実 SQLite 利用) |
| `tests/repositories/auditLogRepository.test.ts` | 5 | AuditLog Repository、orderBy desc |
| `tests/schemas/invoiceSchemas.test.ts` | 30 | Zod バリデーション、`.strict()` 未知フィールド拒否、`.refine()` 最低1フィールド |
| `tests/middleware/withErrorHandler.test.ts` | 8 | AppError → HTTP変換、未知エラーは500 |

### 2.3 期待結果
```
 Test Files  7 passed (7)
      Tests  88 passed (88)
```

### 2.4 テスト用 DB
- `prisma/test.db` (テスト専用)
- 各テストの `beforeEach` で truncate (もしくは migrate reset)
- テスト用 DB は `.gitignore` に含む

### 2.5 vitest.config.ts 設定
- `fileParallelism: false` — SQLite ファイルロック競合を避けるため逐次実行
- `pool: 'forks'`, `singleFork: true`
- `setupFiles: ['./tests/setup.ts']` — テスト用環境変数とDBクリーンアップ

---

## 3. frontend-ui ユニットテスト

### 3.1 実行
```bash
cd frontend
npm test                        # 全テスト1回実行
npm run test:watch              # 変更検知モード
npm run test:coverage           # カバレッジレポート (閾値: statements 70%, branches 60%)
```

### 3.2 テストファイル一覧 (58 tests, 8 files)
| ファイル | テスト数 | 内容 |
|---|---|---|
| `tests/api/apiClient.test.ts` | 8 | fetch モック、各メソッド、ヘッダー付与、エラーハンドリング |
| `tests/components/StatusBadge.test.tsx` | 4 | 4ステータス × 日本語ラベル × 色 |
| `tests/components/Button.test.tsx` | 3 | バリエーション、disabled 状態 |
| `tests/components/FormField.test.tsx` | 2 | label, aria-* 属性 |
| `tests/components/ConfirmDialog.test.tsx` | 5 | ESC、オーバーレイクリック、Tab フォーカストラップ、required text input |
| `tests/pages/InvoiceListPage.test.tsx` | 8 | 一覧表示、ステータスフィルタ、ローディング、エラー |
| `tests/pages/InvoiceCreatePage.test.tsx` | 7 | フォームバリデーション、409重複、5xxエラー |
| `tests/pages/InvoiceDetailPage.test.tsx` | 15 | 各ステータスのアクション切替、承認・差戻し・再提出・削除フロー |

### 3.3 期待結果
```
 Test Files  8 passed (8)
      Tests  58 passed (58)
```

### 3.4 vitest.config.ts 設定
- `environment: 'jsdom'`
- `coverage.thresholds: { statements: 70, branches: 60 }`
- `setupFiles: ['./src/setupTests.ts']` (jest-dom matchers)

---

## 4. 品質ゲート確認

実行する前に、両ユニットで以下を実行:
```bash
# 各ユニットで
npm run typecheck               # TypeScript 型チェック (Exit 0)
npm run lint                    # ESLint (no errors, no warnings)
npm test                        # ユニットテスト全成功
```

すべて Exit 0 で完了することが要件。

---

## 5. テスト失敗時のトラブルシュート

| 症状 | 原因 | 対処 |
|---|---|---|
| `Database is locked` | SQLite 並列アクセス | `vitest.config.ts` で `fileParallelism: false` 確認 |
| `Cannot find module '@prisma/client'` | Prisma Client 未生成 | `npx prisma generate` |
| `process.env.NODE_ENV ... read-only` | 型エラー | `(process.env as Record<string, string>)['NODE_ENV']` 形式で代入 |
| `act() warning` (frontend) | 非同期更新の wrap 不足 | 影響なし、無視可 (将来改善) |
| `mock.calls[0]` 型エラー | 空タプル | mockFetch helper の引数型を明示 |
