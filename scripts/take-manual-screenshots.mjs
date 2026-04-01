#!/usr/bin/env node
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://peratore-dashboard.vercel.app';
const TEACHER_DIR = path.join(__dirname, '..', 'public', 'images', 'manual', 'teacher');
const STUDENT_DIR = path.join(__dirname, '..', 'public', 'images', 'manual', 'student');

const MOBILE = { width: 393, height: 852, deviceScaleFactor: 2 };
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 2 };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, filePath, opts = {}) {
  await page.screenshot({ path: filePath, fullPage: opts.fullPage || false, type: 'png' });
  console.log(`  ✅ ${path.basename(filePath)}`);
}

async function teacherScreenshots(browser) {
  console.log('\n📸 先生用スクリーンショット（残り）...\n');
  const page = await browser.newPage();
  await page.setViewport(DESKTOP);

  // ログイン
  await page.goto(`${BASE}/teacher/login`, { waitUntil: 'networkidle2' });
  await sleep(1000);
  const pwInput = await page.$('input[type="password"]');
  if (pwInput) {
    await pwInput.type('masateacher2026');
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await sleep(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    }
  }

  // 受講生リンク一覧
  await page.goto(`${BASE}/teacher/students`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  // 受講生詳細ページ（最初の受講生をクリック）
  const links = await page.$$eval('a', els =>
    els.filter(a => a.href.includes('/teacher/students/') && !a.href.endsWith('/students') && !a.href.endsWith('/students/'))
      .map(a => a.href)
  );
  if (links.length > 0) {
    await page.goto(links[0], { waitUntil: 'networkidle2' });
    await sleep(2000);
    await shot(page, path.join(TEACHER_DIR, '07-student-detail.png'), { fullPage: true });
  } else {
    // リンクがない場合、名前のテキストをクリック
    const nameEls = await page.$$eval('[class*="name"], [class*="student"]', els =>
      els.map(e => e.textContent).filter(t => t && t.length > 1)
    );
    console.log('  名前要素:', nameEls.slice(0, 3));
    // 直接URLで行く
    await page.goto(`${BASE}/teacher/students/${encodeURIComponent('秋山太郎')}`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    await shot(page, path.join(TEACHER_DIR, '07-student-detail.png'), { fullPage: true });
  }

  // 新規教材管理
  await page.goto(`${BASE}/teacher/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await shot(page, path.join(TEACHER_DIR, '08-dashboard.png'), { fullPage: true });

  // 受講生の専用ページ（practice-v2.html?student=秋山太郎）
  await page.goto(`${BASE}/practice-v2.html?student=${encodeURIComponent('秋山太郎')}`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await shot(page, path.join(TEACHER_DIR, '09-student-practice-page.png'), { fullPage: false });

  await page.close();
}

async function studentScreenshots(browser) {
  console.log('\n📸 受講生用スクリーンショット...\n');

  const page = await browser.newPage();
  await page.setViewport(MOBILE);

  // 1. ホーム画面
  await page.goto(`${BASE}/practice-v2.html`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await shot(page, path.join(STUDENT_DIR, '01-home.png'));

  // ページ内のHTML構造を確認
  const structure = await page.evaluate(() => {
    const els = document.querySelectorAll('[onclick], .clickable, [class*="cat"], [class*="section"], [class*="category"]');
    return Array.from(els).slice(0, 10).map(e => ({
      tag: e.tagName,
      cls: e.className,
      text: e.textContent?.slice(0, 50),
      onclick: e.getAttribute('onclick')?.slice(0, 50)
    }));
  });
  console.log('  UI構造:', JSON.stringify(structure, null, 2).slice(0, 500));

  // クリッカブルな要素を探す
  const clickables = await page.evaluate(() => {
    // 全ての要素でonclickがあるものを探す
    const all = document.querySelectorAll('*');
    const results = [];
    for (const el of all) {
      if (el.getAttribute('onclick') || el.style.cursor === 'pointer') {
        results.push({
          tag: el.tagName,
          cls: el.className?.slice?.(0, 60),
          text: el.textContent?.slice(0, 40)?.trim(),
          onclick: el.getAttribute('onclick')?.slice(0, 60)
        });
      }
      if (results.length >= 20) break;
    }
    return results;
  });
  console.log('  クリッカブル要素:', JSON.stringify(clickables, null, 2).slice(0, 1000));

  // カテゴリをクリックして展開
  const expanded = await page.evaluate(() => {
    // toggleSection的な関数を呼ぶ
    const headers = document.querySelectorAll('.section-header, .cat-header, [class*="header"]');
    if (headers.length > 0) {
      headers[0].click();
      return 'clicked header';
    }
    // onclickを持つ要素を探す
    const onclickEls = document.querySelectorAll('[onclick]');
    if (onclickEls.length > 0) {
      onclickEls[0].click();
      return `clicked onclick: ${onclickEls[0].getAttribute('onclick')?.slice(0, 40)}`;
    }
    return 'nothing found';
  });
  console.log('  展開:', expanded);
  await sleep(1000);
  await shot(page, path.join(STUDENT_DIR, '02-home-expanded.png'));

  // 設定アイコンを探す
  const settingsClicked = await page.evaluate(() => {
    const svgs = document.querySelectorAll('svg, [class*="setting"], [class*="gear"], [class*="cog"]');
    // 歯車アイコンを探す
    const btns = document.querySelectorAll('button, [role="button"], [class*="icon"]');
    for (const btn of btns) {
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label');
      if (ariaLabel?.includes('設定') || ariaLabel?.includes('setting')) {
        btn.click();
        return 'clicked settings via aria-label';
      }
    }
    // 右上エリアのボタン
    const topBtns = document.querySelectorAll('.top-bar button, .header button, nav button');
    for (const btn of topBtns) {
      btn.click();
      return `clicked top button: ${btn.className}`;
    }
    return 'settings not found';
  });
  console.log('  設定:', settingsClicked);
  await sleep(1000);

  // ヘッダー部分のボタンをすべて取得
  const headerBtns = await page.evaluate(() => {
    const allBtns = document.querySelectorAll('button, [onclick]');
    return Array.from(allBtns).map(b => ({
      cls: b.className?.slice?.(0, 40),
      text: b.textContent?.slice(0, 30),
      title: b.getAttribute('title'),
      id: b.id
    }));
  });
  console.log('  全ボタン:', JSON.stringify(headerBtns, null, 2).slice(0, 1000));

  // デスクトップ版
  await page.setViewport(DESKTOP);
  await page.goto(`${BASE}/practice-v2.html`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  await shot(page, path.join(STUDENT_DIR, '06-home-desktop.png'));

  await page.close();
}

async function main() {
  console.log('🚀 残りのスクリーンショット撮影開始');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ja-JP'],
    defaultViewport: null
  });

  try {
    await teacherScreenshots(browser);
    await studentScreenshots(browser);
    console.log('\n✅ 完了!');
  } catch (err) {
    console.error('❌ エラー:', err.message);
    console.error(err.stack);
  } finally {
    await browser.close();
  }
}

main();
