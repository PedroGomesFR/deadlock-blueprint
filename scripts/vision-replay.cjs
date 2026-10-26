// Vision replay: runs the real scanner (dist/replay.html, built by `npm run build`) on saved frames, in a hidden
// Electron window, with a throwaway profile.
//
//   electron scripts/vision-replay.cjs --check tests/vision
//       Regression test: tests/vision/cases.json lists frames and what the scanner must read in each one (only the
//       fields given are compared). Exit code 1 on any difference. `npm run test:vision`.
//
//   electron scripts/vision-replay.cjs --log "%APPDATA%\deadlock-tactical-autobuild\match-logs\partie_…" [--hero id]
//       [--crops] [--sequential] [--out results.json]
//       Recalibration: what the scanner reads on every full frame of a game log (one per minute), or with --crops on
//       every inventory + score-box crop pair (every 2 s, no portraits). Prints one line per frame.
//
// (From a VS Code terminal, unset ELECTRON_RUN_AS_NODE first: VS Code sets it, and Electron then runs as Node.)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dl-replay-')));
app.commandLine.appendSwitch('log-level', '3');

function jobsFromCases(dir) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));
  return spec.cases.map((c) => ({
    name: c.name,
    parts: (c.parts || [{ file: c.image, x: 0, y: 0 }]).map((p) => ({ ...p, file: path.resolve(dir, p.file) })),
    heroId: c.heroId,
    buildItemIds: c.buildItemIds,
    simulateLayout: c.simulateLayout,
    expect: c.expect || {},
  }));
}

function jobsFromLog(logDir) {
  const images = path.join(logDir, 'images');
  const files = fs.readdirSync(images).sort();
  const hero = option('--hero');
  if (flag('--crops')) {
    // inv_<n>_<time>.jpg at (0, 820) and top_<n>_<time>.jpg at (840, 30), as written by matchLogger.ts
    return files
      .filter((f) => f.startsWith('inv_'))
      .map((f) => ({
        name: f.slice(4, -4),
        parts: [
          { file: path.join(images, f), x: 0, y: 820 },
          ...(files.includes(`top_${f.slice(4)}`) ? [{ file: path.join(images, `top_${f.slice(4)}`), x: 840, y: 30 }] : []),
        ],
        heroId: hero,
      }));
  }
  return files
    .filter((f) => f.startsWith('full_'))
    .map((f) => ({ name: f.slice(5, -4), parts: [{ file: path.join(images, f), x: 0, y: 0 }], heroId: hero }));
}

const checkDir = option('--check');
const logDir = option('--log');
if (!checkDir && !logDir) {
  console.error('Usage: electron scripts/vision-replay.cjs --check tests/vision | --log <match log folder> [options]');
  process.exit(2);
}
const jobs = checkDir ? jobsFromCases(path.resolve(checkDir)) : jobsFromLog(path.resolve(logDir));
const results = new Map();

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function compare() {
  let failures = 0;
  for (const job of jobs) {
    const got = results.get(job.name);
    const diffs = [];
    if (!got || got.error) diffs.push(`error: ${got ? got.error : 'no result'}`);
    else {
      for (const [key, want] of Object.entries(job.expect)) {
        if (!sameValue(got[key], want)) diffs.push(`${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got[key])}`);
      }
    }
    if (diffs.length > 0) {
      failures++;
      console.log(`✗ ${job.name}\n    ${diffs.join('\n    ')}`);
    } else {
      console.log(`✓ ${job.name}`);
    }
  }
  console.log(`\n${jobs.length - failures}/${jobs.length} frames as expected`);
  return failures === 0;
}

function report() {
  const short = (slots) => (slots ? slots.map((id) => id || '?').join(',') : '-');
  for (const job of jobs) {
    const r = results.get(job.name);
    if (!r || r.error) {
      console.log(`${job.name}  ERROR ${r ? r.error : ''}`);
      continue;
    }
    console.log(
      `${job.name}  ${r.mode.padEnd(5)} me=${r.highlighted || '-'} allies=[${short(r.allySlots)}] enemies=[${short(
        r.enemySlots
      )}] souls=${r.souls ?? '?'} inv=${r.slots.join(' ')}`
    );
  }
  const out = option('--out');
  if (out) {
    fs.writeFileSync(out, JSON.stringify(Object.fromEntries(results), null, 2));
    console.log(`\nWritten to ${out}`);
  }
}

app.whenReady().then(() => {
  const page = path.join(ROOT, 'dist', 'replay.html');
  if (!fs.existsSync(page)) {
    console.error('dist/replay.html missing: run `npm run build` first');
    app.exit(2);
    return;
  }
  ipcMain.handle('replay-jobs', () => ({
    jobs: jobs.map(({ expect, ...job }) => job),
    sequential: flag('--sequential'),
    ocr: !flag('--no-ocr'),
  }));
  ipcMain.handle('replay-read', (_event, file) => {
    const data = fs.readFileSync(file);
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });
  ipcMain.on('replay-result', (_event, name, summary) => results.set(name, summary));
  ipcMain.on('replay-done', () => {
    const ok = checkDir ? compare() : (report(), true);
    // --out with --check: what was read, to update cases.json after a deliberate change of the scanner
    if (checkDir && option('--out')) fs.writeFileSync(option('--out'), JSON.stringify(Object.fromEntries(results), null, 2));
    app.exit(ok ? 0 : 1);
  });

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'vision-replay-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) console.error(`[page] ${message}`);
  });
  win.loadFile(page);
});
