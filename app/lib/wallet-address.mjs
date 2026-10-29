// Ootle Bech32m layout: owner key (32 bytes), view public key (32 bytes), optional pay reference.
// Primary format: tari-project/tari-ootle v0.47.0 crates/ootle_address/src/{hrp,ootle_address}.rs.
const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

/** Validate address encoding and network; signing-key curve validity is enforced by Tari. */
export function reviewerKeyFromWallet(address) {
  if (typeof address !== 'string' || address.length > 240 || address !== address.toLowerCase()) throw new Error('Use a lowercase Sapient Esmeralda wallet address.');
  const separator = address.lastIndexOf('1');
  const hrp = address.slice(0, separator);
  if (hrp !== 'otl_esm_') throw new Error('The reviewer wallet must be on Esmeralda (otl_esm_1…).');
  const words = [...address.slice(separator + 1)].map(char => ALPHABET.indexOf(char));
  if (words.length < 6 || words.some(word => word < 0)) throw new Error('Invalid wallet address encoding.');
  const expanded = [...hrp].map(char => char.charCodeAt(0) >> 5).concat(0, [...hrp].map(char => char.charCodeAt(0) & 31));
  let checksum = 1;
  for (const value of [...expanded, ...words]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    GENERATORS.forEach((generator, index) => { if ((top >>> index) & 1) checksum ^= generator; });
  }
  if ((checksum >>> 0) !== 0x2bc830a3) throw new Error('Wallet address checksum does not match. Copy it from Sapient again.');
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  for (const word of words.slice(0, -6)) {
    accumulator = ((accumulator << 5) | word) & 0xffff;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); }
  }
  if (bits >= 5 || ((accumulator << (8 - bits)) & 255) !== 0 || bytes.length !== 64) throw new Error('Use a base wallet address without a payment reference.');
  const key = bytes.slice(0, 32).map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (/^0+$/.test(key)) throw new Error('The reviewer signing key cannot be zero.');
  return key;
}
