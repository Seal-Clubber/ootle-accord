> **Legacy v1 reference.** New agreements use [Sapient wallet-authorized review](wallet-review.md). The secret-based HTLC behavior below applies only to old handoffs and recovery files. The new quorum approval component is deployed on Esmeralda and holds no funds. See [testnet receipts](testnet-deployment.md).

# Sapient integration

OotleAccord uses Sapient's injected `window.tari` provider and its create/approve/submit request flow. The target is Esmeralda testnet. It does not request a seed phrase or wallet view secret. Connecting and reading capabilities do not approve a payment; the person approves each proposed spend in Sapient.

Upstream behavior below was inspected on 29 October 2026 at wallet commit [`4db50f8`](https://github.com/chironbuilds/tari-wallet/tree/4db50f848cceb6e397e7fcc44081e1bc32ed1c70) and SDK commit [`52e0424`](https://github.com/chironbuilds/ootle-sdk-ts/tree/52e04247300a0d2ef6d8f825709976d15276b4b4). Installed releases can differ. Capability checks and an actual network demonstration are required; a version string alone is insufficient.

## Why funding is disabled

Sapient's `htlcFund` request accepts resource, amount, claimant, hashlock, refund epoch and fee policy. Its background dispatch calls `local.htlcFund(...)` without the SDK's final options argument. The SDK defaults that argument's source to `{ kind: "revealed" }`, spending the funding account's public resource balance. Asking for a private fee changes the fee lane; it does not change that funding source. [Wallet request type](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/src/lib/messages.ts), [wallet dispatch](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/src/background/index.ts), [SDK default and options](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/wallet.ts)

Accordingly, `fundMilestone` must fail before creating a transaction request. There is no transparent-funding fallback and no claim that simply adding an unrecognized `source` property enables privacy.

Enabling this path needs an upstream wallet change that exposes and validates the SDK's `{ source: { kind: "stealth" } }` option, forwards it into HTLC funding, describes it accurately in approval, and advertises a distinct capability for stealth-source HTLC funding. The application must require that capability and enforce private fees. A live test must inspect funding inputs/change, verify recoverable output-mask handling, and complete both claim and expiry/refund scenarios before removing the block. SDK support by itself is not dApp-provider support.

## Provider lifecycle

Detect `window.tari.isTariWallet` and listen for `tari#initialized` if injection is delayed. User-initiated connection uses `tari_requestAccounts`; then read `tari_getNetwork` and `tari_getCapabilities`. Reject a network mismatch. The connected component address is visible to the page, so do not describe connection as anonymous.

For supported HTLC actions require `transactionRequests`, `supportsPrivateFees` and the action-specific flags (`htlcFund` for funding; `scriptPathSpend` for claim/refund). Funding additionally needs the future explicit stealth-source capability and remains blocked today. Use the wallet's `otl_...` wallet address for the claimant, not a `component_...` address. Account changes invalidate the connection; recheck the account, network and capabilities before spending. [Provider reference](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/docs/integration/provider-api.md)

## Supported native request shapes

Values are decimal strings in the resource's raw units. Do not silently infer token divisibility from its display symbol. Each operation adds `feeType: "private"` and `enforceFeeType: true`, with an optional positive raw-unit `maxFee`.

| Kind | Operation fields |
| --- | --- |
| `htlcFund` — currently blocked | `resourceAddress`, `amount`, `claimantWalletAddress`, `hashLockHex`, `refundEpoch` |
| `htlcClaim` | `resourceAddress`, `commitment`, exact original `conditions`, `preimageHex` |
| `htlcRefund` | `resourceAddress`, `commitment`, exact original `conditions`, `amount`, `outputMask` |

Hashlocks use SHA-256 of raw preimage bytes. Claims are admissible strictly before the refund epoch; refunds are admissible at that epoch or later. The SDK currently expects a 32-byte preimage represented by 64 hex characters. Before requesting a claim, verify the imported agreement/handoff, intended claimant, expected hash, resource, deadline and preimage locally. The wallet must still check the actual output, root, amount, authorization and remaining claim window. Local JSON validation is not on-chain verification. [SDK condition helpers](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/htlc.ts), [SDK claim/refund validation](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/wallet.ts)

## Approval, submission and confirmation

1. `tari_createTransactionRequest` receives the operation and returns `{ requestId }`. Retain that identifier before polling.
2. Poll `tari_getTransactionRequest({ requestId })`. A human chooses approval or rejection in Sapient; there is no app-facing approval method.
3. On `approved`, submit that same identifier through `tari_submitTransactionRequest`. On `submitting`, continue reconciling the existing request. Never create a second payment because the first call timed out.
4. On `submitted`, recover the operation result from the persisted request's `result`. Rejection/failure, missing result or a network interruption needs inspection of the original request and wallet journal before retrying.
5. Look up the transaction separately with `tari_getTransactionResult({ transactionId })` and inspect the network execution outcome. A request status, transaction identifier or successful HTTP response is not by itself independent ledger-commitment evidence.

The current SDK internally polls HTLC network results before returning success and journals prepared recovery material. That is useful wallet behavior, not a reason to equate every provider's `submitted` label with confirmed settlement. An unknown outcome can follow a real broadcast; reconcile the original transaction and retained journal instead of treating an exception as proof that nothing happened. [Request lifecycle](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/docs/integration/transaction-requests.md), [request persistence and result lookup](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/src/background/index.ts)

## Funding result and handoffs

The upstream SDK's funding result contains `transactionId`, full `conditions`, `ownCommitment` and `outputMask`. Despite its name, `ownCommitment` is the claimant-addressed HTLC commitment. Recent SDK results can also contain `changeCommitment` and `journalId`. Use the result's named HTLC commitment; do not guess the correct output from its transaction position or confuse it with fee/change outputs.

Retain the donor's exact amount and mask with the original conditions in an encrypted recovery export. A creator claim handoff carries the commitment, resource, original conditions and agreed context; exclude `outputMask`. The creator needs those conditions even though only their root is committed on-chain. The donor's wallet cannot ordinarily decrypt an output addressed to the creator, so recovery cannot rely on fetching the mask from the ledger later. [Result interface and recovery implementation](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/wallet.ts)

Claim/refund results identify a transaction and may contain `receivedCommitment`, `amount` and `journalId`; the wallet message transport serializes bigint values for the page. Treat results as untrusted structured data, validate the required fields, and do not store sensitive results in ordinary browser persistence by default.

## Verification still required

The adapter can be checked with a mock provider, but that cannot validate an installed extension, faucet access, a real condition root, claim preflight disclosure or validator acceptance. No real-wallet lifecycle or successful Esmeralda transfer is recorded by this integration document. Older architecture pages contain stale capability statements; use the inspected request/dispatch code plus runtime capability checks and receipts as the basis for support claims.
