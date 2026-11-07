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

  // Check if image files exist
  const candidate480 = path.join(imgAssetsDir, `${slotName}-480.webp`);
  const candidate1200 = path.join(imgAssetsDir, `${slotName}.jpg`);
  const candidateWebp = path.join(imgAssetsDir, `${slotName}-960.webp`);

  const hasFiles = fs.existsSync(candidate480) || fs.existsSync(candidateWebp) || fs.existsSync(candidate1200);

  if (hasFiles) {
    let srcset = '';
    const src = fs.existsSync(candidateWebp) ? `assets/img/${slotName}-960.webp` : `assets/img/${slotName}-480.webp`;
    const widths = [480, 960, 1600];
    const existingWidths = widths.filter((w) => fs.existsSync(path.join(imgAssetsDir, `${slotName}-${w}.webp`)));

    if (existingWidths.length > 0) {
      srcset = existingWidths.map((w) => `assets/img/${slotName}-${w}.webp ${w}w`).join(', ');
    }

    const priorityAttrs = isPriority ? 'fetchpriority="high"' : 'loading="lazy"';
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
    <svg class="slot-ph-logo" viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" fill="none" stroke="currentColor">
      <path d="M24 6L6 20L10 40H38L42 20L24 6Z" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M24 16L16 26H32L24 16Z" fill="var(--gold-light)" opacity="0.6"/>
      <circle cx="24" cy="32" r="3" fill="var(--gold)"/>
    </svg>
    <span class="slot-ph-label">${label}</span>
  </div>
</div>`;
}

function renderPreload(slotName, slotsRegistry, imgAssetsDir) {
  const slot = slotsRegistry[slotName];
  if (!slot || !slot.priority) return '';
  const candidate480 = path.join(imgAssetsDir, `${slotName}-480.webp`);
  const candidate960 = path.join(imgAssetsDir, `${slotName}-960.webp`);

  if (!fs.existsSync(candidate480) && !fs.existsSync(candidate960)) {
    return '';
  }

  const widths = [480, 960, 1600];
  const existingWidths = widths.filter((w) => fs.existsSync(path.join(imgAssetsDir, `${slotName}-${w}.webp`)));
  const imagesrcset = existingWidths.map((w) => `assets/img/${slotName}-${w}.webp ${w}w`).join(', ');
  const href = `assets/img/${slotName}-${existingWidths[0] || 960}.webp`;
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
  // 0. Repeated blocks: <!--each:PATH-->...<!--/each-->
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

  // 1. Resolve {{include:name}} (partials may include other partials, up to 3 levels)
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

  // 2. Feature blocks: <!--feature:NAME-->...<!--/feature-->
  content = content.replace(/<!--feature:([a-zA-Z0-9_-]+)-->([\s\S]*?)<!--\/feature-->/g, (match, featureName, inner) => {
    const isEnabled = configData.FEATURES && !!configData.FEATURES[featureName];
    return isEnabled ? inner : '';
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
  if (fs.existsSync(qrcodeSrc)) {
    if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir, { recursive: true });
    fs.copyFileSync(qrcodeSrc, path.join(vendorDir, 'qrcode.js'));
  }

  // Clean / prepare dist
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

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

  // Trim comments and indentation from emitted JS (Home JS budget); keep the original if the result does not parse
  trimDistJs(path.join(distDir, 'js'));

  // Cloudflare Pages redirects
  const redirectsSrc = path.join(srcDir, '_redirects');
  if (fs.existsSync(redirectsSrc)) fs.copyFileSync(redirectsSrc, path.join(distDir, '_redirects'));

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

    const templateContent = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const processed = processTemplate(templateContent, siteData, configData, slotsRegistry, imgAssetsDir, file);
    fs.writeFileSync(path.join(distDir, file), processed, 'utf8');
    emittedPages.push(file);
  }

  // Remove images left in dist by earlier builds whose source image is gone (e.g. a replaced photo had a 1600 size)
  const distImg = path.join(distDir, "assets", "img");
  if (fs.existsSync(distImg)) {
    fs.readdirSync(distImg).forEach((f) => {
      if (!fs.existsSync(path.join(imgAssetsDir, f))) fs.unlinkSync(path.join(distImg, f));
    });
  }

  // Remove pages left in dist by earlier builds that are no longer emitted (e.g. cars.html)
  fs.readdirSync(distDir).forEach((f) => {
    if (f.endsWith('.html') && !emittedPages.includes(f)) fs.unlinkSync(path.join(distDir, f));
  });

  // Emit sitemap.xml (status.html excluded per spec)
  const siteUrl = (configData.SITE_URL && !configData.SITE_URL.startsWith('[TBD'))
    ? configData.SITE_URL.replace(/\/$/, '')
    : 'https://nsgroyalresort.com';

  const sitemapPages = emittedPages.filter((p) => p !== 'status.html');
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPages
  .map((p) => {
    const loc = p === 'index.html' ? `${siteUrl}/` : `${siteUrl}/${p}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
  })
  .join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');

  // Emit robots.txt
  const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
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
let omittedGalleryCount = 0;

build();

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
