## Live community approval and private payout — 30 October 2026

The final 3 tTARI contribution and required community signature committed on the v5 escrow. Two dedicated test reviewers then approved the same work, completing three-of-five including the mandatory reviewer. The fixed private **10 tTARI payout committed** in `0e360bc4d683c25fc843aeaa7a41e0fbb6f157e10ba5c133e065c6407d323b79`. The recipient wallet indexed/decrypted the output as **10,000,000 raw units, Unspent, on-chain**, with the exact precommitted authorization key. The unused 1.586754 tTARI sponsor reserve was returned to its original wallet. Both escrow vaults are empty; component version 7 at epoch 12740 is paid with votes `[true, true, true, false, false]`.

A repeat community approval committed only its fee intent and did not add a vote; it cost 0.1 tTARI. The app now reads the verified reviewer bit before creating a v5 approval request, blocks an already-voted reviewer or paid/not-ready escrow, and binds the check to the same wallet connection. The button stays disabled after the current session’s successful vote. Regression tests verify that these blocked cases create no wallet request and charge no new fee. The paid checkpoint renders immediately as **Paid to creator · 10 tTARI**, with no funding capacity, even before a live refresh.

99 JavaScript tests passed with one Windows symlink-permission skip. The earlier full Rust CI passed, including source and deployed-artifact lifecycle tests. A real browser under the application CSP also generated the funding proof, encrypted memo and restoration successfully without a wallet connection. The [completion ledger](sapient-escrow-testnet.md) separates actual accepted execution from a fee-only outcome, records the recipient-wallet verification and lists all completion receipts. Expiry refunds remain engine-tested rather than executed on this now-paid campaign.

## Stock Sapient deposits and memo recovery — 30 October 2026

The new v5 escrow is published and funded **7/10 tTARI** using the unchanged Sapient SDK 0.1.30. Publication, creation, isolated test-account bootstrap, exact private coin preparation, escrow funding and creator work all finalized with Commit. Component version 2 at epoch 12739 records zero votes and 3 tTARI remaining. The community reviewer is mandatory and approval remains closed until full funding. The exact deposit was inspected before broadcast to exclude the donor base key/account. See [committed receipts, fees and privacy boundaries](sapient-escrow-testnet.md).

The encrypted zero-value refund memo was recovered with a fresh SDK ledger and the same isolated seed, then matched to the actual on-chain amount, refund key and public nonce. No browser recovery file is required. This is a structured encrypted receipt, rather than treating arbitrary memo text as proof of a donation. The app requests private view access only through explicit funding/memo actions; decrypted records stay in memory.

The three new lifecycle tests passed against source-compiled escrow code and the exact optimized deployed binary, including the CI-pinned Rust 1.97.1 toolchain. A separate native engine test verifies memo decryption and the one-micro-TARI round trip. The JavaScript suite passed 97 tests with one Windows symlink-permission skip. Coverage includes actual browser WASM, artifact integrity, precise coin selection, cap/stale checks, account changes, memo lookup and public-return duplicate guards. Installed Chrome-extension approval and live payout/refund remain unexecuted. The real 7 tTARI stays locked.

The current Web Store release 0.6.14 was checked against its exact locked SDK 0.1.26: the required provider APIs exist, its deposit/private-fee routines match the 0.1.30 routines used live, and its fresh ledger recovered the actual escrow refund memo. No custom wallet build or additional transfer was needed for that check.

The UI shows the new accord first, stock-Sapient amount/Max and funding controls, encrypted memo recovery, and older tests in a collapsed section. Public chain state refreshes automatically without wallet permission prompts; amount input survives a balance refresh. There is no intermediate app funding wallet or Sapient fork.

The entries below are historical; their funding restrictions refer to earlier protocols and deployments.

## Second accord funded 7/10 — 30 October 2026

