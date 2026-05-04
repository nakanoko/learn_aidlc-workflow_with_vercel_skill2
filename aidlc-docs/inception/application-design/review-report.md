# Application Design Review Report
**レビュー日**: 2026-05-04
**レビュー担当**: Reviewer Agent (第三者視点)
**レビュー対象**: aidlc-docs/inception/application-design/ 配下 7ファイル
**参照要件**: aidlc-docs/inception/requirements/requirements.md

## サマリ
- 重大指摘: 2件
- 改善提案: 9件
- 結論: **Pass with minor changes** (重大指摘2件は軽微な仕様の明確化で解消可能、設計全体の整合性は高い)

---

## 重大指摘 (Blocking)

### B-1. `services.md` の状態遷移マトリクスと requirements の FR-03 (差戻し) の不整合
- **該当**: `services.md` §2.3、`application-design.md` §3、`api-contract.md` §5
- **内容**: マトリクスでは `pending → reject → rejected` / `mismatch → reject → rejected` を許可しているが、reject の Errors 欄では「409: 既に approved または rejected」のみ記載されており、要件 FR-03 「`approved` の請求書は差戻し不可(409 Conflict)」と整合する一方、再度 `rejected` 対象を 409 として処理することは要件に明記がない (要件は「pending または mismatch」のみが差戻し可能とのみ規定)。
  - api-contract.md §5 の Errors に「既に rejected → 409」を含めるか、`services.md` §5.3 の「rejected → 409 (already rejected)」と表記揃え必要。
  - 実害は小さいが、設計書間の表記が揺れているため、実装フェーズでテストが書きづらい。
- **推奨対応**: `api-contract.md` §5 の reject Errors に「409: 既に approved または rejected (※差戻しは pending/mismatch のみ)」と明記し、services.md と表記を完全一致させる。

### B-2. `component-methods.md` の `InvoiceService` コンストラクタが `services.md` の DI コンテナと不整合
- **該当**: `component-methods.md` §1、`services.md` §4
- **内容**:
  - `component-methods.md`: `constructor(private invoiceRepo, private auditService)` (引数2つ)
  - `services.md` §4: `new InvoiceService(invoiceRepo, auditService, prisma)` (引数3つ、prisma を追加)
  - これは `prisma.$transaction` を Service 層で扱うために必要な追加引数だが、両ドキュメントで定義が食い違っており、実装者が迷う。
- **推奨対応**: `component-methods.md` §1 の `InvoiceService` コンストラクタシグネチャに `private prisma: PrismaClient` を追加して両ドキュメントを統一する。あわせて Repository が transaction client (`tx`) を受け取る設計を component-methods にも明示。

---

## 改善提案 (Non-blocking)

1. **api-contract.md §1 のレスポンス例から `deleted_at` フィールドが欠落** — `requirements.md` §7.1 の Invoice モデルには `deleted_at` があるが、API レスポンス例には含まれていない。論理削除済みは GET から除外されるためレスポンスに `null` 固定で出すか、レスポンス DTO から除外する方針を明記すべき。— **推奨**: API レスポンスでは `deleted_at` を露出しない (内部実装詳細) ことを明記する。

2. **`X-Actor-Id` の検証ルールが未定義** — `api-contract.md` 共通仕様で「書き込み系で必須」と記載されているが、空文字や型の検証要件、フォーマット (英数のみ?) が不明瞭。`withActor` ミドルウェアの実装で迷う。— **推奨**: components.md §3.6 か api-contract.md 共通仕様に「1-50文字、英数とハイフン/アンダースコアのみ」など最小要件を明記。

3. **`api-contract.md` §4 (approve) で X-Actor-Id の必要性が不明瞭** — 共通仕様では「すべての書き込み系で X-Actor-Id 必須」だが、approve は X-Approver-Id のみ要求。承認ログの `actor_id` は X-Approver-Id を流用するのか、両ヘッダー必須なのか不明。services.md §5.2 では `actor_id: approverId` としているが、共通仕様と矛盾。— **推奨**: 「approve の場合は X-Approver-Id を actor_id として監査ログに記録、X-Actor-Id は不要」と api-contract.md §4 に明記。

