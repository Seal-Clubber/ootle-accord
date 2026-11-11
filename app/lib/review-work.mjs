import { sha256Hex } from './accord.mjs';

export async function projectWork(value) {
  const text = value.trim();
  let url;
  try { url = new URL(text); } catch { /* The message below covers invalid URLs. */ }
  if (text.length > 2048 || url?.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new Error('Enter a public HTTPS link without a username or password.');
  }
  const hash = await sha256Hex(new TextEncoder().encode('ootleaccord:review-link:v1\n' + url.href));
  return { url: url.href, hash };
}

export function shareReviewLink(locationHref, network, agreementId, projectUrl) {
  const url = new URL(locationHref);
  url.search = network === 'esmeralda' ? '?network=esmeralda' : '';
  url.hash = 'review?' + new URLSearchParams({ accord: agreementId, work: projectUrl });
  return url.href;
}
