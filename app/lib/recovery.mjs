import {
  AccordError, agreementId, canonicalJson, deepFreeze, hex32, onlyKeys, plainObject,
  rawUnits, validateAgreement, webCrypto,
} from './accord.mjs';

export const RECOVERY_SCHEMA = 'ootleaccord.recovery.v1';
export const CLAIM_SCHEMA = 'ootleaccord.claim.v1';
export const ENCRYPTED_SCHEMA = 'ootleaccord.encrypted-recovery.v1';
export const PBKDF2_ITERATIONS = 310_000;
const MAX_PLAINTEXT_BYTES = 131_072;
const MAX_ENVELOPE_BYTES = 262_144;
const encoder = new TextEncoder();

function fail(message, code = 'INVALID_RECOVERY') { throw new AccordError(message, code); }

/** Bounded JSON clone rejects prototypes, cyclic/deep input and oversized opaque condition trees. */
function boundedClone(value, { maxBytes = MAX_PLAINTEXT_BYTES, maxNodes = 2048, maxDepth = 24 } = {}) {
  let nodes = 0;
  const ancestors = new Set();
  function clone(item, depth) {
    if (++nodes > maxNodes || depth > maxDepth) fail('Backup structure exceeds supported limits.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string') {
      if (item.length > maxBytes) fail('Backup text exceeds supported limits.');
      return item;
    }
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) fail('Backup numbers must be exact integers.');
      return item;
    }
    if (typeof item !== 'object') fail('Backup contains a value that cannot be stored as JSON.');
    if (ancestors.has(item)) fail('Backup contains a circular reference.');
    ancestors.add(item);
    let output;
    if (Array.isArray(item)) {
      if (item.length > maxNodes) fail('Backup array exceeds supported limits.');
      for (let index = 0; index < item.length; index++) {
        if (!Object.hasOwn(item, index)) fail('Backup arrays cannot contain empty slots.');
      }
      output = item.map(child => clone(child, depth + 1));
    }
    else {
      plainObject(item, 'Backup field');
      output = {};
      for (const key of Object.keys(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('Backup contains a reserved field.');
        output[key] = clone(item[key], depth + 1);
      }
    }
    ancestors.delete(item);
    return output;
  }
  const result = clone(value, 0);
  if (encoder.encode(JSON.stringify(result)).length > maxBytes) fail('Backup exceeds the supported file size.');
  return result;
}

function parseBounded(input, maxBytes) {
  if (typeof input === 'string') {
    if (input.length > maxBytes || encoder.encode(input).length > maxBytes) fail('Backup exceeds the supported file size.');
    try { return boundedClone(JSON.parse(input), { maxBytes }); }
    catch (error) {
      if (error instanceof AccordError) throw error;
      fail('Backup is not valid JSON.');
    }
  }
  return boundedClone(input, { maxBytes });
}

function transactionId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /\s/.test(value)) fail('Missing or malformed wallet transaction ID.');
  return value;
}

function conditions(value) {
  const cloned = boundedClone(value, { maxBytes: 32_768, maxNodes: 512, maxDepth: 20 });
  if (!Array.isArray(cloned) || cloned.length !== 2 || cloned.some(leaf => !Array.isArray(leaf) || leaf.length < 1 || leaf.length > 8)) {
    fail('Recovery requires the wallet’s complete two-leaf HTLC conditions tree.');
  }
  for (const leaf of cloned) for (const atom of leaf) plainObject(atom, 'HTLC condition');
  return cloned;
}

function checkNetwork(value, expectedNetwork) {
  if (value !== 'esmeralda' || value !== expectedNetwork) fail('This backup belongs to a different or unsupported network.', 'WRONG_NETWORK');
}