4. **resubmit のフィールド任意の解釈ぶれ** — `api-contract.md` §6 では「いずれかのフィールドを最低1つ含める」、`component-methods.md` `ResubmitInput` では3フィールドすべて optional。スキーマ定義として `.refine()` で「最低1つ」を強制する旨を明記すべき。— **推奨**: `resubmitInvoiceSchema` の定義にカスタムリファインメントを記述。

5. **CORS 設定が Origin ホワイトリスト未対応** — `api-contract.md` §10 で「`Access-Control-Allow-Origin: http://localhost:3001`」固定。Docker 環境で frontend コンテナから host:3001 経由アクセスする場合、ブラウザ起源は `http://localhost:3001` で問題ないが、開発者が別ポートを使う場合に詰まる。— **推奨**: 環境変数 `CORS_ALLOW_ORIGIN` で上書き可能とし、デフォルトは `http://localhost:3001`。

6. **ヘルスチェックの DB ping 実装が未定義** — `components.md` §3.1 と `api-contract.md` §9 で「DB への ping」と書かれているが、Prisma で `SELECT 1` を発行するなど具体的方針が無い。`docker-compose` の healthcheck と連携させる場合に重要。— **推奨**: services.md か code-generation 段階で「`prisma.$queryRaw\`SELECT 1\`` で確認」を明示。

7. **監査ログの `before_status` の取り扱い** — `services.md` §5.1 では create 時に `before_status` を渡していない (新規作成時は null が妥当)。api-contract.md §8 のレスポンス例で `"before_status": null` となっており整合するが、component-methods.md §2 の `AuditLogInput` 型が optional になっているのは正しい。ただし `delete` 時の before_status (削除前の status を記録) が services.md に明記されていない。— **推奨**: services.md §3.1 の記録対象イベントに「`delete` 時は before_status=削除前ステータス、after_status=null」と注記。

8. **frontend の `apiClient` が `delete` を含むのに `getAuditLogs` がない** — `component-methods.md` §6 の apiClient に `getAuditLogs` が無いが、components.md §3.1 では `/api/audit-logs` がある。フロントエンドから監査ログを参照する画面を作らない方針なら、`/api/audit-logs` は backend 単独機能であることを明記。— **推奨**: 「監査ログ閲覧 UI は Out of Scope (PoC)、API 単独提供」を application-design.md §5 か api-contract.md §8 に追記。

9. **design.md §6.5 フォームのアクセシビリティ — エラーメッセージと aria 属性の関連付けが未定義** — `aria-invalid` / `aria-describedby` での結びつけが記載されていない。WCAG AA を謳うなら必要。— **推奨**: design.md §6.5 に「入力に `aria-invalid` を、エラーテキストに `id` を設定し `aria-describedby` で関連付ける」を追記。

---

## 観点別結果

### 1. 要件充足
**OK (一部要明確化)** — FR-01〜FR-07、データモデル、ステータス遷移、受入基準は概ね反映済み。
- FR-01 (登録、重複チェック、mismatch自動判定): OK (services.md §5.1、api-contract §1)
- FR-02 (承認、mismatch 拒否 422): OK (api-contract §4)
- FR-03 (差戻し、reason 必須、approved 不可): OK (一部表記揺れあり、B-1参照)
- FR-04 (再提出、編集可フィールド限定): OK (api-contract §6 で「請求番号・取引先IDは変更不可」と明記)
- FR-05 (論理削除、approved 不可): OK
- FR-06 (status filter、limit/offset): OK
- FR-07 (監査ログ): OK
- データモデル: requirements.md §7 と一致
- 受入基準: docker-compose, 重複拒否, 監査ログ等すべてカバー

### 2. 設計の矛盾
**要対応** — B-1, B-2 が該当。それ以外は整合性高い。components/methods/services/dependency 間の依存方向 (Route→Service→Repo→Prisma) は一貫しており、循環依存なし。

### 3. ステータス遷移
**OK** — services.md §2.3 マトリクス、application-design.md §3、requirements.md §4.8 のステートマシンは完全一致。`mismatch → approve → 422`, `rejected → resubmit → pending/mismatch`, `approved → 全アクション → 409` まで正しく定義。

