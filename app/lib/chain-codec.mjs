import { decodeChainSubstate, decodeChainExecution } from './stock-crypto/accord_sapient_client.js';
import { loadStockCrypto } from './stock-client.mjs';

async function decode(value, decoder) {
  if (typeof value !== 'string') return value;
  if (!value || value.length > 24 * 1024 * 1024) throw new Error('Invalid encoded chain response.');
  await loadStockCrypto();
  return JSON.parse(decoder(value));
}

export async function decodeSubstateResponse(response) {
  const up = response?.state?.up;
  if (!up || typeof up.substate !== 'string') return response;
  return { ...response, state: { ...response.state, up: { ...up, substate: await decode(up.substate, decodeChainSubstate) } } };
}

export async function decodeTransactionResponse(response) {
  const final = response?.result?.Finalized;
  if (final) return { ...response, result: { ...response.result, Finalized: {
    ...final, execution_result: await decode(final.execution_result, decodeChainExecution),
  } } };
  if (typeof response?.result === 'string' && response.result !== 'Pending') return { ...response, result: await decode(response.result, decodeChainExecution) };
  return response;
}
