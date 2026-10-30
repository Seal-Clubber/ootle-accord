# Stock Sapient escrow — Esmeralda

Verified 30 October 2026. This v5 deployment uses stock Sapient’s existing private-fee redemption method and a new Ootle escrow template. No Sapient patch or intermediate app funding wallet is used.

## Completed live payout

The community wallet funded the remaining 3 tTARI and recorded the required vote. Two dedicated test-wallet votes completed the quorum. The fixed private **10 tTARI payout committed**, and the isolated recipient wallet decrypted/indexed it as an on-chain, unspent output of exactly 10 tTARI. The organizer then recovered its unused sponsor reserve. No campaign principal remains in escrow.

## Committed state

| Field | Value |
| --- | --- |
| Agreement | `3d2e19660a07385e212e86e80ff54e6e7d327105507b56e5ffe2763d57e1517d` |
| Template | `bc30266a3c2d025a02aa723b1de4396788c8c477b3dc1c5798bce4ca49a2d5a0` |
| Escrow | `component_1baffe14c156f3cea0aee845416827d72646b7285802a84ba2066d950d9d7fc1` |
| Goal / paid / remaining capacity | **10 / 10 / 0 tTARI** |
| Locked principal / paid flag | **0 tTARI / true** |
| Votes | **3**, including the required community reviewer |
| Quorum | 60% of five, rounded up to three; four reviewers share a test operator |
| Refund deadline | Chain epoch **14739** |
| Checkpoint | Component version **7**, epoch **12740** |
| Work fingerprint | `4e8c2271be43864ecad43eed76c01d1ba57b9d3b880840e4e0e782e1f0f55dfe` |

Review is rejected before full funding. After full funding, approval requires both the quorum and the community vote. Payout was fixed to the isolated test-wallet destination and is now complete. Older immutable escrows retain their earlier custody and receipts; this is a separate component.

## Live transaction receipts

