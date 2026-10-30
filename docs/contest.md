# October 2026 contest preparation

OotleAccord is being prepared for Tari's October 2026 privacy showcase. This document is a submission checklist and draft; it is not a submitted entry.

## Verified requirements

- Submit before **1 November 2026 at 00:00 UTC** (**01:00 Europe/Amsterdam**). This date follows the rule that a month's contest closes at the start of the next month in UTC.
- October's theme is **Spooky Secrets**, judged on demonstrations of Tari privacy. The application itself does not need seasonal branding.
- Use a new repository and new code created after the theme announcement on 1 October. The organizer allows newly created contracts or reusable libraries consumed by existing applications.
- Publish the source under an OSI-approved license. Do not borrow code from another submission.
- Council members and Tari Labs employees are ineligible. Agent-assisted development is permitted; code quality may affect judging.
- Post one entry in the official October forum thread, with a public source/app link, description, Tari prize-payment address and announcement on **Bluesky or Reddit**. Edit that post for later updates.

Sources checked 29 October 2026: [official rules and organizer clarification](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323/1), [October announcement and submission thread](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396).

## Sapient community bonus

A community sponsor offers 100,000 XTM across three places (50,000 / 30,000 / 20,000) to entries demonstrating the Sapient Web Extension. Official winners using the extension qualify first; otherwise the sponsor selects qualifying projects. The October deadline also applies. This is a community bonus, separate from the Council's judging: [bonus announcement](https://community.tari.com/t/spooky-secrets-community-bonus-contest/463).

## Evidence to finish before submitting

- Source repository created: [Seal-Clubber/ootle-accord](https://github.com/Seal-Clubber/ootle-accord).
- Deployed and funded: native private-output escrow on Esmeralda, goal 10 tTARI, two test approvals, required community vote outstanding. Publication, creation, shielding, funding and review receipts are in the [escrow ledger](private-escrow-testnet.md). No live payout or refund is claimed.
- Document the privacy boundary: what the public ledger, organizer, recipient, wallet and application host can each observe.
- Record validation commands and results. Label simulated, in-process and live-network evidence separately.
- Add a demonstration or screenshots showing Sapient approval and the resulting network receipt.
- Supply the prize-payment address and a public Bluesky or Reddit announcement URL.

Ootle mainnet is scheduled for 11 November 2026; the contest prototype targets Esmeralda testnet. The private escrow is deployed and funded on Esmeralda; this does not establish a mainnet lifecycle. See [official launch announcement](https://tari.com/updates/2026-09-01-update-143) and [official wallet setup](https://ootle.tari.com/guides/setup-a-wallet/).

## Forum submission draft — complete placeholders before posting

**OotleAccord — community funding with deliberate privacy boundaries**

Source (MIT): [Seal-Clubber/ootle-accord](https://github.com/Seal-Clubber/ootle-accord)

Demo: [GitHub Pages](https://seal-clubber.github.io/ootle-accord/#explore). Open the 10 tTARI accord and choose Review work.

OotleAccord is a new native-output escrow template and small browser app for community milestone funding. Its v4 agreement fixes the funding cap, deadline, creator, one-time payout key, reviewer list, approval percentage and one required reviewer. A real 10 tTARI example is fully funded on Esmeralda. Two test reviewers have approved; the required community reviewer has not, so payout remains locked. Four test reviewers share an operator and are not independent.

The escrow's private native inputs, range/balance proofs and additional opening proof tie real locked output value to a public funding counter. The contract rejects contributions above remaining capacity atomically. The app displays remaining tTARI and a Max control, disabled when the goal is full. Payout requires the percentage quorum, the mandatory reviewer and a creator signature, then goes only to the fixed private destination. After the deadline, eligible unpaid pledges can be refunded only to their precommitted one-time keys. Donors must retain recovery data.

**Privacy tradeoff:** output amounts and masks are encrypted, and the donation transaction uses one-time spending/signing keys without the donor's base account/key. Exact public counter changes still reveal donation sizes. Transaction graph, timing, fees, public creator/reviewer identities and the documented public test-wallet shielding step remain visible. This is not evidence of donor anonymity. No donor roster, analytics, remote fonts or wallet balance/view grant is used. Balance refresh is explicit and contacts the pinned public Tari indexer; the browser relies on its verification.

**Sapient integration:** reviewer identity and fixed allowlisted work/approval calls, Esmeralda/capability checks, resumable requests and enforced private fees. The community reviewer must complete the installed-extension approval. General Sapient private escrow donations remain disabled because the inspected stock provider does not expose this custom proof flow; the real test was funded with the native private client. Create saves public v3 review terms and does not deploy new escrows.

**Evidence:** [committed funding/review receipts, terms and limits](private-escrow-testnet.md), [verification ledger](verification.md), 64 passed JavaScript tests with one Windows permission skip, six native Tari-engine escrow tests and an additional encrypted funding/payout engine test. The earlier quorum template has five engine tests. No live payout, live refund, installed-extension round trip or independent audit is claimed.

It is an original implementation inspired by the community-funding problem explored by Threshold. October work includes canonical agreements, exact native-TARI amounts, wallet-address decoding, the review/escrow templates, private proof client, recovery helpers, resumable Sapient adapter and the dark app. No Threshold source was copied.

**Development disclosure:** developed with AI coding assistance under the submitter's direction. Testnet results and privacy limits are documented; experimental software, not an independently audited production service.

Tari prize-payment address: **[MAINNET_TARI_XTM_PRIZE_ADDRESS]**

Bluesky or Reddit announcement: **[PUBLIC_ANNOUNCEMENT_URL]**

Only the account owner should publish the announcement and submit this entry. Nothing has been submitted externally by preparing this file.
