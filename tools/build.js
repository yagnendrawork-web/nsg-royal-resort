const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { parseYouTubeId } = require('./youtube');

const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const contentDir = path.join(rootDir, 'content');
const configPath = path.join(contentDir, 'config.json');
const sitePath = path.join(contentDir, 'site.json');
const slotsPath = path.join(rootDir, 'tools', 'slots.json');

function getDotValue(obj, dotPath) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = dotPath.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // ignore hidden files like .DS_Store
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getRatioDimensions(ratioStr) {
  if (!ratioStr) return { width: 800, height: 600 };
  const parts = ratioStr.split('/').map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
    const w = parts[0];
    const h = parts[1];
    if (w >= h) {
      return { width: Math.round(1200), height: Math.round((1200 * h) / w) };
    } else {
      return { width: Math.round((900 * w) / h), height: Math.round(900) };
    }
  }
  return { width: 800, height: 600 };
}

function renderSlot(slotName, slotsRegistry, imgAssetsDir) {
  const slot = slotsRegistry[slotName] || { ratio: '16/9', alt: slotName };
  const ratio = slot.ratio || '16/9';
  const focal = slot.focal || '50% 50%';
  const alt = slot.alt || slotName;
  const sizes = slot.sizes || '100vw';
  const isPriority = !!slot.priority;
  const dims = getRatioDimensions(ratio);
  // "use": reuse another slot's image files (e.g. a Home card showing a gallery photo with its own crop and alt)
  const file = slot.use || slotName;

  // Check if image files exist
  const candidate480 = path.join(imgAssetsDir, `${file}-480.webp`);
  const candidate1200 = path.join(imgAssetsDir, `${file}.jpg`);
  const candidateWebp = path.join(imgAssetsDir, `${file}-960.webp`);

  const hasFiles = fs.existsSync(candidate480) || fs.existsSync(candidateWebp) || fs.existsSync(candidate1200);

  if (hasFiles) {
    let srcset = '';
    const src = fs.existsSync(candidateWebp) ? `assets/img/${file}-960.webp` : `assets/img/${file}-480.webp`;
    const widths = [480, 960, 1600];
    const existingWidths = widths.filter((w) => fs.existsSync(path.join(imgAssetsDir, `${file}-${w}.webp`)));

    if (existingWidths.length > 0) {
      srcset = existingWidths.map((w) => `assets/img/${file}-${w}.webp ${w}w`).join(', ');
    }

    const priorityAttrs = isPriority ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    const srcsetAttr = srcset ? ` srcset="${srcset}"` : '';
    const sizesAttr = ` sizes="${sizes}"`;

    return `<img class="slot-img" src="${src}"${srcsetAttr}${sizesAttr} width="${dims.width}" height="${dims.height}" alt="${alt}" ${priorityAttrs} decoding="async" style="aspect-ratio:${ratio};object-position:${focal};">`;
  }

  // In --prod builds, omit frames without image files
  if (isProd) {
    omittedGalleryCount++;
    return '';
  }

  // Placeholder
  const label = `${slotName} · ${ratio}`;
  return `<div class="slot-ph" data-slot="${slotName}" data-label="${label}" style="aspect-ratio:${ratio};">
  <div class="slot-ph-content">
    <span class="slot-ph-label">${label}</span>
  </div>
</div>`;
}

function renderPreload(slotName, slotsRegistry, imgAssetsDir) {
  const slot = slotsRegistry[slotName];
  if (!slot || !slot.priority) return '';
  const file = slot.use || slotName; // same files renderSlot uses
  const candidate480 = path.join(imgAssetsDir, `${file}-480.webp`);
  const candidate960 = path.join(imgAssetsDir, `${file}-960.webp`);

  if (!fs.existsSync(candidate480) && !fs.existsSync(candidate960)) {
    return '';
  }

  const widths = [480, 960, 1600];
  const existingWidths = widths.filter((w) => fs.existsSync(path.join(imgAssetsDir, `${file}-${w}.webp`)));
  const imagesrcset = existingWidths.map((w) => `assets/img/${file}-${w}.webp ${w}w`).join(', ');
  // href matches the <img src> fallback (960 when present), for browsers without imagesrcset
  const href = `assets/img/${file}-${existingWidths.includes(960) ? 960 : existingWidths[0]}.webp`;
  const sizes = slot.sizes || '100vw';

  return `<link rel="preload" as="image" href="${href}" imagesrcset="${imagesrcset}" imagesizes="${sizes}">`;
}

