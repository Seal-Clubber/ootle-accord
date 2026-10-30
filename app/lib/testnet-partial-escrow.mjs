// Public immutable terms and a committed 7/10 checkpoint.
import {deepFreeze} from './accord.mjs';
export const TESTNET_PARTIAL_ESCROW = deepFreeze({
  "agreement": {
    "schema": "ootleaccord.agreement.v4",
    "title": "Community accord #2",
    "description": "Second private-output community funding test. Goal: 10 tTARI, initially funded with 7 tTARI. The exact public counter exposes contribution sizes by subtraction. Approval opens after full funding and must include the community reviewer. Four test reviewers share an operator.",
    "network": "esmeralda",
    "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
    "creatorWalletAddress": "otl_esm_1tttvh8v6u72prxluznx5vupja8n8r65an30uel4gvfgtq3k734k2yup9y8lagmg6vf2hv0rz9qntu3vv2s5kfcx2jtgt6h98r9h3vtss5ked4",
    "milestones": [
      {
        "id": "delivery",
        "title": "Review the second community milestone",
        "description": "Reach the 10 tTARI funding goal, then review this work. Three of five designated reviewers must approve, including the community reviewer. Payout stays locked until those approvals and goes only to the isolated test wallet’s fixed one-time destination.",
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
        "refundEpoch": "14000",
        "targetUnits": "10000000",
        "requiredReviewerPublicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902",
        "payoutPublicKey": "0870d40d0ad921c0d3751dc24d1bfaefa101b8d1ee19534a568cdd8ad39cce00"
      }
    ]
  },
  "agreementId": "ddc24346d81fb625d1de38708725717edce8d66b6d783f92ba5d5ec599ba7872",
  "work": "OotleAccord — second community funding test\n\nAcceptance criteria:\n- Goal: 10 tTARI with a strict on-chain cap.\n- Initial private funding: 7 tTARI; remaining capacity: 3 tTARI.\n- Private input/output values are encrypted; public counter changes reveal contribution sizes. Transaction links and the shielding bootstrap are visible.\n- No review vote is accepted before the goal is fully funded.\n- After full funding, three of five reviewers must approve this fingerprint, including the community reviewer. Four other reviewers share an operator.\n- No payout before the required approval. The payout destination is fixed to the isolated test wallet.\n- Eligible unpaid pledges become privately refundable at epoch 14000.\n",
  "submissionHash": "f1f0177484583a1c5be3d84b41eba4fe7900ccd3a524850e79a4481e65fae3bf",
  "recordedApprovals": 0,
  "component": "component_5d2639cc01fdb9524a64da98b85bb8fd04a6c4979d0a8f6861aff3a3b8a7e3fc",
  "templateAddress": "5d035ef964e51458ccfd8e654781715cdd6725a1b72ac1ac0b546682169c2d45",
  "constructorTransaction": "e26aba7fe101587dbcbaf1a9783aadd81435914f94174d19982b8d180d41e762",
  "recordedFundingUnits": "7000000",
  "recordedEpoch": 12737,
  "recordedVersion": 2,
  "recordedRequiredReviewerApproved": false,
  "checkpointTransaction": "e079c3821cabd9bd5c91ff64ec141e7c53e6f1bf99d799a885bdcd3982f928d8",
  "workTransaction": "e079c3821cabd9bd5c91ff64ec141e7c53e6f1bf99d799a885bdcd3982f928d8",
  "fundingTransaction": "76fc0597fb3ee175a065a80d16ae60477524fd55dda5ac71862c5f8c63708629",
  "conditionRoot": "c5ba51a960915b8ce6f20c7cd01928c0819aaff134437e55f30fc89847a76eff",
  "receiptsPath": "./docs/partial-escrow-testnet.md"
});
