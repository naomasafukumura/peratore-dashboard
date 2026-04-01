#!/usr/bin/env node
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://peratore-dashboard.vercel.app';
const DIR = path.join(__dirname, '..', 'public', 'images', 'manual', 'student');

const MOBILE = { width: 393, height: 852, deviceScaleFactor: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, name) {
  const fp = path.join(DIR, name);
  await page.screenshot({ path: fp, type: 'png' });
  console.log(`  ✅ ${name}`);
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP',
      '--use-fake-ui-for-media-stream',  // マイク許可を自動で
      '--use-fake-device-for-media-stream'],
    defaultViewport: null
  });

  const page = await browser.newPage();
  await page.setViewport(MOBILE);

  // ホーム画面
  await page.goto(`${BASE}/practice-v2.html`, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // 設定ボタンを押す
  await page.click('#coverSettingsBtn');
  await sleep(1000);
  await shot(page, '04-settings.png');

  // 設定を閉じる（戻るボタンまたはオーバーレイの外をクリック）
  const closeSettings = await page.evaluate(() => {
    // 設定オーバーレイを閉じる
    const close = document.querySelector('.settings-close, .overlay-close, .settings-back');
    if (close) { close.click(); return 'close btn'; }
    // ESCで閉じるかも
    return 'no close btn';
  });
  console.log('  設定閉じ:', closeSettings);
  // ESCキーを送る
  await page.keyboard.press('Escape');
  await sleep(500);

  // 一覧ボタンを押す
  await page.click('#coverListBtn');
  await sleep(1000);
  await shot(page, '05-list-view.png');

  // 閉じる
  await page.keyboard.press('Escape');
  await sleep(500);
  // もう一度ホームに戻る
  await page.goto(`${BASE}/practice-v2.html`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // カテゴリ展開＋チャンク選択
  // 最初のカテゴリをクリック
  await page.evaluate(() => {
    const cats = document.querySelectorAll('.cv-cat');
    if (cats[0]) cats[0].click();
  });
  await sleep(800);

  // チャンクを選択（最初の1つ）
  await page.evaluate(() => {
    const chunks = document.querySelectorAll('.cv-chunk');
    if (chunks[0]) chunks[0].click();
  });
  await sleep(500);
  await shot(page, '03-home-selected.png');

  // スタートボタンを押す
  await page.click('#startBtn');
  await sleep(3000);
  await shot(page, '07-practice-start.png');

  // 練習画面の構造を調べる
  const practiceStructure = await page.evaluate(() => {
    const all = document.querySelectorAll('button, [onclick], [class*="btn"]');
    return Array.from(all).filter(e => e.offsetParent !== null).map(e => ({
      id: e.id, cls: e.className?.slice(0, 40),
      text: e.textContent?.slice(0, 30)?.trim(),
      visible: e.offsetParent !== null
    }));
  });
  console.log('  練習画面ボタン:', JSON.stringify(practiceStructure, null, 2).slice(0, 1500));

  // マイクボタンを探してクリック（録音開始）
  const micClicked = await page.evaluate(() => {
    const mic = document.querySelector('#micBtn, .mic-btn, [class*="mic"], [class*="record"]');
    if (mic) { mic.click(); return `clicked: ${mic.id || mic.className}`; }
    // SVG内のマイクアイコンを探す
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.querySelector('svg path[d*="M12 2a3"]') || b.textContent.includes('🎤')) {
        b.click();
        return `clicked mic by svg: ${b.id || b.className}`;
      }
    }
    return 'mic not found';
  });
  console.log('  マイク:', micClicked);
  await sleep(2000);
  await shot(page, '08-practice-recording.png');

  // 録音停止を待つ（自動停止のはず）
  await sleep(6000);
  await shot(page, '09-practice-after-record.png');

  // 「できた」「再度録音」などのボタンを探す
  const afterRecordBtns = await page.evaluate(() => {
    const btns = document.querySelectorAll('button');
    return Array.from(btns).filter(b => b.offsetParent !== null).map(b => ({
      id: b.id, cls: b.className?.slice(0, 40),
      text: b.textContent?.slice(0, 30)?.trim()
    }));
  });
  console.log('  録音後ボタン:', JSON.stringify(afterRecordBtns, null, 2).slice(0, 800));

  await browser.close();
  console.log('\n✅ 完了');
}

main();
