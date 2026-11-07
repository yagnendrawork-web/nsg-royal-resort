const fs = require('fs');
const path = require('path');

async function processImages() {
  const rootDir = path.resolve(__dirname, '..');
  const slotsPath = path.join(rootDir, 'tools', 'slots.json');
  const originalsDir = path.join(rootDir, 'originals');
  const outputDir = path.join(rootDir, 'src', 'assets', 'img');

  if (!fs.existsSync(slotsPath)) {
    console.error('Error: tools/slots.json not found');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(originalsDir)) {
    fs.mkdirSync(originalsDir, { recursive: true });
  }

  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.warn('Warning: sharp not installed yet. Skipping image processing.');
  }

  const slots = JSON.parse(fs.readFileSync(slotsPath, 'utf8'));
  const slotKeys = Object.keys(slots);
  const manifest = {};
  const statusTable = [];

  const extensions = ['.jpg', '.jpeg', '.png', '.webp'];

  for (const slot of slotKeys) {
    let sourceFile = null;
    for (const ext of extensions) {
      const candidate = path.join(originalsDir, `${slot}${ext}`);
      if (fs.existsSync(candidate)) {
        sourceFile = candidate;
        break;
      }
    }

    if (!sourceFile) {
      statusTable.push({ Slot: slot, Status: 'MISSING', Source: '-' });
      continue;
    }

    statusTable.push({ Slot: slot, Status: 'FILLED', Source: path.basename(sourceFile) });

    if (!sharp) continue;

    if (slot === 'og-image') {
      const targetPath = path.join(outputDir, 'og-image.jpg');
      await sharp(sourceFile)
        .resize(1200, 630, { fit: 'cover' })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(targetPath);
      manifest[slot] = [1200];
    } else {
      const meta = await sharp(sourceFile).metadata();
      const origWidth = meta.width || 1600;
      const targetWidths = [480, 960, 1600];
      const producedWidths = [];

      for (const w of targetWidths) {
        if (w > origWidth && producedWidths.length > 0) {
          // Never upscale
          continue;
        }
        const effectiveWidth = Math.min(w, origWidth);
        const outFileName = `${slot}-${w}.webp`;
        const targetPath = path.join(outputDir, outFileName);

        await sharp(sourceFile)
          .resize({ width: effectiveWidth, withoutEnlargement: true })
          .webp({ quality: 78 })
          .toFile(targetPath);

        producedWidths.push(w);
      }
      manifest[slot] = producedWidths;
    }
  }

  // Write manifest.js
  const manifestContent = `window.NSG = window.NSG || {};\nwindow.NSG.IMG = ${JSON.stringify(manifest, null, 2)};\n`;
  fs.writeFileSync(path.join(outputDir, 'manifest.js'), manifestContent, 'utf8');

  // Print table
  console.log('\n--- Image Slots Status ---');
  console.table(statusTable);
  const filledCount = statusTable.filter((r) => r.Status === 'FILLED').length;
  console.log(`Summary: ${filledCount}/${slotKeys.length} slots filled.\n`);
}

processImages().catch((err) => {
  console.error('images.js failed:', err);
  process.exit(1);
});
