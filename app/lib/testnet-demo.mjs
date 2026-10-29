// Public testnet terms and work only. This is a recorded checkpoint, not a live status feed.
import { deepFreeze } from './accord.mjs';
export const TESTNET_DEMO = deepFreeze({
  "agreement": {
    "schema": "ootleaccord.agreement.v3",
    "title": "OotleAccord testnet quorum demonstration",
    "description": "Public authorization-only demonstration on Esmeralda. Five designated reviewers; three must approve the identical work fingerprint. Four test reviewers are operated by the deployer and are not independent. No donations, custody, release or refunds are implemented by this component.",
    "network": "esmeralda",
    "resourceAddress": "resource_0101010101010101010101010101010101010101010101010101010101010101",
    "creatorWalletAddress": "otl_esm_1tttvh8v6u72prxluznx5vupja8n8r65an30uel4gvfgtq3k734k2yup9y8lagmg6vf2hv0rz9qntu3vv2s5kfcx2jtgt6h98r9h3vtss5ked4",
    "milestones": [
      {
        "id": "quorum-demo",
        "title": "Verify the percentage approval flow",
        "description": "Review the supplied test work file. Its SHA256 fingerprint must match the creator submission. Approval records a public review vote only and does not transfer campaign funds.",
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
        "refundEpoch": "14000"
      }
    ]
  },
  "agreementId": "7722512489d2d16a43e2f45d65a46b16fa22010108ae3e1bceee0817070625ce",
  "work": "OotleAccord — Esmeralda quorum demonstration\n\nAcceptance criteria:\n- Five immutable reviewer signing keys.\n- A 60% threshold requires three approvals.\n- Every approval binds the same creator-submitted SHA256 work fingerprint.\n- Duplicate votes, other signers, and votes at or after epoch 14000 are rejected.\n- This contract holds no funds. This is a public authorization test, not a funded escrow.\n",
  "submissionHash": "dd04f071b7f25419d501875c08305ec6082b5328ee7ad469dddbe525916adccb",
  "component": "component_28f41b4c64ce179866567a144fb6b586abf4c3af17afbbc0b17ac1eedf70258d",
  "constructorTransaction": "c71db8d84733372a5b6299485ffe8b6a596a351d277259aefad1e9edda3d74db",
  "templateAddress": "4548b9ab612ef7a34b839af4a2436ea00046ea645d3f62b22b40b563cb0af756",
  "checkpointTransaction": "8227e3cb93382cb672c1076233de9773fdf6d0b0e814f400a20c5cec4137dba3",
  "recordedApprovals": 2,
  "recordedEpoch": 12720
});
