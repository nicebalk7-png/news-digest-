#!/usr/bin/env node
/**
 * send-email.js
 *
 * PNGを添付してメール送信する。
 * SendGrid（推奨）または Gmail + Nodemailer に対応。
 *
 * 環境変数:
 *   SENDGRID_API_KEY  - SendGrid APIキー（SendGrid使用時）
 *   GMAIL_USER        - Gmailアドレス（Gmail使用時）
 *   GMAIL_APP_PASS    - GmailアプリパスワードorOAuth（Gmail使用時）
 *   MAIL_TO           - 宛先メールアドレス（複数はカンマ区切り）
 *   MAIL_FROM         - 送信元メールアドレス
 *   MAIL_SUBJECT      - 件名（省略時は自動生成）
 *
 * Usage: node src/send-email.js [--provider sendgrid|gmail]
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../output');
const ARTICLES_PATH = path.join(OUTPUT_DIR, 'articles.json');

function getSubject() {
  if (process.env.MAIL_SUBJECT) return process.env.MAIL_SUBJECT;

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const dateStr = `${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${now.getUTCDate()}`;
  return `【ニュースダイジェスト】${dateStr} 原油・プラスチック・小売・包装資材`;
}

function buildTextBody(data) {
  if (!data) return 'ニュースダイジェストをご確認ください。';

  const { categories, windowStart, windowEnd } = data;
  const s = new Date(windowStart);
  const e = new Date(windowEnd);
  const toJST = (d) => {
    const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, '0')}:00`;
  };

  let body = `ニュースダイジェスト\n`;
  body += `対象期間: ${toJST(s)} 〜 ${toJST(e)} JST\n`;
  body += `${'─'.repeat(40)}\n\n`;

  for (const [, category] of Object.entries(categories)) {
    body += `【${category.label}】 ${category.articles.length}件\n`;
    for (const a of category.articles.slice(0, 5)) {
      body += `・${a.title}\n  ${a.source}  ${a.link}\n`;
    }
    body += '\n';
  }

  body += '\n---\nNews Digest - 自動配信\n';
  return body;
}

function buildHtmlBody(data) {
  const textBody = buildTextBody(data);
  // テキストを簡易HTMLに変換
  const escaped = textBody
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => `<div>${line || '&nbsp;'}</div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; font-size: 14px; color: #333; line-height: 1.6; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .note { color: #666; font-size: 12px; margin-top: 16px; }
</style>
</head>
<body>
<div class="container">
<pre style="white-space: pre-wrap; font-family: inherit;">${escaped}</pre>
<p class="note">※ 詳細は添付の図解画像をご確認ください。</p>
</div>
</body>
</html>`;
}

function getPngAttachments() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];

  return fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith('.png') && f.startsWith('digest-'))
    .sort()
    .map((f) => ({
      filename: f,
      path: path.join(OUTPUT_DIR, f),
    }));
}

async function sendWithSendGrid(options) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const toAddresses = options.to.split(',').map((s) => s.trim());

  const attachments = options.attachments.map((att) => ({
    content: fs.readFileSync(att.path).toString('base64'),
    filename: att.filename,
    type: 'image/png',
    disposition: 'attachment',
  }));

  const msg = {
    to: toAddresses,
    from: options.from,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments,
  };

  await sgMail.send(msg);
  console.log(`SendGrid: 送信完了 → ${toAddresses.join(', ')}`);
}

async function sendWithGmail(options) {
  // nodemailer は GitHub Actions 環境で別途インストールが必要
  // Gmail 使用時は package.json に nodemailer を追加すること
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    console.error('nodemailer がインストールされていません。');
    console.error('Gmail を使用する場合: npm install nodemailer');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASS,
    },
  });

  const attachments = options.attachments.map((att) => ({
    filename: att.filename,
    path: att.path,
  }));

  await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments,
  });

  console.log(`Gmail: 送信完了 → ${options.to}`);
}

async function main() {
  const args = process.argv.slice(2);
  const providerIdx = args.indexOf('--provider');
  let provider = providerIdx !== -1 ? args[providerIdx + 1] : null;

  // 自動判定
  if (!provider) {
    if (process.env.SENDGRID_API_KEY) provider = 'sendgrid';
    else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) provider = 'gmail';
    else {
      console.error('メール送信プロバイダーが設定されていません。');
      console.error('SENDGRID_API_KEY または GMAIL_USER + GMAIL_APP_PASS を設定してください。');
      process.exit(1);
    }
  }

  const to = process.env.MAIL_TO;
  const from = process.env.MAIL_FROM;

  if (!to || !from) {
    console.error('MAIL_TO と MAIL_FROM 環境変数が必要です。');
    process.exit(1);
  }

  let articlesData = null;
  if (fs.existsSync(ARTICLES_PATH)) {
    try {
      articlesData = JSON.parse(fs.readFileSync(ARTICLES_PATH, 'utf8'));
    } catch (parseErr) {
      console.warn(`[WARN] articles.json の読み込みに失敗しました: ${parseErr.message}`);
    }
  }

  const attachments = getPngAttachments();
  if (attachments.length === 0) {
    console.warn('[WARN] 添付するPNGファイルが見つかりません。テキストのみで送信します。');
  } else {
    console.log(`添付ファイル: ${attachments.map((a) => a.filename).join(', ')}`);
  }

  const options = {
    to,
    from,
    subject: getSubject(),
    text: buildTextBody(articlesData),
    html: buildHtmlBody(articlesData),
    attachments,
  };

  console.log(`\n=== メール送信 ===`);
  console.log(`プロバイダー: ${provider}`);
  console.log(`件名: ${options.subject}`);
  console.log(`宛先: ${to}`);

  try {
    if (provider === 'sendgrid') {
      await sendWithSendGrid(options);
    } else if (provider === 'gmail') {
      await sendWithGmail(options);
    } else {
      console.error(`未対応のプロバイダー: ${provider}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('送信エラー:', err.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('未処理エラー:', err.message || err);
  process.exit(1);
});
