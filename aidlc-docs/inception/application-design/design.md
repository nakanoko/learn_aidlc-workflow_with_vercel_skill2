# Design Guide (UI/UX)

**プロジェクト**: 請求書チェック・承認Webシステム
**作成日**: 2026-05-04
**参考サイト**: https://www.fsi.co.jp/ (富士ソフト株式会社)
**目的**: フロントエンドUIに一貫性を持たせるためのデザイントークン・ガイドライン

---

## 1. デザインコンセプト

> **「堅牢かつ親近感のある業務系Webアプリケーション」**

参考サイト(FSIコーポレートサイト)の特徴を引き継ぎ、以下の方針を採用する:

- **信頼感**: 抑制された角丸、控えめなシャドウ、深紺系プライマリ
- **可読性**: 階層化された見出し、十分な余白、行間ゆとり
- **業務効率**: 過度な装飾を避け、操作系を明示的に配置
- **アクセシビリティ**: 高コントラスト、ステータス色は色だけでなくバッジ表記でも区別

---

## 2. カラートークン

### 2.1 ブランドカラー (Primary)
| トークン名 | HEX | 用途 |
|---|---|---|
| `--color-primary-900` | `#0B2545` | ヘッダー背景、強い見出し |
| `--color-primary-700` | `#13315C` | プライマリボタン、ナビ強調 |
| `--color-primary-500` | `#1E5DB1` | リンク、アクセント |
| `--color-primary-100` | `#E6EEFA` | プライマリボタンhover背景、薄背景 |

### 2.2 ニュートラル (Gray)
| トークン名 | HEX | 用途 |
|---|---|---|
| `--color-gray-900` | `#1A1F2C` | 本文テキスト |
| `--color-gray-700` | `#3D4659` | 副次テキスト |
| `--color-gray-500` | `#6B7280` | プレースホルダ、無効化テキスト |
| `--color-gray-300` | `#D1D5DB` | ボーダー |
| `--color-gray-100` | `#F3F4F6` | カード背景、テーブルストライプ |
| `--color-gray-50`  | `#F9FAFB` | ページ背景 |
| `--color-white`    | `#FFFFFF` | カード本体、フォーム背景 |

### 2.3 ステータスカラー (Semantic)
| トークン名 | HEX | 用途 |
|---|---|---|
| `--color-status-pending` | `#F59E0B` (amber-500) | pending バッジ・帯 |
| `--color-status-approved`| `#10B981` (emerald-500) | approved バッジ・帯 |
| `--color-status-rejected`| `#6B7280` (gray-500) | rejected バッジ・帯 |
| `--color-status-mismatch`| `#EF4444` (red-500) | mismatch バッジ・帯 |
| `--color-success-bg` | `#ECFDF5` | 成功Toast背景 |
| `--color-error-bg`   | `#FEF2F2` | エラーToast背景 |
| `--color-warning-bg` | `#FFFBEB` | 警告Toast背景 |

ステータスは色のみに頼らず、必ずテキストラベル(例: 「承認済」)を併記すること。

### 2.4 Tailwind CSS マッピング
`tailwind.config.js` の `theme.extend.colors` に上記を定義する:

```js
colors: {
  primary: { 900: '#0B2545', 700: '#13315C', 500: '#1E5DB1', 100: '#E6EEFA' },
  status: {
    pending: '#F59E0B',
    approved: '#10B981',
    rejected: '#6B7280',
    mismatch: '#EF4444',
  },
}
```

---

## 3. タイポグラフィ

### 3.1 フォントファミリ
```css
font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', system-ui, sans-serif;
```

数値は次のフォントを使う(等幅、視認性向上):
```css
font-family: 'Noto Sans Mono', 'Menlo', 'Consolas', monospace;
```

### 3.2 タイプスケール

| 役割 | size | weight | line-height |
|---|---|---|---|
| Display (画面タイトル) | 28px (1.75rem) | 700 | 1.3 |
| h1 / Page Heading | 24px (1.5rem) | 700 | 1.35 |
| h2 / Section | 20px (1.25rem) | 700 | 1.4 |
| h3 / Subsection | 16px (1rem) | 600 | 1.45 |
| Body | 14px (0.875rem) | 400 | 1.6 |
| Body large | 16px (1rem) | 400 | 1.6 |
| Caption / Meta | 12px (0.75rem) | 400 | 1.5 |
| Code / Number | 14px | 500 | 1.5 |

### 3.3 行間と段落間
- 段落間 margin: `1em`
- リスト間: `0.5em`
- 表内: 行高さ最小 44px(タッチ領域確保)

---

## 4. スペーシング

### 4.1 4px ベースのスペーシングスケール
| トークン | px | 用途 |
|---|---|---|
| `space-1` | 4px | アイコン-テキスト間 |
| `space-2` | 8px | フォーム内ラベル-入力間 |
| `space-3` | 12px | タイトル-本文間 |
| `space-4` | 16px | カード内padding |
| `space-6` | 24px | セクション間 |
| `space-8` | 32px | ページ余白 |
| `space-12`| 48px | ヒーロー余白 |

Tailwindのデフォルト `p-1`〜`p-12` がそのまま使える(`4 * n` ピクセル)。

### 4.2 レイアウト
- ページ最大幅: `max-w-screen-xl` (1280px)
- 中央寄せ: `mx-auto`
- ページ全体パディング: モバイル `p-4`、PC `p-8`

---

## 5. ボーダー・角丸・シャドウ

### 5.1 角丸 (抑制的に)
| トークン | 値 | 用途 |
|---|---|---|
| `rounded` | 4px | デフォルト要素 |
| `rounded-md` | 6px | カード、ボタン |
| `rounded-lg` | 8px | モーダル、ダイアログ |

