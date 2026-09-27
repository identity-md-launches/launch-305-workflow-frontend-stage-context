# Crown frontend

One static page for the deployed Crown (CRWN) KingOfTheHill game. Source and build configuration are entirely in `web/`; the complete production export is in repository-root `dist/`. No server, indexer, WalletConnect project ID, private key, or private RPC credential is needed. Modern browsers with BigInt and an injected EIP-1193 Ethereum wallet are supported.

## Install, build and preview

Use Node 24 and npm 11 (the worker used Node 24.21.0 / npm 11.19.0). From the repository root:

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run verify
npm run preview
```

Open the URL printed by Vite. For the same gateway-style subpath used in validation, run `node scripts/serve.mjs` and open `http://localhost:4173/preview/`. Stop the foreground server with Ctrl-C. It serves only production files, with no SPA fallback. `npm run dev` supports source hot reload after an initial build; its middleware serves the generated manifest and ABIs from `dist/`.

On a worker with a read-only home directory, use `npm ci --cache ../test/scratch/npm-cache`. Dependencies and caches are not delivered. The explicit ignore-file path budget is **one file, `web/.gitignore`**; its recursive patterns cover dependency, Vite, test, coverage and cache artifacts inside `web/`. No other ignore file is changed. Test scratch output is disposable and not required for the build.

## Deployment source of truth

`deployment/handoff.json` and `deployment/network.json` preserve the supplied public handoff inputs so rebuilding works after `.imd/reads/` is removed. Do not edit these to retarget this launch.

`scripts/export.mjs` obtains the raw implementation-derived ABI arrays with `git show <sourceCommit>:docs/abi/<Contract>.json`, checks that the working ABI exports match, recursively sorts object keys (retaining array order), and compares the Keccak-256 of compact UTF-8 JSON against each attested `abiHash`. Thus the pinned Git commit must remain available when rebuilding. Existing contracts and ABI exports are unchanged.

After Vite finishes, the script copies both ABI files into `dist/abi/` and writes `dist/imd-deployment.json`. The manifest preserves the launch ID, chain ID, source commit, attestation hash, and exact contract name/address/ABI hash set. It also preserves the supplied `network` object unchanged, includes the exact `walletAddChain` parameters and deployment block, and lists the SHA-256 of **every other exported file**. The manifest excludes itself. `npm run verify` independently re-enumerates files and rejects a stale manifest or changed ABI. Always rebuild after changing the source or export; never hand-edit the built assets.

At runtime `src/config.ts` loads that same relative `imd-deployment.json`, then its referenced ABIs, checking their canonical Keccak hashes. All chain IDs, addresses, explorer links and RPC choices come from this configuration. There is no second runtime deployment map. ABI hashing binds the ABIs to the manifest; it is not a browser-side cryptographic verification of the upstream attestation itself. Publication verifies the handoff binding separately.

## Reads and transactions

The app verifies the RPC chain, nonempty game/token code, `KingOfTheHill.token()` binding, token decimals and symbol before exposing actions. It uses the token address read from the game after comparing it to the handoff. Public RPCs are tried in configured order; a connected wallet is the last fallback on a connection retry. Mid-session RPC failures disable actions and offer reconnection. A retry rechecks the deployment.

Game and wallet views are read at a single block number, refreshed every 12 seconds while visible and on returning to the tab. A snapshot older than 45 seconds or a block timestamp more than 180 seconds from the browser clock pauses actions. The countdown extrapolates from the fetched block time; settlement is enabled only when a fetched block has reached the deadline. Browser clock skew can conservatively pause the interface. Contract execution is authoritative, including races near a deadline or another player's claim.

Connect wallet uses the browser's injected wallet. Changing accounts, changing chains and disconnecting invalidate action eligibility. A wrong-network banner offers one switch control; error 4902, nested 4902, or an unknown-chain message triggers the exact supplied `wallet_addEthereumChain` request and another switch. No WalletConnect connector is configured because no project ID was provided. Adding one in the future would require a public project ID and connector implementation in the centralized configuration path.

