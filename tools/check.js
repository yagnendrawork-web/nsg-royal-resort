/**
 * NSG ROYAL RESORT — BUILD CHECK
 * Validates dist/ output for broken links, missing keys, bad slots, and H1 issues.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const slotsPath = path.join(rootDir, 'tools', 'slots.json');

const errors = [];
const slotsRegistry = JSON.parse(fs.readFileSync(slotsPath, 'utf8'));

function fileExistsInDist(filePath) {
  const abs = path.resolve(distDir, filePath);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
}

function checkHtml(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fileName = path.relative(distDir, filePath);

  // 1. {{ or [MISSING: remaining in HTML
  if (content.includes('{{')) {
    errors.push(`${fileName}: unreplaced {{ template tag found`);
  }
  if (content.includes('[MISSING:')) {
    errors.push(`${fileName}: [MISSING:] placeholder found in output`);
  }

  // 2. Internal href/src must resolve to a file in dist
  const attrRegex = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = attrRegex.exec(content)) !== null) {
    const url = m[1];
    if (url.startsWith('#') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('javascript:')) continue;
    if (url.startsWith('assets/') || url.startsWith('css/') || url.startsWith('js/')) {
      if (!fileExistsInDist(url)) {
        errors.push(`${fileName}: unresolved ${m[1].startsWith('href') ? 'href' : 'src'}="${url}"`);
      }
    }
  }

  // 3. data-slot names must be in slots.json
  const slotRegex = /data-slot="([^"]+)"/g;
  while ((m = slotRegex.exec(content)) !== null) {
    const slotName = m[1];
    if (!slotsRegistry[slotName]) {
      errors.push(`${fileName}: data-slot="${slotName}" not in tools/slots.json`);
    }
  }

  // 4. Exactly one <h1> per page
  const h1Matches = content.match(/<h1[^>]*>/gi);
  const h1Count = h1Matches ? h1Matches.length : 0;
  if (h1Count === 0) {
    errors.push(`${fileName}: no <h1> found`);
  } else if (h1Count > 1) {
    errors.push(`${fileName}: ${h1Count} <h1> elements found (expected exactly 1)`);
  }
}

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const htmlFiles = [];
function collectHtml(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}
collectHtml(distDir);

htmlFiles.forEach(checkHtml);

// Warn (do not fail) about gallery.videos URLs that are not YouTube videos; the build skips them
const { parseYouTubeId } = require('./youtube');
const siteJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'content', 'site.json'), 'utf8'));
((siteJson.gallery && siteJson.gallery.videos) || []).forEach((v, i) => {
  if (v && v.type === 'file') return;
  if (!parseYouTubeId(v && v.url)) console.warn(`WARN: gallery.videos[${i}] is not a YouTube video URL and is skipped: ${v && v.url}`);
});

// Warn (do not fail) about self-hosted videos over 20 MB
const videoDir = path.join(distDir, 'assets', 'videos');
if (fs.existsSync(videoDir)) {
  fs.readdirSync(videoDir).filter((f) => /\.(mp4|webm|mov)$/i.test(f)).forEach((f) => {
    const mb = fs.statSync(path.join(videoDir, f)).size / 1048576;
    if (mb > 20) console.warn(`WARN: assets/videos/${f} is ${mb.toFixed(1)} MB (over 20 MB); consider compressing it`);
  });
}

// --launch: block publishing while any [TBD: ...] placeholder is still visible in dist
if (process.argv.includes('--launch')) {
  htmlFiles.forEach((file) => {
    const count = (fs.readFileSync(file, 'utf8').match(/\[TBD/g) || []).length;
    if (count) errors.push(`${path.relative(distDir, file)}: ${count} [TBD] placeholder(s) left (launch blocked)`);
  });
}

if (errors.length > 0) {
  console.error('CHECK FAILED:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`CHECK PASSED: ${htmlFiles.length} HTML file(s) validated, ${errors.length} issue(s).`);
