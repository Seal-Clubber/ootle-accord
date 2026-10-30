// Public immutable terms and a committed checkpoint. Refresh explicitly for current status.
import {deepFreeze} from './accord.mjs';
export const TESTNET_ESCROW = deepFreeze({
  "agreement": {
    "schema": "ootleaccord.agreement.v4",
    "title": "10 tTARI community escrow",
    "description": "Private-output Esmeralda escrow test. Exact public funding total; contribution sizes can be inferred from counter changes. One community reviewer and four deployer-operated test reviewers. Payout returns to the isolated test wallet and requires the community reviewer’s approval.",
    "network": "esmeralda",
    "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
    "creatorWalletAddress": "otl_esm_1tttvh8v6u72prxluznx5vupja8n8r65an30uel4gvfgtq3k734k2yup9y8lagmg6vf2hv0rz9qntu3vv2s5kfcx2jtgt6h98r9h3vtss5ked4",
    "milestones": [
      {
        "id": "delivery",
        "title": "Verify the private funding and approval flow",
        "description": "A 10 tTARI capped escrow. Three of five reviewers must approve this work, including the community reviewer. The creator may then release funds to the precommitted one-time test-wallet destination. Unpaid pledges become privately refundable after the deadline.",
        "reviewers": [
          {
            "name": "Test reviewer 1",
            "role": "Independent reviewer",
            "walletAddress": "otl_esm_1hfsyz6cp9ha4d7hksyfpqsp5t0egnt49qp297su8znftrq5uqcwa3hq48ajkhwwhxy350jz2vfk6m9v8zz67dlse2d9u6zcrtm9wu2qmj29w4",
            "publicKey": "ba60416b012dfb56faf681121040345bf289aea500545f438714d2b1829c061d"
          },
          {
            "name": "Test reviewer 2",
            "role": "Independent reviewer",
            "walletAddress": "otl_esm_1sc69ft9cz0uxce8ukq6zqv8xt5m6n8fjtz7vlygtukr7ze8y9gvpvddct7rtv52zszazh2jc4y4ryqj3dz54lzfffautfjr4cezh5vgxrq0dy",
            "publicKey": "863454acb813f86c64fcb0342030e65d37a99d3258bccf910be587e164e42a18"
          },
          {
            "name": "Community reviewer",
            "role": "Independent reviewer",
            "walletAddress": "otl_esm_1vfh5ht7kwq78x9s0qk62at0ndwknrhsggn45qmda52c4hg0nmyp94wlskx57zl9367s7s25v04ldyq4cx3qjd5qj9naffeskpww3zpcg08vw9",
            "publicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902"
          },
          {
            "name": "Test reviewer 3",
            "role": "Independent reviewer",
            "walletAddress": "otl_esm_1ssgg3up8w7audn5h8td20emr6u202vm9jd7xhpgq5qjc9es6fvpwenu0rufea9lm3yst6kcfd4lxvrd92eaez6gawlsjc8xcmdhnkjcy8l3hx",
            "publicKey": "841088f02777bbc6ce973adaa7e763d714f53365937c6b8500a02582e61a4b02"
          },
          {
            "name": "Test reviewer 4",
            "role": "Independent reviewer",
            "walletAddress": "otl_esm_1ggpqryfta8zy82j0zcnzpgy5jh2tffp4v6mxeeh8afct6h564pf3sum2kazhvd8g9ce8jpz8hpa9yc0uu3e45rzm5h6t34d2nyl5uwqx0vv47",
            "publicKey": "420201912be9c443aa4f162620a09495d4b4a43566b66ce6e7ea70bd5e9aa853"
          }
        ],
        "approvalPercent": 60,
        "refundEpoch": "14000",
        "targetUnits": "10000000",
        "requiredReviewerPublicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902",
        "payoutPublicKey": "1e82be4cc00cc4834317aa6825155bff4efbfeb30583fbf16a7d953c6b103902"
      }
    ]
  },
  "agreementId": "11f52c1579d7c7c2a882cbe6012e56864783fd480154fb9db518e537a2096555",
  "work": "OotleAccord — private escrow test\n\nAcceptance criteria:\n- Native TARI stealth inputs fund a script-only escrow output.\n- Exact public goal: 10 tTARI; funding above remaining capacity is rejected atomically.\n- Sender base addresses and raw output amounts are absent from the donation transaction. Counter differences still reveal contribution sizes; transaction graph and timing remain observable.\n- Five immutable reviewers and a 60% quorum: three approvals.\n- The community reviewer is mandatory, regardless of other votes.\n- Payout goes to the isolated test wallet, only after the required approval.\n- Before the deadline, funds stay locked. Unpaid pledges can be refunded to their precommitted one-time destinations after epoch 14000.\n- Four test reviewers share an operator and are not independent.\n",
  "submissionHash": "26a59392d78c0d51fc3866e5c04920ebd2703182df1b8747d02ff869c8869ecd",
  "recordedApprovals": 2,
  "component": "component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450",
  "templateAddress": "5d035ef964e51458ccfd8e654781715cdd6725a1b72ac1ac0b546682169c2d45",
  "constructorTransaction": "bc2dc77caef347476bde1a3ed464228b4a76d4e2a7c6149fd548f7b62e7338ae",
  "recordedFundingUnits": "10000000",
  "recordedEpoch": 12721,
  "recordedVersion": 4,
  "checkpointTransaction": "8374b8c64a0976a53c98c550a68ef20626ea1b3f63368b935d976d53432ed040",
  "fundingTransaction": "1953c89fea5494165d4cd27c628a2d9907f80c24db50ed7ba09acc0ba87aff74",
  "workTransaction": "003817bbe83d99687bc453bf58f65e99fa361e859c160b5be00b46e35cef9807",
  "conditionRoot": "1874baa5e609f26b08067020316a21e8fb37e9f27205fd2483764b121c7ca5e8"
});
