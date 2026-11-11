import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NATIVE_TARI_RESOURCE, QUORUM_AGREEMENT_SCHEMA } from '../app/lib/accord.mjs';
import { MAINNET_ESCROW_TEMPLATE, prepareMainnetEscrow } from '../app/lib/escrow-create.mjs';
import { MAINNET_ACCORDS } from '../app/lib/mainnet-accords.mjs';
import init from '../app/lib/stock-crypto/accord_sapient_client.js';
import { reviewerKeyFromWallet } from '../app/lib/wallet-address.mjs';

test('a publisher can sponsor an accord whose submission and payout belong to the developer', async () => {
  const { agreement } = MAINNET_ACCORDS[0];
  const [{ requiredReviewerPublicKey, payoutPublicKey, payoutNonce, ...stage }] = agreement.milestones;
  const draft = { ...agreement, schema: QUORUM_AGREEMENT_SCHEMA, milestones: [stage] };
  const developerKey = reviewerKeyFromWallet(draft.creatorWalletAddress, 'mainnet');
  const publisherKey = stage.reviewers[0].publicKey;
  assert.notEqual(publisherKey, developerKey);

  const account = `component_${'a'.repeat(64)}`;
  const vault = `vault_${'b'.repeat(64)}`;
  const verified = substate => ({ verified: true, state: { up: { substate } } });
  const entries = [[
    { tag: 131, value: { hex: NATIVE_TARI_RESOURCE.slice(9) } },
    { '@cbor': 'tag', tag: 132, value: { '@cbor': 'bytes', hex: vault.slice(6) } },
  ]];
  const component = { header: { owner_rule: { ByPublicKey: publisherKey } }, body: { state: [{ entries }] } };
  const balance = { address: NATIVE_TARI_RESOURCE, revealed_amount: 1700000 };
  const responses = new Map([
    ['/network', { network: 'mainnet', network_byte: 0, epoch: 38470 }],
    [`/substates/${account}`, verified({ Component: component })],
    [`/substates/${vault}`, verified({ Vault: { resource_container: { Stealth: balance } } })],
  ]);
  const fetcher = async url => Response.json(responses.get(new URL(url).pathname));
  await assert.rejects(prepareMainnetEscrow(draft, 2, account, developerKey, fetcher), /verify the connected Sapient account/);

  const wasm = await readFile(new URL('../app/lib/stock-crypto/accord_sapient_client_bg.wasm', import.meta.url));
  await init({ module_or_path: wasm });
  const prepared = await prepareMainnetEscrow(draft, 2, account, publisherKey, fetcher);
  const [withdraw, , constructor] = prepared.operation.instructions;
  assert.equal(withdraw.CallMethod.call.Address, account);
  assert.equal(constructor.CallFunction.address, MAINNET_ESCROW_TEMPLATE.slice(9));
  const args = constructor.CallFunction.args;
  assert.equal(args[3].Literal, `5820${developerKey}`);
  assert.ok(args[11].Literal.includes(`5820${publisherKey}`));
  assert.equal(prepared.agreement.creatorWalletAddress, draft.creatorWalletAddress);
});
