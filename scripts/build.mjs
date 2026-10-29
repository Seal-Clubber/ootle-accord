import { copyFile, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const checked = spawnSync(process.execPath, [resolve(root, 'scripts/check.mjs')], { stdio: 'inherit', windowsHide: true });
if (checked.error || checked.status !== 0) throw new Error('Checks must pass before packaging.');
// Check the final absolute target before recursive cleanup; never accept a caller-supplied output path.
const outputRelative = relative(root, output);
if (isAbsolute(outputRelative) || outputRelative !== 'dist' || output === root) throw new Error('Unsafe build output.');
const rootReal = await realpath(root);
const physicalOutput = resolve(rootReal, 'dist');
if (!physicalOutput.startsWith(`${rootReal}${sep}`)) throw new Error('Unsafe build output.');
try {
  const existingOutput = await realpath(output);
  const physicalRelative = relative(rootReal, existingOutput);
  if (isAbsolute(physicalRelative) || physicalRelative !== 'dist') throw new Error('Build output resolves outside its intended directory.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const appExtensions = new Set(['.html', '.css', '.mjs', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff2']);
let copied = 0;
async function copyTree(source, destination, isDocs = false) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'server.mjs') continue;
    const from = resolve(source, entry.name);
    const to = resolve(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build inputs must not contain symlinks.');
    if (entry.isDirectory()) await copyTree(from, to, isDocs);
    else if (entry.isFile() && (isDocs ? extname(entry.name) === '.md' : appExtensions.has(extname(entry.name)))) {
      await copyFile(from, to);
      copied++;
    }
  }
}
await copyTree(resolve(root, 'app'), output);
await copyTree(resolve(root, 'docs'), resolve(output, 'docs'), true);
process.stdout.write(`Built ${copied} static files in dist/. No credentials or recovery files are included.\n`);
