# Frontend validation

Worker validation on 2026-09-27 UTC. This is a contributor's evidence record, not an independent certification or a publication check.

## Scope and source binding

Implemented one React/TypeScript/Vite page under `web/`, exported under `dist/`, with documentation/evidence under `docs/`. The approved workflow explicitly excludes an in-page swap. Approve, claim, settle and withdraw are present; CRWN balance, game allowance, withdrawable credit, current king, payment, next minimum, pot, round and countdown use contract reads. Claim history uses only contract events. No contracts, root configuration, root lockfile, `lib/`, `.github/`, remappings or Foundry settings were changed.

The supplied workflow, deployment and network inputs, both protected test definitions, and the pinned interface reference were read. The protected tests describe the deployed-contract stage; they were not modified or represented as frontend tests. No Solidity redeployment or funded broadcast was performed.

The ABIs were extracted from source commit `548b47bf64e8e08525fa86bb6f7532dbc3b46154`, compared byte-for-byte with the existing `docs/abi/` files, and checked by recursively sorted-object, array-order-preserving canonical JSON Keccak-256:

| Contract | Attested canonical ABI hash, verified |
| --- | --- |
| LaunchToken | `f36d2fe28b62f817a4fba0b78bb501b41895eada3982280273c063ad8183f577` |
| KingOfTheHill | `241add79a1d24119693cbc0a64050e169b9e9b23ab91643a08b9c5dc3e6b07ac` |

The runtime loads `dist/imd-deployment.json` and its ABI paths. This manifest preserves the exact launch/chain/source/attestation/contract binding and network object, and includes the supplied wallet-add parameters. The final export has **8 inventoried assets totaling 624,738 bytes**, plus the manifest. Every file other than the manifest has a lowercase SHA-256 entry; the manifest excludes itself. No asset approaches 8 MiB, and the export is comfortably below the HTTP response budget. The source and all local font/ABI/runtime assets are included.

The single explicit ignore-file path budget is `web/.gitignore`, with recursive exclusions for dependency/build-cache/test-output directories. No offline registry, dependency archive, package cache, `node_modules`, or new submodule is delivered. `test/scratch/` contains disposable worker checks only. The supplied root `DESIGN.md` criterion conflicts with the overriding write scope, so the complete design document is delivered as `docs/DESIGN.md` instead.

## Commands and outcomes

From `web/` unless indicated otherwise:

| Check | Result |
| --- | --- |
| Frontend dependencies installed with npm, cache in `test/scratch/npm-cache` | Successful; exact versions in `package-lock.json`; install reported zero vulnerabilities |
| `npm run typecheck` (also run by each final build) | Passed, TypeScript 7.0.2 |
| `npm run build` | Passed, Vite 8.3.1; final build writes ABI assets and deployment manifest after bundling |
| `CROWN_CHROMIUM_PATH=/home/imd1/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm test` | **17 passed**, final run 18.2 seconds; Playwright 1.63.0 |
| `npm run verify` | Passed; both pinned ABI hashes, full asset enumeration, SHA-256 inventory and network binding matched |
| `npm run check:rpc` | Passed on all 3 supplied public endpoints; read-only evidence in `evidence/live-rpc.json` |
| Production at `http://localhost:4173/preview/` | Browser loaded local HTML, JS, CSS, both fonts, manifest and ABIs successfully; no rewrites needed |
| Browser console/resource inspection | Zero console warnings/errors; no failed resources in final automated run; tool-managed browser logs in `evidence/browser-console.txt` and `evidence/browser-network.txt` |

Node 24.21.0 and npm 11.19.0 were used. The initial default Playwright launch requested a browser revision absent on the worker; tests were rerun using the existing Chromium path above. The runtime build emits a nonblocking Vite advisory for its 531.66 kB main JS chunk (162.08 kB gzip). The entire export remains about 610 KiB before the manifest; no dependency assets were removed to silence the advisory.

