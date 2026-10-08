# PantryLens: demo and validation

The original terracotta palette, Newsreader typography, category icons, and donation illustration are preserved. The refreshed UI makes the donation action prominent, explains AI verification, shows usable stock and bulk estimates, and connects shortages to balanced boxes.

## Run and review

```powershell
npm run check
npm run web -- --max-workers 2
```

Open `http://localhost:8081/preview` for the actual Home, Inventory, Build boxes, and Needs components with clearly labelled sample data. This route is development-only. Its sample counts are illustrative; they are not impact evidence or a backend test. Navigation to intake and packing requires a signed-in pantry account.

## Backend release dependency

The new client intake and packing paths require `supabase/migrations/20261005090000_reliable_intake_and_packing.sql`. It adds durable verified scan records, replay-safe intake and packing transactions, and shelf-scoped audit replacement. It has been tested locally with PostgreSQL via PGlite, but has not been applied to the hosted project.

For the intended Supabase project, link the CLI to its project reference, review `supabase db push --dry-run`, then apply the migration. Redeploy both functions that import the barcode helper:

```powershell
npx supabase db push
npx supabase functions deploy lookup-barcode
npx supabase functions deploy analyze-donation
```

Use the project's existing authentication and secrets configuration. Do not put service keys into the app. Validate this release in a test pantry before using real inventory.

## A focused 3-minute demo

The [official 2026 rules](https://www.congressionalappchallenge.us/wp-content/uploads/2026/05/2026-CAC-Rules.pdf) call for a 1–3 minute demonstration video with the creators, app name, purpose, target audience, tools/languages, and functionality. Check your district's instructions too. The [official judging guidance](https://www.congressionalappchallenge.us/congress/congressional-toolkit/) includes societal usefulness, creativity, implementation, and user experience.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:25 | PantryLens Home | Introduce creators and app. Explain the pantry volunteer's problem: logging mixed donations and planning balanced family boxes. |
| 0:25–1:10 | Photograph → Review & Verify → Save | Show a real package, correct an imperfect AI draft, and confirm quantity/category/date. Explain that AI proposes and the volunteer decides. |
| 1:10–1:40 | Home → Needs | Show the resulting stock and shortage change. Copy a request with the pantry's configured drop-off details. Identify bulk counts as estimates. |
| 1:40–2:15 | Build boxes → checklist → finish | Show the limiting category, pick each line, and confirm the stock count decreases. |
| 2:15–2:40 | Offline verified intake → reconnect | Show the saved-on-device notice, then replay once with no duplicate inventory. |
| 2:40–3:00 | Tools and real observations | Name Expo/React Native, TypeScript, Supabase/PostgreSQL, and the AI/provider services actually used. Share measured volunteer feedback or time savings only if collected. |

## Validate before recording

- Use two test accounts (admin and volunteer). Verify the volunteer can log food but cannot change pantry-wide rules.
- Photograph a mixed donation on a real phone, including glare, an unknown product, and a deliberately incorrect quantity. Check that corrections reach inventory and scan history.
- Disconnect after verification, restart the app, reconnect, and verify exactly one intake commits. Confirm another signed-in account cannot replay the first account's queue.
- Audit one configured shelf and verify the other shelves remain unchanged. Try a saved audit after a newer stock change; it must fail visibly rather than erase new stock.
- Pack packaged and bulk stock together. Verify counts, proportional bulk weight, and given-out records. Retry a lost response and confirm the same packing operation is not deducted twice.
- Check checksum-invalid and valid-but-mismatched barcode packages. Provider matches still need the volunteer's explicit confirmation.
- Ask at least a few intended users to complete a donation and a box plan without coaching. Record task completion, mistakes, and confusing wording; use their observations for the next UI iteration.

## Limits to describe honestly

Offline queuing covers verified packaged intake and saved photo captures; settings, bulk intake, and packing still require a connection. Pending intakes appear in inventory only after the server accepts them. Scan records persist after verified intake; a pre-verification capture remains local. PostgreSQL tests use a schema fixture and do not replace hosted Supabase, camera, or physical-device testing. AI and barcode coverage are fallible; no accuracy rate has been measured in this change.
