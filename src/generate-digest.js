#!/usr/bin/env node
/**
 * generate-digest.js
 *
 * articles.json をもとに、カテゴリ別カード型HTMLを生成する。
 * コミネコ diagram-guidelines のデザインに準拠（Tailwind CSS + 420px 幅）。
 *
 * 出力ファイル（output/ ディレクトリ）:
 *   digest-summary.html       - サマリー（全カテゴリ件数 + ハイライト）
 *   digest-crude_oil.html     - 原油・ナフサ
 *   digest-plastics.html      - プラスチック・樹脂
 *   digest-retail.html        - 小売業
 *   digest-packaging.html     - 包装資材
 *
 * Usage: node src/generate-digest.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../output/articles.json');
const OUTPUT_DIR = path.join(__dirname, '../output');

// カテゴリアイコン（インラインSVG）
const CATEGORY_ICONS = {
  crude_oil: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" d="M9 22V12h6v10"/></svg>`,
  plastics: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>`,
  retail: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
  packaging: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>`,
  ai: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>`,
};

const CATEGORY_COLORS = {
  crude_oil: { bg: 'bg-red-50', border: 'border-red-100', dot: 'bg-red-500', icon: 'bg-red-500', text: 'text-red-600' },
  plastics: { bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-green-500', icon: 'bg-green-500', text: 'text-green-600' },
  retail: { bg: 'bg-blue-50', border: 'border-blue-100', dot: 'bg-blue-500', icon: 'bg-blue-500', text: 'text-blue-600' },
  packaging: { bg: 'bg-purple-50', border: 'border-purple-100', dot: 'bg-purple-500', icon: 'bg-purple-500', text: 'text-purple-600' },
  ai: { bg: 'bg-orange-50', border: 'border-orange-100', dot: 'bg-orange-500', icon: 'bg-orange-500', text: 'text-orange-600' },
};

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const h = String(jst.getUTCHours()).padStart(2, '0');
  const min = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

function formatWindowDate(isoStart, isoEnd) {
  const s = new Date(isoStart);
  const e = new Date(isoEnd);
  const toJST = (d) => {
    const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, '0')}:00`;
  };
  return `${toJST(s)} 〜 ${toJST(e)} JST`;
}

function htmlHead(title) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif; }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>`;
}

function htmlFooter(generatedAt) {
  const d = new Date(generatedAt);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
  return `  <div class="border-t border-slate-200 pt-3 mt-auto">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span class="text-xs text-slate-400">${dateStr} JST</span>
      </div>
      <div class="text-xs text-slate-400">News Digest</div>
    </div>
  </div>`;
}

/**
 * サマリーページ生成
 */
function generateSummaryHTML(data) {
  const { categories, generatedAt, windowStart, windowEnd } = data;
  const totalArticles = Object.values(categories).reduce((sum, c) => sum + c.articles.length, 0);

  // 全カテゴリからハイライト（各カテゴリ最初の1件）
  const highlights = Object.entries(categories)
    .filter(([, c]) => c.articles.length > 0)
    .map(([key, c]) => ({ key, label: c.label, article: c.articles[0] }));

  const statsItems = Object.entries(categories)
    .map(([key, c]) => {
      const colors = CATEGORY_COLORS[key] || CATEGORY_COLORS.crude_oil;
      return `      <div class="text-center">
        <div class="text-xl font-bold text-slate-900">${c.articles.length}</div>
        <div class="text-xs ${colors.text}">${c.label}</div>
      </div>`;
    })
    .join('\n      <div class="w-px h-8 bg-slate-200"></div>\n');

  const highlightItems = highlights.map(({ key, label, article }) => {
    const colors = CATEGORY_COLORS[key] || CATEGORY_COLORS.crude_oil;
    return `    <a href="${article.link}" target="_blank" class="flex items-start gap-3 p-3 ${colors.bg} rounded-lg border ${colors.border} block">
      <div class="w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 flex-shrink-0"></div>
      <div>
        <div class="text-xs font-medium ${colors.text} mb-0.5">${label}</div>
        <div class="text-sm text-slate-800 leading-snug">${escapeHtml(article.title)}</div>
        <div class="text-xs text-slate-400 mt-1">${article.source} · ${formatDate(article.pubDate)}</div>
      </div>
    </a>`;
  }).join('\n');

  const noHighlights = highlights.length === 0
    ? `    <div class="flex items-center justify-center h-24 text-slate-400 text-sm">本日の対象ニュースはありませんでした</div>`
    : '';

  return `${htmlHead('ニュースダイジェスト サマリー')}
<body class="bg-white p-4">
  <div class="w-[420px] mx-auto flex flex-col gap-4">
    <!-- ヘッダー -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6m-6-4h6"/></svg>
        </div>
        <div>
          <h1 class="text-base font-semibold text-slate-900">ニュースダイジェスト</h1>
          <p class="text-xs text-slate-500">${formatWindowDate(windowStart, windowEnd)}</p>
        </div>
      </div>
      <div class="text-center">
        <div class="text-xl font-bold text-slate-900">${totalArticles}</div>
        <div class="text-xs text-slate-500">件</div>
      </div>
    </div>

    <!-- カテゴリ別件数 -->
    <div class="flex items-center justify-center gap-4 py-3 bg-slate-50 rounded-lg flex-wrap">
${statsItems}
    </div>

    <!-- ハイライト -->
    <div>
      <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">ピックアップ</div>
      <div class="space-y-2">
${highlightItems || noHighlights}
      </div>
    </div>

${htmlFooter(generatedAt)}
  </div>
</body>
</html>`;
}

