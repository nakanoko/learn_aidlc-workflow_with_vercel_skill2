# Frontend-ui Construction Design Review (R2)

**レビュー日**: 2026-05-04
**レビュアロール**: Reviewer (設計担当とは別ロール、第三者視点)
**対象ファイル**:
- `aidlc-docs/construction/frontend-ui/functional-design/functional-design.md` (R2)
- `aidlc-docs/construction/frontend-ui/infrastructure-design/infrastructure-design.md` (R2)
**前回レビュー**: `review-report.md` (R1)

---

## サマリ

- 重大指摘 (Blocking): **0件**
- 改善提案 (Non-blocking): **1件 (軽微)**
- 結論: **Pass**

---

## R1 指摘の対応状況

| ID | 指摘 | 対応 | 確認箇所 |
|---|---|---|---|
| B-01 | エラー文言の二重定義 | **解消** | FD §7.2.1 で「画面別テーブルが source of truth、`handleServerError` は汎用フォールバック」と再定義。§7.2.2 にクロスマトリクス表を新設し、承認400(Approver-Id 欠落) 専用ハンドリング、削除409 文言「承認済の請求書は削除できません」、詳細404 は画面内 alert (Toast 出さず) で確定。§2.3.3〜2.3.7 もテーブル参照に統一。 |
| B-02 | StatusBadge ラベル英日混在 | **解消** | FD §3.1.2 `STATUS_STYLES.label` で 4ステータスとも日本語 (承認待ち/承認済/差戻し済/不一致)。§2.1.2 select の表示テキストもバッジと同一日本語、`value` のみ英 enum 保持。テスト SB-01 期待値も「承認待ち」に追従。 |
| I-04 | ConfirmDialog Tab トラップ | **解消** | FD §3.5.3 「省略可」を削除し、Tab 循環 / Shift+Tab 逆方向、初期フォーカス、フォーカス可能要素収集ロジックを明記。 |
| I-05 | status カスタムトークン未使用 | **解消** | FD §3.1.2 で標準パレット採用方針を明記、ID §7.1 で `colors.status.*` 定義を削除。両者の整合説明あり。 |
| I-06 | warningBg トークン未使用 | **解消** | FD §3.4.2 で `bg-amber-50` 標準採用、ID §7.1 で `successBg`/`errorBg`/`warningBg` を削除。design.md の `#FFFBEB` と `amber-50` が等価である旨も注記。 |
| I-10 | vitest カバレッジ閾値 | **解消** | FD §8.7 に `coverage.thresholds` (statements 70 / branches 60) を `vitest.config.ts` に設定する旨を明記。 |
| I-02 | Toast role 切替 | **軽微反映** | FD §3.4.2 表で error variant を `role="alert"` / `aria-live="assertive"` に切替済。 |

参考: I-01 / I-03 / I-07〜I-09 は R1 でも non-blocking、未取込。Pass 判定に影響なし。

---

## 残課題 (Non-blocking)

### N-01 (軽微) Toast コンテナ外側の `role="status"` 固定

FD §3.4.2 表では variant 別 role を定義したが、§3.4.2 末尾の JSX 例では `<div role="status" aria-live="polite">` のままコンテナ全体に固定。実装時は variant ごとに各 Toast 個別へ role を移すべき (I-03 と同主旨)。コード生成段階で吸収可能。

---

## 結論

**Pass**。R1 の Blocking 2件と取り込み宣言された改善提案 4件はすべて解消。FD/ID 間の整合 (標準パレット採用、カスタムトークン削除) も双方向で記述一致。残る N-01 は実装時に容易に修正可能な軽微事項のため、Code Generation ステージへ進行可。
