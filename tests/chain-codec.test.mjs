import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { decodeChainSubstate } from '../app/lib/stock-crypto/accord_sapient_client.js';
import { decodeSubstateResponse, decodeTransactionResponse } from '../app/lib/chain-codec.mjs';
await init({ module_or_path: await readFile(new URL('../app/lib/stock-crypto/accord_sapient_client_bg.wasm', import.meta.url)) });

// Public faucet component captured from the Esmeralda 0.49.1 indexer.
const encoded = 'ggCBgoVYIAECAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAggCAgqCCAIBBAIIAgIGB2IRYIAECAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

test('current indexer CBOR decodes with pinned Ootle types and retains the verification flag', async () => {
  const response = { version: 0, verified: true, state: { up: { substate: encoded } } };
  const decoded = await decodeSubstateResponse(response);
  assert.equal(decoded.verified, true);
  assert.equal(decoded.version, 0);
  assert.equal(decoded.state.up.substate.Component.header.owner_rule, 'None');
  assert.equal(typeof response.state.up.substate, 'string');
  const unverified = await decodeSubstateResponse({ ...response, verified: false });
  assert.equal(unverified.verified, false);
});

test('chain decoding rejects malformed base64 and trailing CBOR bytes', () => {
  assert.throws(() => decodeChainSubstate('not valid base64!'));
  const trailing = Buffer.concat([Buffer.from(encoded, 'base64'), Buffer.from([0])]).toString('base64');
  assert.throws(() => decodeChainSubstate(trailing));
});

test('already decoded fixtures and pending transaction results pass through', async () => {
  const response = { verified: true, state: { up: { substate: { Utxo: {} } } } };
  assert.equal(await decodeSubstateResponse(response), response);
  const pending = { result: { Pending: {} } };
  assert.equal(await decodeTransactionResponse(pending), pending);
  const pendingString = { result: 'Pending' };
  assert.equal(await decodeTransactionResponse(pendingString), pendingString);
  const result = { result: { Finalized: { final_decision: 'Commit', execution_result: { finalize: {} } } } };
  assert.deepEqual(await decodeTransactionResponse(result), result);
});
