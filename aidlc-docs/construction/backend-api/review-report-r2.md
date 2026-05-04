# Backend-api Construction Design Review (R2)
**レビュー日**: 2026-05-04
**レビュー担当**: Reviewer Agent (第三者視点、R1 とは独立判断)
**対象**:
- `aidlc-docs/construction/backend-api/functional-design/functional-design.md` (R2 修正版)
- `aidlc-docs/construction/backend-api/infrastructure-design/infrastructure-design.md` (R2 修正版)

**前提**: R1 レビュー (`review-report.md`) で挙げた Blocking 3 件と改善提案 4 件 (I-02, I-03, I-04) の解消確認が主目的。

---

## 1. Blocking 対応確認

| ID | 対応有無 | 確認箇所 | 評価 |
|---|---|---|---|
| **B-01** Next.js 15 `params` Promise 化 | 対応済 | FD §3.3〜§3.7 の全 `[id]` 系ハンドラで `ctx: { params: Promise<{ id: string }> }` + `await ctx.params` に統一。コメントで Next.js 15 仕様を明記 | OK |
| **B-02** AuditLogService.list / Repository.list 実装ギャップ | 対応済 | FD §3.8 に `AuditLogService.list()` と `AuditLogRepository.list(filter, paging, tx?)` の擬似コード追加。`orderBy: { created_at: 'desc' }` 明記、`invoice_id` 未指定で全件取得、既存 `listByInvoice` を新 `list` に置換する旨を設計ノートで明示 | OK |
| **B-03** 初回マイグレーション要件 | 対応済 | ID §5.3.1 を新設。`prisma migrate dev --name init --create-only` でコミット必須、`migration_lock.toml` 含む生成物列挙、README 申し送り、`.gitignore` 確認、トラブルシュート手順を網羅。§11.1 の事前チェックにも反映 | OK |

## 2. 改善提案対応確認

| ID | 対応有無 | 確認箇所 | 評価 |
|---|---|---|---|
| **I-02** ヘルスチェック判定強化 | 対応済 | ID §1.2 / §4.3 / §7 で `wget -qO- ... \| grep -q '"status":"ok"'` に統一。compose 側は `CMD-SHELL` でパイプ動作を担保 | OK |
| **I-03** `.strict()` 付与 | 対応済 | FD §2.3 createInvoiceSchema、§2.7 resubmitInvoiceSchema 両方に `.strict()` 付与。テスト 8.2 / 8.7 にも未知フィールド拒否ケース追加 | OK |
| **I-04** ID 形式不正は 404 に一任 | 対応済 | FD §2.1 に `idParamPrimitive = z.string().min(1)` 導入、`cuidSchema` は path/query で不使用と明記。§2.8 / §2.9 / §3.3〜§3.7 で適用、テスト 8.4 / 8.9 を 404 期待に整合更新 | OK |

## 3. 副作用 / 新規 inconsistencies チェック

- 状態遷移マトリクス (FD §3.9) は services.md §2.3 と一致継続。
- ミドルウェア合成順序 (FD §5.4) は変更なし、エラークラス・トランザクション境界 (§4 / §6) も維持。
- B-02 で `listByInvoice` を `list` に置換した旨は component-methods.md との差分が生じるが、設計ノートで明示済 (Code Generation での反映が前提)。
- I-04 で auditLogQuerySchema が `invoice_id` 空文字を拒否 (テスト 8.9) する一方、存在しない CUID は空配列で 200 を返す方針が一貫。
- Dockerfile の HEALTHCHECK と docker-compose の healthcheck は二重定義のままだが、双方同じ判定ロジックに揃っており不整合なし。

## 4. 残課題

- なし (R1 の non-blocking 残り I-01/I-05〜I-10 は今回修正対象外であり、いずれも設計ドキュメント追記レベルで Code Generation には影響しない。Blocking 要素なし)。
- component-methods.md 側の `listByInvoice` 表記は将来的な整合更新が望ましい (申し送り事項、Code Generation で実装が新 `list` に統一されれば実害なし)。

## 5. 結論

**Pass** — R1 で指摘した Blocking 3 件 (B-01/B-02/B-03) と改善提案 4 件 (I-02/I-03/I-04) はすべて適切に解消されており、修正による新規不整合や副作用も確認されない。Code Generation への着手を承認する。
