#!/usr/bin/env node
/**
 * Capture the 1280×640 GitHub social preview image.
 *
 * Deliberately states no version numbers. A card that says "Ant Design 6.6"
 * is wrong within weeks and there is no way to notice — the image lives on
 * GitHub's CDN, not in the repo's build. The claims here ("no meta-framework",
 * "MIT", "EN & 中文") are true for as long as the project is.
 *
 * Usage:
 *   node scripts/social-preview.mjs
 *
 * Env:
 *   URL=…       demo to capture (default: the hosted demo)
 *   OUT=…       output path (default: docs/public/social-preview.png)
 *   SHOT=…      reuse an existing dashboard image instead of capturing
 *   SCALE=1|2   default 1 — GitHub's limit is 1 MB and it never renders above 1280
 *
 * Playwright is not a dependency here — point at one that exists:
 *   PLAYWRIGHT_PATH="…/tailwind-templates/node_modules/playwright" \
 *     node scripts/social-preview.mjs
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const { chromium } = await import(
  process.env.PLAYWRIGHT_PATH
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_PATH, 'index.mjs')).href
    : 'playwright'
);

const URL_ = process.env.URL || 'https://colony-demo.colorlib.com/';
// docs/public/, not docs/ — VitePress only copies public/ to the build, so
// this path also serves it at colony.colorlib.com/social-preview.png.
const OUT = resolve(ROOT, process.env.OUT || 'docs/public/social-preview.png');
const W = 1280, H = 640;
const SCALE = Number(process.env.SCALE || 1);

const browser = await chromium.launch();

// ---- 1. the dashboard itself -------------------------------------------
let shot, mime = 'image/png';
if (process.env.SHOT) {
  const p = resolve(process.env.SHOT);
  shot = readFileSync(p);
  mime = extname(p) === '.webp' ? 'image/webp' : 'image/png';
} else {
  const p = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  p.setDefaultTimeout(90000);
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 90000 });
  await p.waitForTimeout(4500);              // let the charts finish animating
  shot = await p.screenshot();
  await p.close();
}
const shotUri = `data:${mime};base64,${shot.toString('base64')}`;

// ---- 2. the composition -------------------------------------------------
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+SC:wght@500;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${W}px; height:${H}px; overflow:hidden; position:relative;
    background:#0A1020;
    font-family:'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .glow { position:absolute; left:-240px; top:-200px; width:860px; height:860px;
          background:radial-gradient(circle, rgba(22,119,255,.22) 0%, rgba(22,119,255,0) 62%); }
  .grid { position:absolute; inset:0; opacity:.35;
          background-image:linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px);
          background-size:48px 48px; }
  .copy { position:absolute; left:64px; top:0; width:520px; height:100%;
          display:flex; flex-direction:column; justify-content:center; z-index:3; }
  .brand { display:flex; align-items:center; gap:13px; margin-bottom:28px; }
  .mark { width:38px; height:38px; border-radius:9px; background:#1677ff;
          display:flex; align-items:center; justify-content:center;
          font-family:'Noto Sans SC', system-ui, sans-serif; font-weight:700;
          font-size:21px; color:#fff; }
  .brand span { font-size:33px; font-weight:600; color:#F8FAFC; letter-spacing:-.5px; }
  .brand small { font-family:'Noto Sans SC', system-ui, sans-serif; font-size:22px;
                 font-weight:500; color:#64748B; letter-spacing:1px; }
  h1 { font-size:50px; line-height:1.07; font-weight:700; color:#F8FAFC;
       letter-spacing:-1.6px; text-wrap:balance; }
  h1 em { font-style:normal; color:#4096FF; }
  p  { margin-top:20px; font-size:20px; line-height:1.5; color:#94A3B8; max-width:466px; }
  .chips { margin-top:34px; display:flex; gap:9px; }
  .chip { font-size:15px; font-weight:500; color:#CBD5E1; padding:7px 15px;
          border:1px solid rgba(148,163,184,.28); border-radius:999px;
          background:rgba(148,163,184,.07); white-space:nowrap; }
  .chip.free { color:#69B1FF; border-color:rgba(64,150,255,.45); background:rgba(64,150,255,.12); }
  .chip.zh  { font-family:'Inter','Noto Sans SC',system-ui,sans-serif; }

  .shot { position:absolute; left:626px; top:96px; width:790px; height:494px;
          border-radius:14px; overflow:hidden; z-index:2;
          border:1px solid rgba(148,163,184,.22);
          box-shadow:0 40px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.04) inset; }
  .shot img { width:132%; display:block; }
  .fade { position:absolute; right:0; top:0; width:290px; height:100%; z-index:4;
          background:linear-gradient(90deg,
            rgba(10,16,32,0) 0%, rgba(10,16,32,.35) 34%,
            rgba(10,16,32,.78) 66%, rgba(10,16,32,1) 100%); }
</style></head><body>
  <div class="grid"></div><div class="glow"></div>
  <div class="copy">
    <div class="brand"><div class="mark">蚁</div><span>Colony</span><small>蚁群</small></div>
    <h1>The <em>Ant Design</em> admin dashboard</h1>
    <p>Every Ant Design Pro route &mdash; without the meta‑framework.</p>
    <div class="chips">
      <div class="chip free">Free &amp; MIT</div>
      <div class="chip">No meta-framework</div>
      <div class="chip zh">EN &amp; 中文</div>
    </div>
  </div>
  <div class="shot"><img src="${shotUri}"></div>
  <div class="fade"></div>
</body></html>`;

const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();

const kb = (readFileSync(OUT).length / 1024).toFixed(0);
console.log(`social-preview: ${OUT} (${W * SCALE}×${H * SCALE}, ${kb} KB)`);
if (kb > 1000) console.warn("WARNING: over GitHub's 1 MB limit — lower SCALE.");
