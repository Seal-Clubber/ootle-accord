# Wallet-authorized percentage review

New exports use `ootleaccord.agreement.v3`. Each milestone fixes one to ten distinct Sapient owner keys, an integer approval percentage from 1 to 100, the creator and a deadline. Checksummed base Esmeralda addresses supply public keys. No release secret is generated.

Votes required are `ceil(reviewer count × percentage / 100)`: 60% of five needs three; 67% of three needs all three. Non-voters stay in the denominator. Different view keys cannot make one owner key count twice. Reviewer independence remains a community responsibility.

The creator signs `submit_work(SHA256)` for a real work file. Reviewers sign `approve(index, same SHA256)`. Tari checks actual signer proofs. A reviewer votes once; the first vote prevents changing the work. Submission and votes fail at or after the deadline. Threshold completion is final. There is no negative vote, withdrawal, reviewer replacement, weighting, stage-order or work-quality enforcement. The component has no owner who can edit terms.

**This component holds no funds and implements no escrow deposits, payouts or refunds.** Future escrow must verify the component's template and immutable terms and enforce its quorum. An approval flag cannot unlock an existing HTLC. Private funding stays disabled due to the documented stock Sapient private-source limitation.

The adapter prepares fixed calls only for verified allowlisted deployments, with resumable wallet requests and enforced private fees. Unlisted agreements cannot spend through this path. See [the live Esmeralda demo and receipts](testnet-deployment.md). Five tests execute the real WASM in Tari's engine and check rounding, duplicate and forged votes, mismatched work, invalid configurations and deadlines. Testnet approvals used official walletd; installed-extension approval awaits the user's Sapient transaction.

Reading an address is not proof of ownership or approval. Identity lookup requests no balances, private view access or signature. The parser is checked against an independent Rust Bech32m vector, validates network and checksum, and extracts the owner key. It does not validate Ristretto points independently; chain signatures establish control.

Reviewer addresses, keys, work hashes, votes and transaction relationships are public. Private fees do not make reviews anonymous. Files are hashed locally; this app uploads no file contents. Only an explicitly signed fingerprint enters a transaction.

Old v1/v2 data stays distinguishable. The old secret-based claim option is removed from the website. Website updates cannot alter conditions on existing outputs; never relabel old recovery data as v3.

Primary references: [Tari signer proofs](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/template_lib/src/caller_context.rs), [Sapient request types](https://github.com/chironbuilds/tari-wallet/blob/master/src/lib/messages.ts), [instruction format](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/transaction/src/v1/instruction.rs).
