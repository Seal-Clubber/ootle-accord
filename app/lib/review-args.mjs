/** Minimal canonical CBOR for the reviewed contract's two argument types. */
export function cborReviewerIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index > 9) throw new Error('Invalid reviewer index.');
  return { Literal: index.toString(16).padStart(2, '0') };
}

export function cborSubmissionHash(hash) {
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Use the lowercase SHA256 fingerprint of the submitted work.');
  return { Literal: '7840' + [...hash].map(char => char.charCodeAt(0).toString(16)).join('') };
}