function generateJsonLd(siteData, configData) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: siteData.site?.name || 'NSG Royal Resort',
    description: siteData.seo?.home?.description || siteData.site?.strapline || undefined,
    slogan: siteData.site?.tagline || undefined
  };

  const address = siteData.site?.address;
  if (address && !address.startsWith('[TBD')) {
    jsonLd.address = {
      '@type': 'PostalAddress',
      streetAddress: 'Nidigattu',
      addressLocality: 'Bheemunipatnam',
      addressRegion: 'Bheemili',
      addressCountry: 'IN'
    };
  }

  const checkIn = siteData.site?.checkInTime;
  if (checkIn && !checkIn.startsWith('[TBD')) {
    jsonLd.checkinTime = checkIn;
  }

  const checkOut = siteData.site?.checkOutTime;
  if (checkOut && !checkOut.startsWith('[TBD')) {
    jsonLd.checkoutTime = checkOut;
  }

  const phone = configData.PHONE;
  if (phone && !phone.startsWith('[TBD')) {
    jsonLd.telephone = phone;
  }

  const siteUrl = configData.SITE_URL;
  if (siteUrl && !siteUrl.startsWith('[TBD')) {
    jsonLd.url = siteUrl;
  }

  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

function processTemplate(content, siteData, configData, slotsRegistry, imgAssetsDir, currentFile) {
  // 0. Resolve {{include:name}} first, so partials can hold <!--each--> blocks (up to 3 levels deep)
  for (let depth = 0; depth < 3 && /\{\{include:/.test(content); depth++) {
    content = content.replace(/\{\{include:([a-zA-Z0-9_-]+)\}\}/g, (match, name) => {
      const partialPath = path.join(srcDir, 'partials', `${name}.html`);
      if (fs.existsSync(partialPath)) {
        return fs.readFileSync(partialPath, 'utf8');
      }
      console.warn(`[MISSING PARTIAL: ${name}] referenced in ${currentFile}`);
      return `<!-- missing partial: ${name} -->`;
    });
  }

  // 1. Repeated blocks: <!--each:PATH-->...<!--/each-->
  // PATH is a dot path to an array in siteData, or "@slots:PREFIX" for slots.json entries
  content = content.replace(/<!--each:([-a-zA-Z0-9_.:@]+)-->([\s\S]*?)<!--\/each-->/g, (match, path, inner) => {
    let items = [];

    if (path.startsWith('@slots:')) {
      const prefix = path.slice(7);
      Object.entries(slotsRegistry).forEach(([name, slot]) => {
        if (name.startsWith(prefix)) {
          items.push({ name, ...slot });
        }
      });
    } else {
      const val = getDotValue(siteData, path);
      if (Array.isArray(val)) items = val;
    }

    if (items.length === 0) return '';

    return items.map((item) => {
      let result = inner;
      // <!--sub:FIELD-->...<!--/sub--> repeats over item[FIELD]; {{:field}} -> sub-item field
      result = result.replace(/<!--sub:([a-zA-Z0-9_-]+)-->([\s\S]*?)<!--\/sub-->/g, (m2, field, subInner) => {
        const subs = Array.isArray(item[field]) ? item[field] : [];
        return subs.map((sub) => subInner.replace(/\{\{:([a-zA-Z0-9_-]+)\}\}/g, (m3, f) => {
          const v = sub[f];
          return v !== undefined && v !== null ? String(v) : '';
        })).join('');
      });
      // {{.field}} -> item.field
      result = result.replace(/\{\{\.([a-zA-Z0-9_-]+)\}\}/g, (m2, field) => {
        const v = item[field];
        return v !== undefined && v !== null ? String(v) : '';
      });
      // {{slot:.field}} -> render slot named by item[field]
      result = result.replace(/\{\{slot:\.([a-zA-Z0-9_-]+)\}\}/g, (m2, field) => {
        const slotName = item[field];
        return slotName ? renderSlot(slotName, slotsRegistry, imgAssetsDir) : '';
      });
      return result;
    }).join('');
  });

  // 2. Feature blocks: <!--feature:NAME-->...<!--/feature-->
  content = content.replace(/<!--feature:([a-zA-Z0-9_-]+)-->([\s\S]*?)<!--\/feature-->/g, (match, featureName, inner) => {
    const isEnabled = configData.FEATURES && !!configData.FEATURES[featureName];
    return isEnabled ? inner : '';
  });

  // 2a. <!--dev-->...<!--/dev-->: dev-only markup (e.g. the styleguide link), dropped in --prod builds
  content = content.replace(/<!--dev-->([\s\S]*?)<!--\/dev-->/g, (match, inner) => (isProd ? '' : inner));

  // 2b. <!--ifslot:NAME-->...<!--/ifslot-->: dropped in --prod builds while slot NAME has no photo
  content = content.replace(/<!--ifslot:([a-zA-Z0-9_-]+)-->([\s\S]*?)<!--\/ifslot-->/g, (match, slotName, inner) => {
    const file = (slotsRegistry[slotName] || {}).use || slotName;
    const has = ['-480.webp', '-960.webp', '.jpg'].some((ext) => fs.existsSync(path.join(imgAssetsDir, file + ext)));
    return isProd && !has ? '' : inner;
  });

  // 3. Resolve {{preload:slotName}}
  content = content.replace(/\{\{preload:([a-zA-Z0-9_-]+)\}\}/g, (match, slotName) => {
    return renderPreload(slotName, slotsRegistry, imgAssetsDir);
  });

  // 4. Resolve {{slot:slotName}}
  content = content.replace(/\{\{slot:([a-zA-Z0-9_-]+)\}\}/g, (match, slotName) => {
    return renderSlot(slotName, slotsRegistry, imgAssetsDir);
  });

  // 5. Inject JSON-LD if {{jsonld:home}} placeholder exists or inject into <head> on index.html
  if (currentFile === 'index.html') {
    const jsonLdHtml = generateJsonLd(siteData, configData);
    if (content.includes('{{jsonld:home}}')) {
      content = content.replace('{{jsonld:home}}', jsonLdHtml);
    } else if (content.includes('</head>')) {
      content = content.replace('</head>', `  ${jsonLdHtml}\n</head>`);
    }
  }

  // 6. Dot path replacement: {{key.path}}
  const templateContext = { ...siteData, config: configData };
  content = content.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (match, key) => {
    if (key.startsWith('slot:') || key.startsWith('include:') || key.startsWith('preload:') || key.startsWith('jsonld:')) {
      return match;
    }
    const val = getDotValue(templateContext, key);
    if (val !== undefined && val !== null) {
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    }
    console.warn(`[MISSING: ${key}] referenced in ${currentFile}`);
    return `[MISSING: ${key}]`;
  });

  return content;
}

/**
 * In-memory data the templates need but site.json should not store (never written back):
 * - gallery.videoItems / gallery.homeVideos: valid YouTube videos with ytId and thumbnail markup
 * - dining.menuSections / menuSoonBlock / photoSlots: real dishes and food photos only
 */
function deriveSiteData(siteData, slotsRegistry, imgAssetsDir) {
  const gallery = siteData.gallery || (siteData.gallery = {});
  const videos = Array.isArray(gallery.videos) ? gallery.videos : [];
  // Self-hosted videos (type "file"): featured autoplay tiles; orientation from the poster's size
  gallery.fileVideos = videos.filter((v) => v && v.type === 'file').filter((v) => {
    const ok = v.file && fs.existsSync(path.join(srcDir, v.file));
    if (!ok) console.warn(`[VIDEO] skipped, file not found: ${v.file}`);
    return ok;
  }).map((v) => {
    const dim = (v.poster && jpegSize(path.join(srcDir, v.poster))) || { width: 16, height: 9 };
    const portrait = dim.height > dim.width;
    return { ...v, cat: v.cat || 'events', poster: v.poster || '', width: dim.width, height: dim.height, orient: portrait ? 'portrait' : 'landscape' };
  });
  gallery.videoItems = videos.filter((v) => v && v.type !== 'file').map((v) => ({ ...v, ytId: parseYouTubeId(v && v.url) }))
    .filter((v) => {
      if (!v.ytId && !isProd) console.warn(`[VIDEO] skipped, not a YouTube video URL: ${v.url}`);
      return !!v.ytId;
    })
    .map((v) => ({
      ...v,
      cat: v.cat || 'events',
      description: v.description || '',
      thumbHtml: v.poster
        ? renderSlot(v.poster, slotsRegistry, imgAssetsDir)
        : `<img class="video-thumb" src="https://i.ytimg.com/vi/${v.ytId}/hqdefault.jpg" alt="" width="480" height="360" loading="lazy" decoding="async" onerror="this.parentNode.classList.add('is-noimg');this.remove()">`
    }));
  gallery.homeVideos = gallery.videoItems.slice(0, 3);
  gallery.videoScript = gallery.videoItems.length || gallery.fileVideos.length ? [{}] : []; // Home loads gallery.js only when it has videos

  // Dining: show only real dishes ([TBD] seed items stay in site.json and CONTENT.md); note when none yet
  const dining = siteData.dining;
  if (dining && dining.menu && Array.isArray(dining.menu.sections)) {
    dining.menuSections = dining.menu.sections
      .map((s) => ({ ...s, items: (s.items || []).filter((it) => it && it.name && !String(it.name).startsWith('[TBD')) }))
      .filter((s) => s.items.length > 0);
    dining.menuSoonBlock = dining.menuSections.length ? [] : [{}];
    // Food photo frames only for photos that exist
    dining.photoSlots = Object.keys(slotsRegistry)
      .filter((n) => n.startsWith('food-') && fs.existsSync(path.join(imgAssetsDir, `${n}-480.webp`)))
      .map((name) => ({ name }));
  }
}

/** Width and height of a JPEG from its SOF marker (sync, no dependencies); null if unreadable */
function jpegSize(file) {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** Strips comment-only lines and indentation from dist/js/*.js (not vendor); falls back to the original if it no longer parses */
function trimDistJs(jsDir) {
  if (!fs.existsSync(jsDir)) return;
  fs.readdirSync(jsDir).forEach((name) => {
    if (!name.endsWith('.js')) return;
    const file = path.join(jsDir, name);
    const original = fs.readFileSync(file, 'utf8');
    const out = [];
    let inBlock = false;
    original.split('\n').forEach((line) => {
      const s = line.trim();
      if (inBlock) {
        if (s.includes('*/')) inBlock = false;
        return;
      }
      if (s.startsWith('/*')) {
        if (!s.includes('*/')) inBlock = true;
        return;
      }
      if (!s || s.startsWith('//')) return;
      out.push(s);
    });
    const trimmed = out.join('\n') + '\n';
    try {
      new vm.Script(trimmed, { filename: name });
      fs.writeFileSync(file, trimmed, 'utf8');
    } catch (e) {
      console.warn(`[TRIM] kept ${name} untrimmed: ${e.message}`);
    }
  });
}

/**
 * --prod CSS minify, no dependencies: drops comments, collapses whitespace, removes it only next to { } ; ,
 * and drops the ; before }. Strings and url(...) are copied untouched; all other spacing (combinators,
 * calc(), media queries) is kept as one space, so meaning never changes.
 */
function minifyCss(css) {
  const SEP = '{};,';
  let out = '';
  let space = false;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      space = true;
      continue;
    }
    if (/\s/.test(c)) { space = true; i++; continue; }
    if (space && out && !SEP.includes(out[out.length - 1]) && !SEP.includes(c)) out += ' ';
    space = false;
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/^url\(/i.test(css.slice(i, i + 4))) {
      const end = css.indexOf(')', i);
      out += css.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    if (c === '}' && out.endsWith(';')) out = out.slice(0, -1);
    out += c;
    i++;
  }
  return out + '\n';
}

/**
 * --prod: removes the mock layer from shipped JS. Blocks between lines holding exactly
 * MOCK:START and MOCK:END comments (api.js, api.link.js) stay in src for local testing.
 * Fails the build if markers are unbalanced or the result no longer parses.
 */
function stripMockBlocks(jsDir) {
  fs.readdirSync(jsDir).filter((name) => name.endsWith('.js')).forEach((name) => {
    const file = path.join(jsDir, name);
    const code = fs.readFileSync(file, 'utf8');
    if (!code.includes('MOCK:START')) return;
    const out = code.replace(/^[ \t]*\/\* MOCK:START \*\/[ \t]*\n[\s\S]*?^[ \t]*\/\* MOCK:END \*\/[ \t]*\n/gm, '');
    try {
      if (/MOCK:(START|END)/.test(out)) throw new Error('unbalanced MOCK:START / MOCK:END markers');
      new vm.Script(out, { filename: name });
    } catch (e) {
      console.error(`[MOCK] could not strip mock code from js/${name}: ${e.message}`);
      process.exit(1);
    }
    fs.writeFileSync(file, out, 'utf8');
    console.log(`[MOCK] stripped mock code from js/${name}: ${code.length} -> ${out.length} bytes`);
  });
}

/**
 * --prod: deletes dist images that nothing can load. An image is kept if its file name appears in any
 * dist HTML/CSS/JS/JSON/webmanifest file, or its slot is in manifest.js (the Sheet can name any manifest
 * slot at runtime: add-on photos, pkg-<id>, services photoSlot).
 */
function pruneUnusedImages() {
  const imgDir = path.join(distDir, 'assets', 'img');
  if (!fs.existsSync(imgDir)) return;
  const texts = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|css|js|json|webmanifest)$/.test(e.name)) texts.push(fs.readFileSync(p, 'utf8'));
  });
  walk(distDir);
  const all = texts.join('\n');
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(fs.readFileSync(path.join(imgDir, 'manifest.js'), 'utf8'), sandbox);
  } catch (e) {
    console.warn('[IMG] manifest.js unreadable; no images pruned');
    return;
  }
  const slots = new Set(Object.keys((sandbox.window.NSG && sandbox.window.NSG.IMG) || {}));
  const removed = [];
  fs.readdirSync(imgDir).forEach((f) => {
    if (f === 'manifest.js' || all.includes(f)) return;
    const m = f.match(/^(.+)-(\d+)\.webp$/);
    if (m && slots.has(m[1])) return;
    removed.push(f);
    fs.unlinkSync(path.join(imgDir, f));
  });
  if (removed.length) console.log(`[IMG] --prod excluded ${removed.length} unreferenced image(s): ${removed.join(', ')}`);
}

