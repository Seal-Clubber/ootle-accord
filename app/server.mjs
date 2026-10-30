import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const DOCUMENT_DIRECTORY = fileURLToPath(new URL('../docs/', import.meta.url));
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
  ['.json', 'application/json; charset=utf-8'],
]);
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://ootle-indexer-a.tari.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cache-Control': 'no-store',
});

function contained(root, target) {
  const child = relative(root, target);
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`));
}

function requestedPath(requestTarget) {
  if (typeof requestTarget !== 'string' || !requestTarget.startsWith('/') || requestTarget.startsWith('//')) return null;
  const raw = requestTarget.split(/[?#]/, 1)[0];
  let pathname;
  try { pathname = decodeURIComponent(raw); } catch { return null; }
  if (!/^\/[a-zA-Z0-9/_.-]*$/.test(pathname) || pathname.includes('\\')) return null;
  if (pathname.split('/').some(segment => segment.startsWith('.'))) return null;
  return pathname;
}

/** Read-only local preview; imported recovery files are read by the browser, never uploaded here. */
export function createAppServer({ appDir = APP_DIRECTORY, docsDir = DOCUMENT_DIRECTORY } = {}) {
  const appRoot = resolve(appDir);
  const docsRoot = resolve(docsDir);
  return createServer(async (request, response) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(key, value);
    const finish = (code, message) => {
      response.statusCode = code;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      finish(405, 'Method not allowed.');
      return;
    }
    const pathname = requestedPath(request.url);
    if (pathname === null) { finish(400, 'Invalid path.'); return; }
    const isDocument = pathname.startsWith('/docs/');
    const root = isDocument ? docsRoot : appRoot;
    const local = pathname === '/' ? 'index.html' : pathname.slice(isDocument ? 6 : 1);
    const extension = extname(local).toLowerCase();
    if (extension === '.json' && pathname !== '/version.json') { finish(404, 'Not found.'); return; }
    if ((!isDocument && (!TYPES.has(extension) || local === 'server.mjs')) ||
        (isDocument && extension !== '.md')) { finish(404, 'Not found.'); return; }
    const candidate = resolve(root, local);
    if (!contained(root, candidate)) { finish(400, 'Invalid path.'); return; }
    try {
      const [rootReal, fileReal] = await Promise.all([realpath(root), realpath(candidate)]);
      if (!contained(rootReal, fileReal)) { finish(404, 'Not found.'); return; }
      if (!(await stat(fileReal)).isFile()) { finish(404, 'Not found.'); return; }
      const body = await readFile(fileReal);
      response.statusCode = 200;
      response.setHeader('Content-Type', isDocument ? 'text/plain; charset=utf-8' : TYPES.get(extension));
      response.setHeader('Content-Length', body.length);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error.code)) finish(404, 'Not found.');
      else finish(500, 'Unable to read the requested file.');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const server = createAppServer();
  server.on('error', error => { process.stderr.write(`Preview could not start: ${error.message}\n`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => process.stdout.write(`OotleAccord: http://127.0.0.1:${port}/\n`));
}
