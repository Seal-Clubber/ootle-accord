// Current Esmeralda deployment, verified against committed receipts.
import { deepFreeze } from './accord.mjs';
export const TESTNET_CURRENT_ESCROW = deepFreeze({
  "agreement": {
    "schema": "ootleaccord.agreement.v5",
    "title": "Community accord",
    "description": "New escrow on the current Esmeralda network. Goal: 10 TARI. Contribution amounts and the remaining counter are public. Deposits omit the donor base wallet address; history can still link activity. Four reviewers share a test operator; the community reviewer is required.",
    "network": "esmeralda",
    "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
    "creatorWalletAddress": "otl_esm_15tsu70hxnu76vh4pwgy9gk3t52tztpw49xg86mtu7fen4twqn4g4duvff0kcdzr00twqmzu9j9yr25rqvs45c2adn6eqv05az3yfj4sp6wrqc",
    "milestones": [
      {
        "id": "delivery",
        "title": "Community milestone",
        "description": "Reach 10 TARI, then approve the submitted work. Three of five reviewers must agree, including the required community reviewer. Private payout is fixed to the isolated test wallet; eligible unpaid contributions can be refunded after the deadline.",
        "reviewers": [
          {
            "name": "Test reviewer 1",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_1yzkgwa58n36j5llnpsac9gug6hwlzavvpa3gc7ae6l0zdzvupfzrvvwsjnj0te57zw9c9frywp6sljg42l8xaqg7yu6ycfypevr6jast6lzd6",
            "publicKey": "20ac8776879c752a7ff30c3b82a388d5ddf1758c0f628c7bb9d7de26899c0a44"
          },
          {
            "name": "Test reviewer 2",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_19gg9nngy7z6k4cwav4phlg82z5k63jyfv7n47kdltnacsseweezqym5xvq5lycl87rxl2ng3n0lzadrk6k4t7p0ef6tyvckc3f8ujmc8zcg5t",
            "publicKey": "2a1059cd04f0b56ae1dd65437fa0ea152da8c88967a75f59bf5cfb88432ece44"
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
            "walletAddress": "otl_esm_1l3qmrnfwlcvuv68ttg67p6meravttnc6xjl7anunck90sg0d947qezdutanlks809au25pnc4l0m5uuwzpleykn5u8xdlm5er7z46kg4nf0yc",
            "publicKey": "fc41b1cd2efe19c668eb5a35e0eb791f58b5cf1a34bfeecf93c58af821ed2d7c"
          },
          {
            "name": "Test reviewer 4",
            "role": "Deployer-operated test reviewer",
            "walletAddress": "otl_esm_18gelkw2w2u62048n6klseqzh7x6npcsuxd3ztuyuc8edr7k05vqcu60mk20lp0yu4q5csx7p4544z5m78ute9v72ysk3l7x2gyxagfgenj7k0",
            "publicKey": "3a33fb394e5734a7d4f3d5bf0c8057f1b530e21c336225f09cc1f2d1facfa301"
          }
        ],
        "approvalPercent": 60,
        "refundEpoch": "14920",
        "targetUnits": "10000000",
        "requiredReviewerPublicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902",
        "payoutPublicKey": "b6963128a0fde472844a740e997dc7ae424ab8c0feb2fafd8b929ac6849d1f4d",
        "payoutNonce": "7418d016f096ef0d5f6c8bd6b08f84829d45400e8e559d88d767953d9dbb8757"
      }
    ]
  },
  "agreementId": "d85ffba007a467d1fb5281c44ecd7df833ef999f404cbee37e243ee7977c0d80",
  "work": "OotleAccord — current-network community milestone\n\nAcceptance criteria:\n- Native TARI is held in the Ootle escrow with a strict 10 TARI cap and a live remaining counter.\n- Funding uses stock Sapient. Each contribution uses one-time input keys and an encrypted refund memo. The contribution amount is public; prior history and timing can link wallet activity.\n- Approval opens only at 10/10. Three of five reviewers must approve this fingerprint, including the required community reviewer. Four reviewers are controlled by the same test operator.\n- Payout is private and fixed to the isolated test-wallet destination. It cannot be redirected.\n- Eligible unpaid contributions can be refunded privately from epoch 14920, using wallet-bound encrypted recovery memos. The separate 1.6 TARI fee reserve does not reduce campaign principal.\n",
  "submissionHash": "179b9799f39c063bfbd19c832577a5e6ff37932aa52df9142ac664838fae57ab",
  "recordedApprovals": 0,
  "recordedRequiredReviewerApproved": false,
  "recordedFundingUnits": "0",
  "recordedEpoch": 12920,
  "recordedVotes": [
    false,
    false,
    false,
    false,
    false
  ],
  "recordedPaid": false,
  "recordedApproved": false,
  "component": "component_dd022cc1e7e96ad8b27b3957e454af1ed4ee1fadaa1e6269f03d1c83b9206003",
  "templateAddress": "f4e2fe6ed85b10079ee72e4e61b08b3789f679c42085af63e9e1b7bb2b986a01",
  "principalVault": "vault_dd9155a87d303fa5d7906c7f5bbb04dcaa98f7fefac89fc4043b09f39b3ae883",
  "feeVault": "vault_dd0221e145796133563832baba5c859085ef8759cb175f523a1eb2435e01a53c",
  "constructorTransaction": "3b4fffae90d1354a077adde5f625148ac9621f87474018410677b074e6b09ca6",
  "recordedVersion": 1,
  "payoutReceiptCommitment": "18b30bfc82d9271712a07023932878e6a9e027410f27b14c06a7b406e5cfe947",
  "receiptsPath": "./docs/current-network-deployment.md",
  "immutableUpgradeRule": true,
  "workTransaction": "592d40b9a950c53f8b639ab04685b693d9b49fb586c2da8f956ebf9dcd0e8520",
  "checkpointTransaction": "592d40b9a950c53f8b639ab04685b693d9b49fb586c2da8f956ebf9dcd0e8520"
});