/**
 * Cloudflare Pages _redirects from src/_redirects. Cloudflare follows a redirect even when a file exists, and
 * serves page.html at /page (redirecting /page.html there), so a rule whose source is an emitted page would hide
 * that page or loop; such rules are left out and listed. Fragments and comments pass through unchanged.
 */
function writeRedirects(emittedPages) {
  const file = path.join(srcDir, '_redirects');
  if (!fs.existsSync(file)) return;
  const skipped = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => {
    const from = line.trim().split(/\s+/)[0];
    if (!from || from.startsWith('#')) return true;
    const page = from.replace(/^\//, '').replace(/\.html$/, '') + '.html';
    if (emittedPages.includes(page)) { skipped.push(from); return false; }
    return true;
  });
  fs.writeFileSync(path.join(distDir, '_redirects'), lines.join('\n'), 'utf8');
  if (skipped.length) console.log(`[REDIRECTS] left out (live page at that URL): ${skipped.join(', ')}`);
}

/**
 * --prod: appends ?v=<content hash> to css/*.css, js/*.js and assets/img/manifest.js references in HTML
 * (href, src, data-lazy-script), so the 7-day cache in _headers never serves old CSS/JS after a deploy.
 */
function versionAssetRefs() {
  const crypto = require('crypto');
  const hashes = {};
  const hashOf = (rel) => {
    if (!(rel in hashes)) {
      const f = path.join(distDir, rel);
      hashes[rel] = fs.existsSync(f) ? crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex').slice(0, 8) : '';
    }
    return hashes[rel];
  };
  fs.readdirSync(distDir).filter((f) => f.endsWith('.html')).forEach((page) => {
    const file = path.join(distDir, page);
    const html = fs.readFileSync(file, 'utf8').replace(
      /\b(href|src|data-lazy-script)="((?:css|js)\/[\w.-]+\.(?:css|js)|assets\/img\/manifest\.js)"/g,
      (m, attr, rel) => (hashOf(rel) ? `${attr}="${rel}?v=${hashOf(rel)}"` : m)
    );
    fs.writeFileSync(file, html, 'utf8');
  });
}

