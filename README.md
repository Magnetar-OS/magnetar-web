# magnetar-web

The source of [magnetaros.com](https://magnetaros.com): a single static page
built with Astro, with a live magnetar drawn behind it in three.js.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # astro check, then a static build in dist/
pnpm preview    # serve dist/
pnpm test       # build, then check the built page (tests/site.test.mjs)
```

`astro check` needs TypeScript 6: TypeScript 7's native compiler does not yet
expose the API it uses, and `@astrojs/check` accepts only `^5 || ^6`. That is
why `package.json` pins `typescript` to exactly `6.0.3`, the last 6.x release.

## Layout

| path | what |
|---|---|
| `src/pages/index.astro` | The page, assembled from the section components. |
| `src/components/` | Hero (with the live field), Layers, Suite, Brief, Install, Footer. |
| `src/data/suite.ts` | The apps: names, package names, AppStream summaries, benchmarks, icon hues. The order is also each app's flux tube in the field. Also the brief's measured figures. |
| `src/scripts/field/stage.ts` | Renderer, camera, frame loop, page drift, focus and starquake. |
| `src/scripts/field/shared.ts` | Field building blocks: dipole lines, jets, star, halo. |
| `src/scripts/field/variants.ts` | The field looks the hero can switch between. |
| `tests/` | Checks on the built page: the install steps cover every app and place the repository correctly, no link points at the package host root, three.js loads on demand, robots.txt, the sitemap and `og:url` are there, the measured figures are the recorded ones, the page is served in its still state, and the phone nav keeps Install. |
| `scripts/measure-suite.sh` | Counts lines of Rust, tests and `todo!()` calls on each suite repo's `main`, for `measured` in `src/data/suite.ts`. Re-run it and update `measured` when refreshing the figures. |
| `public/icons/` | App icons, copied from `magnetar-brand/icons/hicolor/scalable/apps/`. |
| `public/robots.txt` | Allows all crawlers and points them at the sitemap, which `@astrojs/sitemap` writes at build time. |
| `public/field-still.svg` | Shown in place of the field without JavaScript, or when neither WebGPU nor WebGL 2 is available; from `magnetar-brand/wallpapers/magnetar.svg`. |

## The field

Particles are positioned entirely in the vertex stage from their instance
index: a dipole field line is `r = L·sin²θ`, and each particle slides along
one. No buffers, no compute pass, so the same shaders run on three.js' WebGPU
backend and its WebGL 2 fallback.

Five variants, each drawn from a reference image in `magnetar-art/`:
`streaks`, `bloom`, `filaments`, `disk`, `wind`. The switcher in the hero's
readout changes them, and `?field=<id>` opens the page on one. Every variant
keeps two behaviours: hovering an app in the suite list lights its coloured
tube, and "Set off a starquake" blows the field outward.

With `prefers-reduced-motion`, time stops and frames are drawn only when
something changes.

The page is served in a still state (`data-field="still"` on `<html>`): the
still image, and a readout of one line saying why. An inline script in `<head>`
moves it to `starting` before anything is drawn, and the hero sets `live` once
the field runs, or `still` again if it can't.

## Release

Production is [magnetaros.com](https://magnetaros.com), the Vercel project
`magnetar-web`. Vercel builds with `pnpm test` (`vercel.json`), so nothing is
deployed from a page that fails the checks in `tests/`.

1. Refresh the measured figures. `scripts/measure-suite.sh` reads the suite's
   repos checked out beside this one, so it can't run on Vercel: its totals are
   committed as `measured` in `src/data/suite.ts`. Run it, copy the `total` row
   into `measured` (and the month into `date`), and commit.
2. `pnpm test`.
3. Push `main`, then run `vercel deploy --prod` from this directory. It uploads
   the working tree and builds it on Vercel.

The Vercel project is not connected to this repository yet, because the Vercel
GitHub App is not installed on the Magnetar-OS organisation. Once it is, run
`vercel git connect` here: from then on pushing `main` deploys, and step 3 is
only the push.

## Brand assets

`magnetar-brand` is the source of truth. When an icon or the fallback image
changes there, copy it here.
