// Verified stock-Sapient escrow and committed 7/10 checkpoint.
import {deepFreeze} from './accord.mjs';
export const TESTNET_SAPIENT_ESCROW = deepFreeze({
  "agreement": {
    "schema": "ootleaccord.agreement.v5",
    "title": "Community accord · Sapient",
    "description": "Stock-Sapient funding test: 10 tTARI goal, initially funded with 7. Contribution amounts and total are public. The deposit uses one-time keys and omits the donor base wallet address. Transaction history and timing may still link activity. Four test reviewers share an operator; the community reviewer is mandatory.",
    "network": "esmeralda",
    "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
    "creatorWalletAddress": "otl_esm_1tttvh8v6u72prxluznx5vupja8n8r65an30uel4gvfgtq3k734k2yup9y8lagmg6vf2hv0rz9qntu3vv2s5kfcx2jtgt6h98r9h3vtss5ked4",
    "milestones": [
      {
        "id": "delivery",
        "title": "Review the funded community milestone",
        "description": "Reach 10 tTARI, then require three of five approvals including the community reviewer. Payout goes to the isolated test wallet. Unpaid contributions can be refunded privately after the deadline using encrypted Sapient memo receipts.",
        "reviewers": [
          {
            "name": "Test reviewer 1",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_1hfsyz6cp9ha4d7hksyfpqsp5t0egnt49qp297su8znftrq5uqcwa3hq48ajkhwwhxy350jz2vfk6m9v8zz67dlse2d9u6zcrtm9wu2qmj29w4",
            "publicKey": "ba60416b012dfb56faf681121040345bf289aea500545f438714d2b1829c061d"
          },
          {
            "name": "Test reviewer 2",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_1sc69ft9cz0uxce8ukq6zqv8xt5m6n8fjtz7vlygtukr7ze8y9gvpvddct7rtv52zszazh2jc4y4ryqj3dz54lzfffautfjr4cezh5vgxrq0dy",
            "publicKey": "863454acb813f86c64fcb0342030e65d37a99d3258bccf910be587e164e42a18"
          },
          {
            "name": "Community reviewer",
            "role": "Required community reviewer",
            "walletAddress": "otl_esm_1vfh5ht7kwq78x9s0qk62at0ndwknrhsggn45qmda52c4hg0nmyp94wlskx57zl9367s7s25v04ldyq4cx3qjd5qj9naffeskpww3zpcg08vw9",
            "publicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902"
          },
          {
            "name": "Test reviewer 3",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_1ssgg3up8w7audn5h8td20emr6u202vm9jd7xhpgq5qjc9es6fvpwenu0rufea9lm3yst6kcfd4lxvrd92eaez6gawlsjc8xcmdhnkjcy8l3hx",
            "publicKey": "841088f02777bbc6ce973adaa7e763d714f53365937c6b8500a02582e61a4b02"
          },
          {
            "name": "Test reviewer 4",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_1ggpqryfta8zy82j0zcnzpgy5jh2tffp4v6mxeeh8afct6h564pf3sum2kazhvd8g9ce8jpz8hpa9yc0uu3e45rzm5h6t34d2nyl5uwqx0vv47",
            "publicKey": "420201912be9c443aa4f162620a09495d4b4a43566b66ce6e7ea70bd5e9aa853"
          }
        ],
        "approvalPercent": 60,
        "refundEpoch": "14739",
        "targetUnits": "10000000",
        "requiredReviewerPublicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902",
        "payoutPublicKey": "02bc8074a4042632515042f79bb9687259cd5b3e0f9893376ec7048280c4153c",
        "payoutNonce": "aa1f02dffe3c868f14c33a736b8b7cd9e17f61742304bba0b23b56a3646c283b"
      }
    ]
  },
  "agreementId": "3d2e19660a07385e212e86e80ff54e6e7d327105507b56e5ffe2763d57e1517d",
  "work": "OotleAccord — stock Sapient escrow test\n\nAcceptance criteria:\n- Native TARI is held by the Ootle escrow, with a strict 10 tTARI cap and a live remaining counter.\n- Initial funding: 7 tTARI. Reviews open at 10/10.\n- The unmodified Sapient SDK redeems only an exact-value coin with a separate private fee coin. A private self-transfer prepares an exact coin when necessary.\n- Contribution amounts are explicit. The escrow deposit omits the donor base wallet address and uses one-time signers; transaction history can still link activity.\n- Each contribution creates an encrypted, zero-value Sapient memo receipt for recovery of its fixed private refund.\n- Three of five reviewers must approve this fingerprint, including the community reviewer. The four other reviewers share a test operator.\n- No payout before the required approval. Payout is fixed to the isolated test wallet, and eligible unpaid contributions are refundable from epoch 14739.\n- A separate organizer fee reserve pays private return fees without reducing contributed principal.\n",
  "submissionHash": "4e8c2271be43864ecad43eed76c01d1ba57b9d3b880840e4e0e782e1f0f55dfe",
  "recordedApprovals": 0,
  "recordedRequiredReviewerApproved": false,
  "recordedFundingUnits": "7000000",
  "recordedEpoch": 12739,
  "component": "component_1baffe14c156f3cea0aee845416827d72646b7285802a84ba2066d950d9d7fc1",
  "templateAddress": "bc30266a3c2d025a02aa723b1de4396788c8c477b3dc1c5798bce4ca49a2d5a0",
  "principalVault": "vault_1b643d19814b15c6ee77a0bc58134283af521450362ecfd881a986c40698d4e0",
  "feeVault": "vault_1b6d2778e572a3d66ec9623f3dfe41751ca65ff1e69a26f7e16a14a894ea9929",
  "constructorTransaction": "1bee76ac4e606f90fc9e7b581179e02dedc97504068161eee21c496e349303a1",
  "recordedVersion": 2,
  "payoutReceiptCommitment": "74f5d0b98ffaa0a0e6899546fe8dcec699924973162c840bbb511e4ddb642b72",
  "fundingTransaction": "ae720780bb5983e1697026465463027d893de78f42926c99e3427659a3f18bd0",
  "workTransaction": "c87606b5315aec8423970aea95975413ecb88ca4dd67e938283df50688926bb5",
  "checkpointTransaction": "c87606b5315aec8423970aea95975413ecb88ca4dd67e938283df50688926bb5",
  "receiptsPath": "./docs/sapient-escrow-testnet.md"
});
