// Entrypoint for Tailwind: Archipelago Flight (make.fun best-flight-game-20261126-0057).
// Copies static game/ assets and screenshots/ to /output (or MAKEFUN_OUTPUT_DIR)
// and emits a deterministic /output/dossier.json via vendor/makefun-game.ts.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

const screenshotsSrc = join(repoRoot, 'screenshots');
const screenshotsDst = join(outDir, 'screenshots');
mkdirSync(screenshotsDst, { recursive: true });
if (existsSync(screenshotsSrc)) {
  cpSync(screenshotsSrc, screenshotsDst, { recursive: true });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
