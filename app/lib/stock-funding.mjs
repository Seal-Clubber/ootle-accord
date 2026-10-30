import { NATIVE_TARI_RESOURCE, rawUnits, fromRawAmount } from './accord.mjs';

const HEX = /^[a-f0-9]{64}$/;
export function fundingCoins(records) {
  if (!Array.isArray(records) || records.length > 512) throw new Error('Sapient returned an invalid private coin list.');
  const seen = new Set();
  return records.filter(r => r?.resourceAddress === NATIVE_TARI_RESOURCE).map(r => {
    if (!HEX.test(r.commitment) || seen.has(r.commitment)) throw new Error('Sapient returned an invalid or duplicate private coin.');
    seen.add(r.commitment);
    return Object.freeze({ commitment: r.commitment, amount: rawUnits(r.amount, 'Private coin', { allowZero: true }) });
  }).filter(c => c.amount !== '0');
}

/** Never redeem a larger coin: the stock method reveals the entire selected value. */
export function selectFundingCoins(records, amount, maxFee) {
  rawUnits(amount, 'Contribution'); rawUnits(maxFee, 'Maximum fee');
  const coins = fundingCoins(records.map(r => ({ ...r, resourceAddress: r.resourceAddress ?? NATIVE_TARI_RESOURCE })));
  for (const source of coins.filter(c => c.amount === amount)) {
    const fee = coins.filter(c => c.commitment !== source.commitment && BigInt(c.amount) > BigInt(maxFee))
      .sort((a,b) => BigInt(a.amount) < BigInt(b.amount) ? -1 : BigInt(a.amount) > BigInt(b.amount) ? 1 : 0)[0];
    if (fee) return Object.freeze({ source, fee });
  }
  const exact = coins.some(c => c.amount === amount);
  return Object.freeze({ source: null, fee: null, reason: exact
    ? 'An exact contribution coin exists, but a separate private coin larger than ' + fromRawAmount(maxFee) + ' tTARI is needed for fees.'
    : 'Prepare an exact ' + fromRawAmount(amount) + ' tTARI coin in Sapient first. A larger private coin will not be revealed.' });
}

export function assertLivePrivateCoin(response) {
  const utxo = response?.state?.up?.substate?.Utxo?.output;
  if (response?.verified !== true || !utxo || !HEX.test(utxo.auth?.Key)) throw new Error('A selected private coin is no longer verified and spendable. Refresh Sapient before paying.');
  return utxo.auth.Key;
}