async function publicContext(value, { expectedNetwork = 'esmeralda', expectedAgreementId, agreement } = {}) {
  checkNetwork(value.network, expectedNetwork);
  const normalized = validateAgreement(value.agreement);
  if (normalized.network !== value.network) fail('Backup and public agreement networks do not match.', 'WRONG_NETWORK');
  const id = await agreementId(normalized);
  if (id !== hex32(value.agreementId, 'Agreement ID')) fail('The public agreement does not match its recorded ID.');
  if (expectedAgreementId !== undefined && id !== hex32(expectedAgreementId, 'Expected agreement ID')) fail('Backup belongs to another agreement.');
  if (agreement && await agreementId(agreement) !== id) fail('Backup belongs to another agreement.');
  const stage = normalized.milestones.find(item => item.id === value.stageId);
  if (!stage) fail('Backup refers to a milestone absent from its public agreement.');
  return { agreement: normalized, agreementId: id, stageId: stage.id, network: value.network };
}

/**
 * Record the wallet's funding response immediately and encrypt/export before leaving the page.
 * The response acknowledges submission; this helper does not verify chain acceptance or
 * cryptographically prove that opaque conditions enforce the embedded agreement.
 */
export async function createPledgeRecovery({ agreement, stageId, amount, result }) {
  const normalized = validateAgreement(agreement);
  plainObject(result, 'Wallet funding result');
  return validatePledgeRecovery({
    schema: RECOVERY_SCHEMA,
    status: 'wallet-submitted',
    network: normalized.network,
    agreementId: await agreementId(normalized),
    agreement: normalized,
    stageId,
    amount: rawUnits(amount),
    transactionId: result.transactionId,
    commitment: result.ownCommitment,
    conditions: result.conditions,
    outputMask: result.outputMask,
  });
}

export async function validatePledgeRecovery(input, options = {}) {
  const value = parseBounded(input, MAX_PLAINTEXT_BYTES);
  onlyKeys(value, ['schema', 'status', 'network', 'agreementId', 'agreement', 'stageId', 'amount', 'transactionId', 'commitment', 'conditions', 'outputMask'], 'Recovery');
  if (value.schema !== RECOVERY_SCHEMA || value.status !== 'wallet-submitted') fail('Unsupported recovery format or verification status.');
  const context = await publicContext(value, options);
  return deepFreeze({
    schema: RECOVERY_SCHEMA,
    status: 'wallet-submitted',
    ...context,
    amount: rawUnits(value.amount),
    transactionId: transactionId(value.transactionId),
    commitment: hex32(value.commitment, 'Locked output commitment'),
    conditions: conditions(value.conditions),
    outputMask: hex32(value.outputMask, 'Refund output mask'),
  });
}

/** Claim handoffs deliberately omit the donation amount and refund mask. Send them privately. */
export async function createClaimHandoff(input) {
  const recovery = await validatePledgeRecovery(input);
  return validateClaimHandoff({
    schema: CLAIM_SCHEMA,
    status: recovery.status,
    network: recovery.network,
    agreementId: recovery.agreementId,
    agreement: recovery.agreement,
    stageId: recovery.stageId,
    transactionId: recovery.transactionId,
    commitment: recovery.commitment,
    conditions: recovery.conditions,
  });
}

export async function validateClaimHandoff(input, options = {}) {
  const value = parseBounded(input, MAX_PLAINTEXT_BYTES);
  onlyKeys(value, ['schema', 'status', 'network', 'agreementId', 'agreement', 'stageId', 'transactionId', 'commitment', 'conditions'], 'Claim handoff');
  if (value.schema !== CLAIM_SCHEMA || value.status !== 'wallet-submitted') fail('Unsupported claim handoff format or verification status.');
  const context = await publicContext(value, options);
  return deepFreeze({
    schema: CLAIM_SCHEMA,
    status: 'wallet-submitted',
    ...context,
    transactionId: transactionId(value.transactionId),
    commitment: hex32(value.commitment, 'Locked output commitment'),
    conditions: conditions(value.conditions),
  });
}

function passwordBytes(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    fail('Use a backup password of at least 12 characters (up to 1024).', 'INVALID_PASSWORD');
  }
  return encoder.encode(password);
}

