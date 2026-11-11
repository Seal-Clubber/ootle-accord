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
  assert.equal(project.hash, createHash('sha256').update('ootleaccord:review-link:v1\n' + project.url).digest('hex'));
  assert.notEqual(project.hash, createHash('sha256').update(project.url).digest('hex'));
  assert.notEqual(project.hash, (await projectWork(project.url.replace('build=1', 'build=2'))).hash);
});

test('a review link preserves the submitted website and multiline description and binds both to the hash', async () => {
  const submitted = await projectWork('https://example.com/demo', ' Shipped ✓\r\nIncludes links & a walkthrough. ');
  const link = new URL(shareReviewLink('https://app.example/', 'mainnet', 'demo', submitted.url, submitted.description));
  const params = new URLSearchParams(link.hash.slice('#review?'.length));
  assert.equal(params.get('description'), 'Shipped ✓\nIncludes links & a walkthrough.');
  assert.deepEqual(await projectWork(params.get('work'), params.get('description')), submitted);
  assert.notEqual((await projectWork(submitted.url, 'Different work')).hash, submitted.hash);
  assert.notEqual((await projectWork('https://example.org/', submitted.description)).hash, submitted.hash);
  assert.notEqual((await projectWork(submitted.url)).hash, submitted.hash);

  const textOnly = await projectWork('', submitted.description);
  const textLink = new URL(shareReviewLink('https://app.example/', 'mainnet', 'demo', textOnly.url, textOnly.description));
  const textParams = new URLSearchParams(textLink.hash.slice('#review?'.length));
  assert.equal(textParams.has('work'), false);
  assert.deepEqual(await projectWork('', textParams.get('description')), textOnly);
});

test('project work rejects non-HTTPS URLs and credentials', async () => {
  for (const link of ['javascript:alert(1)', 'http://example.com', '/relative', 'https://user:secret@example.com']) {
    await assert.rejects(projectWork(link), /public HTTPS/);
  }
});
