# 要件確認質問書 (Requirement Verification Questions)

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**目的**: 要件のあいまいさを解消し、設計・実装に進むための明確化を行う

---

## 回答方法

各質問の `[Answer]:` の後に選択肢のレター(A〜E)または自由記述を記入してください。
複数選択可能な場合は明示しています。「X) Other」を選んだ場合は、その後に内容を記述してください。

---

## カテゴリ1: 機能スコープ

### Question 1: UIのスコープ
このシステムでは「Webシステム」として、どこまでUIを作成しますか?

A) 最小構成 — 請求書登録・一覧・承認/差戻のための基本UIのみ(画面数:3〜4画面)
B) 標準構成 — A) に加えてダッシュボード、検索フィルタ、監査ログ閲覧画面を含む(画面数:5〜7画面)
C) フル構成 — B) に加えてマスタ管理(取引先など)、ユーザー管理画面を含む(画面数:8画面以上)
D) APIのみ — UIは作成せず、Next.js Route Handlers経由のAPIのみを提供
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2: 認証・ユーザー管理
承認者IDの記録要件がありますが、認証はどのように実装しますか?

A) 簡易認証 — ヘッダーまたはセッションに含まれるユーザーID/承認者IDをそのまま使用(認証ロジックなし、PoC向け)
B) ログイン機能あり — Email + パスワードでのシンプルなログイン(セッション管理あり、ロールはApprover/Accountant程度)
C) 外部認証連携 — OAuth/OIDC等の外部IdPに連携
D) Mock認証 — 開発時はMockユーザー、ロール切り替え可
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 3: 請求書のステータス遷移
請求書のステータスはどのように定義しますか?

A) シンプル — `pending`(登録待ち承認) / `approved`(承認済) / `rejected`(差戻) / `mismatch`(金額不一致)
B) 標準 — A) に加えて `paid`(支払済) を含む
C) 詳細 — A) に加えて `submitted`(提出済) / `under_review`(確認中) / `paid` を含む
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4: 差戻し後の運用
差戻し(reject)した請求書はどのように扱いますか?

A) 編集後再提出可 — 差戻しされた請求書を修正して再度承認待ちに戻せる
B) 新規登録のみ — 差戻し後は別の請求書として新規登録する(同一請求番号は禁止のため、修正不可)
C) 削除して再登録 — 差戻された請求書を削除し、新規登録する
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5: ステータス検索の詳細
「ステータスで一覧検索」とは、どこまで含めますか?(複数選択可、A〜Eを選択)

A) ステータスのみ
B) ステータス + 取引先ID
C) ステータス + 期間(支払期限など)
D) ステータス + 取引先ID + 期間 + 金額レンジ
E) 全文検索を含む
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 6: 監査ログの記録対象
「主要操作は監査ログに記録」とは、どのイベントを含めますか?(複数選択可)

A) 登録・承認・差戻・削除のみ
B) A) + 一覧検索・詳細閲覧
C) A) + ログイン・ログアウト
D) A) + B) + C) すべて
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## カテゴリ2: 技術構成

### Question 7: フロントエンド・バックエンドの構成
CLAUDE.mdの要件で「フロントエンド: React、バックエンド: Next.js Route Handlers」とあります。具体的にはどの構成を採用しますか?

A) 完全分離 — フロントエンド: Vite + React (別コンテナ) / バックエンド: Next.js Route Handlers のみのAPIサーバ(別コンテナ)
B) Next.jsフルスタック — Next.js を BFF として利用(フロント: React Server Components/Client Components、バックエンド: Route Handlers)を1コンテナ + 別途データ永続化用コンテナ
C) Next.js分離 — 同一Next.jsプロジェクトをフロント用・API用に2つのコンテナで起動(同じコードベースを使い分け)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 8: データ永続化
データの永続化方法はどうしますか?

A) PostgreSQL (docker-compose で起動)
B) MySQL (docker-compose で起動)
C) SQLite (コンテナ内のファイルベース、PoC向け)
D) インメモリ(プロセス再起動でデータ消失、PoC向け)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 9: ORMの選択
バックエンドで使用するORMは?

A) Prisma
B) Drizzle ORM
C) TypeORM
D) ORMなし(生SQL)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 10: 通貨・金額の扱い
請求金額・発注金額はどのように扱いますか?

A) JPY整数のみ(円、整数値、小数点なし)
B) 多通貨対応(currencyフィールドあり、Decimal型で小数点対応)
C) JPYのみだがDecimal型で小数点対応
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## カテゴリ3: 拡張機能(Extensions)

### Question 11: Security Extensions
このプロジェクトにセキュリティベースライン拡張ルールを適用しますか?

A) Yes — すべてのセキュリティルールをブロッキング制約として強制(本番環境向け推奨)
B) No — セキュリティルールをスキップ(PoC、プロトタイプ、実験向け)
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 12: Property-Based Testing Extension
Property-Based Testing (PBT) ルールを強制しますか?

A) Yes — すべてのPBTルールをブロッキング制約として強制(ビジネスロジック、データ変換、シリアライゼーションが多いプロジェクト向け推奨)
B) Partial — 純粋関数とシリアライゼーションのラウンドトリップのみPBTを強制
C) No — すべてのPBTルールをスキップ(シンプルなCRUDアプリ、UIのみ、薄い統合層など)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## カテゴリ4: 非機能要件

### Question 13: パフォーマンス要件
想定する同時利用者数・データ量は?

A) 小規模 — 同時10ユーザー以下、請求書数 < 10,000件 (社内利用向け)
B) 中規模 — 同時50ユーザー、請求書数 < 100,000件
C) 大規模 — 同時数百ユーザー以上、請求書数 > 100,000件
D) PoC — 性能要件は問わない(動作確認のみ)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 14: テスト戦略
作成するテストの範囲は?

A) 最小 — 主要ハンドラ(API)のユニットテストのみ
B) 標準 — ユニットテスト + 統合テスト(DB含むエンドツーエンドAPI)
C) 充実 — ユニットテスト + 統合テスト + E2E(UIテスト)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 15: デプロイメント
最終的な成果物としてどこまで含めますか?

A) ローカル開発環境のみ(docker-compose で動作)
B) ローカル + Vercelへのデプロイ手順をREADMEに記載
C) ローカル + Vercel + 本番運用のための監視・ログ設計
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

## 補足・特記事項
その他、設計に反映すべき事項があれば自由に記述してください。

[Notes]: 

---

**回答完了後、要件定義書 (`requirements.md`) を作成し、次のステージへ進みます。**
