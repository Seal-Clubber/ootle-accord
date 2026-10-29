# Privacy and trust boundaries

OotleAccord aims to keep pledged values and recipient outputs confidential while using native conditional payments. That goal does not make the whole workflow anonymous. **New pledge funding is currently disabled:** the inspected stock Sapient dApp route withdraws a revealed public balance, so it cannot deliver the intended private funding boundary. Existing compatible HTLC claim/refund support is a separate path. See [integration limits](sapient.md).

## Who can observe what

| Observer | Information available |
| --- | --- |
| Public ledger observer | Transaction identifiers, timing, fees, input/output graph and commitments. A script-path spend reveals the exercised condition leaf, its relevant signing identity and, on claim, the preimage. |
| Creator | Its claimant wallet can decrypt an addressed HTLC's amount. The private claim handoff contains the complete conditions, including the donor refund key, so the creator can link that pledge to that key. |
| Donor | Its pledge amount, complete conditions, output commitment and refund opening. It knows the intended creator and milestone. |
| Reviewer | The secrets it generates and whatever work, pledge records or amounts participants disclose for review. The agreement does not grant a wallet view key. |
| Application/browser | The agreement, amount entered, imported handoffs, reviewer secret and recovery plaintext while those are open in the page. Wallet signing keys and view secrets remain in Sapient. |
| Wallet/indexer/operator | The wallet handles payment amounts and signing material. Requests, submissions and default claim preflight can send sensitive transaction data to the configured indexer, including the claim preimage. A web host can observe requests for application files and connection metadata. |

Tari hides a stealth output's amount and one-time recipient key cryptographically, but transaction structure remains observable. A public amount at funding, a reused account, nearby timing or a known handoff can still associate transactions. The public amount of a fee remains visible even when that fee is paid from a private UTXO. [Official Tari privacy model](https://ootle.tari.com/concepts/privacy/), [official application boundaries](https://ootle.tari.com/concepts/privacy-in-applications/)

## Private fees are a limited guarantee

OotleAccord requests `feeType: "private"` with `enforceFeeType: true` for supported wallet actions. It refuses unsupported capabilities rather than falling back to transparent fees. This chooses the wallet's private fee source; it does not hide the fee amount or every transaction signer.

Native HTLC claim and refund branches require the claimant's or funder's public-key authorization. The revealed script leaf and signature can expose that identity, regardless of the fee source. A complete handoff also includes both branch keys before either branch is exercised. Reusing these keys across pledges increases linkage. [Sapient operation contract](https://github.com/chironbuilds/tari-wallet/blob/4db50f848cceb6e397e7fcc44081e1bc32ed1c70/src/lib/messages.ts), [HTLC condition construction](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/htlc.ts)

## Secret handling

The reviewer generates a unique random secret independently and shares only its hash until approval. Do not put secrets in public agreements, URLs, issue reports, screenshots or source control. After approval, give the creator the secret through a private authenticated channel; claiming publishes it. The same milestone secret links its claims once public. A stolen secret enables the designated creator to claim early, and a reviewer can collude with the creator.

The creator must receive the original complete `conditions` tree through a private claim handoff. Its root is on-chain, but the full unused branch cannot be reconstructed from that root. Send only the claim handoff to the creator; retain the refund opening separately. Authenticate both parties and independently check the resource, claimant, hash and deadline.

`outputMask` is sensitive recovery material. It is the blinding opening for the pledge commitment and can expose the amount when combined with the record. It does not replace the funder's signing key, but it must remain in the donor's recovery backup. Encrypt recovery exports with a strong passphrase, keep that passphrase separately and maintain an offline copy. Encryption protects an unopened export; it cannot protect plaintext from a compromised browser, extension or device after decryption.

## Review and accounting are trusted processes

Campaign goals and progress are agreement terms, not private on-chain arithmetic. A reviewer must decide whether the information provided is sufficient to approve. A declared total, editable JSON file or screenshot is not a cryptographic proof of funded value. If participants publish exact running totals, differences can reveal individual contributions. The prototype has no automatic public donor roster or independently verified campaign-wide total.

There is no on-chain reviewer identity, quorum or stage-order enforcement. Hashlocks implement control by possession of a secret. They cannot prove that work was completed or that its reviewer was independent.

## Verification status

The privacy analysis above describes the intended protocol and inspected upstream behavior. Local tests of application validation, encryption and wallet mocks do not establish validator acceptance, receipt privacy or successful refunds. Before enabling funding, verify the supported wallet feature, inspect actual Esmeralda receipts for disclosed amounts and accounts, and demonstrate the complete funding/claim/refund cycle. No independent security audit or live-network privacy proof is claimed here.
