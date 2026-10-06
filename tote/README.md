# Bees Tote Studio

Standalone React + Vite + Three.js / React Three Fiber / Drei app for
`https://totebag.builtbyaether.com`. The existing Wrapped app and deployment stay separate.

From the repository root (Node 22.12+):

```sh
npm ci
npm run dev:tote       # http://localhost:5173; also available on your LAN
npm run build:tote     # builds only the tote site into tote/dist/
npm run preview:tote   # http://localhost:4173
npm test
```

## Patch artwork

The ten PNGs in `tote/public/patches/` are the original artwork supplied in
`Desktop/Aether - Logo/58.png` through `66.png` and `Desktop/abejas.png`, copied
without altering the images.
Names and paths live in `tote/src/data/patches.js`. To add a patch, add a PNG and one
entry to that array. Terrace Club is the only default selection. All entries can
be selected independently; there is no selection limit. More than ten selected
entries automatically fit into rows above and below the logo.
Non-square images retain their aspect ratio. A missing PNG disables its button and
removes that patch from the selection without interrupting the other patches.

Selected patches automatically pack into centered, staggered arrangements around
the logo. Removing an entry closes its gap, including when artwork fails to load.
Small selections use slightly larger patches; fuller layouts use sizes around 0.40
model units with slight rotations. The logo is 1.04 model units wide.
`tools/generate-tote-patches.mjs` is the old placeholder generator; its output is no
longer used by the page.

## Model and materials

No user-provided GLB was present during implementation. `tote/public/models/tote.glb`
is a locally authored placeholder: an open canvas body, rim seams, and two black
webbing handles. The app loads this actual local GLB. If the file is missing or fails
to parse, it renders the same procedural tote and shows a brief status notice.

Replace that file with your model, then run:

```sh
npm run inspect:tote
# Or inspect a GLB before copying it into the app:
npm run inspect:tote -- /absolute/path/to/your-model.glb
```

In `src/config/toteConfig.js`, update `model.bodyMeshNames`, `model.bodyMaterialNames`,
and `model.strapMaterialNames` with the printed names. The shipped GLB has `Tote_Body`
as its main body, `Natural_Canvas` and `Canvas_Seams` as canvas materials, and
`Black_Webbing` as its strap material. An unknown body name falls back to the largest
non-handle mesh. No external model or texture services are used.

`model.rotation` orients a replacement asset before normalization; its front should
face +Z. The loader centers the model and normalizes its height to `model.height`.
`model.colors.body` and `model.colors.straps` control the colors. `model.recolor: false`
preserves original colors and color maps. Original normal/bump maps are retained;
a generated woven bump map fills in when neither is present. Reinspect and check
front, back, and side views after swapping the geometry.

`node tools/generate-tote.mjs` regenerates the placeholder GLB, overwriting the file.

## Move, resize, and rotate the patches

Everything starts with `patchPlacement` in `src/config/toteConfig.js`:

| Setting | Effect |
| --- | --- |
| `position` | Center of the patch area: X right, Y up, Z toward the front |
| `rotation` | Rotation in radians: Z turns the artwork on the fabric |
| `scale` | Base width, height, and decal projection depth |
| `layout.gap` | Space between neighboring selected patches |
| `layout.upperY`, `layout.lowerY`, `layout.sideX` | Layout offsets around the logo |
| `layout.smallCountScale`, `layout.mediumCountScale` | Size multipliers for small selections |
| `surfaceOffset` | Distance above the surface to prevent flickering (default 0.004) |
| `grid` | Row widths, heights, offsets, and gap for more than ten patches |

Each data entry can optionally include `placement: { position, rotation, scale }`
to override its automatic placement with absolute values in normalized model coordinates. Positions
are snapped to the front fabric by raycasting along the placement's local Z axis;
use `surfaceOffset` to adjust how high the artwork sits above the fabric. Decals use
Three.js `DecalGeometry` (the same projector used by Drei's `Decal`). Geometry is
normalized before projection, so nested GLB transforms are supported. If projection
produces no triangles, the patch uses a thin plane instead.

`toteConfig.background.image`, `size`, and `repeat` control the repeating Bees
background. Set `size: 'cover'` and `repeat: 'no-repeat'` for a future full-screen photo.
`toteConfig.wordmark` controls the permanent logo printed on the center of the bag.
`toteConfig.logoPlacement.position`, `.rotation`, and `.scale`
control that printed logo; the image aspect ratio is preserved. Clearing the patches
does not remove the logo. Automatic arrangements leave it unobstructed.

## Controls and performance

- Drag or swipe to orbit, wheel or pinch to zoom. Right-drag or use two fingers to pan.
- Drag the joystick to move the viewpoint in that direction, or focus it and hold
  an arrow key. Right-drag and two-finger panning use the same direction. Releasing
  the joystick stops movement. Panning is bounded and Reset view recenters the bag.
- Zoom buttons and Reset view also work with a keyboard. Focus the scene and use
  left/right arrows to rotate, +/- to zoom, or Home to reset.
- Camera distance and polar limits are in `toteConfig.camera`. Mobile framing adapts
  to aspect ratio, with a close zoom limit of 1.8 model units. The selector sits at
  the side on desktop and landscape mobile, and along the bottom in portrait.
  It scrolls independently when the artwork exceeds its available space.
- The canvas fills the viewport underneath the interface. A separate, invisible
  layout guide sets the starting composition; zooming and panning can carry the
  bag behind the header, controls, and patch selector without a canvas cutoff.
- Transparent canvas, studio lights, woven bump map, and a single-frame soft shadow.
- Rendering uses the display's pixel density up to 3×, with 1.5× supersampling on
  standard-density screens. Patch textures use GPU-supported anisotropic filtering
  up to 16× and a small mip bias for distant detail while retaining mipmaps.
- On-demand rendering; selection changes and completed
  texture loads explicitly request a frame so patches update while the bag is still.
  GLB and PNG caches survive selection changes. The 3D bundle loads separately.

## Deploy

```sh
aws sso login --profile aether-prod
npm run deploy:tote
```

`infra/tote-hosting.json` creates the separate `bees-tote` stack in Aether's production
account (`200159632733`, `us-east-1`): a private versioned S3 origin, CloudFront, an
automatically validated TLS certificate, and Route 53 A/AAAA records for the tote
subdomain. A CloudFront function protects the page and every asset with the shared
Bees password session. Unauthenticated visitors go to
`https://bees.builtbyaether.com/gate.html?site=tote`. The neutral password screen
returns directly to the tote without mentioning the other site. One login still
unlocks both sites when visitors open their respective links.
The script reads `.deploy/access.json` and builds the private `.deploy/tote-hosting.json`;
do not deploy the unbundled template directly. After changing the password, run
`npm run deploy:both` so both functions use the same key. The script checks the account, builds
and uploads only `tote/dist/`, uploads HTML last, and waits for cache invalidation.
This incurs normal AWS hosting charges. No credentials are included in the build.

## Verification

`npm test` includes thirteen access checks across both sites and eight tote checks:
actual GLB normalization/materials, front-only decal projection for every patch,
automatic layouts and repacking for selected entries, handle clearance, bounded panning,
full-screen camera framing,
and recovery from unknown mesh names.
Browser checks cover independent toggles, clear-all, orbit, zoom, reset, mobile sizes,
and missing model/PNG recovery. Native pinch is provided by Drei's OrbitControls;
desktop browser viewport checks do not substitute for a physical touch-device test.
