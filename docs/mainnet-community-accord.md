# Mainnet Community accord

The example uses the published `SapientEscrow` template on Tari Ootle Mainnet. Its opening checkpoint showed **0 of 10 TARI funded** and no votes. The app refreshes both from the indexer. [Creation receipt](https://indexer-a.ootle.tari.com/transactions/b183bc7f0415a99e501db3ab1229c0a3b37fef4bc6182efb356b653b59e91e1e/result) · [Escrow state](https://indexer-a.ootle.tari.com/substates/component_2b67f7a0daba5addc4f5aff72bfc74dd50afc3fcc2f34d8ed2d645f311581b5e)

- The goal is **10 TARI**. The minimum contribution is **0.625 TARI**, with a smaller exact final contribution allowed.
- Full funding and **three of five approvals** unlock payout before epoch **40437**. The creator's vote is required. The other four reviewer wallets share a demo operator.
- Payout goes to the creator's fixed private destination. The encrypted payout memo was created with the escrow. The creator registers the prepared example work under **Review → Creator: submit work**.
- Eligible unpaid contributions become refundable at epoch **40437**. The **1.6 TARI** return reserve sits in a separate vault. Creation cost **0.020167 TARI** in network fees.

Contribution amounts, the remaining balance and reviewer votes are public. Deposits use one-time keys. Refund and payout memos are encrypted to their recipients.
