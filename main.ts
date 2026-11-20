// main.ts — the token-radar-01 entry program (Node 22, standard library only).
//
// It reads the sealed snapshot, scores every rankable pre-token protocol
// with the radar-2 model in lib/model.ts, and writes the entry's outputs:
//
//   board.json    the ranked board (226 rows, watchlist + early pre-token)
//   data.js       the same board slimmed down for the dashboard page
//   dashboard/    a copy of this repository's dashboard/
//   screenshots/  a copy of this repository's screenshots/
//   dossier.json  buildDossier's summary, for the judge
//
// Inputs and outputs:
//   snapshot: /input/snapshot.json, or --input <path> (a file, or a
//             directory holding snapshot.json)
//   out dir:  $MAKEFUN_OUTPUT_DIR, or /output
//
// The program is deterministic: two runs on the same snapshot write the
// same bytes. It uses no network and nothing beyond Node's standard library.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';
import {
  MODEL_PARAMS,
  MODEL_VERSION,
  buildBoard,
  dashboardRow,
  liveRow,
  liveSubjects,
  type SnapshotDoc,
} from './lib/model.ts';

/** Where this program's own files live (the repository root). */
const HERE = new URL('.', import.meta.url).pathname;

/** The snapshot path: --input <path>, else the sealed /input/snapshot.json. */
function snapshotPath(argv: string[]): string {
  const at = argv.indexOf('--input');
  if (at >= 0 && argv[at + 1] !== undefined) return argv[at + 1]!;
  return '/input/snapshot.json';
}

/** The output directory: $MAKEFUN_OUTPUT_DIR, else /output. */
function outputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : '/output';
}

/** Read the snapshot, accepting a file or a directory holding snapshot.json. */
function readSnapshot(path: string): SnapshotDoc {
  const file = existsSync(path) && !path.endsWith('.json') ? join(path, 'snapshot.json') : path;
  return JSON.parse(readFileSync(file, 'utf8')) as SnapshotDoc;
}

/** Copy a directory tree into the output, replacing what was there. */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, force: true });
}

function main(argv: string[]): void {
  const snapshot = readSnapshot(snapshotPath(argv));
  const out = outputDir();
  mkdirSync(out, { recursive: true });

  // The board: every subject scored and ranked by implied value.
  const board = buildBoard(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const earlyCount = board.filter((row) => !watchlist.has(row.slug)).length;
  const live = liveSubjects(snapshot);

  // board.json: the full board, one object with a rows array.
  writeFileSync(join(out, 'board.json'), JSON.stringify({ rows: board }) + '\n', 'utf8');

  // data.js: the dashboard's data — the board slimmed down, plus the
  // live-token table and the model's constants, under window.RADAR.
  const radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL_PARAMS,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    rows: board.map((row) => dashboardRow(row, watchlist.has(row.slug))),
    live: live.map((p) => liveRow(p)),
  };
  writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`, 'utf8');

  // The page and its screenshots, copied whole.
  copyTree(join(HERE, 'dashboard'), join(out, 'dashboard'));
  copyTree(join(HERE, 'screenshots'), join(out, 'screenshots'));

  // The dossier: what the judge reads, written by the vendored library.
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65536 }));

  console.log(
    `radar-2: ${board.length} rows (${snapshot.watchlist.length} watchlist, ${earlyCount} early), ` +
      `${live.length} live, top ${board[0]?.name} $${board[0]?.implied_value_usd.toLocaleString('en-US')}`,
  );
}

main(process.argv.slice(2));
