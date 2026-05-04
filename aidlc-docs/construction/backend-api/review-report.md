# Backend-api Construction Design Review (R1)
**レビュー日**: 2026-05-04
**レビュー担当**: Reviewer Agent (第三者視点)
**対象**:
- `aidlc-docs/construction/backend-api/functional-design/functional-design.md`
- `aidlc-docs/construction/backend-api/infrastructure-design/infrastructure-design.md`

---

## サマリ
- **重大指摘 (Blocking)**: 3 件
- **改善提案 (Non-blocking)**: 10 件
- **結論**: **Pass with minor (要修正)** — 機能仕様/状態遷移/トランザクション境界の整合性は概ね良好だが、Next.js 15 の API 仕様変更への追従漏れ、AuditLog 一覧 API の実装ギャップ、初回マイグレーションが空の状態で起動失敗する問題があるため、これらを解消した上で Code Generation に進むことを推奨する。

---

## 重大指摘 (Blocking)

### B-01 Next.js 15 の動的ルート `params` が Promise 化されている
- **該当**: functional-design.md §3.3 (詳細), §3.4 (承認), §3.5 (差戻し), §3.6 (再提出), §3.7 (削除)
- **内容**: 各 `[id]` 系ハンドラのシグネチャが `ctx: { params: { id: string } }` という同期型で、`idParamSchema.parse(ctx.params)` を直接渡している。Next.js 15 (App Router / Route Handlers) の破壊的変更により、動的ルートの `params` は `Promise<{ id: string }>` となっており、`await ctx.params` が必須。infrastructure-design.md §10.1 で `next ^15.0.0` を採用しているため、現在の擬似コードのままでは型チェック失敗もしくはランタイムで `ctx.params` が Promise として渡され Zod parse に失敗する。
- **推奨対応**:
  1. ハンドラシグネチャを `ctx: { params: Promise<{ id: string }> }` に変更し、`const { id } = idParamSchema.parse(await ctx.params);` にする。
  2. もしくは Next 14.x にバージョンを固定する旨を infrastructure-design に明記する (PoC 簡素化を優先する場合)。
  3. 採用方針を Functional Design の擬似コード/Infrastructure Design 双方に反映する。

### B-02 `auditLogService.list()` と `AuditLogRepository` の実装ギャップ
- **該当**: functional-design.md §3.8、テスト 8.9
- **内容**: ルートハンドラは `auditLogService.list(query)` を呼ぶが、`AuditLogService.list` の本体および対応する `AuditLogRepository` のメソッド定義が functional-design に存在しない。component-methods.md §4 では `AuditLogRepository.listByInvoice(invoiceId: string, limit: number)` のみが定義されており、`invoice_id` 未指定 (= 全件) の検索パスが用意されていない。テストケース 8.9 「`invoice_id` 未指定で全 AuditLog が返る」が実装不能な状態。
- **推奨対応**:
  1. `AuditLogRepository` に `list(filter: { invoice_id?: string }, paging: { limit: number }): Promise<AuditLog[]>` を追加する (もしくは既存 `listByInvoice` を `find(filter, paging)` に置換)。
  2. `AuditLogService.list(query)` の擬似コードを functional-design に追記し、`order by created_at desc` のソート要件を明記する。
  3. component-methods.md と整合させる (DB 直アクセスはしない原則は維持)。

### B-03 初回起動時にマイグレーションファイルが存在せず `prisma migrate deploy` が異常終了する
- **該当**: infrastructure-design.md §1.2 (CMD), §5.1, §5.3
- **内容**: 起動シーケンスは `npx prisma migrate deploy && npm start` で固定。Code Generation 直後の初回 `docker-compose up` 時には `prisma/migrations/` が空のため、SQLite ファイル `/data/invoices.db` が存在しないにもかかわらずスキーマが適用されず、テーブル不在で API が 500 エラーとなる (もしくは migrate deploy が "No migration found" 警告で素通りし、後続の SELECT で table not found)。restart on-failure とも組み合わさり、無限再起動ループに陥る可能性がある。
- **推奨対応**:
  1. infrastructure-design に「Code Generation 時に最低 1 つのマイグレーション (`prisma migrate dev --name init` 由来) をリポジトリにコミットする」要件を明記する。
  2. もしくは初回ブートストラップ用に `prisma db push` を `migrate deploy` のフォールバックとして併用するスクリプトを用意する (PoC の SQLite では現実的)。
  3. README の起動手順に「初回ビルド前にマイグレーションが生成済みであること」を確認するチェックポイントを追加。

---

## 改善提案 (Non-blocking)

### I-01 ミドルウェア合成順序が上位設計と矛盾
- **該当**: functional-design.md §5.4 vs component-methods.md §5
- **内容**: functional-design は `withCors(withErrorHandler(handler))` (CORS 最外側)、component-methods.md §5 は `withErrorHandler(withCors(...))` を例示。CORS をエラー応答にも付与する観点で functional-design の順序が技術的に正しいが、上位設計との矛盾を解消するため component-methods.md 側の表現を更新する旨をレビュー結果に反映するか、functional-design に「component-methods.md §5 のサンプルは表記簡略化であり、実装は §5.4 の順序に従う」旨を追記すると良い。