| Operation | Receipt | Paid fee (tTARI) |
| --- | --- | --- |
| Publish optimized template | [58ef3328…](https://ootle-indexer-a.tari.com/transactions/58ef332896b0e1b717940d9ff928c0b0ed91431235ab84ead5276e5d7d34c344/result) | 3.592500 |
| Create escrow and separate 1.6 tTARI fee reserve | [1bee76ac…](https://ootle-indexer-a.tari.com/transactions/1bee76ac4e606f90fc9e7b581179e02dedc97504068161eee21c496e349303a1/result) | 0.014895 |
| Bootstrap isolated SDK test account with 8 tTARI and zero-value test memo | [ba5be865…](https://ootle-indexer-a.tari.com/transactions/ba5be865c8db15e6473649e541d06290734d1c80e65dcd5e935a8b81599c6219/result) | 0.016144 |
| Stock SDK private self-transfer preparing an exact 7 tTARI coin | [cc22ecd4…](https://ootle-indexer-a.tari.com/transactions/cc22ecd4e88bf6a53bea39ca05059e4dc9427fd6e8bb400f8c820722d5d3125c/result) | 0.015211 |
| Stock SDK escrow deposit, plus encrypted refund memo | [ae720780…](https://ootle-indexer-a.tari.com/transactions/ae720780bb5983e1697026465463027d893de78f42926c99e3427659a3f18bd0/result) | 0.100000 |
| Submit work; no votes cast | [c87606b5…](https://ootle-indexer-a.tari.com/transactions/c87606b5315aec8423970aea95975413ecb88ca4dd67e938283df50688926bb5/result) | 0.003162 |

All six receipts finalized with `Commit`. New paid fees total **3.741912 tTARI**. Including 5.414526 tTARI from earlier test work, the cumulative test fee ledger is **9.156438 tTARI**, below the authorized 10 tTARI fee limit. Transferred principal and the held 1.6 tTARI sponsor reserve are separate from fees paid.

### Completion receipts

| Operation | Receipt | Paid fee (tTARI) |
| --- | --- | --- |
| Final 3 tTARI contribution | [204572c4…](https://ootle-indexer-a.tari.com/transactions/204572c42dc6274a635645d40d0dae687f153a13f44adf6a07037be34d7ac28b/result) | 0.100000 |
| Required community vote, reviewer index 2 | [761433bd…](https://ootle-indexer-a.tari.com/transactions/761433bd6f8664f13d015a76301400b0bfcf627b008a1baf8da8a15dc226af62/result) | 0.100000 |
| Repeat community vote, fee intent only; no new vote | [00ca74f9…](https://ootle-indexer-a.tari.com/transactions/00ca74f9e5ad1176da5cf3d3ed43e471328e6a50d092a997fc879f136b39e73a/result) | 0.100000 |
| Test reviewer index 0 | [ff167535…](https://ootle-indexer-a.tari.com/transactions/ff167535eb3af4701c0afa7a3792e2393e855b884f1b3a623cf85bb531b8765b/result) | 0.003290 |
| Test reviewer index 1 | [7aa45043…](https://ootle-indexer-a.tari.com/transactions/7aa45043cd4c490f41905d8158e668a04d1a56b9c31713a6380d38f453eadcec/result) | 0.003290 |
| Full private 10 tTARI payout | [0e360bc4…](https://ootle-indexer-a.tari.com/transactions/0e360bc4d683c25fc843aeaa7a41e0fbb6f157e10ba5c133e065c6407d323b79/result) | 0.013246 |
| Return unused sponsor reserve | [f123a55e…](https://ootle-indexer-a.tari.com/transactions/f123a55e98ace8fc248a43c0baf03b32b7c7bbab903ed2fc157c91fb4fb9e026/result) | 0.003129 |

The agent-operated completion fees were **0.022955 tTARI**, bringing the isolated test-wallet fee ledger to **9.179393 tTARI**. The three participant-paid fees above are listed separately. The unused **1.586754 tTARI** sponsor reserve was returned to its original isolated wallet. Both the principal and sponsor vaults are empty. The payout is `utxo_0101010101010101010101010101010101010101010101010101010101010101_b6086d5d0fe7d3711ea3a94fe98146af35a6ec706df133eed5f6205ba9226b1d`; its authorization matches the agreement’s fixed payout key.

The repeat vote did not add an approval: its execution accepted fees and rejected the repeated vote. The app now checks the verified live reviewer bit before creating a wallet request, blocks repeats and paid accords, and keeps the button disabled after a successful vote. A page reload cannot bypass that check. A consensus `Commit` decision alone is not enough to establish successful execution; the accepted state transition and actual vote/output must also be checked.

[Current component](https://ootle-indexer-a.tari.com/substates/component_1baffe14c156f3cea0aee845416827d72646b7285802a84ba2066d950d9d7fc1), [published template definition](https://ootle-indexer-a.tari.com/templates/bc30266a3c2d025a02aa723b1de4396788c8c477b3dc1c5798bce4ca49a2d5a0).

## Stock wallet evidence

The test used **Sapient 0.6.17’s unmodified dependency `@chironbuilder/ootle-sdk` 0.1.30**, an agent-generated isolated seed, and Esmeralda. Wallet source was inspected at [e2f7bf9](https://github.com/chironbuilds/tari-wallet/tree/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c); SDK provider behavior is documented in the [wallet’s primary API reference](https://github.com/chironbuilds/tari-wallet/blob/e2f7bf9772faa35c4bce55f5e2b741a37b38a36c/docs/integration/provider-api.md). The test called `redeemStealthOutputWithPrivateFee` directly through the installed, unchanged SDK package.

Before broadcast, the decoded signed deposit was checked to exclude the test donor’s base public key and account component. It used the source and fee coins’ one-time signers. The exact-value source was 7 tTARI; a larger balance was not redeemed. The actual escrow state and native principal vault were verified after commit.

This is a stock-SDK network test, not an installed Chrome extension approval test. The browser calls the stock provider’s existing transaction request kind and checks `stealthRedeemPrivateFee`, `privateBalanceView`, `walletAddress`, `transactionRequests` and private-fee support. Accounts/releases without the capabilities fail before a spend is requested. Preparing an exact coin also requires `privateSpend`.

The live [Chrome Web Store listing](https://chromewebstore.google.com/detail/tari-ootle-wallet/demkeckolenopkgnfbnpflkpbbdhpgkl) was also checked directly: it showed **0.6.14**, updated 23 October 2026. The [0.6.14 source](https://github.com/chironbuilds/tari-wallet/tree/3b3dcac630e55a61756be576349914eca6187442) already exposes all of the provider methods/capabilities this flow needs. Its exact locked SDK **0.1.26** was installed unmodified into a separate test directory. It recovered and retained the actual zero-value refund memo from an empty ledger, and the restored binding matched the live escrow. Its `redeemStealthOutputWithPrivateFee` and `buildPrivateFeeInstructions` routines were byte-for-byte identical to the routines used by the tested 0.1.30 package. No additional funds were moved for this compatibility check. This does not claim a completed installed-extension approval.

## Memo-based refund recovery

Each contribution fixes a one-time refund key Q and public nonce R in the contract. A separate native zero-value output contains this structured message, encrypted to the donor’s public receiving view key:

`ootleaccord:v5:refund:<agreement ID>:<raw amount>:<private return nonce>`

The private nonce derives R and the fixed refund destination from the wallet’s public receiving keys. It cannot spend the wallet’s coins. It signs a fresh return statement for this component, action and pledge index, while the actual wallet spending secret stays in Sapient. A payout memo works the same way for the creator. Plaintext memos and private nonces are never posted to the chain or written to app storage.

The zero note is created within the escrow transaction using a **one micro-TARI round trip** from the sponsor vault: revealed input 1 → zero-value encrypted note + revealed return 1 → same sponsor vault. Native range/balance proofs enforce zero note value and return the full micro-unit. This does not subtract from campaign principal or consume sponsor principal.

Live checks established that the unmodified SDK decrypted the memo, retained the zero note in `listUnspentShieldedOutputs`, and recovered it again using an empty local ledger with the same isolated seed. The actual escrow refund memo was recovered this way and its amount, Q and R matched against verified contract state. A browser file is not the sole recovery source.

The app reads known receipt commitments from the verified contract, registers/decrypts owned notes through Sapient, restores their metadata and checks the fixed binding before enabling a return. Private view permission reveals private coin amounts and memos to the app; it does not reveal the seed, view secret or input spending keys. Any app with that permission should be trusted. Clearing a wallet’s local records does not delete the on-chain encrypted note, but wallet recovery still requires the original wallet secrets.

## Privacy boundary and limits

- **Public:** contribution amount, goal/remaining, fixed one-time return key/nonces, encrypted note IDs, transaction links, fees, timing, creator and reviewer identities/votes. The organizer’s test bootstrap also links preparation history.
- **Omitted from the deposit:** donor base account/address and base signing key. This does not guarantee that analysis of earlier transactions cannot identify a donor.
- **Private:** receiving wallet secrets, masks, input values outside the exact contribution, memo plaintext and return nonce. Sapient shares coin amounts/memos with this tab only after a view grant. Refund/payout ciphertext uses a fresh mask and native cipher nonce.
- **Custody:** the Ootle component’s principal vault holds real native TARI. The app has no funding wallet, backend custodian or payout address selector. Returns are fixed to wallet-controlled one-time keys.
- **Prototype limits:** one milestone per deployed escrow, up to 16 contributions, a fixed 0.1 tTARI sponsored return-fee budget per action, no contribution-slot abuse protection and no independent security audit. Create currently exports terms rather than deploying contracts.

## Validation scope

Three native lifecycle tests passed against both source-compiled code and the **exact 252,968-byte optimized artifact** published here: stale/over-cap deposits, full-funding and mandatory-reviewer payout gating, immutable private destinations, expiry refunds, nonce authorization, duplicate prevention and inability of an outsider to spend a returned output. A separate native test decrypts the zero-value receipt memo and verifies the micro-unit round trip.

The JavaScript tests cover browser WASM, exact private coin selection, stale state, permission refusal, account changes, memo restoration and saving public transaction IDs before broadcast. The interface has amount/Max, exact-coin preparation, direct stock-Sapient deposit, memo lookup and eligibility-gated return controls. Public native returns are simulated first and never blindly retried after an ambiguous network response.

The live community funding, required signature, quorum and full private payout are complete. The final 3 tTARI signed deposit was also checked to omit the known community reviewer’s base key. Public transaction history can still link funding and review activity. No independent inspection of the participant’s installed extension or claim of donor anonymity is made. Expiry refunds have been exercised in the native engine but not on the live paid campaign, whose contributions are now settled.

Before completion, network dry-runs rejected early refund with `Refund not eligible` and incomplete-funding payout with `Payout not authorized`. These checks did not broadcast transactions or pay fees. The later authorized payout passed a fresh dry-run, committed, and was verified in the recipient wallet.
