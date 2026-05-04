# Frontend-ui Construction Design Review (R1)
**レビュー日**: 2026-05-04
**レビュアロール**: Reviewer (設計担当とは別ロール)
**対象ファイル**:
- `aidlc-docs/construction/frontend-ui/functional-design/functional-design.md`
- `aidlc-docs/construction/frontend-ui/infrastructure-design/infrastructure-design.md`

**参照ベースライン**:
- `aidlc-docs/inception/requirements/requirements.md`
- `aidlc-docs/inception/application-design/application-design.md`
- `aidlc-docs/inception/application-design/api-contract.md`
- `aidlc-docs/inception/application-design/design.md`

---

## サマリ

- 重大指摘 (Blocking): **2件**
- 改善提案 (Non-blocking): **10件**
- 結論: **Pass with minor** — 重大指摘2件は軽微な定義揺れに留まり、いずれも記述追加または短い修正で解消可能。実装フェーズに進んで差し支えない範囲だが、コード生成前に Blocking 2件の文言/挙動修正を反映するのが望ましい。

---

## 重大指摘 (Blocking)

### B-01 `handleServerError` と画面個別エラー表示が二重定義され、優先順位が不明確
**該当箇所**: FD §2.3.3 / §2.3.4 / §2.3.6 / §2.3.7 と §7.2

**問題**:
- FD §7.2 で汎用 `handleServerError(err, context)` が定義され、400 → `toast.warning`, 422 → 「mismatch のため承認できません」固定文言, 404 → `toast.error('対象の請求書が見つかりません')`, 409(create) → inline banner 等を一元処理するとされている。
- しかし各画面 (FD §2.3.3 承認、§2.3.4 差戻し、§2.3.6 削除、§2.3.7 詳細404) に個別の文言・表示先が直接記述されており、双方を読むと「どちらが採用される設計か」が一意に決まらない。
  - 例1: 承認時の400(Approver-Id 欠落)について §2.3.3 では `toast.error('承認者IDが設定されていません…')` だが §7.2 では 400 共通で `toast.warning(err.serverMessage)`。
  - 例2: 詳細画面の 404 について §2.3.7 では「画面内 alert + 一覧へ戻るボタン」、§7.2 では「Toast (error) もしくは画面内 alert」と曖昧。
  - 例3: 削除409について §2.3.6 では「`toast.error('承認済の請求書は削除できません')`、ダイアログ閉じ」、§7.2 では「`toast.error('既に確定済みのため操作できません')`」と文言不一致。

**影響**: コード生成エージェントが画面個別仕様と汎用仕様のどちらをベースにするか分岐し、テストケース (D-07, D-14) のアサーション文言と実装文言が乖離する可能性。受入テスト時のエビデンス揺れ。

**修正案**:
- `handleServerError` を **「汎用フォールバック」** と明記し、画面/操作個別の文言マッピングを **正の真実 (source of truth)** とする。§7.2 を「個別が定義されていないケースの既定動作」と再定義し、表 (HTTP × context) を画面別に併記する。または逆に画面個別マッピングを削除し §7.2 のテーブルのみ採用する。
- 特に 404 (詳細) は「画面内 alert (full-page error)、Toast は出さない」で確定すること (UX 上、Toast だけだと詳細画面のレイアウトが破綻するため)。
- 承認時の 400 は「Approver-Id 欠落」専用ハンドリングを残す (一般 400 と区別)。

---

### B-02 StatusBadge のラベル表記が混在(英語/日本語)、design.md と整合不足
**該当箇所**: FD §3.1.2

**問題**:
- design.md §6.2 「ステータスバッジ」表 では label カラムに具体文言指定はないが、§9 アクセシビリティで「ステータスは色だけでなくバッジ内テキストでも示す」、§2.3 で例として「承認済」と日本語表記が示されている。
- 一方 FD §3.1.2 の `STATUS_STYLES.label` は **`pending: 'Pending'` のみ英語**、`approved: '承認済'` / `rejected: '差戻し済'` / `mismatch: '不一致'` は日本語と、表記が混在。
- design.md §7.2 の一覧画面例では `[Pending]` の英表記、§7.3 の詳細画面例も `[Pending]` だが、これは図示用プレースホルダで日本語ユーザ向けの最終文言は別。

