import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { createAppServer } from '../app/server.mjs';

async function fixture(t) {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(resolve(temporaryRoot, 'ootleaccord-server-'));
  const appDir = resolve(directory, 'app');
  const docsDir = resolve(directory, 'docs');
  await mkdir(appDir);
  await mkdir(docsDir);
  await writeFile(resolve(appDir, 'index.html'), '<!doctype html><title>OotleAccord test</title>');
  await writeFile(resolve(appDir, 'main.mjs'), 'export const value = 1;');
  await writeFile(resolve(appDir, '.env'), 'PRIVATE=test-value');
  await writeFile(resolve(appDir, 'server.mjs'), 'server source');
  await writeFile(resolve(appDir, 'private.recovery.json'), '{"outputMask":"synthetic"}');
  await writeFile(resolve(directory, 'outside.css'), 'body{color:red}');
  await writeFile(resolve(docsDir, 'privacy.md'), '# Privacy\n<script>untrusted()</script>');
  const server = createAppServer({ appDir, docsDir });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    const cleanupRelative = relative(temporaryRoot, directory);
    if (isAbsolute(cleanupRelative) || cleanupRelative.startsWith(`..${sep}`) || !cleanupRelative.startsWith('ootleaccord-server-')) throw new Error('Unsafe test cleanup.');
    await rm(directory, { recursive: true, force: true });
  });
  return { appDir, directory, port: server.address().port };
}

function read(port, path, method = 'GET') {
  return new Promise((resolveResult, reject) => {
    const outgoing = request({ host: '127.0.0.1', port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveResult({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('preview serves HTML/modules and plain-text docs under a restrictive local policy', async t => {
  const { port } = await fixture(t);
  const page = await read(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.headers['content-security-policy'], /connect-src https:\/\/ootle-indexer-a\.tari\.com;/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.match(page.headers['content-security-policy'], /font-src 'self'/);
  assert.equal(page.headers['referrer-policy'], 'no-referrer');
  assert.equal(page.headers['cache-control'], 'no-store');
  const module = await read(port, '/main.mjs?version=1');
  assert.equal(module.status, 200);
  assert.match(module.headers['content-type'], /^text\/javascript/);
  const docs = await read(port, '/docs/privacy.md');
  assert.equal(docs.status, 200);
  assert.match(docs.headers['content-type'], /^text\/plain/);
  assert.equal(docs.headers['x-content-type-options'], 'nosniff');
  assert.match(docs.body, /<script>untrusted/);
  const head = await read(port, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], page.headers['content-length']);
});

test('preview rejects traversal, malformed paths, private exports and source-server exposure', async t => {
  const { port } = await fixture(t);
  for (const path of ['/../outside.css', '/%2e%2e/outside.css', '/docs/%2e%2e/outside.css', '/%5c..%5coutside.css', '/%00.css', '/%ZZ', '//outside.css', '/.env']) {
    const response = await read(port, path);
    assert.equal(response.status, 400, path);
    assert.equal(response.body.includes('PRIVATE'), false);
  }
  for (const path of ['/private.recovery.json', '/server.mjs', '/docs/server.mjs', '/missing.css']) assert.equal((await read(port, path)).status, 404, path);
});

test('preview has no file-upload or mutation endpoint', async t => {
  const { port, appDir } = await fixture(t);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await read(port, '/main.mjs', method);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
  }
  assert.equal(await readFile(resolve(appDir, 'main.mjs'), 'utf8'), 'export const value = 1;');
});

test('preview refuses a symlink that escapes the app directory', async t => {
  const { port, appDir, directory } = await fixture(t);
  try { await symlink(resolve(directory, 'outside.css'), resolve(appDir, 'escape.css'), 'file'); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('This Windows account cannot create file symlinks.'); return; }
    throw error;
  }
  assert.equal((await read(port, '/escape.css')).status, 404);
});
