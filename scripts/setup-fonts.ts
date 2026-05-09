/**
 * Download required fonts for captions burn-in.
 * Run: npx tsx scripts/setup-fonts.ts
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

const fonts = [
  {
    name: 'Montserrat.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
  },
  {
    name: 'Inter.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
  },
];

async function main() {
  mkdirSync(FONTS_DIR, { recursive: true });

  for (const font of fonts) {
    const outPath = path.join(FONTS_DIR, font.name);
    if (existsSync(outPath)) {
      console.log(`[skip] ${font.name} already exists`);
      continue;
    }
    console.log(`[download] ${font.name}...`);
    const resp = await fetch(font.url);
    if (!resp.ok) {
      console.error(`  FAILED: HTTP ${resp.status}`);
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(outPath, buf);
    console.log(`  saved ${buf.length} bytes → ${outPath}`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