**影響**:
- ユーザが日本語/英語混在の UI を見て一貫性が崩れる (要件 §5.4 保守性、design.md §1 「可読性」原則違反)。
- 一覧画面のステータスフィルタの select option (FD §2.1.2) は `pending` 等の英 enum 値で表示しており、バッジ表記とフィルタ表記が連動しないと UX が分かりにくい。

**修正案**:
- `pending` の label を「**未承認**」または「**承認待ち**」に統一 (推奨: 「承認待ち」、業務文脈に合致)。すべて日本語で揃える。
- フィルタ select の表示テキストもバッジと同じ日本語ラベルを使い、`value` だけ英 enum を保持する形に変更。
  ```tsx
  <option value="pending">承認待ち</option>
  <option value="mismatch">不一致</option>
  ...
  ```
- design.md 側にもこのラベル定義を追記して整合させることを推奨 (本ユニットスコープ外なら application-design 側へ FB)。

---

## 改善提案 (Non-blocking)

### I-01 承認操作にクライアント確認を入れることを推奨
- FD §2.3.3 「PoC、ワンクリック承認」と明記されているが、請求書承認は金銭操作であり誤クリックリスクが高い。最低限「承認しますか? (Approver: xxx)」の単純確認ダイアログ (`ConfirmDialog` 流用、`requireConfirmText` 不要) を入れる方がリスクと整合する。実装コストは低い (既存 ConfirmDialog 流用)。

### I-02 Toast の `role` を variant に応じて切替
- FD §3.4.2 では `<div role="status" aria-live="polite">` 一律。エラー Toast は `role="alert"` + `aria-live="assertive"` の方が WCAG 推奨に合致する。

### I-03 Toast コンテナ外側でなく各 Toast 個別に `role` を付与
- 現状はコンテナ全体に `role="status"`。複数 Toast を順次 push する場合、各 Toast に個別 `role` を付与する方がスクリーンリーダーの読み上げ精度が上がる。

### I-04 ConfirmDialog のフォーカストラップを「省略可」とせず最低限実装
- FD §3.5.3 「Tab ループは省略可」とあるが、design.md §9 「モーダルは ESC で閉じる、Tab フォーカストラップ」で要請されている。Tab ループは20行程度で実装可能なため省略は推奨しない。最低限「ダイアログ open 時に最後の要素から Tab すると最初の要素へ戻る」だけでも入れる。

### I-05 Tailwind config の `colors.status.*` トークンが未使用化する懸念
- ID §7.1 で `status.pending` 等のカスタムトークンを定義しているが、FD §3.1.2 の StatusBadge は `bg-amber-100 text-amber-800` のような Tailwind 標準パレットを使っており、カスタムトークンは未参照のまま。design.md §2.3 のセマンティック意図を保つため、テーブル行のステータス強調帯やアイコン色などで `bg-status-pending/10` のような形で利用するか、定義を削除して整合性を取る。

### I-06 Toast の warning 背景が design.md の `--color-warning-bg` と乖離
- design.md §2.3 では `--color-warning-bg = #FFFBEB` (= amber-50) を「警告 Toast 背景」と定義。FD §3.4.2 では `bg-amber-50` 直接指定で結果は同じだが、ID §7.1 で `warningBg: '#FFFBEB'` とトークン定義しているのに使われていない。トークン経由 (`bg-warningBg`) に統一するか、トークンを削除して実装の意図を一本化する。

### I-07 `Dockerfile` runner ステージで `node_modules` を全コピーしている件の最適化余地
- ID §1.1 / §13 で「`vite preview` のため devDependencies 含む `node_modules` を runner にコピー」と認識されているが、PoC 範囲でも `npm prune --production` 後に `vite` を最低限 install し直すか、`serve` (10MB 程度) を採用してイメージサイズを抑える代替案がある。Blocking ではないが README に「PoC として割り切ったトレードオフ」を明記すること。

