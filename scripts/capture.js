#!/usr/bin/env node
/**
 * Screenshot Capture Script
 *
 * HTMLファイルをPNG画像に変換します。
 * - Retina対応 (2x)
 * - コンテンツサイズに自動フィット（余白なし）
 * - GitHub Actions対応（Headless）
 *
 * Usage: node scripts/capture.js <input.html> <output.png>
 *        node scripts/capture.js --batch <capture-list.txt>
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const CONFIG = {
  scale: parseInt(process.env.SCREENSHOT_SCALE || '2', 10),
  width: parseInt(process.env.SCREENSHOT_WIDTH || '420', 10),
  wait: parseInt(process.env.SCREENSHOT_WAIT || '500', 10),
};

async function capture(inputPath, outputPath, browser) {
  const fileUrl = inputPath.startsWith('file://')
    ? inputPath
    : `file://${path.resolve(inputPath).replace(/\\/g, '/')}`;

  console.log(`Capturing: ${inputPath}`);
  console.log(`Output:    ${outputPath}`);

  const context = await browser.newContext({
    deviceScaleFactor: CONFIG.scale,
    viewport: { width: CONFIG.width, height: 800 },
  });

  const page = await context.newPage();
  try {
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(CONFIG.wait);

    const contentHeight = await page.evaluate(() => {
      const container = document.body.firstElementChild;
      if (container) {
        const rect = container.getBoundingClientRect();
        const style = window.getComputedStyle(document.body);
        const pt = parseFloat(style.paddingTop) || 0;
        const pb = parseFloat(style.paddingBottom) || 0;
        return Math.ceil(rect.height + pt + pb);
      }
      return document.body.scrollHeight;
    });

    console.log(`  Content height: ${contentHeight}px`);

    await page.setViewportSize({ width: CONFIG.width, height: contentHeight });
    await page.waitForTimeout(100);

    await page.screenshot({ path: outputPath, type: 'png' });
    console.log(`  Saved: ${outputPath}`);
  } finally {
    await context.close();
  }
}

async function captureBatch(listPath) {
  if (!fs.existsSync(listPath)) {
    console.error(`キャプチャリストが見つかりません: ${listPath}`);
    process.exit(1);
  }

  const lines = fs.readFileSync(listPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const line of lines) {
      const [inputPath, outputPath] = line.split(':');
      if (!inputPath || !outputPath) {
        console.warn(`スキップ（形式不正）: ${line}`);
        continue;
      }
      await capture(inputPath, outputPath, browser);
    }
  } finally {
    await browser.close();
  }
  console.log('\n全キャプチャ完了');
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--batch') {
    const listPath = args[1] || path.join(__dirname, '../output/capture-list.txt');
    await captureBatch(listPath);
    return;
  }

  if (args.length < 2) {
    console.error('Usage:');
    console.error('  node scripts/capture.js <input.html> <output.png>');
    console.error('  node scripts/capture.js --batch [capture-list.txt]');
    console.error('');
    console.error('Environment variables:');
    console.error('  SCREENSHOT_SCALE  - Device pixel ratio (default: 2)');
    console.error('  SCREENSHOT_WIDTH  - Viewport width in px (default: 420)');
    console.error('  SCREENSHOT_WAIT   - Wait time in ms (default: 500)');
    process.exit(1);
  }

  const [inputPath, outputPath] = args;
  const browser = await chromium.launch({ headless: true });
  try {
    await capture(inputPath, outputPath, browser);
  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes("Executable doesn't exist")) {
      console.error('Chromium がインストールされていません。次を実行してください:');
      console.error('  npx playwright install chromium');
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
