#!/usr/bin/env node
/**
 * fetch-news.js
 *
 * RSSフィードから記事を取得し、時刻フィルタとキーワードマッチングを行う。
 * 出力: articles.json (output/ ディレクトリに保存)
 *
 * Usage: node src/fetch-news.js [--date YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const yaml = require('js-yaml');

const CONFIG_PATH = path.join(__dirname, '../config/sources.yml');
const OUTPUT_DIR = path.join(__dirname, '../output');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return yaml.load(raw);
}

/**
 * 基準日時（当日8時 JST）と前日8時 JST の範囲を返す
 */
function getTimeWindow(config, targetDate) {
  let base;
  if (targetDate) {
    // YYYY-MM-DD 形式で指定された場合
    base = new Date(`${targetDate}T08:00:00+09:00`);
  } else {
    // 実行時刻から JST の日付を取得し、その日の 08:00 JST を基準とする
    const jstDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    base = new Date(`${jstDateStr}T08:00:00+09:00`);
  }

  const hours = config.time_window_hours || 24;
  const windowMs = hours * 60 * 60 * 1000;

  return {
    end: base,
    start: new Date(base.getTime() - windowMs),
  };
}

/**
 * 記事テキスト（タイトル・概要）にキーワードが含まれているかチェック
 */
function matchesCategory(article, category) {
  const text = [article.title || '', article.contentSnippet || article.summary || '']
    .join(' ')
    .toLowerCase();

  const jaKeywords = category.keywords_ja || [];
  const enKeywords = category.keywords_en || [];

  for (const kw of jaKeywords) {
    if (text.includes(kw.toLowerCase())) return true;
  }
  for (const kw of enKeywords) {
    if (text.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/**
 * 単一RSSフィードを取得してパース
 */
async function fetchFeed(source) {
  const parser = new Parser({
    customFields: {
      item: ['media:content', 'enclosure'],
    },
    timeout: 15000,
  });

  try {
    console.log(`  Fetching: ${source.name}`);
    const feed = await parser.parseURL(source.url);
    return feed.items || [];
  } catch (err) {
    console.warn(`  [WARN] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }
}

/**
 * メイン処理
 */
async function main() {
  const args = process.argv.slice(2);
  let targetDate = null;
  const dateIdx = args.indexOf('--date');
  if (dateIdx !== -1 && args[dateIdx + 1]) {
    targetDate = args[dateIdx + 1];
  }

  const config = loadConfig();
  const { start, end } = getTimeWindow(config, targetDate);

  console.log(`\n=== ニュース取得開始 ===`);
  console.log(`対象期間: ${start.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} 〜 ${end.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} (JST)`);
  console.log(`ソース数: ${config.sources.length}`);

  // 全ソースから記事取得
  const allArticles = [];
  for (const source of config.sources) {
    const items = await fetchFeed(source);
    for (const item of items) {
      allArticles.push({
        ...item,
        _source: source.name,
        _lang: source.lang,
      });
    }
  }

  console.log(`\n取得記事数（フィルタ前）: ${allArticles.length}`);

  // 時刻フィルタ（Invalid Date を除外）
  const inWindow = allArticles.filter((article) => {
    const pubDate = article.pubDate || article.isoDate;
    if (!pubDate) return false;
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) return false;
    return d >= start && d < end;
  });

  console.log(`時刻フィルタ後: ${inWindow.length}件`);

  // カテゴリ分類
  const categories = config.categories;
  const result = {};
  const maxPerCat = config.filter?.max_articles_per_category || 10;

  for (const [catKey, category] of Object.entries(categories)) {
    const matched = inWindow.filter((a) => matchesCategory(a, category));

    // 重複排除（URL重複 + タイトル類似）
    const seenUrls = new Set();
    const seenTitleKeys = new Set();
    const deduped = matched.filter((a) => {
      const url = a.link || a.guid;
      if (url && seenUrls.has(url)) return false;
      if (url) seenUrls.add(url);

      // タイトルを正規化して類似記事を排除
      // 「写真ギャラリーN枚め |」「(1/7)」などのプレフィックス・サフィックスを除去
      const rawTitle = (a.title || '').trim();
      const normalizedTitle = rawTitle
        .replace(/^写真ギャラリー\d+枚め\s*[|｜]\s*/u, '')
        .replace(/\s*[\(（]\d+\/\d+[\)）]\s*$/, '')
        .replace(/\s*[-–—]\s*\S+$/, '') // 末尾の「- メディア名」を除去
        .trim()
        .slice(0, 40); // 先頭40文字で比較

      if (seenTitleKeys.has(normalizedTitle)) return false;
      seenTitleKeys.add(normalizedTitle);
      return true;
    });

    // 新しい順に並べ、最大件数で切り捨て
    const sorted = deduped
      .sort((a, b) => {
        const da = new Date(a.isoDate || a.pubDate || 0);
        const db = new Date(b.isoDate || b.pubDate || 0);
        return db - da;
      })
      .slice(0, maxPerCat)
      .map((a) => ({
        title: a.title || '(タイトルなし)',
        link: a.link || a.guid || '',
        pubDate: a.isoDate || a.pubDate || '',
        source: a._source,
        summary: (a.contentSnippet || a.summary || '').slice(0, 200),
      }));

    result[catKey] = {
      label: category.label,
      color: category.color,
      articles: sorted,
    };

    console.log(`  ${category.label}: ${sorted.length}件`);
  }

  // 出力
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, 'articles.json');
  const output = {
    generatedAt: new Date().toISOString(),
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    categories: result,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n完了: ${outputPath} に保存`);

  return output;
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
