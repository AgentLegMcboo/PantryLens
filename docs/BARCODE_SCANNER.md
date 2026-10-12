# Barcode scanner

Camera readings must pass their format's checksum and agree across two frames
before a product is requested. UPC-E is expanded to UPC-A first; the same eight
digits must never be interpreted as EAN-8 when the camera reports UPC-E.

The scanner previews the product before replacing the selected review row.
Unreadable labels can be entered by hand, including UPC-E with its number-system
and check digits. A flashlight helps in poor light; continuous autofocus is kept
enabled. An explicit retry prevents repeated requests for a stationary unknown
package, and leaving the screen ignores late responses.

Product lookup checks the returned GTIN, including equivalent zero padding.
Nonzero case-pack indicators remain distinct. Fresh positive cache rows last
30 days; old misses and expired matches are rechecked. Provider outages are
retryable and are never cached as unknown products. Exact USDA matches can be
enriched with Open Food Facts imagery and positive allergen claims for the same
GTIN. Missing allergen data does not mean allergen-free.

## Verification

```sh
npm run test:barcodes
npm run typecheck
```

Regression tests cover checksums, UPC-E expansion, camera-frame agreement,
leading-zero aliases, wrong provider responses, outages, cache expiry, category
mix-ups, and client-side response validation. They use fixtures, without API keys
or requests to real services.

On physical iOS and Android devices, check:

- UPC-A, EAN-13, EAN-8, UPC-E and ITF-14 labels, with all end digits visible.
- Switching between two packages does not silently replace an item.
- Product preview acceptance and rejection; only acceptance changes the draft.
- Glare, low light, flashlight, blurry labels, manual entry and denied permission.
- Connection failures, retry, and closing the scanner during a lookup.

Camera recognition quality still depends on the device, label and lighting;
unit tests do not measure a physical scanning accuracy percentage.

## Backend rollout

Both Edge Functions use the shared resolver. Redeploy both to activate the
provider and cache changes in the hosted app; no database migration is needed.

```sh
npx supabase functions deploy lookup-barcode --project-ref YOUR_PROJECT_REF
npx supabase functions deploy analyze-donation --project-ref YOUR_PROJECT_REF
```
