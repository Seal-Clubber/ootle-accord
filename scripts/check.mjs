import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Unexpected linked file: ${relative(root, path)}`);
  }
}
for (const directory of ['app', 'scripts', 'tests']) await collect(resolve(root, directory));
for (const path of files.filter(path => /\.(?:mjs|js)$/.test(path))) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || `Syntax check failed: ${path}`);
}
const entry = resolve(root, 'app/index.html');
const html = await readFile(entry, 'utf8');
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const reference = match[1];
  if (/^(?:https?:|data:|mailto:)/.test(reference)) continue;
  const localReference = reference.split(/[?#]/)[0].replace(/^\.\//, '');
  let path = localReference.startsWith('docs/') ? resolve(root, localReference) : resolve(dirname(entry), localReference);
  if (reference.startsWith('/') || relative(root, path).startsWith('..')) throw new Error(`Unexpected nonportable page reference: ${reference}`);
  if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
  if (!(await stat(path)).isFile()) throw new Error(`Missing page asset: ${reference}`);
}
if (/\son[a-z]+\s*=/i.test(html)) throw new Error('Use module event listeners instead of inline handlers.');
if (!html.includes('OotleAccord') || !html.includes('id="explore-open-accord"')) throw new Error('The application entry is incomplete.');
process.stdout.write(`Checked JavaScript syntax and ${Array.from(html.matchAll(/(?:src|href)="([^"#]+)"/g)).length} page references.\n`);
