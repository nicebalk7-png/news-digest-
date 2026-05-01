#!/usr/bin/env node
/**
 * generate-explainer.js
 *
 * articles.json を読み、カテゴリごとに relevanceScore 上位5件を選んで
 * creating-visual-explainers スタイルの図解ページを生成する。
 *
 * 出力: output/explainer-{catKey}.html（カテゴリ数分）
 * Usage: node src/generate-explainer.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../output/articles.json');
const OUTPUT_DIR = path.join(__dirname, '../output');

const TOP_N = 5;

// カテゴリ別テーマカラー（ADS配色ベース）
const CATEGORY_THEME = {
  crude_oil:  { accent: '#EF4444', accentLight: '#FEE2E2', accentText: '#B91C1C', label: '原油・ナフサ' },
  plastics:   { accent: '#10B981', accentLight: '#D1FAE5', accentText: '#065F46', label: 'プラスチック・樹脂' },
  retail:     { accent: '#3B82F6', accentLight: '#DBEAFE', accentText: '#1D4ED8', label: '小売業' },
  packaging:  { accent: '#8B5CF6', accentLight: '#EDE9FE', accentText: '#6D28D9', label: '包装資材' },
  ai:         { accent: '#F59E0B', accentLight: '#FEF3C7', accentText: '#B45309', label: 'AI・テクノロジー' },
};

// Lucide アイコン名（visualType → アイコン）
const VISUAL_TYPE_ICON = {
  causal:     'arrow-right-circle',
  process:    'list-ordered',
  comparison: 'columns-2',
  stat:       'bar-chart-2',
};

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

// --- 図解レンダラー ---

/** causal: 横3ボックス因果フロー */
function renderCausal(diagramData, theme) {
  const nodes = diagramData?.nodes || [];
  const [n0, n1, n2] = nodes;
  if (!n0) return '';
  return `
    <div class="mt-4 p-4 rounded-xl border border-slate-200 bg-ads-surface">
      <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <i data-lucide="arrow-right-circle" class="w-3.5 h-3.5"></i> 因果フロー
      </p>
      <div class="flex items-stretch gap-2">
        <div class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
          <p class="text-[10px] text-ads-dim mb-1">背景・原因</p>
          <p class="text-xs font-semibold text-ads-text leading-snug">${escapeHtml(n0)}</p>
        </div>
        <div class="flex items-center text-slate-300">
          <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
          <p class="text-[10px] text-ads-dim mb-1">変化</p>
          <p class="text-xs font-semibold text-ads-text leading-snug">${escapeHtml(n1 || '')}</p>
        </div>
        <div class="flex items-center text-slate-300">
          <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 rounded-lg border" style="border-color:${theme.accent}33; background:${theme.accentLight};" class="px-3 py-2.5 text-center">
          <p class="text-[10px] mb-1" style="color:${theme.accentText}; opacity:0.7;">業界への影響</p>
          <p class="text-xs font-semibold leading-snug" style="color:${theme.accentText};">${escapeHtml(n2 || '')}</p>
        </div>
      </div>
    </div>`;
}

/** process: 番号付き縦ステップフロー */
function renderProcess(diagramData, keyPoints, theme) {
  const steps = (diagramData?.nodes?.length >= 2 ? diagramData.nodes : keyPoints) || [];
  if (steps.length === 0) return '';
  const items = steps.map((step, i) => `
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5" style="background:${theme.accent};">${i + 1}</div>
          <p class="text-sm text-ads-text leading-relaxed pt-0.5">${escapeHtml(step)}</p>
        </div>`).join('');
  return `
    <div class="mt-4 p-4 rounded-xl border border-slate-200 bg-ads-surface">
      <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <i data-lucide="list-ordered" class="w-3.5 h-3.5"></i> ステップフロー
      </p>
      <div class="flex flex-col gap-3">
        ${items}
      </div>
    </div>`;
}

/** comparison: 左右2カラム対比 */
function renderComparison(diagramData, theme) {
  const nodes = diagramData?.nodes || [];
  if (nodes.length < 2) return '';
  const left = nodes[0] || '';
  const right = nodes[nodes.length - 1] || '';
  const mid = nodes.length === 3 ? nodes[1] : null;
  return `
    <div class="mt-4 p-4 rounded-xl border border-slate-200 bg-ads-surface">
      <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <i data-lucide="columns-2" class="w-3.5 h-3.5"></i> 比較
      </p>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-white border border-slate-200 p-3 text-center">
          <p class="text-[10px] text-ads-dim mb-1">従来 / Before</p>
          <p class="text-sm font-semibold text-ads-text">${escapeHtml(left)}</p>
        </div>
        <div class="rounded-lg border p-3 text-center" style="border-color:${theme.accent}55; background:${theme.accentLight};">
          <p class="text-[10px] mb-1" style="color:${theme.accentText}; opacity:0.7;">変化後 / After</p>
          <p class="text-sm font-semibold" style="color:${theme.accentText};">${escapeHtml(right)}</p>
        </div>
      </div>
      ${mid ? `<p class="text-xs text-ads-dim text-center mt-2">${escapeHtml(mid)}</p>` : ''}
    </div>`;
}

