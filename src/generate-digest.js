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

/**
 * パターンA: 因果フロー図（原因 → 変化 → 影響）
 */
function renderDiagramA(nodes, colors) {
  const [n0, n1, n2] = nodes;
  return `<div class="mt-3 rounded-lg ${colors.bg} border ${colors.border} p-3">
    <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">因果フロー</div>
    <div class="flex items-stretch gap-1.5">
      <div class="flex-1 rounded-md bg-white border ${colors.border} px-2 py-2 text-center">
        <div class="text-[9px] font-medium text-slate-400 mb-0.5">背景・原因</div>
        <div class="text-xs font-medium text-slate-800 leading-snug">${escapeHtml(n0 || '')}</div>
      </div>
      <div class="flex items-center text-slate-300">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </div>
      <div class="flex-1 rounded-md bg-white border ${colors.border} px-2 py-2 text-center">
        <div class="text-[9px] font-medium text-slate-400 mb-0.5">変化</div>
        <div class="text-xs font-medium text-slate-800 leading-snug">${escapeHtml(n1 || '')}</div>
      </div>
      <div class="flex items-center text-slate-300">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </div>
      <div class="flex-1 rounded-md bg-white border ${colors.border} px-2 py-2 text-center">
        <div class="text-[9px] font-medium ${colors.text} mb-0.5">業界への影響</div>
        <div class="text-xs font-medium text-slate-800 leading-snug">${escapeHtml(n2 || '')}</div>
      </div>
    </div>
  </div>`;
}

/**
 * 図解データからHTMLを生成（パターン振り分け）
 */
function renderDiagram(diagramData, colors) {
  if (!diagramData || !Array.isArray(diagramData.nodes) || diagramData.nodes.length < 2) return '';
  return renderDiagramA(diagramData.nodes, colors);
}

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
      <div class="text-xs text-slate-400">Generated by Claude Code</div>
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
    ? category.articles.map((article) => {
      const displaySummary = article.aiSummary || article.summary;
      const isAiSummary = !!article.aiSummary;
      return `    <a href="${article.link}" target="_blank" class="flex items-start gap-3 p-3 ${colors.bg} rounded-lg border ${colors.border} block">
      <div class="w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 flex-shrink-0"></div>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-slate-800 leading-snug font-medium">${escapeHtml(article.title)}</div>
        ${displaySummary ? `<div class="text-xs text-slate-500 mt-1 leading-relaxed">${escapeHtml(displaySummary)}${isAiSummary ? ' <span class="inline-block align-middle px-1 py-0 text-[9px] font-semibold text-slate-400 border border-slate-200 rounded leading-tight">AI</span>' : ''}</div>` : ''}
        <div class="flex items-center gap-2 mt-1.5">
          <span class="text-xs text-slate-400">${escapeHtml(article.source)}</span>
          <span class="text-xs text-slate-300">·</span>
          <span class="text-xs text-slate-400">${formatDate(article.pubDate)}</span>
        </div>
      </div>
    </a>`;
    }).join('\n')
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

/**
 * 縦長Webページ（index.html）生成 — URL共有用メインページ
 */