/** Empty, or an obvious placeholder ([TBD: ...], [MISSING: ...], YOUR_..., example.com) */
function isPlaceholder(v) {
  const s = String(v == null ? '' : v).trim();
  return !s || /\[(TBD|MISSING)|\bTBD\b|YOUR[_-]|PLACEHOLDER|example\.com/i.test(s);
}

/**
 * --launch: refuses to publish while placeholders or test settings remain. Prints every problem, then exits 1.
 * The live reviews check needs the network; if the API cannot be reached it is a warning, not a failure.
 */
async function launchChecks() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const site = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  const problems = [];
  const notes = [];

  // 1. [TBD: ...] / [MISSING: ...] in anything a visitor receives (scripts are skipped: their code tests for "[TBD")
  const found = {};
  const scan = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    const rel = path.relative(distDir, p);
    if (e.isDirectory()) return scan(p);
    if (!/\.(html|xml|txt|json|webmanifest)$/.test(e.name) && !['js/config.js', 'js/content.ui.js'].includes(rel)) return;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/\[(?:TBD|MISSING)[^\]\n]{0,120}\]?/g)) {
      (found[m[0]] = found[m[0]] || new Set()).add(rel);
    }
  });
  scan(distDir);
  Object.entries(found).forEach(([text, files]) => {
    const list = [...files];
    problems.push(`placeholder ${text} in ${list.slice(0, 4).join(', ')}${list.length > 4 ? ` (+${list.length - 4} more)` : ''}`);
  });

  // 2. config.json
  if (config.USE_MOCK === true) problems.push('content/config.json: USE_MOCK is true (the site would show mock data)');
  if (isPlaceholder(config.API_URL) || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.API_URL)) {
    problems.push(`content/config.json: API_URL is empty or not an Apps Script /exec URL ("${config.API_URL || ''}")`);
  }
  ['PHONE', 'WHATSAPP', 'SITE_URL'].forEach((k) => {
    if (isPlaceholder(config[k])) problems.push(`content/config.json: ${k} is empty or a placeholder ("${config[k] || ''}")`);
  });
  if (!isPlaceholder(config.SITE_URL) && !/^https:\/\//.test(config.SITE_URL)) problems.push(`content/config.json: SITE_URL must start with https:// ("${config.SITE_URL}")`);

  // 3. Sample reviews: in site.json, and in the live reviews feed
  const walk = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => {
      if (k === 'name' && /^sample/i.test(String(x).trim())) problems.push(`content/site.json ${where}.name is a sample review ("${x}")`);
      walk(x, where ? `${where}.${k}` : k);
    });
  };
  walk(site, '');
  if (!isPlaceholder(config.API_URL)) {
    try {
      const res = await fetch(`${config.API_URL}?action=reviews`, { signal: AbortSignal.timeout(25000) });
      const json = await res.json();
      const rows = (json.data && json.data.reviews) || json.reviews || [];
      rows.filter((r) => /^sample/i.test(String(r.name || '').trim())).forEach((r) => problems.push(`Reviews sheet: approved review "${r.name}" looks like a sample row`));
      notes.push(`live reviews feed checked: ${rows.length} approved review(s)`);
    } catch (e) {
      notes.push(`WARNING: live reviews feed not checked (${e.message}); check the Reviews tab for "Sample" names by hand`);
    }
  }

  // 4. payPageUrl lives in the Apps Script Config tab, which the website cannot read
  if (fs.existsSync(path.join(distDir, 'pay.html'))) {
    notes.push('pay.html is live: in the Sheet Config tab, payPageUrl must be SITE_URL + "/pay.html" with no [TBD] (run NSG > Launch check in the Sheet)');
  }

  console.log('\n--- Launch check ---');
  notes.forEach((n) => console.log(`  note: ${n}`));
  if (problems.length) {
    console.error(`LAUNCH BLOCKED: ${problems.length} problem(s) to fix first:`);
    problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
    process.exit(1);
  }
  console.log('LAUNCH CHECK PASSED');
}

