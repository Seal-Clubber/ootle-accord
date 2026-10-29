# Wallet-authorized milestone review

New agreement exports use `ootleaccord.agreement.v2`. Each milestone names a reviewer wallet address. The app decodes its public owner key from the checksummed Esmeralda address. There is no generated release secret, hashlock or reviewer secret file in the new flow.

The reviewer connects Sapient and shares its reported wallet address with the organizer. Reading that address is not proof of ownership or an approval. It requests no private balances or view access. An actual transaction signed by the designated key is required to approve.

## Authorization component

`crates/accord-review-template` is an original Tari template pinned to `tari_template_lib = 0.35.0`. Each component fixes an agreement ID, milestone ID, reviewer public key and chain deadline. `approve()` checks a real transaction-signer proof for the designated reviewer, refuses approval at or after the deadline, and records approval once. The component has no owner who can edit these terms.

This component **holds no funds and does not implement escrow payouts or refunds**. An escrow must first verify its template identity and immutable terms, then enforce this component's decision. A standalone approval flag cannot release a legacy HTLC. Funding and escrow integration remain unfinished.

The Sapient adapter prepares only the fixed `approve()` call for an allowlisted milestone deployment, using the existing resumable request lifecycle and enforced private fees. The allowlist is empty until deployment, terms and engine behavior have been verified. Pasting an arbitrary component address cannot enable this path. No reviewer approval transaction is created for an unverified deployment.

## Validation and status

The template builds for `wasm32-unknown-unknown` with the pinned library. This establishes compilation, not validator acceptance. Engine authorization tests, deployment and live Sapient approval receipts remain outstanding. The website says this explicitly and cannot currently record a live review approval.

Address decoding is checked against a vector generated independently with Rust `bech32` 0.11.1. It validates Bech32m encoding and the Esmeralda prefix, extracts only the owner public key, and accepts base wallet addresses without payment references. Tari's transaction-signature verification must establish actual control of that key. The parser does not independently validate Ristretto points.

Old v1 agreements and encrypted recovery records remain readable as legacy data. The legacy claim form is inside an explicitly labeled disclosure. Changing a website cannot replace conditions on an existing output. Never relabel a v1 recovery record as v2.

## Privacy

Reviewer wallet addresses, public keys and approval transactions are public. Reusing a reviewer wallet creates a link across its reviews. Signing through Sapient does not make that activity anonymous. No donation amounts are required in an approval call, and review does not require access to a contributor's balance.

The previously documented private-source funding limitation remains unresolved. New private funding stays disabled.

Primary references: [Sapient request types](https://github.com/chironbuilds/tari-wallet/blob/master/src/lib/messages.ts), [Tari transaction signer proofs](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/template_lib/src/caller_context.rs), [Ootle address format](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/ootle_address/src/ootle_address.rs), [network prefixes](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/ootle_address/src/hrp.rs), [instruction format](https://github.com/tari-project/tari-ootle/blob/v0.47.0/bindings/src/types/Instruction.ts).
