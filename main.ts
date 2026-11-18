// Hollowlight's entrypoint: the program the grader runs.
//
// The game itself is static — game/index.html plus the ES modules under game/src, no bundler, no
// library, no network request at load time — so this file has one job: put the entry where the
// grader expects it and write the dossier the judge reads.
//
//   /output/game/          the playable files, copied from beside this file
//   /output/screenshots/   the four stills, first by name is the cover
//   /output/dossier.json   the summary, built by the vendored make.fun library
//
// Runs on Node 22, standard library only. Locally, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The caps passed to the dossier builder are the scorer's own (reference/gate.json in the kit):
// they are what makes a dossier the grader would otherwise refuse fail here instead.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const SCORER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function stage(from: string, to: string): void {
  if (!existsSync(from)) return;
  cpSync(from, to, { recursive: true });
}

mkdirSync(output, { recursive: true });
stage(join(root, 'game'), join(output, 'game'));
mkdirSync(join(output, 'screenshots'), { recursive: true });
stage(join(root, 'screenshots'), join(output, 'screenshots'));

writeFileSync(join(output, 'dossier.json'), buildDossier(output, SCORER_CAPS));