function build() {
  console.log('--- Starting Build ---');
  const startTime = Date.now();

  // Load config & site data
  if (!fs.existsSync(configPath) || !fs.existsSync(sitePath)) {
    console.error('Error: config.json or site.json missing');
    process.exit(1);
  }

  const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const siteData = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  const slotsRegistry = fs.existsSync(slotsPath) ? JSON.parse(fs.readFileSync(slotsPath, 'utf8')) : {};

  // Ensure vendor/qrcode.js is copied from node_modules if present
  const qrcodeSrc = path.join(rootDir, 'node_modules', 'qrcode-generator', 'dist', 'qrcode.js');
  const vendorDir = path.join(srcDir, 'js', 'vendor');
  const qrcodeDest = path.join(vendorDir, 'qrcode.js');
  // Only when it differs: rewriting a file inside src/ would retrigger --watch in a loop
  if (fs.existsSync(qrcodeSrc) && (!fs.existsSync(qrcodeDest) || !fs.readFileSync(qrcodeSrc).equals(fs.readFileSync(qrcodeDest)))) {
    if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir, { recursive: true });
    fs.copyFileSync(qrcodeSrc, qrcodeDest);
  }

  // Start from an empty dist so files removed from src (old scripts, pages, images) never ship
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  // Copy assets, css, js from src to dist
  const subdirs = ['css', 'js', 'assets'];
  for (const dir of subdirs) {
    const srcSub = path.join(srcDir, dir);
    const distSub = path.join(distDir, dir);
    if (fs.existsSync(srcSub)) {
      copyDirRecursive(srcSub, distSub);
    }
  }

  // Emit dist/js/config.js
  const jsDir = path.join(distDir, 'js');
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });

  const configJsContent = `// Auto-generated by tools/build.js
window.NSG = window.NSG || {};
window.NSG.CONFIG = ${JSON.stringify(configData, null, 2)};
`;
  fs.writeFileSync(path.join(jsDir, 'config.js'), configJsContent, 'utf8');

  // Emit dist/js/content.ui.js
  const uiJsContent = `// Auto-generated by tools/build.js
window.NSG = window.NSG || {};
window.NSG.UI = ${JSON.stringify(siteData.ui || {}, null, 2)};
`;
  fs.writeFileSync(path.join(jsDir, 'content.ui.js'), uiJsContent, 'utf8');

  // --prod: no mock data or mock branches in shipped JS (before trimming, which drops the marker comments)
  if (isProd) stripMockBlocks(path.join(distDir, 'js'));

  // --prod: minified CSS (JS stays as trimDistJs leaves it: a safe JS minifier would need a dependency)
  if (isProd && !args.includes('--no-minify')) {
    const cssDir = path.join(distDir, 'css');
    let before = 0;
    let after = 0;
    fs.readdirSync(cssDir).filter((n) => n.endsWith('.css')).forEach((n) => {
      const file = path.join(cssDir, n);
      const css = fs.readFileSync(file, 'utf8');
      const min = minifyCss(css);
      before += css.length;
      after += min.length;
      fs.writeFileSync(file, min, 'utf8');
    });
    console.log(`[CSS] minified: ${before} -> ${after} bytes`);
  }

  // Trim comments and indentation from emitted JS (Home JS budget); keep the original if the result does not parse
  trimDistJs(path.join(distDir, 'js'));

  // Cloudflare Pages headers (_redirects is written after the pages, below)
  const headersSrc = path.join(srcDir, '_headers');
  if (fs.existsSync(headersSrc)) fs.copyFileSync(headersSrc, path.join(distDir, '_headers'));

  // Process HTML templates in src/
  const imgAssetsDir = path.join(srcDir, 'assets', 'img');
  deriveSiteData(siteData, slotsRegistry, imgAssetsDir);
  const files = fs.readdirSync(srcDir);
  const emittedPages = [];

  for (const file of files) {
    if (!file.endsWith('.html')) continue;

    // Feature check: if file is e.g. cars.html and FEATURES.cars is false, skip
    const pageKey = file.replace('.html', '');
    if (configData.FEATURES && configData.FEATURES[pageKey] === false) {
      console.log(`Skipping feature page: ${file} (feature disabled)`);
      continue;
    }
    // Dev-only pages (styleguide, any test/demo page) never ship in --prod
    if (isProd && DEV_PAGE.test(file)) continue;

    const templateContent = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const processed = processTemplate(templateContent, siteData, configData, slotsRegistry, imgAssetsDir, file);
    fs.writeFileSync(path.join(distDir, file), processed, 'utf8');
    emittedPages.push(file);
  }

  writeRedirects(emittedPages);

  if (isProd) {
    versionAssetRefs();
    // No source maps in production (none are generated today; this keeps it that way)
    const dropMaps = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) dropMaps(p);
      else if (e.name.endsWith('.map')) fs.unlinkSync(p);
    });
    dropMaps(distDir);
    pruneUnusedImages();
  }

  // Emit sitemap.xml and robots.txt from SITE_URL; public pages only (noindex and dev pages left out).
  // Without a real SITE_URL there is no sitemap (never a guessed domain); --launch fails on it.
  const siteUrl = isPlaceholder(configData.SITE_URL) ? '' : configData.SITE_URL.replace(/\/$/, '');
  if (!siteUrl) console.warn('[SITEMAP] SITE_URL is not set in content/config.json: sitemap.xml not written');

  const NOINDEX_PAGES = ['status.html', 'pay.html', 'staff.html', '404.html'];
  const sitemapPages = emittedPages.filter((p) => !NOINDEX_PAGES.includes(p) && !DEV_PAGE.test(p));
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPages
      .map((p) => {
        // Cloudflare Pages serves page.html at /page (and redirects /page.html there): list the final URL
        const loc = p === 'index.html' ? `${siteUrl}/` : `${siteUrl}/${p.replace(/\.html$/, '')}`;
        return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
      })
      .join('\n')}