The live RPC checks reported chain 11155111, 1,802-byte LaunchToken runtime, 2,326-byte KingOfTheHill runtime, the expected token binding and `10^27` token minor units. All three checked block 11,791,410 around 06:02:52 UTC. The final browser later read block 11,791,475+ without a wallet. These observations establish reachable live reads at those times, not continuous RPC availability or runtime-bytecode equivalence to a separately audited build.

## Interaction coverage

The real production bundle was tested at `/preview/`; the test fixture intercepts the configured RPCs and supplies an EIP-1193 mock wallet. It uses the actual exported ABI JSON to decode requests and encode responses. Synthetic accounts, balances and history appear only in test code/evidence, never in application configuration or the static export.

The 17 scenarios cover:

1. Disconnected live reads, disabled writes, missing-wallet guidance, skip-link focus and no page exceptions.
2. Exact finite approval to the game, claim unavailable until allowance is sufficient, separate claim request, successful receipt, event refresh and current-king refusal.
3. The complete connect → enter amount → approve → claim flow using only Tab, typing, Enter and Space.
4. Settlement at the exact fetched chain deadline, new round and withdrawal of the caller's whole credit.
5. Active-round settlement refusal and expired-round claim/approval refusal.
6. Wrong chain; switch fails with 4902, exact supplied chain-add parameters, then another switch.
7. User rejection on wallet connection and signing, visible recovery, no broadcast.
8. ABI-decoded game simulation revert, preventing wallet broadcast.
9. Reverted receipt, retained explorer link, no false success.
10. A 110% minimum with a one-minor-unit rounding edge, exact-value disclosure, rejection of excess decimals and insufficient balance.
11. Account change, network change and disconnect invalidating unsafe eligibility.
12. RPC read failure, retry, stale block data and disabled writes.
13. Missing deployed code blocking initialization.
14. Wrong token binding blocking initialization.
15. Tampered ABI blocking initialization.
16. Event-only history, earlier block pagination and recoverable log errors.
17. Responsive layout, accessibility/contrast checks, keyboard horizontal history scrolling, reduced motion, 200% text enlargement and no failed resources.

Raw results: `evidence/interactions.json`. No test signs a real transaction. Actual wallet-extension prompts, receipt replacement/cancellation, receipt timeouts, wallet-provider RPC fallback, long-running reorganizations and adversarial public-RPC behavior were not end-to-end exercised. Their relevant guards were source-reviewed; that does not establish these cases passed in a live wallet.

## Better Interface: consolidated review

The pinned workflow and core principles in all six domains were applied during implementation and reviewed again against the production export. Relevant disclosure, form, focus, token, type and responsive patterns were examined. Scope is one English light-theme page with a dark round panel. Alternate themes, localization, overlays and media playback are absent and not applicable.

| Domain | Coverage and evidence | Limits |
| --- | --- | --- |
| Accessibility — Checked | Native landmarks, headings, labels, buttons, links, details; described invalid input; live transaction status; keyboard-only primary flow; visible skip and approve focus screenshots; axe scans with WCAG 2 A/AA, 2.1 AA and 2.2 AA tags at all four widths, zero violations | No screen-reader session, physical touch device, forced-colors session or complete accessibility certification |
| Layout — Checked | Rendered desktop 1440px, intermediate 840px, mobile 390px, smallest 320px; no document overflow; 600px history table scrolls inside its region; keyboard scroll and visible cue; rules and payment controls remain in reading order | No native browser zoom, RTL locale or pseudo-localization; 200% root text-size check is separately labeled |
| Writing — Checked | Explicit approval/payment distinction, exact CRWN payment, stake/loss explanation, verb-first controls, loading/rejection/network/RPC/simulation messages and recovery links; recent-event range qualified | External swap UI is outside scope; no quoted price or rate is invented |
| Typography — Checked | Local faces loaded in browser; serif/body hierarchy; 20px input; tabular numbers; exact-value disclosure; real address/minimum/error content at narrow widths and 200% text size | Only bundled Latin fonts and English reviewed; history exact amounts use title and explorer access |
| Colors — Checked | Computed foreground/background pairs recorded in `evidence/accessibility.json`; body 13.36:1, supporting text 5.40–5.74:1, dark supporting text 7.70:1, enabled primary button 6.37:1; textual status cues | Measurements cover identified rendered pairs; not every possible hover/disabled/OS state. Disabled controls are intentionally subdued |
| UI — Checked | Enabled, disabled, loading, pending, confirmed, error, empty and populated states; local SVG; consistent borders/radii; responsive cards; reduced-motion transition duration is 0s | No native wallet popup inspection or animation-panel 10% playback; no modal or page-entry animation exists |