### 4. API設計の妥当性
**OK** — RESTful な URL パターン、HTTP ステータスコードの使い分け (400/404/409/422) は適切。
- POST /approve, /reject はリソースに対するアクションとして妥当 (PATCH でも良いが POST の方が冪等でないアクションには適切)
- PATCH /resubmit は部分更新のセマンティクスに合う
- DELETE は 204 No Content で論理削除 (要件と整合)
- ただし api-contract.md は OpenAPI 形式ではなく Markdown 形式。要件 §9 では「OpenAPI形式 または Markdown」許容のため OK だが、code-generation 段階で OpenAPI 化すれば Swagger UI で動作確認できるメリットあり (改善提案ではなく将来の選択肢)。

### 5. セキュリティ上の問題
**OK (PoC前提)** — Security Baseline 拡張が無効化されているが、最低限の対策が設計に組み込まれている:
- SQL Injection: Prisma ORM 経由で OK
- 入力バリデーション: Zod で全エンドポイント検証 OK
- CORS: localhost:3001 を許可、preflight 対応 OK
- CSRF: ヘッダーベースで Cookie 不使用のため不要 OK
- ただし、`X-Actor-Id` を信頼するヘッダーベース認証は本質的にスプーフィング可能であることを「PoC のみ・本番禁止」と application-design.md にも明記すべき (現状 requirements.md にしかない)。

### 6. 保守性・可読性
**OK** — 3層 (Route Handler / Service / Repository) のレイヤ分離は明確、責務が `services.md` §6 で表で定義されている。命名 (Pascal/camelCase) は TypeScript 慣習に沿う。Repository インタフェース化 (services.md §4「サービスは具象ではなくインタフェース経由で依存を持つことを推奨」) はテスト容易性に寄与。

### 7. コンテナ構成の妥当性
**OK** — フロント (Vite preview, :3001) / バック (Next.js, :3000) を別コンテナで起動、SQLite はバックエンドコンテナ内ボリュームに永続化、CLAUDE.md §1 の「フロント・バック完全分離」要件を満たす。
- ただし、healthcheck の docker-compose 設定例が示されていない (改善提案 #6)。
- `package-lock.json` 生成と `npm ci` の使用は CLAUDE.md §5 で必須だが、本ステージ (Application Design) ではなく code-generation で確認するため OK。

### 8. デザイン要件の充足
**OK** — design.md は FSI コーポレートサイトの「堅牢・信頼感」コンセプトを正しく抽出。
- カラートークン (深紺系プライマリ): OK
- ステータスカラー (色依存しないラベル併記): WCAG AA 準拠、OK
- タイポグラフィ (Noto Sans JP、見出し700/本文400): OK
- スペーシング (4px ベース, Tailwind デフォルト互換): 運用容易、OK
- Tailwind config への mapping が具体的: 実装時即適用可能、OK
- ただし、フォーム aria 属性の詳細不足 (改善提案 #9)。

### 9. テスト容易性
**OK** — DI コンテナ (services.md §4) でリポジトリと Prisma を注入する設計で、Vitest によるユニットテスト時に Mock 注入可能。
- Service 層が HTTP / Prisma 直接依存しないため、テストが書きやすい。
- Route Handler は薄い層 (Zod 検証 → Service 委譲 → JSON 返却) なので、Service のテストでビジネスロジックをカバーすれば十分。
- ただし、トランザクション (`prisma.$transaction`) を扱う Service のテストは、in-memory SQLite または Prisma モックの方針を code-generation 段階で明示するべき。

---

## 推奨される次のアクション
1. **B-1, B-2 の解消** (api-contract.md, component-methods.md の軽微な修正): 30分以内で対応可能。
2. **改善提案のうち #2 (X-Actor-Id 検証ルール)、#3 (approve のヘッダー仕様)、#4 (resubmit リファインメント) は code-generation 前に確定すべき**。残り (#1, #5-9) は code-generation と並行解消で OK。
3. **解消後、Application Design ステージを Pass として Construction フェーズ (Functional Design / Code Generation) へ進行可能**。
4. Construction フェーズでは、特に「Service 層のトランザクションテスト方針」「ヘルスチェックの具体実装」「OpenAPI 自動生成 (任意)」を補足することを推奨。
