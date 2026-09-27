# Crown interface design

## Overview

Crown is a single-page interface for players of the deployed Sepolia KingOfTheHill game. The design uses warm paper backgrounds, a dark plum round panel, a restrained rust action color, and serif display typography. Game state comes first; payment controls sit beside it on wide screens and follow it on narrow screens. Rules and the financial consequence remain visible before the event history.

This document describes the implemented `web/src/App.tsx` and `web/src/styles.css`. It lives under `docs/` because the assignment's overriding path restriction does not permit a root `DESIGN.md`. There was no pre-existing frontend visual system. These ordinary design choices were inferred from the Crown/game brief.

## Colors

The source uses hex primitives and semantic aliases in `styles.css:1`. Components consume semantic tokens. This is one light theme with a dark game panel; it is not a dark-mode implementation.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#f5f2e9` | Page paper |
| `--color-surface` | `#fbf9f3` | Claim panel and light foreground |
| `--color-subtle` | `#e9e4d8` | Disabled controls, empty history, small field action |
| `--color-border` | `#d9d2c4` | Structural separators |
| `--color-input-border` | `#79746b` | Interactive control borders |
| `--color-text` | `#29271f` | Primary text |
| `--color-muted` | `#686257` | Supporting text |
| `--color-dark` | `#392e3d` | Round panel and wallet connection action |
| `--color-dark-border` | `#615168` | Internal dark-panel structure |
| `--color-on-dark` | `#fbf9f3` | Dark-panel foreground |
| `--color-on-dark-muted` | `#d0c5cf` | Dark-panel descriptions |
| `--color-decoration` | `#ecce7c` | Crown line art |
| `--color-accent` / `--color-accent-hover` | `#9c3e26` / `#81331f` | Current payment step |
| `--color-error` / `--color-warning-bg` | `#872e24` / `#f9eae1` | Errors and network warnings, always with text |
| `--color-focus` / `--color-dark-focus` | `#185e83` / `#ecce7c` | Three-pixel keyboard outline on light/dark surfaces |

Measured rendered pairs: body text/page 13.36:1; muted text/claim surface 5.74:1; muted text/page 5.40:1; muted dark-panel text/plum 7.70:1; primary-button text/rust 6.37:1. Measurements and selectors are in `evidence/accessibility.json`. No ratios are asserted for every possible interaction state. Structural separators are not used as text colors.

## Typography

`web/src/fonts.css` loads two local WOFF2 assets with `font-display: swap`. DM Sans is the normal variable face (weight range 100–1000; the interface uses 400, 500 and 600). Libre Caslon Display is a normal 400 face. Browser inspection confirmed both faces loaded. There are no required italic faces; the hero's `em` is explicitly normal style. `font-synthesis: none` prevents manufactured weights/styles.

`--font-body` is DM Sans, Segoe UI, sans-serif. `--font-display` is Libre Caslon Display, Georgia, serif. The root is 16px with line-height 1.6. Tokens define 13px small text, 14px labels, 16px body and a 32px title role. Details/field hints use 12–13px; uppercase editorial labels use 11px with 0.13em tracking. Small brand captions are decorative secondary identification.

The hero uses `clamp(3.25rem, 5.5vw, 4.6rem)`, line-height 0.98 and tracking -0.035em. At 720px and below it uses `clamp(2.8rem, 8.5vw, 4rem)`. Section titles use the display face at 32–38.4px with approximately 1.1 line-height. Headings balance lines; paragraphs use pretty wrapping. Body text is left/start aligned.

Amounts and time use tabular numerals. Inputs are 20px, including on mobile. Compact token values show at most four decimal places and visibly mark truncation with an ellipsis. Their full precision is accessible in the “Show exact CRWN amounts” disclosure; the amount field and minimum button always use the exact value. History has full values in titles and transaction links. Addresses are shortened visually and have full accessible labels, titles and explorer destinations.

## Layout

`.page` has a 1224px maximum outer width, centered with 40px inline padding. The two game columns use `minmax(0, 1.12fr)` and `minmax(0, 1fr)` with a 24px gap. Card padding is 28px by 32px. Typical within-group gaps are 8–12px; component groups use 20–28px; section separations use 32–52px. DOM order follows visual reading order.