function generateWebHTML(data) {
  const { categories, generatedAt, windowStart, windowEnd } = data;

  const d = new Date(generatedAt);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
  const timeStr = `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;

  const totalArticles = Object.values(categories).reduce((sum, c) => sum + c.articles.length, 0);

  // カテゴリナビ
  const navItems = Object.entries(categories)
    .filter(([, c]) => c.articles.length > 0)
    .map(([key, c]) => {
      const colors = CATEGORY_COLORS[key] || CATEGORY_COLORS.crude_oil;
      return `<a href="#cat-${key}" class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${colors.border} ${colors.bg} ${colors.text} text-xs font-medium whitespace-nowrap hover:opacity-80 transition-opacity">${c.label} <span class="opacity-60">${c.articles.length}</span></a>`;
    }).join('\n        ');

  // カテゴリセクション
  const sections = Object.entries(categories).map(([key, category]) => {
    const colors = CATEGORY_COLORS[key] || CATEGORY_COLORS.crude_oil;
    const icon = CATEGORY_ICONS[key] || CATEGORY_ICONS.crude_oil;

    if (category.articles.length === 0) return '';

    const trendBlock = category.trendSummary
      ? `<div class="mb-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-5 h-5 rounded-md ${colors.icon} flex items-center justify-center text-white flex-shrink-0">${icon}</div>
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">今日のまとめ</span>
          </div>
          <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(category.trendSummary)}</p>
        </div>`
      : '';

    const articleItems = category.articles.map((article) => {
      const displaySummary = article.aiSummary || article.summary;
      const isAiSummary = !!article.aiSummary;
      const pub = formatDate(article.pubDate);
      const diagramHtml = renderDiagram(article.diagramData, colors);

      return `<li class="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors">
          <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener" class="block">
            <p class="text-sm font-medium text-slate-900 leading-snug hover:underline">${escapeHtml(article.title)}</p>
            <p class="text-xs text-slate-400 mt-1">${escapeHtml(article.source)}${pub ? ' · ' + pub : ''}</p>
            ${displaySummary ? `<div class="mt-3 pl-3 border-l-2 ${colors.border}">
              <p class="text-sm text-slate-600 leading-relaxed">${escapeHtml(displaySummary)}</p>
              ${isAiSummary ? `<span class="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors.text} ${colors.bg} border ${colors.border}">AI要約</span>` : ''}
            </div>` : ''}
            ${diagramHtml}
          </a>
        </li>`;
    }).join('\n        ');

    const hasExplainer = category.articles.some((a) => a.aiSummary);
    const explainerLink = hasExplainer
      ? `<a href="./explainer-${key}.html"
           class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${colors.border} ${colors.bg} ${colors.text} hover:opacity-80 transition-opacity">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
          図解で見る
        </a>`
      : '';

    return `<section id="cat-${key}" class="scroll-mt-6">
      <div class="flex items-center gap-3 pb-3 mb-4 border-b border-slate-200">
        <div class="w-7 h-7 rounded-lg ${colors.icon} flex items-center justify-center text-white flex-shrink-0">${icon}</div>
        <div class="flex-1">
          <h2 class="text-base font-bold text-slate-900">${escapeHtml(category.label)}</h2>
        </div>
        <span class="text-sm font-medium text-slate-500">${category.articles.length}件</span>
        ${explainerLink}
      </div>
      ${trendBlock}
      <ul class="space-y-3">
        ${articleItems}
      </ul>
    </section>`;
  }).filter(Boolean).join('\n\n    ');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ニュースダイジェスト ${dateStr}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic', sans-serif; }
    html { scroll-behavior: smooth; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900">
  <div class="max-w-2xl mx-auto px-4 py-8">

    <!-- ヘッダー -->
    <header class="mb-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-bold text-slate-900">ニュースダイジェスト</h1>
          <p class="text-sm text-slate-500 mt-1">${formatWindowDate(windowStart, windowEnd)}</p>
        </div>
        <div class="text-center shrink-0">
          <div class="text-2xl font-bold text-slate-900">${totalArticles}</div>
          <div class="text-xs text-slate-500">件</div>
        </div>
      </div>

      <!-- カテゴリナビ -->
      <div class="flex flex-wrap gap-2 mt-4">
        ${navItems}
      </div>
    </header>

    <!-- カテゴリセクション -->
    <main class="space-y-10">
    ${sections}
    </main>

    <!-- フッター -->
    <footer class="mt-12 pt-6 border-t border-slate-200 flex items-center justify-between">
      <span class="text-xs text-slate-400">${dateStr} ${timeStr} JST</span>
      <span class="text-xs text-slate-400">Generated by Claude Code</span>
    </footer>

  </div>
</body>
</html>`;
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

  // 縦長Webページ（URL共有用メインページ）
  const webPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(webPath, generateWebHTML(data), 'utf8');
  console.log(`生成: ${webPath}`);

  // サマリーページ（メール添付用PNG向け、既存）
  const summaryPath = path.join(OUTPUT_DIR, 'digest-summary.html');
  fs.writeFileSync(summaryPath, generateSummaryHTML(data), 'utf8');
  console.log(`生成: ${summaryPath}`);

  // カテゴリ別ページ（既存）
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
