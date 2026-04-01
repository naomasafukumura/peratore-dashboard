#!/usr/bin/env node
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://peratore-dashboard.vercel.app';
const T = path.join(__dirname, '..', 'public', 'images', 'manual', 'teacher');
const S = path.join(__dirname, '..', 'public', 'images', 'manual', 'student');

const MOBILE = { width: 393, height: 852, deviceScaleFactor: 2 };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, fp) {
  await page.screenshot({ path: fp, type: 'png' });
  console.log(`  ✅ ${path.basename(fp)}`);
}
async function shotFull(page, fp) {
  await page.screenshot({ path: fp, type: 'png', fullPage: true });
  console.log(`  ✅ ${path.basename(fp)} (full)`);
}

async function teacherFlow(browser) {
  console.log('\n📸 先生用：フォーム送信→AI解析→プレビュー→保存の全フロー\n');
  const page = await browser.newPage();
  await page.setViewport(DESKTOP);

  // ログイン
  await page.goto(`${BASE}/teacher/login`, { waitUntil: 'networkidle2' });
  await sleep(1000);
  const pw = await page.$('input[type="password"]');
  if (pw) {
    await pw.type('masateacher2026');
    const btn = await page.$('button[type="submit"]');
    if (btn) { await btn.click(); await sleep(3000); }
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  }

  // レッスン後フォーム
  await page.goto(`${BASE}/teacher/lesson-form`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // 受講生名入力
  const nameInput = await page.$('input[list], input[placeholder*="佐藤"]');
  if (nameInput) {
    await nameInput.click();
    await nameInput.type('秋山太郎');
    await sleep(500);
  }

  // レッスンメモ入力
  const textarea = await page.$('textarea');
  if (textarea) {
    await textarea.click();
    await textarea.type('Hey, what movie do you feel like watching today? I was thinking maybe we could go see something fun or exciting. Are you free this evening, or would you prefer going tomorrow instead? There is a theater near the station, so it is pretty convenient to meet there. We could grab something to eat before the movie starts, too. Let me know what time works best for you and what kind of movie you are in the mood for.');
    await sleep(500);
  }
  await shot(page, path.join(T, '10-form-filled-full.png'));

  // 「解析して確認」ボタンを押す
  const analyzeBtn = await page.evaluateHandle(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent.includes('解析')) return b;
    }
    return null;
  });
  if (analyzeBtn) {
    await analyzeBtn.click();
    console.log('  ⏳ AI解析中...');
    // 解析完了を待つ（プレビュー画面が出るまで）
    await sleep(15000); // AI解析には時間がかかる
    await shotFull(page, path.join(T, '11-preview-chunks.png'));

    // チャンクにチェックが入っている状態
    await sleep(1000);

    // 保存ボタンを探す（押さない！データを汚さないため）
    // 代わりに保存ボタンが見える状態でスクショ
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(500);
    await shot(page, path.join(T, '12-preview-save-button.png'));
  }

  // 受講生リンク一覧でリンクコピーの流れ
  await page.goto(`${BASE}/teacher/students`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // 上部のみスクショ（ヘッダー＋検索＋最初の数人）
  await shot(page, path.join(T, '13-students-top.png'));

  // 受講生詳細（秋山太郎）
  await page.goto(`${BASE}/teacher/students/${encodeURIComponent('秋山太郎')}`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await shot(page, path.join(T, '14-student-detail-top.png'));

  await page.close();
}

async function studentFlow(browser) {
  console.log('\n📸 受講生用：練習の全フロー\n');
  const page = await browser.newPage();
  await page.setViewport(MOBILE);

  // ホーム画面
  await page.goto(`${BASE}/practice-v2.html?student=${encodeURIComponent('秋山太郎')}`, { waitUntil: 'networkidle2' });
  await sleep(4000);
  await shot(page, path.join(S, '10-home-with-lesson.png'));

  // 「レッスンで追加（最近）」カテゴリを展開
  const expanded = await page.evaluate(() => {
    const cats = document.querySelectorAll('.cv-cat');
    for (const cat of cats) {
      const name = cat.querySelector('.cv-cat-nm');
      if (name && name.textContent.includes('レッスン')) {
        cat.click();
        return name.textContent;
      }
    }
    // 最初のカテゴリを開く
    if (cats[0]) { cats[0].click(); return cats[0].querySelector('.cv-cat-nm')?.textContent; }
    return 'none';
  });
  console.log('  展開:', expanded);
  await sleep(1000);
  await shot(page, path.join(S, '11-category-expanded.png'));

  // チャンクを1つ選択
  await page.evaluate(() => {
    const chunks = document.querySelectorAll('.cv-chunk');
    if (chunks[0]) chunks[0].click();
  });
  await sleep(500);
  await shot(page, path.join(S, '12-chunk-selected.png'));

  // STARTボタンを押す
  const startBtn = await page.$('#startBtn');
  if (startBtn) {
    // スクロールしてSTARTボタンを見せる
    await page.evaluate(() => {
      const btn = document.getElementById('startBtn');
      if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await sleep(500);
    await shot(page, path.join(S, '13-start-button.png'));

    await startBtn.click();
    await sleep(3000);
    await shot(page, path.join(S, '14-practice-screen.png'));

    // 練習画面の状態を調査
    const practiceInfo = await page.evaluate(() => {
      const visible = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetParent && el.textContent?.trim() && el.children.length === 0) {
          const rect = el.getBoundingClientRect();
          if (rect.top >= 0 && rect.top < 852 && rect.width > 50) {
            visible.push({ tag: el.tagName, text: el.textContent.slice(0, 60), cls: el.className?.slice?.(0, 30) });
          }
        }
      });
      return visible.slice(0, 20);
    });
    console.log('  練習画面の表示:', JSON.stringify(practiceInfo, null, 2).slice(0, 800));
  }

  // 設定画面（もう一度撮り直し）
  await page.goto(`${BASE}/practice-v2.html`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await page.click('#coverSettingsBtn');
  await sleep(1000);
  await shot(page, path.join(S, '15-settings-clean.png'));

  await page.close();
}

async function main() {
  console.log('🚀 マニュアル用フルスクリーンショット撮影');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    defaultViewport: null
  });
  try {
    await teacherFlow(browser);
    await studentFlow(browser);
    console.log('\n✅ 完了!');
  } catch (e) {
    console.error('❌', e.message, e.stack);
  } finally {
    await browser.close();
  }
}

main();