Claiming uses two explicit steps: approve only the entered amount of CRWN for the game, then separately call `claim(amount)`. If an existing allowance already covers the claim, the first step displays that it is ready. Inputs use integer arithmetic and reject excess precision instead of rounding. Every approve, claim, settle and withdraw rereads prerequisites and is simulated before a signature request, with account and chain checked again after simulation. A synchronous lock prevents double submission. Receipts, reverted transactions and replacement/cancellation status are handled, with explorer links retained. A receipt timeout leaves the transaction link available; check it before retrying, because timeout does not mean a transaction failed.

Withdraw always collects the connected account's whole credited balance. Settle is available to anyone once the round has a king and its on-chain deadline has passed. Token transfer/transferFrom are not standalone game actions and are not exposed as a general token utility.

## Economics and CRWN acquisition

The first claim costs at least 1,000 CRWN and goes to the pot. Subsequent minimums are `ceil(previousPayment * 110 / 100)`; the dethroned king receives a credit for their payment plus `floor(newPayment * 5 / 100)`. The remainder goes into the pot. The current king cannot claim again. Every accepted claim restarts the 24-hour clock. The exact deadline belongs to settlement, not claiming.

The final king receives **the pot only**, not the pot plus their original payment. After multiple claims the pot is less than their payment; after a long chain of minimum raises it approaches approximately 45% of that payment. This loss is the game's stake. A sole claimant gets their payment back as the pot. Settlement credits the prize; recipients still call withdraw. The page states this before the history section and explains the round rules in a native disclosure.

Per the approved workflow, there is **no in-page swap, quote or liquidity action**. Players obtain CRWN by swapping Sepolia ETH externally in the attested native ETH/CRWN Uniswap v4 pool (0.3% fee, tick spacing 60, no hook). The page links the attested token and configured pool manager, and provides the supplied faucet links. It does not invent a swap URL, exchange rate or router address. All network Uniswap addresses remain in the unchanged manifest block. Paying game approvals target KingOfTheHill, as the contract requires; Permit2 is not involved in this game flow.

Claim history comes only from `Claimed` contract logs. It initially scans the latest 2,000 blocks, clamped to deployment, then lets the visitor load earlier 2,000-block ranges. The loaded range is visible; an empty recent range is not presented as lifetime history. Eight rows are initially displayed, with more available. RPC log errors have a retry path. Latest ranges are refreshed; deep reorganizations affecting already loaded older pages require a reload. No indexing backend exists.

## Validation

```sh
cd web
npx playwright install chromium
npm test
npm run check:rpc
npm run verify
```

Tests run against `dist/` at `/preview/`, intercept RPC and wallet requests, and cannot broadcast funded transactions. Their preview server is automatically started/stopped when one is not already running. `CROWN_CHROMIUM_PATH` can select an existing Chromium executable. Test scratch goes under `test/scratch/`; durable results/screenshots go under `docs/evidence/`. On this worker, the installed browser was selected with:

```sh
CROWN_CHROMIUM_PATH=/home/imd1/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm test
```

The live RPC script is read-only. It records chain IDs, code sizes, token binding and supply from every configured public endpoint. It does not execute swaps or game writes. See [validation](../docs/validation.md), [design](../docs/DESIGN.md) and [evidence](../docs/evidence/). The root `DESIGN.md` requested elsewhere in the assignment is placed at `docs/DESIGN.md` because the overriding write scope excludes root files.

The publisher can serve the committed `dist/` directory directly from a static host or an IPFS gateway subpath. Vite uses `base: './'`, assets and fonts are local, and there are no rewrite-dependent routes. File URLs are not supported because runtime JSON is fetched; use HTTP(S). No deployment, publication, CID generation, or site naming is performed here.

## References and licenses

Interface guidance: Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Applied from the supplied local reference, without fetching a replacement guide. Source attribution: [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), [Impeccable documentation reference](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md).

Local fonts are DM Sans and Libre Caslon Display under SIL Open Font License 1.1; their complete license notices are in `docs/dm-sans-OFL.txt` and `docs/libre-caslon-display-OFL.txt`. Fonts are bundled; visitors do not contact Google Fonts. The crown is an original inline SVG.

The simulation-before-signature flow uses viem's documented [simulateContract](https://viem.sh/docs/contract/simulateContract) and [writeContract](https://viem.sh/docs/contract/writeContract) APIs.
