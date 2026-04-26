#!/usr/bin/env node
/**
 * summarize.js
 *
 * articles.json の各記事URLに対して:
 *   1. Jina Reader (r.jina.ai) で本文テキストを取得
 *   2. Gemini Flash で100文字以内の日本語要約を生成
 *   3. articles.json に aiSummary フィールドを追記して上書き保存
 *
 * 環境変数:
 *   GEMINI_API_KEY  … 必須（未設定時はスキップ）
 *   JINA_API_KEY    … 任意（未設定でも動作、設定時は高レート制限解除）
 *
 * Usage: node src/summarize.js [--max N]
 */

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INPUT_PATH = path.join(__dirname, '../output/articles.json');

const JINA_BASE = 'https://r.jina.ai/';
const GEMINI_MODEL = 'gemini-2.0-flash';
const MAX_CONTENT_CHARS = 3000;
const INTERVAL_MS = 600;
const FETCH_TIMEOUT_MS = 15000;

function buildPrompt(content) {
  return `あなたは化学・資材業界の専門アナリストです。
以下の記事本文を、業界関係者向けに100文字以内の日本語で要約してください。
- 価格変動・規制・企業動向など重要な事実を優先する
- 専門用語はそのまま使用する
- 文末は体言止めまたは「〜の見通し」「〜を発表」など端的な表現にする
- 100文字を絶対に超えないこと

記事本文:
${content}

要約:`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArticleContent(articleUrl) {
  const jinaUrl = `${JINA_BASE}${articleUrl}`;
  const headers = { Accept: 'text/plain' };
  if (process.env.JINA_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
  }
  const res = await fetchWithTimeout(jinaUrl, { headers }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`Jina Reader returned ${res.status}`);
  }
  const text = await res.text();
  return text.slice(0, MAX_CONTENT_CHARS);
}

async function summarizeWithGemini(ai, content) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildPrompt(content),
  });
  const text = response.text?.trim() ?? '';
  // 100文字を超えた場合は切り捨て（フォールバック）
  return text.slice(0, 100);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[summarize] GEMINI_API_KEY が設定されていません。AI要約をスキップします。');
    process.exit(0);
  }

  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[summarize] articles.json が見つかりません: ${INPUT_PATH}`);
    console.error('先に fetch-news.js を実行してください。');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const maxIdx = args.indexOf('--max');
  const maxArticles = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : Infinity;

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const ai = new GoogleGenAI({ apiKey });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let total = 0;

  // 全カテゴリの記事を収集
  for (const category of Object.values(data.categories)) {
    total += category.articles.length;
  }

  console.log(`\n=== AI要約生成開始 ===`);
  console.log(`対象記事数: ${total}件`);
  console.log(`モデル: ${GEMINI_MODEL}`);
  if (process.env.JINA_API_KEY) {
    console.log('Jina API Key: 設定済み');
  } else {
    console.log('Jina API Key: 未設定（低レート制限で動作）');
  }

  for (const [catKey, category] of Object.entries(data.categories)) {
    console.log(`\n[${category.label}] ${category.articles.length}件`);

    for (const article of category.articles) {
      if (processed >= maxArticles) {
        console.log('  --max 上限に達しました。残りをスキップ。');
        break;
      }

      // 既に要約済みの場合はスキップ（再実行対応）
      if (article.aiSummary !== undefined) {
        console.log(`  [skip] 要約済み: ${article.title.slice(0, 40)}...`);
        skipped++;
        continue;
      }

      if (!article.link) {
        article.aiSummary = null;
        skipped++;
        continue;
      }

      process.stdout.write(`  [${processed + 1}/${total}] ${article.title.slice(0, 40)}... `);

      try {
        const content = await fetchArticleContent(article.link);
        if (!content || content.trim().length < 50) {
          throw new Error('本文が短すぎます');
        }
        const summary = await summarizeWithGemini(ai, content);
        article.aiSummary = summary;
        console.log('OK');
        processed++;
      } catch (err) {
        article.aiSummary = null;
        console.log(`FAIL (${err.message})`);
        failed++;
      }

      // レート制限回避のインターバル
      await sleep(INTERVAL_MS);
    }
  }

  // カテゴリごとのトレンドサマリー生成
  console.log(`\n=== カテゴリトレンド分析 ===`);
  for (const [catKey, category] of Object.entries(data.categories)) {
    const articles = category.articles || [];
    if (articles.length === 0) {
      category.trendSummary = null;
      continue;
    }

    // 記事数・内容が変わっていなければスキップ
    const fingerprint = articles.map((a) => `${a.link}|${a.aiSummary || ''}`).join('\n');
    if (category.trendSummary && category._trendFingerprint === fingerprint) {
      console.log(`  [skip] ${category.label}: トレンド済み`);
      continue;
    }

    process.stdout.write(`  [trend] ${category.label}... `);
    try {
      const lines = articles.map((a, i) => {
        const body = a.aiSummary || a.summary || '(要約なし)';
        return `${i + 1}. ${a.title}\n   要約: ${body}`;
      }).join('\n\n');

      const prompt = `あなたは化学・資材業界の専門アナリストです。
カテゴリ「${category.label}」の本日掲載記事を踏まえ、今日の業界トレンドを2文以内・150文字以内の日本語で述べてください。
- 記事に現れていない主張はしない
- 価格・供給・規制・企業動向など共通テーマにフォーカス
- 前置き不要、結論文から始める

本日の記事:
${lines}

トレンド（2文以内）:`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const trend = (response.text?.trim() ?? '').slice(0, 150);
      category.trendSummary = trend;
      category._trendFingerprint = fingerprint;
      console.log('OK');
    } catch (err) {
      category.trendSummary = null;
      console.log(`FAIL (${err.message})`);
    }
    await sleep(INTERVAL_MS);
  }

  // _trendFingerprint は保存前に除去
  for (const category of Object.values(data.categories)) {
    delete category._trendFingerprint;
  }

  // articles.json を上書き保存
  fs.writeFileSync(INPUT_PATH, JSON.stringify(data, null, 2), 'utf8');

  console.log(`\n=== AI要約完了 ===`);
  console.log(`成功: ${processed}件 / スキップ: ${skipped}件 / 失敗: ${failed}件`);
  console.log(`保存: ${INPUT_PATH}`);
}

main().catch((err) => {
  console.error('[summarize] 予期しないエラー:', err);
  process.exit(1);
});
