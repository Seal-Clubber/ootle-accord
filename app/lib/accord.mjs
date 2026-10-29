/** Original OotleAccord agreement helpers. Amounts use six decimal places, never floats. */
import { reviewerKeyFromWallet } from './wallet-address.mjs';
export const AGREEMENT_SCHEMA = 'ootleaccord.agreement.v1';
export const WALLET_AGREEMENT_SCHEMA = 'ootleaccord.agreement.v2';
export const QUORUM_AGREEMENT_SCHEMA = 'ootleaccord.agreement.v3';
export const UINT64_MAX = (1n << 64n) - 1n;
// Protocol-native TARI, six decimals; v1 does not support custom resource divisibilities.
export const NATIVE_TARI_RESOURCE = `resource_${'01'.repeat(32)}`;
const HEX32 = /^[a-f0-9]{64}$/i;
const RESOURCE = /^resource_[a-f0-9]{64}$/i;
const WALLET = /^otl_[a-z0-9]+_1[023456789acdefghjklmnpqrstuvwxyz]{20,}$/;

export class AccordError extends Error {
  constructor(message, code = 'INVALID_AGREEMENT') {
    super(message);
    this.name = 'AccordError';
    this.code = code;
  }
}

export function webCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new AccordError('A secure browser context with Web Crypto is required.', 'CRYPTO_UNAVAILABLE');
  }
  return globalThis.crypto;
}

export function plainObject(value, label = 'Value') {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new AccordError(`${label} must be a plain object.`);
  }
  return value;
}

export function onlyKeys(value, keys, label) {
  plainObject(value, label);
  if (Object.keys(value).some(key => !keys.includes(key))) {
    throw new AccordError(`${label} contains an unsupported field. Keep secrets out of public agreements.`);
  }
}

function text(value, label, min, max) {
  if (typeof value !== 'string') throw new AccordError(`${label} must be text.`);
  const result = value.trim().normalize('NFC');
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    throw new AccordError(`${label} must be between ${min} and ${max} characters without control characters.`);
  }
  return result;
}

export function rawUnits(value, label = 'Amount', { allowZero = false } = {}) {
  if (typeof value !== 'string' || value.length > 20 || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new AccordError(`${label} must be a canonical raw-unit integer string.`, 'INVALID_AMOUNT');
  }
  const amount = BigInt(value);
  if (amount > UINT64_MAX || (!allowZero && amount === 0n)) {
    throw new AccordError(`${label} must be positive and within the resource range.`, 'INVALID_AMOUNT');
  }
  return value;
}

/** Parse user-entered TARI exactly. Scientific notation, signs and excess precision are rejected. */
export function toRawAmount(value) {
  if (typeof value !== 'string' || value.length > 30 || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) {
    throw new AccordError('Enter a positive amount with at most six decimal places.', 'INVALID_AMOUNT');
  }
  const [whole, fraction = ''] = value.split('.');
  return rawUnits((BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))).toString());
}