### I-02 BusyBox `wget` のヘルスチェック判定不備の可能性
- **該当**: infrastructure-design.md §1.2, §4.2, §7
- **内容**: `wget -qO- http://localhost:3000/api/health || exit 1` は HTTP 5xx でも `-q` モードでは exit 0 を返すケースがある (busybox 実装)。健全性判定が緩くなる。
- **推奨対応**: `wget -q --spider http://localhost:3000/api/health` または `wget -qO /dev/null --tries=1 --timeout=3 ... && grep -q ok` 等の確実な判定に変更。最低限 `wget -qO- ... | grep -q '"status":"ok"'` で本文検証する。

### I-03 Zod スキーマに `strict()` がなく未知フィールドが silently drop される
- **該当**: functional-design.md §2.3 (createInvoice), §2.7 (resubmit)
- **内容**: `createInvoiceSchema` / `resubmitInvoiceSchema` は `.strict()` 未指定。クライアントが `vendor_id` を resubmit ボディに含めても無視されるだけで誤操作の検出ができない。要件 FR-04 では「請求番号・取引先IDは変更不可」が明示されている。
- **推奨対応**: 両スキーマに `.strict()` を付与し、未知フィールドを 400 で拒否する。

### I-04 CUID 形式バリデーションの妥当性
- **該当**: functional-design.md §2.1 (`cuidSchema`)
- **内容**: 正規表現 `/^c[a-z0-9]{24,}$/` は CUID v1 を想定。Prisma `@default(cuid())` v5 系は CUID v1 (25 文字) を生成するため現実装では問題ないが、将来 `cuid2` (大文字含む可能性あり) に移行した場合に不整合となる。また、404 (api-contract 準拠) が期待される文脈で 400 を返してしまう (例: 存在しない非CUID形式 ID の GET)。
- **推奨対応**: api-contract に「ID 形式不正時の HTTP ステータス」を追記するか、Zod は `z.string().min(1)` 程度に緩めて、存在チェックは Repository 側 (NotFoundError) に一任する。

### I-05 `withCors` のレスポンス再構築でステータステキスト等が失われる
- **該当**: functional-design.md §5.2
- **内容**: `new NextResponse(res.body, { status: res.status, headers })` は `statusText` や stream 状態を引き継がない。JSON レスポンスでは実害はないが、204 No Content (DELETE) で `body=null` の扱いに注意が必要。テストで実証必要。
- **推奨対応**: 既存 `res.headers` に対し `headers.set(...)` する形でヘッダのみ追記し、`res` 自体は返却するパターンへ変更を検討。

### I-06 `prisma.$transaction` 内の Promise.all 並列が不要
- **該当**: functional-design.md §6.2 `list` メソッド
- **内容**: Service.list は読み取りのみで `tx` 不要 (§6.4 で言及済み)。`Promise.all([findMany, count])` を非トランザクションで実行している点は妥当だが、count と findMany 間の弱整合は明記しておくと運用判断が容易。
- **推奨対応**: 設計ドキュメントに「list は弱整合 (count と items は別クエリ)、PoC では許容」と注記。

### I-07 `audit_logs` のソート順が未定義
- **該当**: functional-design.md §3.8、テスト 8.9
- **内容**: テスト 8.9「並び順は `created_at desc`」が定義されているが、`AuditLogRepository` の `list` 擬似コードに `orderBy` が明示されていない (B-02 の解消とあわせて記載が必要)。
- **推奨対応**: Repository 実装に `orderBy: { created_at: 'desc' }` を明記する。

### I-08 監査ログ note の最大長が不明
- **該当**: functional-design.md §1.2 (`note String?`)
- **内容**: `rejection_reason` (≤500 文字) を `note` に格納するが、SQLite の TEXT は実質無制限のため許容される一方、API レスポンスのサイズ制御や悪意ある巨大入力の観点でアプリ層の最大長を明示しておくのが望ましい。
- **推奨対応**: `note` の入力経路 (rejection_reason 経由) で上限が担保されることを設計書に明記、もしくは Zod 共通 `noteSchema` を定義。

### I-09 Dockerfile のレイヤキャッシュ最適化余地
- **該当**: infrastructure-design.md §1.2
- **内容**: 単一ステージで `COPY app ./app; COPY src ./src` の後に `npm run build` を実行。`build` の前に `npx prisma generate` のみが走るため、Prisma クライアントは依存導入後に再生成される一方、ソース変更ごとに `next build` 全体が再走するのは PoC では許容範囲。マルチステージ未採用方針との整合は OK。
- **推奨対応**: なし (採用方針を尊重)。ただし将来本番化の際に `output: 'standalone'` 採用を検討する旨をコメントで残す。

