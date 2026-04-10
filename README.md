# News Digest - ニュースダイジェスト自動配信

毎朝8時（JST）に原油・ナフサ・プラスチック・小売・包装資材に関連するニュースを自動収集し、図解画像（PNG）をメールで配信する自動化ツールです。

## 処理フロー

```
GitHub Actions (cron: 毎日 JST 08:00)
  ↓
fetch-news.js    : Google News / Yahoo / ロイター / 日経 から RSS 取得
  ↓ 時刻フィルタ（昨日 08:00 〜 当日 08:00 JST）
  ↓ キーワードマッチング（原油・ナフサ・プラスチック・小売・包装資材）
  ↓
generate-digest.js : カテゴリ別カード型 HTML を生成
  ↓
capture.js       : Playwright で HTML → PNG 変換
  ↓
send-email.js    : PNG 添付メールを送信（SendGrid / Gmail）
```

## ディレクトリ構成

```
news-digest/
├── .github/workflows/
│   └── daily-news.yml      # cron スケジュール設定
├── src/
│   ├── index.js            # 全処理を順番に実行するエントリポイント
│   ├── fetch-news.js       # RSS 取得・フィルタリング
│   ├── generate-digest.js  # HTML 図解生成
│   └── send-email.js       # メール送信
├── scripts/
│   └── capture.js          # HTML → PNG 変換（Playwright）
├── config/
│   └── sources.yml         # RSS ソース URL とキーワード設定
└── output/                 # 生成ファイル（.gitignore 対象）
    ├── articles.json
    ├── digest-summary.html
    ├── digest-*.html
    └── digest-*.png
```

---

## セットアップ

### 1. リポジトリを GitHub に作成・プッシュ

```bash
cd news-digest
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/news-digest.git
git push -u origin main
```

### 2. GitHub Secrets の設定

GitHub リポジトリ > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** から以下を追加してください。

| Secret 名 | 説明 | 必須 |
|-----------|------|------|
| `SENDGRID_API_KEY` | SendGrid の API キー | SendGrid 使用時 |
| `GMAIL_USER` | Gmail のメールアドレス | Gmail 使用時 |
| `GMAIL_APP_PASS` | Gmail のアプリパスワード | Gmail 使用時 |
| `MAIL_TO` | 宛先アドレス（複数はカンマ区切り） | 必須 |
| `MAIL_FROM` | 送信元アドレス | 必須 |

#### SendGrid の場合（推奨）

1. [SendGrid](https://sendgrid.com/) にアカウント登録（無料枠: 1日100通）
2. **Settings** > **API Keys** > **Create API Key** で "Mail Send" 権限のキーを作成
3. 取得したキーを `SENDGRID_API_KEY` として登録
4. `MAIL_FROM` には SendGrid の Sender Authentication で認証したアドレスを設定

#### Gmail の場合

1. Google アカウント > **セキュリティ** > **2段階認証** を有効化
2. **アプリパスワード** を作成（16文字のパスワード）
3. `GMAIL_USER` にメールアドレス、`GMAIL_APP_PASS` にアプリパスワードを設定
4. `npm install nodemailer` が必要（package.json に追加してコミット）

### 3. 動作確認（手動実行）

GitHub リポジトリ > **Actions** > **ニュースダイジェスト 毎朝配信** > **Run workflow**

- `skip_send: true` に設定するとメール送信をスキップ（動作確認に便利）
- `target_date: YYYY-MM-DD` を指定すると任意の日付で実行可能

---

## ローカルでの実行

```bash
# 依存パッケージのインストール
npm install
npx playwright install chromium

# 全処理を実行（メール送信あり）
node src/index.js

# メール送信をスキップして動作確認
node src/index.js --skip-send

# 特定日付を指定
node src/index.js --date 2026-04-10 --skip-send

# 個別に実行
node src/fetch-news.js
node src/generate-digest.js
node scripts/capture.js --batch output/capture-list.txt
node src/send-email.js
```

環境変数はターミナルで設定するか `.env` ファイルを用意してください（`.gitignore` 済み）。

---

## キーワード・ソースのカスタマイズ

`config/sources.yml` を編集します。

```yaml
# RSSフィードの追加例
sources:
  - name: "追加ソース名"
    url: "https://example.com/rss"
    lang: ja

# キーワードの追加例
categories:
  crude_oil:
    keywords_ja: ["原油", "ナフサ", "追加キーワード"]
```

---

## 生成される図解

| ファイル | 内容 |
|---------|------|
| `digest-summary.png` | サマリー（全カテゴリ件数 + ピックアップ） |
| `digest-crude_oil.png` | 原油・ナフサ 記事一覧 |
| `digest-plastics.png` | プラスチック・樹脂 記事一覧 |
| `digest-retail.png` | 小売業 記事一覧 |
| `digest-packaging.png` | 包装資材 記事一覧 |

---

## ライセンス

MIT
