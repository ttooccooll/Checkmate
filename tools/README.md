# tools/

Asset pipeline scripts. All run from the repo root with the project's
playwright install (`npx playwright install chromium` once, same as tests).

- `make-vehicles.cjs` — regenerates all traffic sprites (3 taxis, 3 bakkies,
  4 hatchbacks) into `public/assets/` from hand-tuned top-down SVG. Edit the
  SVG functions or the `JOBS` color list to add variants; the game's sprite
  pools live in `src/main.js` (`vehicleSprites`) and the per-type sizes in
  `src/entities/traffic.js` (`VEHICLE_TYPES`).
- `make-webp.cjs` — WebP re-encoder for new image assets, with downscale
  caps. Keeps the asset budget honest (the original 2MB of PNG/JPG ships
  as ~278KB of WebP).

Visual-change workflow used throughout this project: generate, screenshot
at real in-game scale (there are viewer scripts in the test harness to
copy from), and judge the pixels before wiring any mechanics.