export function fromRawAmount(value) {
  const units = BigInt(rawUnits(value, 'Amount', { allowZero: true }));
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${units / 1_000_000n}${fraction ? `.${fraction}` : ''}`;
}

export function validateEpoch(value) {
  rawUnits(value, 'Refund epoch');
  // Sapient's current HTLC builder serializes epochs as JS numbers.
  if (BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AccordError('Refund epoch exceeds the wallet’s exact integer range.', 'INVALID_EPOCH');
  }
  return value;
}

export function hex32(value, label = '32-byte hex value') {
  if (typeof value !== 'string' || !HEX32.test(value)) {
    throw new AccordError(`${label} must contain exactly 64 hexadecimal characters.`);
  }
  return value.toLowerCase();
}

export function requiredApprovals(count, percent) {
  if (!Number.isInteger(count) || count < 1 || count > 10 || !Number.isInteger(percent) || percent < 1 || percent > 100) throw new AccordError('Use one to ten reviewers and a whole approval percentage from 1 to 100.');
  return Math.floor((count * percent + 99) / 100);
}

function normalizeReviewer(reviewer) {
  onlyKeys(reviewer, ['name', 'role', 'walletAddress', 'publicKey'], 'Reviewer');
  const publicKey = reviewerKeyFromWallet(reviewer.walletAddress);
  if (reviewer.publicKey !== undefined && reviewer.publicKey !== publicKey) throw new AccordError('Reviewer key does not match the wallet address.');
  return { name: text(reviewer.name, 'Reviewer name', 1, 100), role: text(reviewer.role ?? 'Independent reviewer', 'Reviewer role', 1, 160), walletAddress: reviewer.walletAddress, publicKey };
}

export function validateAgreement(input) {
  onlyKeys(input, ['schema', 'title', 'description', 'network', 'resourceAddress', 'creatorWalletAddress', 'milestones'], 'Agreement');
  const schema = input.schema ?? AGREEMENT_SCHEMA;
  const quorumReview = schema === QUORUM_AGREEMENT_SCHEMA;
  const walletReview = quorumReview || schema === WALLET_AGREEMENT_SCHEMA;
  if (![AGREEMENT_SCHEMA, WALLET_AGREEMENT_SCHEMA, QUORUM_AGREEMENT_SCHEMA].includes(schema)) throw new AccordError('Unsupported agreement version.');
  if (input.network !== 'esmeralda') throw new AccordError('This prototype supports the Esmeralda testnet only.', 'WRONG_NETWORK');
  if (typeof input.resourceAddress !== 'string' || !RESOURCE.test(input.resourceAddress)) throw new AccordError('Enter a valid resource address.');
  if (input.resourceAddress.toLowerCase() !== NATIVE_TARI_RESOURCE) throw new AccordError('Agreement v1 supports only native TARI with six decimal places.', 'UNSUPPORTED_RESOURCE');
  // This lexical check catches wrong address classes; Sapient validates the complete address and checksum.
  if (typeof input.creatorWalletAddress !== 'string' || !WALLET.test(input.creatorWalletAddress)) throw new AccordError('Enter an Ootle wallet address (otl_…), not an account component.');
  if (quorumReview) reviewerKeyFromWallet(input.creatorWalletAddress);
  if (!Array.isArray(input.milestones) || input.milestones.length < 1 || input.milestones.length > 8) throw new AccordError('An agreement needs between one and eight milestones.');
  for (let index = 0; index < input.milestones.length; index++) {
    if (!Object.hasOwn(input.milestones, index)) throw new AccordError('Milestones cannot contain empty array slots.');
  }
  const ids = new Set();
  const hashes = new Set();
  const milestones = input.milestones.map(stage => {
    onlyKeys(stage, ['id', 'title', 'description', 'refundEpoch', 'targetUnits', ...(quorumReview ? ['reviewers', 'approvalPercent'] : ['reviewer']), ...(walletReview ? [] : ['hashLockHex'])], 'Milestone');
    const id = text(stage.id, 'Milestone ID', 1, 40);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id)) throw new AccordError('Use unique lowercase milestone IDs containing letters, digits and hyphens.');
    ids.add(id);
    if (!quorumReview) onlyKeys(stage.reviewer, ['name', 'role', ...(walletReview ? ['walletAddress', 'publicKey'] : [])], 'Reviewer');
    let reviewers;
    if (quorumReview) {
      if (!Array.isArray(stage.reviewers)) throw new AccordError('Provide a reviewer list.');
      requiredApprovals(stage.reviewers.length, stage.approvalPercent);
      for (let i = 0; i < stage.reviewers.length; i++) if (!Object.hasOwn(stage.reviewers, i)) throw new AccordError('Reviewer list cannot contain empty slots.');
      reviewers = stage.reviewers.map(normalizeReviewer);
      if (new Set(reviewers.map(r => r.publicKey)).size !== reviewers.length) throw new AccordError('Each reviewer must have a distinct signing key.');
    }
    const hashLockHex = walletReview ? null : hex32(stage.hashLockHex, 'Reviewer hashlock');
    if (!walletReview && hashes.has(hashLockHex)) throw new AccordError('Each milestone needs a separate reviewer secret.');
    if (!walletReview) hashes.add(hashLockHex);
    const publicKey = walletReview && !quorumReview ? reviewerKeyFromWallet(stage.reviewer.walletAddress) : null;
    if (walletReview && !quorumReview && stage.reviewer.publicKey !== undefined && stage.reviewer.publicKey !== publicKey) throw new AccordError('Reviewer key does not match the wallet address.');
    const normalized = {
      id,
      title: text(stage.title, 'Milestone title', 1, 100),
      description: text(stage.description ?? '', 'Milestone description', 0, 2000),
      ...(quorumReview ? { reviewers, approvalPercent: stage.approvalPercent } : { reviewer: {
        name: text(stage.reviewer.name, 'Reviewer name', 1, 100),
        role: text(stage.reviewer.role ?? 'Independent reviewer', 'Reviewer role', 1, 160),
        ...(walletReview ? { walletAddress: stage.reviewer.walletAddress, publicKey } : {}),
      } }),
      ...(!walletReview ? { hashLockHex } : {}),
      refundEpoch: validateEpoch(stage.refundEpoch),
    };
    if (stage.targetUnits !== undefined) normalized.targetUnits = rawUnits(stage.targetUnits, 'Milestone target');
    return normalized;
  });
  return deepFreeze({
    schema,
    title: text(input.title, 'Campaign title', 2, 100),
    description: text(input.description, 'Campaign description', 1, 4000),
    network: input.network,
    resourceAddress: input.resourceAddress.toLowerCase(),
    creatorWalletAddress: input.creatorWalletAddress,
    milestones,
  });
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  plainObject(value);
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value) {
  const normalized = hex32(value);
  return Uint8Array.from(normalized.match(/../g), byte => Number.parseInt(byte, 16));
}

export async function sha256Hex(bytes) {
  return bytesToHex(new Uint8Array(await webCrypto().subtle.digest('SHA-256', bytes)));
}

/** Hash of normalized public terms, with an application-specific domain prefix. */
export async function agreementId(input) {
  const agreement = validateAgreement(input);
  return sha256Hex(new TextEncoder().encode(`${agreement.schema}\n${canonicalJson(agreement)}`));
}

/** Generate only on the independent reviewer's own device; never share preimage before approval. */
export async function createReviewerSecret() {
  const secret = webCrypto().getRandomValues(new Uint8Array(32));
  try {
    return Object.freeze({ preimageHex: bytesToHex(secret), hashLockHex: await sha256Hex(secret) });
  } finally { secret.fill(0); }
}

export async function verifyReviewerSecret(preimageHex, hashLockHex) {
  try {
    const expected = hex32(hashLockHex, 'Reviewer hashlock');
    return await sha256Hex(hexToBytes(preimageHex)) === expected;
  } catch (error) {
    if (error instanceof AccordError && error.code !== 'CRYPTO_UNAVAILABLE') return false;
    throw error;
  }
}