function base64(bytes) {
  let binary = '';
  for (let start = 0; start < bytes.length; start += 16_384) binary += String.fromCharCode(...bytes.subarray(start, start + 16_384));
  return btoa(binary);
}

function unbase64(value, label, { exactLength, maxLength = MAX_PLAINTEXT_BYTES + 16 } = {}) {
  if (typeof value !== 'string' || value.length > Math.ceil(maxLength / 3) * 4 ||
      value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail(`${label} is not a supported base64 value.`);
  }
  let bytes;
  try { bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
  catch { fail(`${label} is not valid base64.`); }
  if (bytes.length > maxLength || (exactLength !== undefined && bytes.length !== exactLength) || base64(bytes) !== value) fail(`${label} has an invalid length or encoding.`);
  return bytes;
}

async function deriveKey(password, salt, usage) {
  const bytes = passwordBytes(password);
  try {
    const source = await webCrypto().subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await webCrypto().subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt },
      source, { name: 'AES-GCM', length: 256 }, false, [usage],
    );
  } finally { bytes.fill(0); }
}

function header(envelope) {
  return { schema: envelope.schema, cipher: envelope.cipher, kdf: envelope.kdf, iv: envelope.iv };
}

export async function encryptRecovery(input, password) {
  passwordBytes(password).fill(0);
  const recovery = await validatePledgeRecovery(input);
  const salt = webCrypto().getRandomValues(new Uint8Array(16));
  const iv = webCrypto().getRandomValues(new Uint8Array(12));
  const envelope = {
    schema: ENCRYPTED_SCHEMA,
    cipher: 'AES-256-GCM',
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: base64(salt) },
    iv: base64(iv),
  };
  const plaintext = encoder.encode(canonicalJson(recovery));
  try {
    const key = await deriveKey(password, salt, 'encrypt');
    const ciphertext = await webCrypto().subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: encoder.encode(canonicalJson(header(envelope))) },
      key, plaintext,
    );
    return deepFreeze({ ...envelope, ciphertext: base64(new Uint8Array(ciphertext)) });
  } finally { plaintext.fill(0); }
}

export async function decryptRecovery(input, password, options = {}) {
  const envelope = parseBounded(input, MAX_ENVELOPE_BYTES);
  onlyKeys(envelope, ['schema', 'cipher', 'kdf', 'iv', 'ciphertext'], 'Encrypted recovery');
  if (envelope.schema !== ENCRYPTED_SCHEMA || envelope.cipher !== 'AES-256-GCM') fail('Unsupported encrypted recovery version or cipher.');
  onlyKeys(envelope.kdf, ['name', 'hash', 'iterations', 'salt'], 'Backup key derivation');
  if (envelope.kdf.name !== 'PBKDF2' || envelope.kdf.hash !== 'SHA-256' || envelope.kdf.iterations !== PBKDF2_ITERATIONS) {
    fail('Unsupported backup key derivation settings.');
  }
  const salt = unbase64(envelope.kdf.salt, 'Backup salt', { exactLength: 16, maxLength: 16 });
  const iv = unbase64(envelope.iv, 'Backup IV', { exactLength: 12, maxLength: 12 });
  const ciphertext = unbase64(envelope.ciphertext, 'Backup ciphertext');
  if (ciphertext.length < 17) fail('Backup ciphertext is incomplete.');
  const key = await deriveKey(password, salt, 'decrypt');
  let plaintext;
  try {
    plaintext = new Uint8Array(await webCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: encoder.encode(canonicalJson(header(envelope))) },
      key, ciphertext,
    ));
  } catch { fail('The password is incorrect or the backup has been damaged.', 'DECRYPT_FAILED'); }
  try {
    return await validatePledgeRecovery(new TextDecoder('utf-8', { fatal: true }).decode(plaintext), options);
  } finally { plaintext?.fill(0); }
}
