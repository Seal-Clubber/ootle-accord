# OotleAccord mainnet launch

`SapientEscrow` was published on Ootle Mainnet on **11 November 2026 at 05:26:28 UTC**, in epoch **38434**. It targets Ootle **0.53.1** and template library **0.40.0**. The [build manifest](../artifacts/mainnet/manifest.json) identifies the exact published template bytes. [Template definition](https://indexer-a.ootle.tari.com/templates/151ae04f4b80eda9a45d37f0ae8c2c8b005eb6df6715c2a9eb14df68b6e4bbf3) · [Committed publication receipt](https://indexer-a.ootle.tari.com/transactions/a9e8396052476dcad9d5e47fb02213a1e3eefd4cb77a919ffcbd6dd9095cb60d/result)

Mainnet publication makes the template available for instantiation. The app shows a funding action once a specific mainnet accord has been instantiated, verified and added to its public list.

## Publish an accord from the app

On Mainnet, open **Create**, enter the milestone and the developer’s reward address, and list the reviewers in order. The first reviewer’s approval is required. Choose a deadline in local time and check the estimated epoch. **Publish in Sapient** uses the connected wallet for the reserve and fee. Once publication confirms, copy the accord link to share it.

## Prepare an accord manually

1. Open the app with `?network=mainnet#create`. Save a public agreement with one milestone, a native Ootle TARI goal, a future chain epoch and the creator’s and reviewers’ mainnet receiving addresses (`otl_1…`). The creator’s wallet is the fixed private payout recipient. Choose the approval percentage and the reviewer whose vote is mandatory.
2. Run `node scripts/prepare-mainnet.mjs <public-draft.json> <required-reviewer-mainnet-address> [sponsor-mainnet-address]` and save the output. It contains the normalized public terms, agreement ID, constructor arguments and required `1600000` raw-unit fee reserve. Each run creates a fresh encrypted payout memo and agreement ID. If a sponsor signs the creation transaction, pass their address to authorize the receipt's one micro-TARI round trip. The memo and payout still go to the creator.
3. Confirm the released Sapient extension connects on Mainnet and supports the deployed ABI, private coin funding, approval and encrypted memo recovery. Obtain a live fee quote and instantiate the accord using the published `SapientEscrow` template address. Constructor workspace slot 0 supplies **1.6 TARI** for sponsored returns. Deployment fees and campaign principal are separate.
4. Verify committed main-state acceptance for the instantiation. Read back the agreement ID, creator, fixed payout keys, reviewers, quorum, deadline and both vault IDs. Confirm owner rule `None` and upgrade rule `Locked`. Recover the creator’s payout memo in Sapient and match it to the on-chain keys before accepting contributions.
5. Rehearse funding, full-funding approval, fixed private payout and post-deadline refund against the live protocol before opening public funding. Measure return fees against the sponsored **0.1 TARI** per action. The `claim_with_external_fee` and `refund_with_external_fee` calls accept the same signed return proof when the transaction supplies fees separately. The browser currently uses sponsored returns. Verify the external fee path operationally before launch.
6. Add the verified component, vault IDs and checkpoint to `app/lib/mainnet-accords.mjs`. Deploy the Pages build and check funding and wallet actions on the public mainnet URL before announcing it.

## On-chain terms

- Funding is capped at the goal. Each contribution must cover at least one sixteenth of the goal, rounded up to a raw unit, with a smaller exact final contribution allowed. This keeps the campaign fundable within 16 slots.
- Contribution amounts, remaining capacity, and reviewer votes are public. Deposits use one-time keys and omit the donor’s base wallet address. Transaction history and timing can still link activity. Return memos are encrypted to the receiving wallet.
- Full funding and the required quorum authorize a private payout before the deadline. Eligible unpaid pledges become refundable at the deadline.
