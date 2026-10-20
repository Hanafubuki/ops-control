import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, renameSync} from 'node:fs';
import {renderVideo} from '@revideo/renderer';
import {HOLD, PICK, STILL_SETS, type StillSet} from './src/stills-plan';

const chromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(existsSync);
type Output = {outFile: `${string}.mp4`; size: {x: number; y: number}; project: string; stills?: StillSet};
const outputs: Output[] = [
  {outFile: 'launch.mp4', size: {x: 1920, y: 1080}, project: './src/project.ts'},
  {outFile: 'launch-square.mp4', size: {x: 1080, y: 1080}, project: './src/project.ts'},
  {outFile: 'stills-dock.mp4', size: STILL_SETS.dock.size, project: './src/stills.ts', stills: STILL_SETS.dock},
  {outFile: 'stills-narrow.mp4', size: STILL_SETS.narrow.size, project: './src/stills.ts', stills: STILL_SETS.narrow},
  {outFile: 'stills-tall.mp4', size: STILL_SETS.tall.size, project: './src/stills.ts', stills: STILL_SETS.tall},
];

const only = process.argv[2];
const stillsOut = process.env.STILLS_OUT ?? 'out/stills';
mkdirSync('out', {recursive: true});

// One frame per still from the stills render: cropped, halved (the render is 2x), and palette-quantized to keep the PNG small.
function extract(file: string, set: StillSet) {
  mkdirSync(stillsOut, {recursive: true});
  set.names.forEach((name, i) => {
    const crop = set.crop ? `crop=${set.size.x}:${set.crop.h}:0:${set.crop.y},` : '';
    const vf = `${crop}scale=iw/2:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=single[p];[b][p]paletteuse=dither=none`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(i * HOLD + PICK), '-i', file, '-frames:v', '1', '-filter_complex', vf, `${stillsOut}/${name}.png`]);
    console.log('wrote', `${stillsOut}/${name}.png`);
  });
}

// One at a time: each render is a headless chromium plus an ffmpeg encode.
// The stills render only when asked for by name (`pnpm render stills`).
for (const o of outputs) {
  if (only ? !o.outFile.startsWith(only) : o.stills) continue;
  const render = () =>
    renderVideo({
      projectFile: o.project,
      settings: {
        outFile: o.outFile,
        outDir: './out',
        workers: 1,
        logProgress: true,
        projectSettings: {size: o.size, exporter: {name: '@revideo/core/wasm'}},
        puppeteer: {
          executablePath: process.env.CHROMIUM ?? chromium,
          args: ['--no-sandbox', '--disable-gpu'],
        },
        viteConfig: {server: {fs: {allow: ['..', '../..']}}},
      },
    });
  // On a fresh node_modules vite re-optimizes its dependencies during the first render,
  // reloads the page, and the render fails once; the second attempt is clean.
  const file = await render().catch(() => render());
  if (o.stills) {
    extract(file, o.stills);
    continue;
  }
  // The encoder leaves sample_aspect_ratio unset; say 1:1 so no player guesses. A remux, no re-encode.
  const tmp = `${file}.sar.mp4`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c', 'copy', '-bsf:v', 'h264_metadata=sample_aspect_ratio=1/1', tmp]);
  renameSync(tmp, file);
  console.log('wrote', file);
}
