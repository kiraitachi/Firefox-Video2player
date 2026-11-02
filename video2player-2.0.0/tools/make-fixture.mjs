import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';

const OUTPUT_PATH = 'test/fixtures/sample.mp4';
const VTT_PATH = 'test/fixtures/sample.vtt';
const SRT_PATH = 'test/fixtures/sample.srt';
const DURATION_SECONDS = 120;
const CUE_SECONDS = 5;

// 2.35:1 content so a phone screen shows real black bars to test pinch zoom.
// Colour bars rather than a noise pattern: visually useful and a tiny file.
const VIDEO_SIZE = 'size=1280x544:rate=15';
const VIDEO_SOURCE = `smptebars=${VIDEO_SIZE}:duration=${DURATION_SECONDS}`;
const AUDIO_SOURCE = `sine=frequency=440:duration=${DURATION_SECONDS}`;
const TIMECODE_FILTER = [
  'drawtext=text=%{pts\\\\:hms}',
  'fontsize=54',
  'fontcolor=white',
  'x=(w-tw)/2',
  'y=h-120',
  'box=1',
  'boxcolor=black@0.6',
  'boxborderw=16',
].join(':');

const args = [
  '-y',
  '-f',
  'lavfi',
  '-i',
  VIDEO_SOURCE,
  '-f',
  'lavfi',
  '-i',
  AUDIO_SOURCE,
  '-vf',
  TIMECODE_FILTER,
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '32',
  '-pix_fmt',
  'yuv420p',
  '-c:a',
  'aac',
  '-b:a',
  '64k',
  '-movflags',
  '+faststart',
  OUTPUT_PATH,
];

const formatStamp = (totalSeconds, millisSeparator) => {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}${millisSeparator}000`;
};

// Cues state their own timestamp, so subtitle sync is verifiable by eye.
const buildCues = () => {
  const cues = [];
  for (let start = 0; start < DURATION_SECONDS; start += CUE_SECONDS) {
    const end = Math.min(start + CUE_SECONDS - 1, DURATION_SECONDS);
    const minutes = Math.floor(start / 60);
    const seconds = String(start % 60).padStart(2, '0');
    cues.push({ start, end, text: `Cue at ${minutes}:${seconds}` });
  }
  return cues;
};

const buildVtt = (cues) => {
  const blocks = cues.map(({ start, end, text }) => {
    const range = `${formatStamp(start, '.')} --> ${formatStamp(end, '.')}`;
    return `${range}\n${text}`;
  });
  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
};

const buildSrt = (cues) => {
  const blocks = cues.map(({ start, end, text }, index) => {
    const range = `${formatStamp(start, ',')} --> ${formatStamp(end, ',')}`;
    return `${index + 1}\n${range}\n${text}`;
  });
  return `${blocks.join('\n\n')}\n`;
};

const run = async () => {
  const cues = buildCues();
  await writeFile(VTT_PATH, buildVtt(cues));
  await writeFile(SRT_PATH, buildSrt(cues));
  console.log(`Wrote ${VTT_PATH} and ${SRT_PATH} (${cues.length} cues).`);

  try {
    await access(OUTPUT_PATH);
    console.log(`${OUTPUT_PATH} already exists, nothing to do.`);
    return;
  } catch {
    // Not generated yet, fall through and build it.
  }

  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const code = await new Promise((resolve, reject) => {
    ffmpeg.on('error', reject);
    ffmpeg.on('close', resolve);
  });

  if (code !== 0) {
    console.error(stderr);
    throw new Error(`ffmpeg exited with code ${code}`);
  }
  console.log(`Generated ${OUTPUT_PATH} (${DURATION_SECONDS}s, 2.35:1).`);
};

run().catch((error) => {
  console.error(`Could not generate the fixture: ${error.message}`);
  console.error('Install ffmpeg, or point the fixture page at your own file.');
  process.exit(1);
});