### I-10 セキュリティ: PoC 認証であることを README/レスポンスでより明示
- **該当**: 全体
- **内容**: `X-Actor-Id` / `X-Approver-Id` は詐称容易で監査証跡として法的拘束力なし (application-design 7.1 で言及済み)。Functional Design / Infrastructure Design 内でも、各監査ログ記録箇所で「actor_id は自己申告値であり認証保証なし」のコメントを残しておくと、保守者の誤解を防げる。
- **推奨対応**: コード内 JSDoc に注記、README にも明記する旨を Code Generation に申し送り。

---

## 観点別結果

| # | 観点 | 結果 | 詳細 |
|---|---|---|---|
| 1 | 要件充足 (FR-01〜FR-07b, NFR, データモデル, 受入基準) | 要対応 | FR-07 監査ログ閲覧の実装ギャップ (B-02)。それ以外の FR は擬似コードレベルで網羅。NFR (型安全/Lint/Vitest/コンテナ) は infra で担保。受入基準 §10「README手順だけで再現」は B-03 解消が前提。 |
| 2 | 設計の矛盾 (application-design / api-contract / services) | 要対応 | I-01 (ミドルウェア順序)、B-02 (AuditLogRepository インタフェース) が integral。状態遷移/エンドポイント/レスポンス形式は一致。 |
| 3 | API契約準拠 | OK (一部要追記) | エンドポイント、HTTP ステータス、エラー形式 `{error: ...}`、`X-Actor-Id`/`X-Approver-Id` 仕様は api-contract と一致。「ID 形式不正時のステータス」は api-contract で未定義 (I-04)。 |
| 4 | 状態遷移ロジックの正確性 (services.md §2.3) | OK | §3.9 のマトリクスは services.md §2.3 と完全一致。各擬似コードの switch 分岐が 422 (mismatch + approve) / 409 (それ以外) を正確に区別。 |
| 5 | トランザクション境界 (Invoice 更新 + AuditLog 挿入) | OK | `prisma.$transaction(async (tx) => ...)` でアトミック保証、Repository は `tx?` 引数で受け取り。テスト 8.14 でロールバック確認も計画済み。 |
| 6 | Zodスキーマと API 契約の整合 | OK (改善余地あり) | フィールド名/型/制約 (min/max/regex) は一致。`refine` で resubmit の最低1フィールド要件をカバー。`.strict()` 不在 (I-03) は改善提案。 |
| 7 | セキュリティ | OK (PoC 範囲) | Prisma 経由で SQL injection 防止、Zod 入力検証、CORS 環境変数化、`X-Powered-By` 削除、非 root 実行。PoC 認証の限界明示は I-10。 |
| 8 | コンテナ構成 (Dockerfile / npm ci / package-lock / ヘルスチェック / ボリューム) | 要対応 | `npm ci` ✓、package-lock 必須明記 ✓、非 root ✓、ボリューム永続化 ✓、ヘルスチェック方式は I-02 の改善余地あり。初回 migration 不在問題 B-03 が Blocking。 |
| 9 | テストカバレッジ | OK | 正常系/異常系を FR ごとに網羅 (8.2〜8.10)。ミドルウェア・Service・Repository・Tx 境界も独立してテスト計画あり。AuditLog 全件取得テスト (8.9) は B-02 解消が前提。 |
| 10 | 保守性 (命名 / 責務分離 / エラークラス階層 / Repository テスト容易性) | OK | レイヤ責務分離 (route/service/repo) 明確、AppError 階層は httpStatus + code を共有プロパティで保持、Repository は `tx?` 引数で DI 容易。命名一貫 (snake_case for DB / camelCase for params)。 |

---

## 推奨される次のアクション

1. **Blocking 3 件を Functional Design / Infrastructure Design に反映**:
   - B-01: `params: Promise<{id: string}>` への切替を全 `[id]` ハンドラ擬似コードに反映、もしくは Next 14 採用に変更。
   - B-02: `AuditLogRepository.list(filter, paging)` を新設し、`AuditLogService.list` の擬似コードを §3.8 に追加。component-methods.md とも整合。
   - B-03: infrastructure-design §5.3 と README ガイダンスに「Code Generation 時に init マイグレーション生成・コミット必須」を追記。
2. **Non-blocking 提案のうち最低限 I-02 (ヘルスチェック判定強化) と I-03 (`strict()`) は Code Generation で適用**。残りは設計書追記レベルで対応可。
3. **再レビュー (R2) を実施**: B-01〜B-03 解消後、状態遷移マトリクス・API 契約・テスト計画の整合を最終確認した上で Code Generation 着手を承認。
4. CLAUDE.md §4「同一ステージで 3 回レビューしても重大指摘が残る場合は人間に判断を仰ぐ」の対象とならぬよう、修正方針を明記したうえで R2 へ進むことを推奨。