過度な角丸(pill shapeなど)は使わない。

### 5.2 ボーダー
- デフォルト: `border border-gray-300`
- 強調(active等): `border-primary-500`
- エラー: `border-red-500`

### 5.3 シャドウ (微細)
| トークン | 用途 |
|---|---|
| `shadow-sm` | カード、テーブルヘッダー(常時) |
| `shadow-md` | ホバー時のボタン、ドロップダウン |
| `shadow-lg` | モーダル、ダイアログ |

---

## 6. UIコンポーネント標準

### 6.1 ボタン

| バリエーション | 背景 | テキスト | ボーダー |
|---|---|---|---|
| Primary | `bg-primary-700 hover:bg-primary-900` | `text-white` | none |
| Secondary | `bg-white hover:bg-gray-100` | `text-primary-700` | `border-primary-700` |
| Danger | `bg-red-600 hover:bg-red-700` | `text-white` | none |
| Ghost | `bg-transparent hover:bg-gray-100` | `text-gray-700` | none |
| Disabled | `bg-gray-200` | `text-gray-500` | none、`cursor-not-allowed` |

共通: `px-4 py-2 rounded-md font-medium text-sm transition-colors duration-200`

承認ボタン: Primary
差戻しボタン: Danger
削除ボタン: Danger (確認ダイアログ必須)
キャンセル: Ghost

### 6.2 ステータスバッジ

`<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ...">`

| Status | 背景 | テキスト |
|---|---|---|
| pending | `bg-amber-100` | `text-amber-800` |
| approved | `bg-emerald-100` | `text-emerald-800` |
| rejected | `bg-gray-200` | `text-gray-700` |
| mismatch | `bg-red-100` | `text-red-800` |

### 6.3 カード
```
.card {
  background: var(--color-white);
  border: 1px solid var(--color-gray-300);
  border-radius: 6px;
  padding: 1rem 1.5rem;  /* p-4 px-6 */
  box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);  /* shadow-sm */
}
```

### 6.4 テーブル (一覧表示)
- ヘッダー: `bg-gray-100 text-gray-700 font-semibold uppercase text-xs`
- 行: 偶数 `bg-gray-50`、奇数 `bg-white`(ストライプ)
- ホバー: `hover:bg-primary-100`
- セル padding: `px-4 py-3`
- ボーダー: `border-b border-gray-300`

### 6.5 フォーム
- ラベル: `block text-sm font-medium text-gray-700 mb-2`
- 入力: `block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500`
- エラーメッセージ: `mt-1 text-xs text-red-600`
- 必須マーク: ラベル末尾に `<span class="text-red-500">*</span>`

### 6.6 ダイアログ (差戻し理由入力など)
- オーバレイ: `bg-black/50`
- ダイアログ本体: `bg-white rounded-lg shadow-lg p-6 max-w-md w-full`
- ヘッダー: `text-lg font-semibold text-gray-900 mb-4`
- フッター: ボタンを `flex gap-2 justify-end mt-6`

---

## 7. レイアウトパターン

### 7.1 ヘッダー
```
┌──────────────────────────────────────────────────────────┐
│ [請求書システム]                       [Actor: user-001 ▼]│   bg-primary-900, text-white, h-16
└──────────────────────────────────────────────────────────┘
```

### 7.2 一覧画面
```
┌──────────────────────────────────────────────────────────┐
│ 請求書一覧                                  [+ 新規登録]    │
│                                                            │
│ ステータス: [すべて ▼]                                       │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 請求番号  | 取引先  | 金額   | 期限     | ステータス     │ │
│ │──────────┼────────┼────────┼──────────┼─────────────│ │
│ │ INV-001  | A      | ¥100,000 | 2026/6/30 | [Pending]    │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 7.3 詳細画面
```
┌──────────────────────────────────────────────────────────┐
│ ← 一覧へ戻る                                               │
│                                                            │
│ 請求書詳細  [Pending]                                      │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 請求番号: INV-001                                        │ │
│ │ 取引先ID: VENDOR-A                                       │ │
│ │ 請求金額: ¥100,000                                       │ │
│ │ 発注金額: ¥100,000                                       │ │
│ │ 支払期限: 2026/6/30                                      │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [承認] [差戻し]                                [削除]       │
└──────────────────────────────────────────────────────────┘
```

---

## 8. アニメーション

| 種別 | duration | easing |
|---|---|---|
| ボタン背景色 | 200ms | ease-in-out |
| モーダル開閉 | 200ms | ease-out |
| トースト表示 | 300ms | ease-out (スライド) |
| ページ遷移 | アニメなし(即時切替、業務効率優先) |

過度なアニメ(回転、バウンスなど)は使わない。

---

## 9. アクセシビリティ

- すべての対話的要素に `aria-label` または可視テキスト
- フォーカスリング: `focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
- カラーコントラスト: WCAG AA 以上 (テキスト 4.5:1, 大テキスト 3:1)
- ステータスは色だけでなくバッジ内テキストでも示す
- キーボード操作: モーダルは ESC で閉じる、Tab フォーカストラップ

---

## 10. レスポンシブ

ブレークポイント (Tailwind デフォルトに準拠):
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px (PC基準、業務系のメインターゲット)
- `xl`: 1280px

PoCは PC利用前提だが、`md` 以上で問題なく動作することを目標とする。`sm` 以下は最低限の縦並びレイアウトで動作。

---

## 11. アイコン
PoCではアイコンは最小限。必要なものは `Heroicons` (`@heroicons/react`) または インラインSVG を採用する。色は本文色 (`text-gray-700`) または primary に揃える。
