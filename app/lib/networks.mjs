export const NETWORKS = Object.freeze({
  esmeralda: Object.freeze({ name: 'Esmeralda', byte: 38, unit: 'tTARI', walletPrefix: 'otl_esm_', indexer: 'https://ootle-indexer-a.tari.com' }),
  mainnet: Object.freeze({ name: 'Mainnet', byte: 0, unit: 'TARI', walletPrefix: 'otl_', indexer: 'https://indexer-a.ootle.tari.com' }),
});

export function networkConfig(network) {
  if (!Object.hasOwn(NETWORKS, network)) throw new Error('Unsupported Ootle network.');
  return NETWORKS[network];
}
