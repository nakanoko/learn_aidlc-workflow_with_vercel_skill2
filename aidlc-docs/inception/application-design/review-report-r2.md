# Application Design レビューレポート (R2 / 第三者再レビュー)

**プロジェクト**: 請求書チェック・承認Webシステム
**レビュー日**: 2026-05-04
**ラウンド**: R2 (修正版再レビュー)
**レビュー対象**: application-design.md / components.md / component-methods.md / services.md / api-contract.md
**レビュー観点**: 前回 R1 指摘の解消状況のみ

---

## 1. 前回 Blocking 指摘の解消状況

### B-1: api-contract.md `reject` Errors と services.md 状態遷移マトリクスの表記揺れ
- **状態**: ✅ 解消
- **確認内容**:
  - `api-contract.md` §5 Errors: `409: 既に approved または rejected (※差戻し可能なのは pending または mismatch のみ)`
  - `services.md` §2.3 マトリクス: `rejected → reject = ❌ 409`、`approved → reject = ❌ 409`
  - `application-design.md` §3 サマリ表も同一の遷移表に統一されており、3ファイル間で整合。

### B-2: `InvoiceService` コンストラクタ引数の不整合 (2 vs 3)
- **状態**: ✅ 解消
- **確認内容**:
  - `component-methods.md` §1: 3引数 (`invoiceRepo`, `auditService`, `prisma`) に統一。`prisma` を持つ理由 (`$transaction` 境界) のコメントも追記済。
  - `services.md` §4 DIコンテナ: `new InvoiceService(invoiceRepo, auditService, prisma)` で 3引数。完全一致。
  - Repository 群も `tx?: TxClient` 引数を受け取る形に揃えられ、トランザクション設計が一貫。

---

## 2. 前回の改善提案の対応状況

| # | 指摘 | 対応 | 確認場所 |
|---|---|---|---|
| #2 | `X-Actor-Id` の検証ルール未定義 | ✅ 対応 | `api-contract.md` 共通仕様「Actor ID 形式」に1-50文字、英数字/ハイフン/アンダースコアのみ、規定外は400と明記 |
| #3 | approve で X-Actor-Id / X-Approver-Id の使い分けが不明 | ✅ 対応 | `api-contract.md` §4 に「X-Actor-Id は不要、X-Approver-Id を actor_id として記録」と明示 |
| #4 | `resubmit` の最低1フィールド必須がスキーマ未明記 | ✅ 対応 | `api-contract.md` §6 に「Zodの `refine()` で強制」、Errors にも「すべてのフィールドが未指定 → 400」を追加 |
| #5 | CORS Origin が環境変数化されていない | ✅ 対応 | `api-contract.md` §10 と `application-design.md` §7 で `CORS_ALLOW_ORIGIN` 環境変数化、デフォルト値も記載 |
| #7 | AuditLog の delete 時 `before_status` 取り扱い未定義 | ✅ 対応 | `services.md` §3.1 に「delete: before_status=削除前status, after_status=null」と明記 |
| #8 | `/api/audit-logs` のフロントUI不在の明示なし | ✅ 対応 | `api-contract.md` §11「監査ログ閲覧UI」で Out of Scope を明示 |

---

## 3. 追加で確認した整合性

- セキュリティ注記 (`application-design.md` §7.1) で X-Actor-Id 系がPoC限定であることを宣言済み。
- 状態遷移マトリクスが `application-design.md` / `services.md` で完全一致。
- API契約と Service メソッドのエラー (404/409/422) の対応も一貫。

---

## 4. 残課題

なし。R1 で挙げた Blocking および改善提案は全項目クローズ。

---

## 5. 最終結論

**Pass** — 前回指摘 (Blocking 2件、改善提案 6件) はすべて解消。設計成果物間の整合性も担保されており、次ステージ (Construction) に進行可能。