### I-08 HEALTHCHECK の `wget` が busybox 提供である前提を README に明記
- ID §9.1 で「alpine 標準 (busybox 提供)」と注記済だが、もし `node:20-alpine` のベースイメージが将来 `wget` を含まなくなった場合に CI/CD が壊れる。対策として `RUN apk add --no-cache wget` を Dockerfile に追加するか、`node -e "require('http').get(...)"` ベースのヘルスチェックに置換する選択肢を残す。

### I-09 `--host 0.0.0.0 --port 3001` の二重指定
- ID §1.1 CMD で `npm run preview -- --host 0.0.0.0 --port 3001` を渡しているが、§2 vite.config.ts の `preview.host = '0.0.0.0'` と `preview.port = 3001` で既に設定済。CLI 引数と config の二重指定は意図的(明示性)だが、片方を削除して責務を一本化することを推奨。

### I-10 テストカバレッジ閾値が未設定
- FD §8.7 で「カバレッジ閾値は PoC では未設定」と明記されている。受入基準 §10 の「正常系・異常系のユニットテストが全て成功」を客観的に判定する手段が欠ける。最低限 statements 70%・branches 60% 程度の閾値を vitest config に設定し、CI 実行時に強制することを推奨。

---

## 観点別結果

| # | 観点 | 結果 | コメント |
|---|---|---|---|
| 1 | **要件充足 (FR-01〜06)** | ◯ | FR-01 (登録) → §2.2、FR-02 (承認) → §2.3.3、FR-03 (差戻し) → §2.3.4、FR-04 (再提出) → §2.3.5、FR-05 (削除) → §2.3.6、FR-06 (一覧/フィルタ) → §2.1.2 で網羅。FR-07 監査ログ閲覧UIは要件の Out of Scope なので未実装で正しい (api-contract §11)。 |
| 2 | **設計整合性** | △ | application-design / api-contract / design.md の数値仕様 (HTTP・status・色トークン) は概ね一致。ただし B-01 (エラー文言の二重定義) と B-02 (バッジ表記混在) がある。 |
| 3 | **API 契約準拠** | ◯ | apiClient のシグネチャ (§4.1)、ヘッダー (§4.2)、エラー throw 戦略 (§4.5) は api-contract.md と完全一致。承認時に X-Actor-Id を送らない仕様も正しく反映。 |
| 4 | **状態遷移 UI ロジック** | ◯ | FD §2.3.2 のボタン構成テーブルは application-design.md §3 状態遷移マトリクスと完全一致。pending=承認/差戻し/削除、mismatch=差戻し/削除のみ、rejected=再提出/削除、approved=操作不可。 |
| 5 | **デザインガイド反映** | △ | カラー、ボタン、フォーム、ダイアログのクラスは design.md §6 と概ね一致。ただし I-05 (status トークン未使用)、I-06 (warningBg トークン未使用)、B-02 (ラベル表記混在) で軽微な乖離あり。 |
| 6 | **アクセシビリティ** | △ | `aria-required` / `aria-invalid` / `aria-describedby` / `role="alert"` / `role="dialog"` / `aria-modal` / `aria-labelledby` は適切に付与。フォーカスリングも `:focus-visible` で標準化済。改善余地: Toast role 切替 (I-02)、ConfirmDialog Tab トラップ (I-04)。 |
| 7 | **エラーハンドリング** | △ | 400/404/409/422/5xx それぞれの表示先が定義されているが B-01 の二重定義が解消必要。ネットワークエラー (TypeError) → Toast の経路は明確 (§4.5)。 |
| 8 | **コンテナ構成** | ◯ | マルチステージ Dockerfile、`npm ci` 採用、build-time `VITE_API_BASE_URL` の ARG 受け、HEALTHCHECK、非root (node ユーザ) 起動、`strictPort:true` で早期失敗、CLAUDE.md §5 品質ゲートマトリクス (ID §12) 完備。CLAUDE.md 第1章 (フロント/バック別コンテナ) に完全準拠。 |
| 9 | **テストカバレッジ** | ◯ | InvoiceListPage (8ケース)、Create (9)、Detail (15)、共通UI (15)、apiClient (8)、actor.ts (3) の計58ケースが網羅的に列挙され、状態遷移境界 (D-07 422、D-14 409、D-15 404) や a11y (CD-01〜05、FF-01/02) も含む。改善: I-10 (閾値未設定)。 |
| 10 | **保守性** | ◯ | Pages / components / api / lib / types のディレクトリ責務分離が明確。命名規約 (PascalCase コンポーネント、camelCase ヘルパ、`apiClient.{verbResource}`) は一貫。型は frontend で個別定義し backend と意図的に共有しない方針が application-design.md §7 と一致。 |