/** stat: 数値カード */
function renderStat(keyPoints, theme) {
  if (!keyPoints || keyPoints.length === 0) return '';
  const cards = keyPoints.map((kp) => {
    // 数字が含まれていれば強調表示
    const numMatch = kp.match(/[\d,\.]+[%倍億万円ドル%]/);
    const num = numMatch ? numMatch[0] : null;
    const label = num ? kp.replace(num, '').trim() : kp;
    return `
        <div class="rounded-xl border border-slate-200 bg-white p-4 text-center">
          ${num ? `<p class="text-2xl font-black mb-1" style="color:${theme.accent};">${escapeHtml(num)}</p>` : ''}
          <p class="text-xs text-ads-muted leading-snug">${escapeHtml(label)}</p>
        </div>`;
  }).join('');
  return `
    <div class="mt-4 p-4 rounded-xl border border-slate-200 bg-ads-surface">
      <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i> 数値ハイライト
      </p>
      <div class="grid grid-cols-3 gap-2">
        ${cards}
      </div>
    </div>`;
}

function renderDiagram(article, theme) {
  const type = article.visualType || 'causal';
  switch (type) {
    case 'process':
      return renderProcess(article.diagramData, article.keyPoints, theme);
    case 'comparison':
      return renderComparison(article.diagramData, theme);
    case 'stat':
      return renderStat(article.keyPoints, theme);
    default:
      return renderCausal(article.diagramData, theme);
  }
}

// --- HTML生成 ---

