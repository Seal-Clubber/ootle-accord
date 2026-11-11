import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectWork, shareReviewLink } from '../app/lib/review-work.mjs';

test('creator and reviewer derive the same submission from a shared HTTPS link', async () => {
  const project = await projectWork(' https://Example.github.io/demo/?build=1&theme=dark#work ');
  const review = new URL(shareReviewLink('https://app.example/?v=old#explore', 'esmeralda', 'demo', project.url));
  const params = new URLSearchParams(review.hash.slice('#review?'.length));
  assert.equal(review.search, '?network=esmeralda');
  assert.equal(params.get('accord'), 'demo');
  assert.equal(params.get('work'), 'https://example.github.io/demo/?build=1&theme=dark#work');
  assert.deepEqual(await projectWork(params.get('work')), project);
  assert.notEqual(project.hash, createHash('sha256').update(project.url).digest('hex'));
  assert.notEqual(project.hash, (await projectWork(project.url.replace('build=1', 'build=2'))).hash);
});

test('project work rejects non-HTTPS URLs and credentials', async () => {
  for (const link of ['javascript:alert(1)', 'http://example.com', '/relative', 'https://user:secret@example.com']) {
    await assert.rejects(projectWork(link), /public HTTPS/);
  }
});