</urlset>
`;
  if (siteUrl) fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');

  // Emit robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\n` + (siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : '');
  fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');

  const elapsed = Date.now() - startTime;
  let msg = `Build complete in ${elapsed}ms. Emitted ${emittedPages.length} pages: ${emittedPages.join(', ')}`;
  if (isProd && omittedGalleryCount > 0) {
    msg += ` | Omitted ${omittedGalleryCount} gallery frame(s) without image files in --prod`;
  }
  console.log(msg);
}

// Serve dist directory
function serveDist(port = 3000) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml',
    '.txt': 'text/plain'
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';

    let filePath = path.join(distDir, reqUrl);

    if (!fs.existsSync(filePath) && fs.existsSync(`${filePath}.html`)) {
      filePath = `${filePath}.html`;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    console.log(`Dist server running at http://localhost:${port}`);
  });
}

// Handle CLI args
const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isServe = args.includes('--serve');
const isProd = args.includes('--prod');
const DEV_PAGE = /^(styleguide|test|demo)\b.*\.html$/i;
let omittedGalleryCount = 0;

if (args.includes('--launch') && !isProd) {
  console.error('--launch needs --prod (it checks the production build): node tools/build.js --prod --launch');
  process.exit(1);
}

build();

if (args.includes('--launch')) launchChecks();

if (isWatch) {
  console.log('Watching for changes in src/, content/, and tools/slots.json...');
  let debounceTimeout = null;
  const triggerRebuild = (eventType, filename) => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      console.log(`\nChange detected (${filename || eventType}). Rebuilding...`);
      try {
        build();
      } catch (err) {
        console.error('Rebuild failed:', err);
      }
    }, 150);
  };

  fs.watch(srcDir, { recursive: true }, triggerRebuild);
  fs.watch(contentDir, { recursive: true }, triggerRebuild);
  if (fs.existsSync(slotsPath)) {
    fs.watch(slotsPath, triggerRebuild);
  }
}

if (isServe) {
  serveDist(3000);
}
