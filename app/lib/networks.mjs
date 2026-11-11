export const NETWORKS = Object.freeze({
  esmeralda: Object.freeze({ name: 'Esmeralda', byte: 38, unit: 'tTARI', walletPrefix: 'otl_esm_', indexer: 'https://ootle-indexer-a.tari.com' }),
  mainnet: Object.freeze({ name: 'Mainnet', byte: 0, unit: 'TARI', walletPrefix: 'otl_', indexer: 'https://indexer-a.ootle.tari.com' }),
});

export function networkConfig(network) {
  if (!Object.hasOwn(NETWORKS, network)) throw new Error('Unsupported Ootle network.');
  return NETWORKS[network];
}

export async function readCurrentEpoch(network, fetcher = globalThis.fetch) {
  const chain = networkConfig(network);
  const response = await fetcher(chain.indexer + '/network', {
    credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Could not read the current ${chain.name} epoch.`);
  const data = await response.json();
  if (data.network !== network || data.network_byte !== chain.byte || !Number.isSafeInteger(data.epoch) || data.epoch < 0) {
    throw new Error(`Could not verify the current ${chain.name} epoch.`);
  }
  return data.epoch;
}
