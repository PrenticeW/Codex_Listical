# Tacular brand assets

Full set added 2026-07-12. Mono clock-dial mark (central T + 12-tick dial).

## Layout

- `src/assets/brand/` — every asset (SVGs + PNGs), for importing into components.
- `public/brand/` — favicons and PWA icons only, duplicated here so they can be served as static files (e.g. `/brand/favicon.svg`).

## What's here

- **Marks** — `tacular-mark-black/white.svg` (+512px PNG): the dial mark alone.
- **Tiles** — `tacular-tile-black/white.svg`: rounded-square app icon.
- **Coins** — `tacular-coin-black/white.svg` (+512px PNG): circular, for favicons/avatars/spinners.
- **Wordmarks** — `tacular-wordmark-black/white.svg` (+2048px PNG): text only.
- **Lockups** — `tacular-lockup-black/white.svg` (+2048px PNG): mark + wordmark combined.
- **Favicons/PWA** — `favicon.svg`, `favicon-white.svg`, `favicon-16/32.png`, `favicon-white-16/32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`.

## Brand palette

Pink `#D4356A`, Magenta `#C24799`, Purple `#7941C8`, Gold `#FFC421` (use black mark on gold). Pastels: `#F9D3E1`, `#F0D6F0`, `#E2D8F8`, `#FFEFC7` (use black mark).

## Note on the current favicon

`public/favicon.svg` (the one already wired into `index.html`) is a different, older placeholder icon — it has not been swapped for the new brand favicon. When ready to switch, point `index.html` at `/brand/favicon.svg` and `/brand/favicon-32.png`, and add the apple-touch-icon / PWA icon links documented in `index.html`'s existing comments.
