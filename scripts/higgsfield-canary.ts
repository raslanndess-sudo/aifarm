import { HiggsfieldWebProvider } from '../src/lib/providers/higgsfield-web';
import { mkdirSync } from 'fs';
import { join } from 'path';

async function main() {
  const provider = new HiggsfieldWebProvider();

  console.log(`Connecting to Chrome via CDP (host/port from env)...`);
  await provider.connect();

  console.log('Listing pages...');
  const pages = await provider.listPages();
  console.log(`Found ${pages.length} page(s):`);
  pages.forEach((p, i) => console.log(`  [${i}] ${p.title} — ${p.url}`));

  const outDir = join(process.cwd(), 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `canary-${Date.now()}.png`);

  console.log(`Taking screenshot → ${outPath}`);
  await provider.screenshot(outPath);

  console.log('Done. Disconnecting...');
  await provider.disconnect();
}

main().catch(err => {
  console.error('Canary failed:', err.message);
  process.exit(1);
});