function htmlHead(title, description) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            ads: {
              bg: '#FFFFFF', surface: '#F8FAFC', hover: '#F1F5F9', border: '#E2E8F0',
              accent: '#3B82F6', 'accent-light': '#2563EB',
              text: '#1E293B', muted: '#64748B', dim: '#94A3B8',
              positive: '#10B981', negative: '#EF4444', warning: '#F59E0B',
            }
          },
          fontFamily: {
            sans: ['"Noto Sans JP"', '"Hiragino Sans"', '"Yu Gothic UI"', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    @media print { .no-print { display: none !important; } }
  </style>
</head>`;
}

function generateCategoryExplainer(catKey, category, theme, generatedAt) {
  const articles = (category.articles || [])
    .filter((a) => a.aiSummary)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, TOP_N);

  if (articles.length === 0) return null;

  const d = new Date(generatedAt);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;

  const title = `${theme.label} 図解 — ${dateStr}`;
  const description = category.trendSummary || `${theme.label}の最新ニュースを図解でわかりやすく解説`;

  const articleCards = articles.map((article, idx) => {
    const typeIcon = VISUAL_TYPE_ICON[article.visualType] || 'arrow-right-circle';
    const keyPointsHtml = (article.keyPoints || []).length > 0
      ? `<ul class="mt-3 space-y-1">
          ${article.keyPoints.map((kp) => `
          <li class="flex items-start gap-2 text-sm text-ads-muted">
            <i data-lucide="check-circle" class="w-4 h-4 flex-shrink-0 mt-0.5" style="color:${theme.accent};"></i>
            <span>${escapeHtml(kp)}</span>
          </li>`).join('')}
        </ul>`
      : '';

    const diagramHtml = renderDiagram(article, theme);

    return `
  <!-- 記事${idx + 1} -->
  <div class="rounded-2xl border border-ads-border bg-white shadow-sm overflow-hidden">
    <div class="px-5 py-4 border-b border-ads-border/60" style="background:${theme.accentLight};">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-xs font-bold px-2 py-0.5 rounded-full text-white" style="background:${theme.accent};">TOP ${idx + 1}</span>
        <span class="text-xs text-ads-dim flex items-center gap-1">
          <i data-lucide="${typeIcon}" class="w-3 h-3"></i>
          ${{ causal: '因果分析', process: 'プロセス', comparison: '比較', stat: '数値' }[article.visualType] || '図解'}
        </span>
        <span class="text-xs text-ads-dim ml-auto">${formatDate(article.pubDate)}</span>
      </div>
      <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener"
         class="text-base font-bold leading-snug hover:underline block" style="color:${theme.accentText};">
        ${escapeHtml(article.title)}
      </a>
      <p class="text-xs text-ads-muted mt-1">${escapeHtml(article.source)}</p>
    </div>
    <div class="px-5 py-4">
      ${article.aiSummary ? `
      <div class="mb-3 pl-3 border-l-4" style="border-color:${theme.accent};">
        <p class="text-sm text-ads-text leading-relaxed">${escapeHtml(article.aiSummary)}</p>
      </div>` : ''}
      ${keyPointsHtml}
      ${diagramHtml}
    </div>
  </div>`;
  }).join('\n');

  // スコアバー（記事のスコア分布を視覚化）
  const scoreBar = articles.map((a, i) => {
    const score = a.relevanceScore || 3;
    const pct = Math.round((score / 5) * 100);
    return `
      <div class="flex items-center gap-2 text-xs text-ads-muted">
        <span class="w-4 text-right">${i + 1}</span>
        <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full" style="width:${pct}%;background:${theme.accent};opacity:0.7;"></div>
        </div>
        <span class="w-4 text-center font-medium" style="color:${theme.accent};">${score}</span>
      </div>`;
  }).join('');

  return `${htmlHead(title, description)}
<body class="bg-ads-bg text-ads-text antialiased leading-relaxed" style="border-top:4px solid ${theme.accent};">
  <div class="no-print max-w-3xl mx-auto px-5 pt-2 flex items-center justify-between">
    <a href="./index.html" class="text-xs text-ads-dim hover:text-ads-accent flex items-center gap-1">
      <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> 一覧に戻る
    </a>
    <button onclick="window.print()" class="flex items-center gap-1.5 text-xs text-ads-dim hover:text-ads-accent transition-colors cursor-pointer">
      <i data-lucide="download" class="w-3.5 h-3.5"></i> PDF
    </button>
  </div>

  <main class="max-w-3xl mx-auto px-5 py-10">

    <!-- ヒーロー -->
    <div class="text-center mb-10">
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-5 text-white" style="background:${theme.accent};">
        <i data-lucide="newspaper" class="w-4 h-4"></i>
        ${escapeHtml(theme.label)}
      </div>
      <h1 class="text-3xl font-black text-ads-text mb-4">今日の注目ニュース<br>図解でわかる</h1>
      ${category.trendSummary ? `
      <div class="max-w-xl mx-auto mt-4 p-4 rounded-2xl border border-ads-border bg-ads-surface text-left">
        <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <i data-lucide="trending-up" class="w-3.5 h-3.5"></i> 今日のまとめ
        </p>
        <p class="text-sm text-ads-text leading-relaxed">${escapeHtml(category.trendSummary)}</p>
      </div>` : ''}

      <!-- スコアインジケーター -->
      <div class="max-w-xs mx-auto mt-6 p-4 rounded-2xl border border-ads-border bg-ads-surface text-left">
        <p class="text-xs font-semibold text-ads-dim uppercase tracking-wide mb-2">重要度スコア（1-5）</p>
        <div class="space-y-1.5">
          ${scoreBar}
        </div>
      </div>
    </div>

    <!-- 記事カード -->
    <div class="space-y-6">
      ${articleCards}
    </div>

  </main>

  <footer class="max-w-3xl mx-auto px-5 pb-10 pt-6 border-t border-ads-border/30 flex items-center justify-between">
    <a href="./index.html" class="text-xs text-ads-dim hover:text-ads-accent flex items-center gap-1">
      <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> 一覧に戻る
    </a>
    <p class="text-xs text-ads-dim">${dateStr} · Generated by Claude Code</p>
  </footer>

  <script src="https://unpkg.com/lucide@latest"></script>
  <script>lucide.createIcons();</script>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`articles.json が見つかりません: ${INPUT_PATH}`);
    console.error('先に fetch-news.js と summarize.js を実行してください。');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let generated = 0;
  let skipped = 0;

  console.log('\n=== 図解ページ生成開始 ===');

  for (const [catKey, category] of Object.entries(data.categories)) {
    const theme = CATEGORY_THEME[catKey] || CATEGORY_THEME.crude_oil;
    const html = generateCategoryExplainer(catKey, category, theme, data.generatedAt);

    if (!html) {
      console.log(`  [skip] ${category.label}: AI要約なし（summarize.js を先に実行してください）`);
      skipped++;
      continue;
    }

    const filePath = path.join(OUTPUT_DIR, `explainer-${catKey}.html`);
    fs.writeFileSync(filePath, html, 'utf8');
    const articleCount = Math.min(TOP_N, category.articles.filter((a) => a.aiSummary).length);
    console.log(`  生成: ${path.basename(filePath)} (TOP${articleCount}件)`);
    generated++;
  }

  console.log(`\n=== 図解ページ生成完了 ===`);
  console.log(`生成: ${generated}件 / スキップ: ${skipped}件`);
  if (generated > 0) {
    console.log('\n公開URL（Surgeデプロイ後）:');
    Object.keys(data.categories).forEach((k) => {
      if (CATEGORY_THEME[k]) {
        console.log(`  https://morning-digest-plan.surge.sh/explainer-${k}.html`);
      }
    });
  }
}

main();
