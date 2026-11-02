import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('test/fixtures');
const PORT = Number(process.env.PORT ?? 8422);

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'application/x-subrip; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const resolvePath = (url) => {
  const pathname = decodeURIComponent(
    new URL(url, 'http://localhost').pathname,
  );
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const target = join(ROOT, relative === '/' ? 'index.html' : relative);
  return target.startsWith(ROOT) ? target : null;
};

const sendRange = (response, path, size, type, rangeHeader) => {
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  const start = match[1] === '' ? 0 : Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);

  if (start >= size || start > end) {
    response.writeHead(416, { 'content-range': `bytes */${size}` });
    response.end();
    return;
  }

  response.writeHead(206, {
    'content-type': type,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${size}`,
    'accept-ranges': 'bytes',
  });
  createReadStream(path, { start, end }).pipe(response);
};

const server = createServer(async (request, response) => {
  const path = resolvePath(request.url);
  if (!path) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(path);
    const type = CONTENT_TYPES[extname(path)] ?? 'application/octet-stream';

    if (request.headers.range) {
      sendRange(response, path, info.size, type, request.headers.range);
      return;
    }

    response.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'accept-ranges': 'bytes',
    });
    createReadStream(path).pipe(response);
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404).end('Not found');
      return;
    }
    console.error(error);
    response.writeHead(500).end('Server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Fixtures on http://localhost:${PORT}/`);
  console.log(`For a phone:  adb reverse tcp:${PORT} tcp:${PORT}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