At 1000px, page padding becomes 28px, cards use 24px, the round metrics stack, wallet metrics use two columns, and rules use two columns. At 720px the game becomes one column, page padding is 20px, header controls wrap, wallet withdrawal occupies a full row, and rules become one column. At 380px page padding becomes 16px and cards use 20px; round metrics and settlement content stack. No fixed heights constrain text blocks.

The history table preserves a 600px minimum width within its own scrollable region. On small screens a visible instruction explains horizontal scrolling, and the region is keyboard-focusable. Page-level overflow was checked at 1440, 840, 390 and 320 CSS pixels. Text enlargement was tested at 200% with an 840px viewport; this is not a native browser zoom test. Screenshots are under `docs/evidence/`.

## Elevation & depth

The interface is deliberately flat: no box shadows, backdrop blur, floating panes or modal stack. Solid surfaces establish the round and payment groups. One-pixel rules organize wallet metrics, history and footer. The only elevated placement is the skip link, which appears at the top on keyboard focus. Nothing is sticky over game controls.

## Shapes

Cards use a 10px radius. Buttons, fields and empty states use 5px; warning banners use 6px. Numbered payment steps and the crown orbit are circles. The orbit is decorative: a 152px circle with a second inset ring, reduced to 132px on mobile. The crown uses a single original inline SVG with `currentColor`; decorative graphics are hidden from assistive technology.

## Components

All component patterns are in `web/src/App.tsx`; this is a small application rather than a shared component library.

- `Crown({ large })`: brand and round-panel decorative SVG, using `.brand-icon` or `.crown-art`.
- `TokenValue({ value, decimals })`: unavailable dash or grouped CRWN value, tabular numerals and full-value metadata. Exact round and wallet values have a separate native disclosure.
- `AddressLink`: explorer link with shortened display and full address label. Deployment and explorer addresses come from the loaded manifest.
- `.button`: native buttons, minimum 44px height, explicit disabled styling. `.wide` is the 48px payment button. `.primary` marks the next approval/claim step, `.connect` is the plum wallet action, `.dark-button` is settlement on the round surface. No disabled control is click-through. During writes the labels and persistent status explain simulation, wallet confirmation and receipt waiting.
- `.amount-input`: visible label, decimal keyboard hint, unrounded integer parsing, exact-minimum action, `aria-invalid` and described inline help. A valid amount is displayed in the payment description before signing.
- `.banner`, `.action-error`, `.transaction-feedback`: persistent network/read errors, transaction errors and polite status respectively. Text communicates state without depending on color. Transaction links remain available after errors.
- Native `details/summary`: rules, pool information and exact amount disclosure; browser keyboard behavior is retained.
- Claim history: semantic table, column headers, accessible caption, empty state, RPC error, refresh and pagination controls; links open explorer records. Loaded block bounds remain visible.

Focus uses `:focus-visible`, 3px solid with 4px offset. Buttons respond to Enter/Space and disclosures use native behavior. The skip link reaches the main landmark. Motion is limited to a 120ms press transform with `cubic-bezier(0.2, 0, 0, 1)` and scale 0.96, only under `prefers-reduced-motion: no-preference`. Colors change immediately so disabled-to-enabled transitions cannot transiently lose contrast. No page-load animation exists.

## Do's and don'ts

- Start additions inside `.page`, reuse semantic color tokens, and keep state before actions in the DOM.
- Use the rust fill only for the current payment step. Keep supporting actions neutral and explain why unavailable actions cannot run.
- Preserve the explicit approval and claim separation and the statement that the final king can receive less than they paid.
- Keep precise values, full addresses and loaded history ranges reachable; compact display must not silently change transaction amounts.
- Keep fonts local and use ordinary links/buttons/disclosures. Avoid introducing a second icon family, a theme toggle, a modal workflow, or a second deployment configuration without a product need.
- For a related future static view, start from the existing header/page/section patterns, select existing body and display roles, and test its main action at 320px, with keyboard input, stale RPC data and reduced motion. Any additional route would need a static export or hash navigation.

Design review follows the supplied Better Interface guide (Jakub Krehel, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`); documentation structure follows the supplied Impeccable reference (Paul Bakaus, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). See `web/README.md` for source links and font licenses.