/**
 * カテゴリ別詳細ページ生成
 */
function generateCategoryHTML(data, catKey) {
  const { categories, generatedAt, windowStart, windowEnd } = data;
  const category = categories[catKey];
  const colors = CATEGORY_COLORS[catKey] || CATEGORY_COLORS.crude_oil;
  const icon = CATEGORY_ICONS[catKey] || CATEGORY_ICONS.crude_oil;

  const articleItems = category.articles.length > 0
    ? category.articles.map((article) => `    <a href="${article.link}" target="_blank" class="flex items-start gap-3 p-3 ${colors.bg} rounded-lg border ${colors.border} block">
      <div class="w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 flex-shrink-0"></div>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-slate-800 leading-snug font-medium">${escapeHtml(article.title)}</div>
        ${article.summary ? `<div class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(article.summary)}</div>` : ''}
        <div class="flex items-center gap-2 mt-1.5">
          <span class="text-xs text-slate-400">${escapeHtml(article.source)}</span>
          <span class="text-xs text-slate-300">·</span>
          <span class="text-xs text-slate-400">${formatDate(article.pubDate)}</span>
        </div>
      </div>
    </a>`).join('\n')
    : `    <div class="flex items-center justify-center h-24 text-slate-400 text-sm rounded-lg bg-slate-50 border border-slate-100">本日の対象ニュースはありませんでした</div>`;

  return `${htmlHead(`${category.label} - ニュースダイジェスト`)}
<body class="bg-white p-4">
  <div class="w-[420px] mx-auto flex flex-col gap-4">
    <!-- ヘッダー -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg ${colors.icon} flex items-center justify-center text-white">
          ${icon}
        </div>
        <div>
          <h1 class="text-base font-semibold text-slate-900">${category.label}</h1>
          <p class="text-xs text-slate-500">${formatWindowDate(windowStart, windowEnd)}</p>
        </div>
      </div>
      <div class="text-center">
        <div class="text-xl font-bold text-slate-900">${category.articles.length}</div>
        <div class="text-xs text-slate-500">件</div>
      </div>
    </div>

    <!-- 記事リスト -->
    <div class="space-y-2">
${articleItems}
    </div>

${htmlFooter(generatedAt)}
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`articles.json が見つかりません: ${INPUT_PATH}`);
    console.error('先に fetch-news.js を実行してください。');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // サマリーページ
  const summaryPath = path.join(OUTPUT_DIR, 'digest-summary.html');
  fs.writeFileSync(summaryPath, generateSummaryHTML(data), 'utf8');
  console.log(`生成: ${summaryPath}`);

  // カテゴリ別ページ
  for (const catKey of Object.keys(data.categories)) {
    const catPath = path.join(OUTPUT_DIR, `digest-${catKey}.html`);
    fs.writeFileSync(catPath, generateCategoryHTML(data, catKey), 'utf8');
    console.log(`生成: ${catPath}`);
  }

  console.log('\nHTML生成完了');

  // スクリーンショット対象ファイルリストを出力（capture スクリプトに渡す）
  const htmlFiles = [
    'digest-summary.html',
    ...Object.keys(data.categories).map((k) => `digest-${k}.html`),
  ];

  const captureListPath = path.join(OUTPUT_DIR, 'capture-list.txt');
  fs.writeFileSync(
    captureListPath,
    htmlFiles.map((f) => `${path.join(OUTPUT_DIR, f)}:${path.join(OUTPUT_DIR, f.replace('.html', '.png'))}`).join('\n'),
    'utf8'
  );
  console.log(`キャプチャリスト: ${captureListPath}`);
}

main();
