# OotleAccord

Community milestone funding on Tari Ootle, with stock Sapient integration.

[Open OotleAccord on Mainnet](https://seal-clubber.github.io/ootle-accord/#explore) · [Esmeralda testnet](https://seal-clubber.github.io/ootle-accord/?network=esmeralda#explore)

The `SapientEscrow` template was published to **Ootle Mainnet** on **11 November 2026 at 05:26:28 UTC**. [Published template](https://indexer-a.ootle.tari.com/templates/151ae04f4b80eda9a45d37f0ae8c2c8b005eb6df6715c2a9eb14df68b6e4bbf3) · [Transaction receipt](https://indexer-a.ootle.tari.com/transactions/a9e8396052476dcad9d5e47fb02213a1e3eefd4cb77a919ffcbd6dd9095cb60d/result) · [WASM and build manifest](artifacts/mainnet)

The mainnet **Community accord** has a **10 TARI goal** and needs **three of five approvals**, including the creator's vote. The app reads the current funding and vote counts from the chain. [Mainnet accord and creation receipt](docs/mainnet-community-accord.md)

The Esmeralda demo was deployed on **7 November 2026** for **Ootle 0.49.1**. Its recorded checkpoint shows **2 of 10 tTARI funded**. It requires **three of five approvals including the mandatory community reviewer**. Four reviewers share a test operator. [Testnet deployment and privacy limits](docs/current-network-deployment.md)

The earlier 10 TARI private payout remains documented as a historical test. Those pre-reset contracts are archived in the app; they are no longer on the current Esmeralda network.

Contribution amounts and the exact remaining counter are public. The deposit uses one-time signing keys and omits the donor’s base wallet address. Wallet preparation, transaction history and timing can still link activity. This does not establish donor anonymity.

## Use it

Open **Community accord** on the network you want to use. Its verified remaining balance refreshes automatically.

1. Open the accord, then **Fund this accord**.
2. Choose an amount or **Max**, then **Check coins in Sapient**. This explicitly requests a private view grant to read coin amounts and memos; they stay in tab memory. Seeds, view secrets and wallet spending keys stay in Sapient.
3. If necessary, approve **Prepare exact coin**, a private transfer to yourself within Sapient. Then approve **Fund in Sapient** separately. Each transaction has a private fee limit of 0.1 TARI on Mainnet or 0.1 tTARI on Esmeralda. The app redeems the exact contribution coin.
4. After full funding, reviewers can approve the submitted work. Payout needs the percentage quorum and the mandatory reviewer.
5. **My refunds & payout → Find my memos in Sapient** recovers return metadata from encrypted, zero-value native outputs. Eligible unpaid contributions become refundable after the deadline to fixed private wallet destinations. A separate organizer fee reserve pays return fees.

There is no custom wallet build, funding relay or intermediate funding wallet in the app. The live demonstration used an isolated, agent-controlled account with the stock SDK; it does not substitute for a test of the installed Chrome extension. The app checks the actual provider capabilities and fails before spending if they are missing. The user still approves each wallet spend in Sapient.

Pre-reset escrows remain under **Earlier test accords** as historical records, with separate work and receipts. Their wallet controls are disabled. **Create** exports public agreement terms for deployment by the organizer.

## Run and check

Node.js 22 or newer is required. The static app has no npm dependencies to install; its browser crypto helper is included.

```sh
node app/server.mjs
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

Preview at [127.0.0.1:4173](http://127.0.0.1:4173/). The read-only server binds to loopback. `build.mjs` creates `dist/` from app assets and documentation, excluding `.local/`, wallet files, exports, native binaries and source artifacts.

The app refreshes public escrow state on startup, return to the tab and every 30 seconds while visible. It checks immutable terms, template, vaults, funding and votes using the pinned Tari indexer. No wallet read or prompt happens during these background checks. The browser trusts the indexer’s verification flag; it does not independently verify consensus proofs.

Sapient connections restore using passive reads of existing origin permission. Unresolved wallet requests retain their IDs and are resumed or explicitly reconciled before another transaction. Private coin summaries and decrypted memos are never written to browser storage. Native return tracking stores only public transaction/output identifiers, before broadcast, so an ambiguous response cannot trigger a new return automatically.

## Escrow and recovery

The `SapientEscrow` template fixes the goal, deadline, creator, payout key/nonce, reviewers, approval percentage and mandatory reviewer. Native TARI principal lives in its vault, whose balance must equal the funding counter. An expected-total check and exact cap reject stale or excessive deposits atomically. The mainnet template requires at least one sixteenth of the goal per contribution, rounded up, and accepts a smaller exact final contribution. Failed or stale transactions can still cost network fees.

Stock Sapient redeems one exact-value private input with a separate private fee input. The follow-up escrow call uses that bucket and creates an encrypted zero-value memo receipt for the donor. Each receipt contains a private return nonce; it is not a wallet spending key. That nonce authorizes fresh ciphertext to the fixed private return key and public nonce already bound on-chain. Action, component and pledge index are included in the authorization. Public masks and reusable public return proofs are not stored in the contract.

The deployed testnet escrow supports up to 16 contributions and reserves 1.6 tTARI separately for up to sixteen 0.1 tTARI return fees. Principal is not reduced by return fees. This test deployment has no contribution-slot abuse protection. After expiry, unpaid pledges can be refunded once; payout and refunds exclude each other. The creator can recover unused fee reserve only after principal is resolved.

Memo recovery was tested on Esmeralda using a fresh local SDK ledger and the same isolated test seed. It recovered the actual 7 tTARI refund binding from the on-chain encrypted memo. No seed, plaintext memo nonce, mask or funded recovery export is committed. Anyone granted private view access can read these memos; grant that access only to an app you trust.

## Validation and builds

The JavaScript suite covers exact amounts, fixed terms, chain parsing, coin liveness/selection, stale funding, account changes, wallet request recovery, memo restoration, browser WASM and duplicate-return guards. It also prevents an already-recorded reviewer or completed payout from opening another paid approval request. The approval button stays disabled after a successful vote in the current session; fresh on-chain checks block repeats after reload. Mock provider tests alone do not prove an installed-extension round trip. Native Tari-engine tests exercise real encrypted deposits, caps, required votes, payout, refunds and receipt encryption. The same three escrow lifecycle tests passed against the exact optimized artifact published on Esmeralda.

With Rust 1.98.1 and `wasm32-unknown-unknown` installed:

```sh
cargo +1.98.1 test -p accord-sapient-escrow-template --locked
cargo +1.98.1 build -p accord-sapient-client --lib --release --target wasm32-unknown-unknown --locked
```

Regenerate the browser helper with `wasm-bindgen-cli` **0.2.128**, using `--target web --out-dir app/lib/stock-crypto --out-name accord_sapient_client` on the resulting client WASM. Historical binaries and SHA-256 hashes are preserved under [artifacts/esmeralda](artifacts/esmeralda/README.md). Set `OOTLEACCORD_TEMPLATE_WASM` to the absolute path of `artifacts/mainnet/sapient-escrow.wasm` to exercise the published mainnet binary directly in the engine tests. [Mainnet deployment steps](docs/mainnet-launch.md)

The earlier quorum/private-output templates and native proof client remain in the Rust workspace. See [verification ledger](docs/verification.md) for the distinction between source tests, engine tests and live network evidence. The v5 community deposit, required approval and private payout now have committed receipts. Expiry refunds remain engine-tested rather than executed live.

## GitHub Pages

Pushing to `main` runs tests, packages the static app and deploys GitHub Pages. All assets use relative paths. A same-origin version manifest detects new builds and loads fresh versioned assets while idle on Accords. Updates defer during drafts, review, contribution/return panels and unresolved transactions.

Assets and fonts are local. There is no analytics service. GitHub can observe normal visitor connection metadata; the public Tari indexer sees public contract and transaction reads/broadcasts. The HTML carries a restrictive content policy permitting local WASM compilation, and a no-referrer policy. See [server policy](app/server.mjs) and [current chain evidence](docs/current-network-deployment.md).

## Contest and provenance

OotleAccord is an original implementation inspired by Threshold’s community-funding idea, developed with coding-agent assistance under the author’s direction. See the [October 2026 contest entry](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396/38) and the [November First to Launch rules](https://community.tari.com/t/november-bonus-contest-first-to-launch/521).

License: [MIT](LICENSE). Tari cryptographic and transaction dependencies retain their upstream licenses. Never commit wallet seeds, private return metadata, passwords or recovery exports.