A second immutable component reuses the qualified escrow template. Constructor, public shielding bootstrap, private-input 7 tTARI funding and work submission committed on Esmeralda. The native client dry-run checked a 10 tTARI target, 7 funded and 3 remaining before broadcasting its saved signed envelope. The final checkpoint is version 2 at epoch 12737, with zero votes, the community reviewer required and paid false. The first escrow was not spent to fund this one. See [the second accord's receipts](partial-escrow-testnet.md).

The app renders two independent cards and binds review selection to each agreement, work fingerprint and allowlisted component. Max shows 3 for the second accord, and approval stays disabled until a matching-work snapshot is fully funded. An asynchronous wallet connection cannot approve a different accord selected in the meantime. 77 JavaScript tests passed with one Windows symlink-permission skip. The changed private client compiled and its real 7 tTARI statement was accepted in a live dry-run and committed funding transaction. General Sapient donations remain unavailable; the contract cap stays authoritative.

## Clearing a failed wallet request — 30 October 2026

The Review screen now shows a previous-request recovery box whenever there is a recoverable request ID. After checking the request in Sapient, the user confirms that it failed or was rejected and chooses **Clear failed request**. The adapter rereads the wallet's status without requesting private balance/view access or submitting anything. It clears only a `failed`/`rejected` local ID; pending, approved, submitting, submitted, unknown, unreadable and account-changed outcomes remain guarded. An unknown-create marker still requires the existing manual reconciliation path.

Clearing the ID does not cancel a wallet/network transaction or erase the wallet's record. It only allows a new, separately approved request after the user has checked the previous outcome. The app no longer directs failed requests back into the Resume loop. 74 JavaScript tests passed with one Windows symlink-permission skip, including terminal-status checks, acknowledgment, live-status refusal, unavailable reads, account changes and an explicitly requested fresh operation after clearing.

## Spent private approval-fee output — 30 October 2026

Both official Esmeralda indexers report the user-supplied native-TARI UTXO as down. The escrow still records 10 tTARI locked, two votes and the required vote false at epoch 12736. The review instruction has no donor UTXO inputs, so this points to the wallet-generated private fee lane. It does not mean the escrow payout happened.

Approval and creator-submission requests now declare the allowlisted component's known public inputs before signing; the funded escrow additionally declares its immutable authority vault/resource and native TARI resource. This avoids depending on the wallet's discovery retries for those inputs. The upstream SDK currently prepares a private fee proof outside its execute retry loop; reuse after a fee-consuming failed attempt is a possible cause, not established for this user's request. A wallet-side stale coin record is also possible.

The approval adapter recognizes a specific native-TARI `Input substate … is down` error, explains wallet refresh/reconciliation, preserves the existing request ID and never retries or switches to revealed fees. Generic 404s, timeouts and other resources are not classified as spent approval-fee coins. The default review fee cap is reduced from 1 to 0.1 tTARI; the user can still change it before signing. 70 JavaScript tests passed with one Windows symlink-permission skip.

Recovery remains a wallet action: open/unlock Sapient's home screen on Esmeralda and let its private-payment scan and spent-output pruning finish. Check the failed request/history, reconcile the app's local request marker, then create a fresh approval. The site requests no private balance or view grant and cannot repair the wallet's coin database itself. See [Sapient's popup scan handler](https://github.com/chironbuilds/tari-wallet/blob/master/src/background/index.ts) and [SDK fee selection/pruning](https://github.com/chironbuilds/ootle-sdk-ts/blob/master/src/wallet.ts). A successful installed-wallet approval remains outstanding.

## Wallet approval error reporting — 30 October 2026

Approval, creator-submission and request-resume failures now remain beside the approval button with a Copy error action. General error notices no longer time out. Provider errors preserve the method name, original error code and message, including plain EIP-1193 error objects. A positively identified unsupported create method clears only its impossible request marker; uncertain create errors and unsupported polling methods keep the duplicate-spend guard and existing request ID. No fallback transaction path or fee-privacy downgrade is used.

68 JavaScript tests passed, with one Windows symlink-permission skip. Four new regression cases check error preservation, unsupported create handling, ambiguous failures and retention of existing request IDs. The user's exact installed-wallet failure still needs to be captured; this change does not establish a successful installed-Sapient approval. Chrome UI inspection was unavailable because the automation could not verify the browser URL.

# Private escrow update — 30 October 2026

A capped 10 tTARI escrow is funded on Esmeralda with native private outputs, one-time donor signing keys and private fee inputs. Component version 4 records two votes; the mandatory community reviewer is false and paid is false. The full remaining counter is 0. Publication, creation, public shielding, private funding, work and both test votes have committed receipts. See [current evidence and fee ledger](private-escrow-testnet.md).

64 JavaScript tests passed, with one Windows symlink-permission skip and no failures. Six Tari-engine escrow tests and a separate real encrypted-client funding/payout test passed. The earlier five quorum-engine tests remain. The browser counter accepts only pinned, verified indexer responses with matching immutable terms; refresh is explicit and sends no wallet data. Max uses exact raw units, closed campaigns disable it, and the chain enforces the cap even when quotes race.

No live payout or refund has been performed. Installed Sapient approval remains for the community reviewer to do; wallet-provider tests are mocks. General Sapient private escrow funding remains disabled. Create exports public terms only. Independent security review remains outstanding. Exact public totals expose amounts by subtraction, and this test's bootstrap/graph is public.

The entries below record earlier versions and historical evidence.

## Simplified app interface

The current interface has Accords, Create and Review tabs. The marketing layout, local sandbox and legacy recovery screen were removed. Earlier browser evidence for those removed screens below is historical. The deployed agreement remains reachable directly from Accords.

## Sapient connection restoration

58 JavaScript tests passed with one Windows symlink-permission skip. Ten new tests cover restoring an already-approved origin after refresh, locked/unlocked wallets, concurrent lifecycle checks, disconnect/disposal races, revoked permission, wrong network, a Connect click during restoration delayed provider injection, slow checks, reviewer actions during restoration and Connect/Disconnect ordering. Pending transaction IDs remain intact and no account address or authorization token is written to storage. Restoration only calls `tari_getAccounts`, then network and capability reads for an existing connection; it never requests permission, signs, submits, reads balances or grants view access. The app rechecks on startup, pageshow, focus, becoming visible and provider initialization. The logo uses hash navigation without reloading.

The passive lookup follows Sapient's [provider API](https://github.com/chironbuilds/tari-wallet/blob/master/docs/integration/provider-api.md) and [background implementation](https://github.com/chironbuilds/tari-wallet/blob/master/src/background/index.ts). Sapient's own lock and connection-revocation behavior remains authoritative. An installed-extension lifecycle test remains separate from the mock regression suite.

# Percentage-quorum update — 30 October 2026

48 JavaScript tests passed, one Windows symlink-permission skip, no failures. Five real Tari-engine tests passed in Ubuntu: 3-of-5 gating, rounding/unanimity, forged and duplicate votes, work mismatch/change, deadlines and invalid reviewer/threshold configurations. The template and immutable component terms were verified against actual committed Esmeralda receipts. Creator work and two reviewer approvals committed. See [deployment details and fee ledger](testnet-deployment.md).

The app allows only the verified demo component. It enforces private fees for Sapient requests and reads no balances or private view data. Wallet request tests use a mock; a successful installed Sapient transaction remains outstanding. This component holds no funds. Private funding and escrow integration are unfinished.

The following ledger records the earlier v1 prototype and is historical.

# Verification ledger

Recorded 29 October 2026. This ledger distinguishes implemented application behavior from network evidence.

| Check | Result |
| --- | --- |
| `node --test` | 35 passed, 1 skipped, 0 failed. The skipped case needs Windows permission to create a file symlink; traversal and other server tests passed. |
| `node scripts/check.mjs` | JavaScript syntax and 13 page references passed. |
| `node scripts/build.mjs` | Static build passed; generated output contains application assets and documentation. |
| Local browser sandbox | Pledges remain local; early refund is rejected, expiry enables unpaid refund, reset clears the simulation. |
| Local reviewer tools | Secret/hashlock generation and explicit clearing worked. |
| Agreement designer | Synthetic public agreement exported with its deterministic agreement ID. |
| Encrypted recovery import | Synthetic backup decrypted locally, displayed its exact 12.345678 TARI amount, and cleared when locked. |
| Wallet discovery | Missing-extension path checked. Connection never requests private balance access. |
| Responsive layout | Checked at 390px and 1440px widths; no page-wide horizontal overflow. Mobile navigation uses a two-column layout. |
| Browser console | No errors or warnings reported during the checked flows. |
| Stock Sapient funding guard | Tests establish that no funding request is created, even if the wallet reports native HTLC support. |

Wallet tests use a mock provider. Synthetic browser fixtures are local and ignored by Git. They contain no real wallet information, usable outputs or funded balances.

## Outstanding evidence

- An installed Sapient extension round trip, including recovery after page reload and account changes.
- A wallet release that exposes verified private-source HTLC funding; the inspected stock provider does not.
- Fresh Esmeralda funding, claim and refund transactions, with chain acceptance and privacy verified from actual receipts.
- Cryptographic validation that a funded output's conditions implement the full public agreement. Current recovery import validates structure and agreement identity only; the wallet enforces the actual native conditions.
- Independent security review.

The quorum template is now published; see the current update above. No test here establishes a completed live campaign payment or refund.
