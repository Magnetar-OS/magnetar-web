# magnetar-web

The source of [magnetaros.com](https://magnetaros.com): a single static page
built with Astro, with a live magnetar drawn behind it in three.js.

## Develop

```sh
pnpm install
pnpm dev        # http://localhost:4321
pnpm build      # astro check, then a static build in dist/
pnpm preview    # serve dist/
pnpm test       # build, then check the built page's install steps and links
```

`astro check` needs TypeScript 6: TypeScript 7's native compiler does not yet
expose the API it uses, which is why `typescript` is pinned to `^6`.

## Layout

| path | what |
|---|---|
| `src/pages/index.astro` | The page, assembled from the section components. |
| `src/components/` | Hero (with the live field), Layers, Suite, Brief, Install, Footer. |
| `src/data/suite.ts` | The apps: names, package names, AppStream summaries, benchmarks, icon hues. The order is also each app's flux tube in the field. |
| `src/scripts/field/stage.ts` | Renderer, camera, frame loop, page drift, focus and starquake. |
| `src/scripts/field/shared.ts` | Field building blocks: dipole lines, jets, star, halo. |
| `src/scripts/field/variants.ts` | The field looks the hero can switch between. |
| `tests/` | Checks on the built page: the install steps cover every app and place the repository correctly. |
| `public/icons/` | App icons, copied from `magnetar-brand/icons/hicolor/scalable/apps/`. |
| `public/field-still.svg` | Shown when neither WebGPU nor WebGL 2 is available; from `magnetar-brand/wallpapers/magnetar.svg`. |

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

## Brand assets

`magnetar-brand` is the source of truth. When an icon or the fallback image
changes there, copy it here.