### 拡張ルール準拠
- Security Baseline 拡張: **無効** (要件 §5.2、§12)
- PBT 拡張: **無効** (要件 §5.5、§12)
- 適用必須拡張は無いため、本レビューで追加チェックは N/A。

### CLAUDE.md 準拠 (品質ゲート §5)
| 要件 | 対応 |
|---|---|
| ビルド成功 | `npm run build` (ID §5) |
| テスト成功 | `npm test` (Vitest, FD §8) |
| Lint/静的解析成功 | `npm run lint` (ID §5) |
| 型チェック成功 | `npm run typecheck` (ID §5) |
| docker-compose 起動可能 | ID §4 |
| package-lock.json 生成 | ID §6.2 注記 |
| Dockerfile で `npm ci` | ID §1.1 |
| README 第三者再現 | code-generation 段階で要担保 (本ステージ範囲外) |

---

## 推奨される次のアクション

1. **B-01 (エラーハンドリング二重定義) の解消**:
   - FD §7.2 を「汎用フォールバック」として位置付け、画面個別マッピング (§2.3.3 承認 / §2.3.4 差戻し / §2.3.6 削除 / §2.3.7 詳細404) を正とする旨を明記する1段落を追加。あるいは画面個別の文言を §7.2 のテーブルに統合し、画面側からは「`handleServerError(err, 'approve')` を呼ぶだけ」に簡略化する。
   - 文言の不整合 (例: 削除409 の「承認済の…」vs「既に確定済みのため…」) を一意に揃える。

2. **B-02 (StatusBadge ラベル統一)**:
   - `STATUS_STYLES.pending.label` を「Pending」→「**承認待ち**」(推奨) に変更。
   - 一覧フィルタ select の表示テキストも同じ日本語ラベルに統一。
   - design.md §6.2 表に label 列を追記して合意 (application-design への軽微 FB)。

3. **改善提案 I-01〜I-10 の取り込み判断**:
   - I-01 (承認確認ダイアログ) と I-04 (Tab トラップ) は実装コスト小・ユーザ価値中で取り込み推奨。
   - I-05 / I-06 (未使用トークン整理) は code-generation 前に決着させると後戻りが減る。
   - 残りは README/補足ドキュメント反映または今後の改善キューで可。

4. **コード生成エージェントへの引き継ぎ事項**:
   - B-01 / B-02 の修正版をベースに実装を進めること。
   - テストケース表 (FD §8) のアサーション文言は最終確定版の StatusBadge ラベル / エラー文言と一致させること。
   - `package-lock.json` を初回 `npm install` 後に必ずコミットし、Dockerfile `npm ci` が緑になることを確認すること (CLAUDE.md §5)。

5. **再レビュー条件**:
   - B-01, B-02 の修正後、文言と表示先のクロスマトリクスを 1 表にまとめて再提出。再レビューはこの差分のみを対象とする想定で、所要時間は短い見込み。

---

**レビュー結論**: **Pass with minor**。Blocking 2件は軽微な記述整理で解消可能。修正後はそのまま Code Generation ステージに進めて問題ない。
