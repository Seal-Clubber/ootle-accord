import { deepFreeze } from './accord.mjs';

// Verified against the committed mainnet constructor and both escrow vaults.
export const MAINNET_ACCORDS = deepFreeze([
  {
    "agreement": {
      "schema": "ootleaccord.agreement.v5",
      "title": "Community accord",
      "description": "A 10 TARI mainnet example of milestone funding. Contribution amounts are public. Four demo reviewers share one operator.",
      "network": "mainnet",
      "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
      "creatorWalletAddress": "otl_1vfh5ht7kwq78x9s0qk62at0ndwknrhsggn45qmda52c4hg0nmyp94wlskx57zl9367s7s25v04ldyq4cx3qjd5qj9naffeskpww3zpcgklmtx",
      "milestones": [
        {
          "id": "delivery",
          "title": "Community funding demonstration",
          "description": "Reach 10 TARI, then review the submitted work. Three of five approvals, including the community reviewer, unlock payout to the creator. Unpaid contributions become refundable at the deadline.",
          "reviewers": [
            {
              "name": "Demo reviewer 1",
              "role": "Deployer-operated demo reviewer",
              "walletAddress": "otl_10r6fc3glahlptjqautny02nw9v3n0fadtzy3rpagvssald5deg6msghhdz922zh980j7xy28r3zy2lkqehqzvl40455d3g9cqnvk2jqc9ukfs",
              "publicKey": "78f49c451fedfe15c81de2e647aa6e2b2337a7ad58891187a86421dfb68dca35"
            },
            {
              "name": "Demo reviewer 2",
              "role": "Deployer-operated demo reviewer",
              "walletAddress": "otl_1ygf22vzkvfh636zvqygemaw22rfll4a9pg04pgq8wpsehlju4d24e8ag7ap78f6gexf59tmkkmk2pkhkf6t0xlujywy80d85ekphq9sz9z0z8",
              "publicKey": "2212a53056626fa8e84c01119df5ca50d3ffd7a50a1f50a00770619bfe5cab55"
            },
            {
              "name": "Community reviewer",
              "role": "Required reviewer and accord creator",
              "walletAddress": "otl_1vfh5ht7kwq78x9s0qk62at0ndwknrhsggn45qmda52c4hg0nmyp94wlskx57zl9367s7s25v04ldyq4cx3qjd5qj9naffeskpww3zpcgklmtx",
              "publicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902"
            },
            {
              "name": "Demo reviewer 3",
              "role": "Deployer-operated demo reviewer",
              "walletAddress": "otl_1t63lpl388esy5edmdfvmsslxv69vkmqq5fu0s5sp76mhfftpd4rpplvfjtethxkvxxypcsrna08y07dj8yvf5vwfxm6u2tdyrfvlj4sty0kcg",
              "publicKey": "5ea3f0fe273e604a65bb6a59b843e6668acb6c00a278f85201f6b774a5616d46"
            },
            {
              "name": "Demo reviewer 4",
              "role": "Deployer-operated demo reviewer",
              "walletAddress": "otl_1tjftdpkvssfuyk7aqeyhzznygvz92mr3azj2cepyk36fjwf4jsdxpmqxy7x5grav9ax64dv5yk4q7wr4lp3aqjgelpkvyxplddcjyec00st8g",
              "publicKey": "5c92b686cc8413c25bdd0649710a644304556c71e8a4ac6424b474993935941a"
            }
          ],
          "approvalPercent": 60,
          "refundEpoch": "40437",
          "targetUnits": "10000000",
          "requiredReviewerPublicKey": "626f4bafd6703c73160f05b4aeadf36bad31de0844eb406dbda2b15ba1f3d902",
          "payoutPublicKey": "c27c2c3d649ca948404986db9cf2a770dc6994e8c913287dbc57b02cc1565e49",
          "payoutNonce": "e2124e51367593b8f8200f62d48deb85f3a0289f3575a0283a4c33d436935a71"
        }
      ]
    },
    "agreementId": "94bf3b806ef4e092389d5fee88d521a5f9b24f0a30c03a7dbee2c719b3068ad6",
    "work": "OotleAccord community funding demonstration\n\nVerify the 10 TARI escrow goal and exact remaining balance. Review opens when the goal is fully funded. The 60% quorum includes the required community reviewer. Payout goes to the creator’s fixed private destination. Eligible unpaid pledges become refundable at the deadline.\n",
    "submissionHash": "74f56bcab2e2eeba349c13431c6e2deb3b088066a1886edb25cfe445df05ddf4",
    "templateAddress": "template_151ae04f4b80eda9a45d37f0ae8c2c8b005eb6df6715c2a9eb14df68b6e4bbf3",
    "component": "component_2b67f7a0daba5addc4f5aff72bfc74dd50afc3fcc2f34d8ed2d645f311581b5e",
    "principalVault": "vault_2bd56c76d52dc4bd779da18e9ebc41672791db3a008192526fa82835ecdc0020",
    "feeVault": "vault_2be1d24b72f3931244352def031c38fbdb6a999f6c7f1ca15eea99e397a3b682",
    "constructorTransaction": "b183bc7f0415a99e501db3ab1229c0a3b37fef4bc6182efb356b653b59e91e1e",
    "checkpointTransaction": "b183bc7f0415a99e501db3ab1229c0a3b37fef4bc6182efb356b653b59e91e1e",
    "immutableUpgradeRule": true,
    "recordedVersion": 0,
    "recordedEpoch": 38437,
    "receiptsPath": "./docs/mainnet-community-accord.md",
    "payoutReceiptCommitment": "8afa8748da38e1a4359cb051652eb83e79334adda635c19a06d68c54d8af447d",
    "recordedFundingUnits": "0",
    "recordedSubmissionHash": "",
    "submittedWebsite": "https://tari.com/",
    "recordedVotes": [
      false,
      false,
      false,
      false,
      false
    ],
    "recordedApprovals": 0,
    "recordedRequiredReviewerApproved": false,
    "recordedPaid": false,
    "recordedApproved": false
  }
]);
