import { sha256Hex } from './accord.mjs';

export async function projectWork(value, description = '') {
  const website = value.trim();
  const notes = description.replace(/\r\n?/g, '\n').trim().toWellFormed();
  if (notes.length > 1500) throw new RangeError('Keep the work description to 1,500 characters.');
  let url = '';
  if (website) {
    let address;
    try { address = new URL(website); } catch { /* The message below covers invalid URLs. */ }
    if (website.length > 2048 || address?.protocol !== 'https:' || !address.hostname || address.username || address.password) {
      throw new Error('Enter a public HTTPS website address without a username or password.');
    }
    url = address.href;
    if (url.length > 2048) throw new Error('Use a shorter website address.');
  }
  if (!url && !notes) throw new Error('Enter a website or work description.');
  // Preserve the hash of website-only submissions already recorded on-chain.
  const payload = notes ? 'ootleaccord:review-work:v1\n' + JSON.stringify([url, notes]) : 'ootleaccord:review-link:v1\n' + url;
  const hash = await sha256Hex(new TextEncoder().encode(payload));
  return { url, hash, ...(notes ? { description: notes } : {}) };
}

export function shareReviewLink(locationHref, network, agreementId, website, description = '', view = 'review') {
  const url = new URL(locationHref);
  url.search = network === 'esmeralda' ? '?network=esmeralda' : '';
  const params = new URLSearchParams({ accord: agreementId });
  if (website) params.set('work', website);
  if (description) params.set('description', description);
  url.hash = view + '?' + params;
  return url.href;
}
