#!/usr/bin/env node
/**
 * index.js
 *
 * 全処理を順番に実行するエントリポイント。
 *   1. fetch-news.js  - RSSからニュース取得
 *   2. generate-digest.js - HTML生成
 *   3. capture.js    - HTML→PNG変換
 *   4. send-email.js - メール送信
 *
 * Usage: node src/index.js [--date YYYY-MM-DD] [--skip-send]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

function run(command, label) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[${label}]`);
  console.log('='.repeat(50));
  execSync(command, { cwd: ROOT, stdio: 'inherit' });
}

async function main() {
  const args = process.argv.slice(2);
  const skipSend = args.includes('--skip-send');
  const dateIdx = args.indexOf('--date');
  const dateValue = dateIdx !== -1 ? args[dateIdx + 1] : null;
  const dateArg = dateValue ? `--date ${dateValue}` : '';

  try {
    // 1. ニュース取得
    run(`node src/fetch-news.js ${dateArg}`.trim(), 'STEP 1: ニュース取得');

    // 2. HTML生成
    run('node src/generate-digest.js', 'STEP 2: HTML生成');

    // 3. PNG化
    const captureList = path.join(ROOT, 'output/capture-list.txt');
    if (fs.existsSync(captureList)) {
      run(`node scripts/capture.js --batch ${captureList}`, 'STEP 3: PNG生成');
    } else {
      console.warn('[WARN] capture-list.txt が見つかりません。PNGをスキップ。');
    }

    // 4. メール送信
    if (skipSend) {
      console.log('\n[STEP 4: メール送信] --skip-send が指定されたためスキップ');
    } else {
      run('node src/send-email.js', 'STEP 4: メール送信');
    }

    console.log('\n\n全処理完了');
  } catch (err) {
    console.error('\n処理中にエラーが発生しました:', err.message);
    process.exit(1);
  }
}

main();