Screenshots were actually opened and inspected: live desktop/mobile via the assigned browser and final mock 320px/keyboard-focus images via image inspection. The automated screenshots at 1440/840/390/320 document connected active-round content. `text-200-percent.png` documents enlarged text, not browser-native zoom. Browser screenshot and accessibility snapshots were not treated as screen-reader testing.

### Findings, corrections and rechecks

| Severity / domain | Source | Evidence and impact | Correction and recheck |
| --- | --- | --- | --- |
| Medium — Writing/layout | `web/src/App.tsx:188`, `web/src/App.tsx:228` | At narrow widths CSS-hidden line breaks joined “CRWN.Hold” and “comesat”; rendered mobile text lost word boundaries | Added explicit spaces in source; final 390px live inspection and screenshots show correct sentences |
| Medium — Colors/UI | `web/src/styles.css:195` | Background-color transition briefly combined enabled-button light text with its disabled light fill; immediate computed ratio was 1.20:1 | Color changes now occur immediately; only press transform animates. Re-measured enabled primary at 6.37:1; final axe scans remain clean |
| Medium — Layout/accessibility | `web/src/App.tsx:233`, `web/src/styles.css:177` | At 320px, history address/hash columns collapsed into tall fragments | Preserved 600px table width, made region keyboard-focusable, added visible scroll instruction. Final 320px screenshot and ArrowRight scroll assertion pass without page overflow |
| Medium — Accessibility/typography | `web/src/App.tsx:13`, `web/src/App.tsx:226` | Truncated fractional balances were previously available in titles only, making exact values hard to obtain on touch | Added native exact-values disclosure and full-value metadata; 18-decimal boundary test opens disclosure and checks the exact value |
| Low — Writing/UI | `web/src/App.tsx:70`, `web/src/App.tsx:121` | Initial “loading balances” notice persisted after balances arrived | Stable connected/account-changed notices now accompany actual view loading states; final connected screenshots show “Wallet connected.” |
| High — Transaction feedback | `web/src/chain.ts:142` | Source review found successful cancellation/replacement receipts could otherwise be labeled as the requested game action | Only gas repricing retains the original action-success path; other replacement reasons surface a review/refresh error. Source-reviewed; live replacement behavior remains untested as stated above |

Initial compile issues and one fixture mismatch (a game error encoded as a token-approval revert) were corrected before the final passing run. They are not represented as live-chain defects.

## Completion and limits

Source, static export, manifest, ABI binding, frontend build/typecheck, browser inspection, meaningful interactions and six-domain design review are complete for the authorized write scope. A Git delivery/size check is recorded in `evidence/submission.json`.

The requested root-repository commit could not be created: `git add -- web dist docs` failed with `Unable to create .git/index.lock: Read-only file system`. The environment mounts `.git` read-only and allows no permission escalation. Files remain ready for the publisher's collection/commit. The bundle-size check uses an isolated disposable Git repository under the explicitly permitted `test/scratch/`; it does not change the protected repository's Git metadata or claim a root commit exists.

Live wallet signing, game writes, swaps, actual gas use, pending-transaction competition and reorg finality remain untested. No live swap is part of this page. One successful receipt is the app's confirmation threshold. Clock skew or an RPC outage can conservatively pause actions. No screen-reader/physical-device/Safari/Firefox session or native zoom was performed.

Publication, GitHub hosting, IPFS pinning, a fixed CID, named entrypoint checks and the control-plane HTTP/RPC checks have not been performed or claimed. Those run after worker delivery and are not prerequisites for this assignment's frontend implementation.
