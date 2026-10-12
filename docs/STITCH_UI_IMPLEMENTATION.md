# Stitch UI implementation

The design source is the project's `stitch_go_development_toolkit.zip`, particularly
the Warm Pantry design document, dashboard redesign, inventory, and donation review
exports. Stitch MCP was not exposed in this chat, and the plugin directory returned
no Stitch connector. These changes adapt the supplied export; they were not
generated through a live Stitch MCP call.

The app keeps its PantryLens name, existing serif accents, terracotta palette,
data sources, inventory operations, allocation rules, and barcode confirmation.
Both runtime and NativeWind palettes now use the original cream canvas.

## Changes

- Home: a short welcome, donation capture hero, two secondary intake actions,
  readable stock summaries, packed-box entry, actionable shortages and activity.
- Inventory: product and unit totals; product names and expiry details get their
  own row, with quantity controls below instead of crowding the same line.
- Review: a clear intake heading and complete editable item list alongside the
  existing photo overlays. Items without detection boxes stay visible too.
- Shared controls: lighter card outlines, less pronounced button edges, 48px
  steppers and filters, readable type, and status markers with icons and dark
  text on pale backgrounds.
- Navigation: visible screen context and a more distinct selected tab, with
  sufficient room for labels and safe-area padding.

The export's sample counts, fake names, placeholder links and broken icon glyphs
were not copied into the app. All production screen counts come from the store.

## Validation

```sh
npm run typecheck
npm run test:barcodes
npx expo export --platform web --output-dir dist/stitch-ui-check
```

Visual review uses isolated in-memory sample records without calling the real
pantry's write operations or changing authentication. Device camera verification
and deployment are separate from this UI update.
