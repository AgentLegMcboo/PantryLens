# PantryLens feature guide

PantryLens tracks food from donation intake through storage, box packing, and household pickup. This guide lists the available features, what each does, where to find it in the app, and the source files that implement it. Settings and team actions depend on the member's role.

## Navigation and getting started

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Introduction | Demonstrates photographing food, confirming detected items, and planning family boxes in three interactive steps. | First launch; Full app map → Replay introduction | `app/onboarding.tsx`, `components/onboarding-demos.tsx` |
| Guided tips | Highlights controls on Home, Inventory, Boxes, and Needs. Tips can be exited and replayed. | First visit to those tabs; Full app map → Replay onboarding | `components/spotlight.tsx` |
| Account creation and sign in | Supports email/password accounts and Google sign in. | Welcome → Sign in or Create account | `app/login.tsx`, `app/sign-up.tsx`, `lib/auth.ts` |
| Create or join a pantry | Creates a food bank or joins one using its volunteer invite code. | After sign in; pantry menu → add/join another pantry | `app/pantry-selection.tsx` |
| Switch pantries | Changes the active pantry for members of more than one pantry. | Tap pantry name in the top bar → Switch pantry | `components/app-header.tsx`, `lib/store.ts` |
| Full app map | Opens a grouped directory of screens and tasks. | Top bar → three-dot menu | `components/app-map.tsx` |
| Home dashboard | Shows scan and intake actions, shelf units, achievable boxes, reports, and categories needing attention. | Home tab | `app/(tabs)/index.tsx` |
| Sign out | Ends the current account session. | Pantry menu or Settings → Sign out | `components/app-header.tsx`, `app/(tabs)/settings.tsx` |

## Donation intake and shelf counting

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Photo donation intake | Takes or imports donation photos and detects food for review before saving. | Home → Scan donations → Photos | `app/log-donation.tsx`, `lib/ai_vision.ts` |
| Multiple photos and capture groups | Uses several views of the same food without automatically treating every view as new stock; separate captures can represent separate stock. | Scan donations → photo capture and review | `app/log-donation.tsx`, `lib/scan-normalize.ts`, `lib/intake.ts` |
| Barcode scanning | Looks up products from barcodes, including equivalent GTIN forms; can identify an uncertain review item. | Scan donations → barcode mode; review item → Scan the barcode; Full app map → Scan a barcode | `app/barcode-scan.tsx`, `lib/barcode-scanner.ts`, `lib/barcode-cache.ts` |
| Review and verify | Lets volunteers correct item name, category, quantity, expiration, condition, and storage location before adding food. | After a photo scan | `app/review-verify.tsx` |
| Cases and multipacks | Converts a case or pack count into units using an explicit pack size. | Scan review → quantity controls | `app/review-verify.tsx`, `lib/intake.ts` |
| Printed date reading | Reads an expiration date from a label photo and allows manual correction or an unknown date. | Scan review → item details → Read date from a label photo | `app/review-verify.tsx`, `lib/intake.ts` |
| Inspection splits | Separates damaged units from usable units while preserving the total count. | Scan review → item details → Separate for inspection | `app/review-verify.tsx`, `lib/intake.ts` |
| Combine or separate readings | Resolves whether scan rows are the same physical stock or separate items; can restore original readings. | Scan review → Every item in this scan | `app/review-verify.tsx`, `lib/intake.ts` |
| Identify again | Re-runs identification for a selected item when its initial name is wrong or missing. | Scan review → item details → Identify with AI | `app/review-verify.tsx` |
| Donation source | Records where incoming food came from, such as grocery rescue, a food bank, a drive, or an individual. | Photo intake/review; bulk intake | `app/log-donation.tsx`, `app/review-verify.tsx`, `app/bulk-intake.tsx` |
| Quick Add | Adds common staples without taking a picture. | Home → Quick Add; Inventory → add controls | `components/quick-add-staples.tsx` |
| Manual item entry | Adds an arbitrary food item and quantity by hand. | Inventory → add controls → Add an item | `app/(tabs)/inventory.tsx` |
| Bulk deliveries by weight | Records crates or pallets in pounds, category, expiration, donor, and notes; estimates units available for boxes. | Home → Weigh a delivery; Full app map → Bulk donation | `app/bulk-intake.tsx` |
| Shelf checks | Counts a selected shelf and compares the count with recorded inventory. | Home → Check a shelf; Full app map → Check shelf inventory | `components/shelf-check.tsx`, `app/shelf-audit.tsx` |
| Reconcile a shelf count | Reviews additions, reductions, and unchanged items before applying a count; reports conflicts if stock changed during counting. | Complete a shelf check → Review shelf count | `app/audit-review.tsx`, `lib/audit.ts` |

## Inventory and storage

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Search inventory | Finds stocked items by search text. | Inventory → Search items | `app/(tabs)/inventory.tsx` |
| Filter, group, and sort | Narrows inventory by category and changes its grouping and display order. | Inventory → Filter & sort | `app/(tabs)/inventory.tsx` |
| Shelves and sub-shelves | Creates and organizes storage places such as shelves, bins, and freezers, with nested locations. | Inventory → Shelves | `components/places-manager.tsx`, `lib/shelves.ts` |
| Move stock | Files items in a storage location, including moving selected items together. | Inventory → item/selection controls → Move to | `app/(tabs)/inventory.tsx` |
| Bulk edits | Changes category or storage location for several selected rows. | Inventory → selection controls | `app/(tabs)/inventory.tsx` |
| Item details | Edits item quantity, category, date, condition, location, image, and dietary tags. | Inventory → tap an item | `app/item-detail.tsx` |
| Item photos | Uses a product image or lets volunteers replace the item's photo. | Inventory → item details → photo controls | `app/item-detail.tsx`, `lib/item-photos.ts` |
| Condition checks | Marks food good, dented, rusted, seal broken, or expired; unsuitable food is held out of box plans. | Item details → Fit to give out?; scan review | `app/item-detail.tsx`, `lib/allocation.ts` |
| Dietary information | Records known allergens and tags such as vegan, no-cook, and easy-open. Missing allergen tags do not establish allergy safety. | Item details → Who can eat it | `app/item-detail.tsx`, `lib/diet.ts` |
| Record stock leaving | Distinguishes food given out, thrown away, and mistaken inventory entries. | Inventory → Take off shelf; item details → Remove from the shelf | `app/(tabs)/inventory.tsx`, `app/item-detail.tsx`, `lib/reports.ts` |

## Box planning and distribution

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Achievable box count | Calculates complete boxes possible from usable shelf stock and bulk units, showing what runs out first. | Boxes → Plan boxes | `app/(tabs)/build.tsx`, `lib/allocation.ts` |
| Batch quantity | Sets how many boxes to plan, up to 200. | Boxes → Change the plan → Boxes you want | `app/(tabs)/build.tsx` |
| One shared family size | Applies the same household size to every box and scales recipes where enabled. | Boxes → Family sizes → Same size | `app/(tabs)/build.tsx`, `lib/box-families.ts` |
| Individual family sizes | Sets 1–99 people separately for each box, including 20 different sizes in a 20-box plan. Quantities are rounded per household and then summed. | Boxes → Family sizes → Set per box → Edit each box | `app/(tabs)/build.tsx`, `lib/allocation.ts`, `lib/box-families.ts` |
| Fixed-content kits | Keeps the same quantities for kits that do not scale with family size, while retaining the household size. | Boxes → choose a fixed-content box type | `components/box-picker.tsx`, `lib/box-presets.ts` |
| Box presets | Provides Standard family, Senior, Baby & toddler, Kids' snack pack, Hygiene kit, No-kitchen, Wheat-free, and Plant-based starting recipes. | Boxes → Box type → Change | `components/box-picker.tsx`, `lib/box-presets.ts` |
| Saved templates | Creates, edits, copies, deletes, and chooses a default pantry recipe; templates support category quantities, named products, dietary rules, and family scaling. | Boxes → Box type → Change; Settings → Box defaults → What goes in a box | `components/box-picker.tsx`, `components/box-items-editor.tsx` |
| Template folders | Organizes saved recipes into folders. | Box picker → folder controls | `components/box-folders.tsx` |
| Named products | Requires specific products in addition to category amounts, without counting the same stock twice. | Box template editor → specific items | `components/box-items-editor.tsx`, `lib/allocation.ts` |
| Dietary box constraints | Excludes known allergen tags or requires recorded tags such as vegan/no-cook/easy-open when planning and picking. | Box picker presets and template editor | `lib/diet.ts`, `lib/allocation.ts` |
| Shortage breakdown | Shows category stock versus the amounts needed for the requested plan. Mixed-size plans use the combined household requirements. | Boxes → Details | `app/(tabs)/build.tsx` |
| Use-first allocation and variety | Prioritizes stock near expiration, then rotates across products where possible. Expired and unsuitable stock is excluded. | Applied automatically to box plans and pick lists | `lib/allocation.ts` |
| Packing checklist | Combines shelf picks, quantities, locations, and use-first cues; tracks checked rows before finishing. | Boxes → Pack boxes | `app/packing-checklist.tsx` |
| Individual packing instructions | Shows the exact products and quantities for each numbered household box. If stock is short, boxes are planned in order and only the complete initial set is included. | Packing checklist → See what goes in each box | `app/packing-checklist.tsx`, `lib/allocation.ts` |
| Save packed boxes | Deducts picked units through the server and creates Ready to go entries. Retries reuse run IDs to avoid deducting a saved box twice. Individually sized boxes are saved separately. | Packing checklist → Finish and update the shelf | `lib/store.ts`, `lib/pack-batch.ts` |
| Ready to go | Shows packed boxes awaiting pickup, their contents, counts remaining, and recorded family sizes. | Boxes → Ready to go | `components/ready-boxes-content.tsx` |
| Pickup recording | Records one pickup or all remaining pickups. Food counts as given out when collected. Individual box entries let volunteers hand out the matching family size. | Ready to go → Hand out 1 / All picked up | `components/ready-boxes-content.tsx`, `lib/store.ts` |
| Batch names and folders | Names a packed batch and files it by distribution day or destination. Individually sized boxes can also be named or filed. | Ready to go → pencil; Folders | `components/ready-boxes-content.tsx`, `components/box-folders.tsx` |

## Needs and notifications

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Priority shortages | Highlights the category limiting boxes and lists other categories below their low-stock thresholds. The goal uses the pantry's saved box count and usual family size. | Needs tab | `app/(tabs)/needs.tsx` |
| Donation suggestions | Expands a shortage to suggest appropriate foods to request. | Needs → tap a category | `app/(tabs)/needs.tsx` |
| Shareable donor message | Builds a dated request with shortages and configured drop-off location/hours; can be copied or shared. | Needs → Ask donors for help | `app/(tabs)/needs.tsx` |
| Expiry and inspection notifications | Surfaces use-first, past-date, and held stock and supports clearing notifications. | Top bar → bell → Notifications | `app/expiring-soon.tsx`, `lib/notifications.ts` |
| Team alerts | Shows new team activity in a top notification bubble with a link to the relevant needs. | Appears above the active app screen | `components/top-notification-bubble.tsx`, `lib/team-alerts.ts` |

## Reports and team management

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Reports dashboard | Summarizes pantry activity, stock leaving, categories, and bulk weight. | Home → Reports & activity; Full app map → Reports & activity | `app/reports.tsx` |
| Recent activity | Lists recorded pantry actions and recent stock exits. | Reports → Recent activity / Recent stock left | `app/reports.tsx`, `lib/reports.ts` |
| Slow-moving stock | Shows items sitting longest and their movement/waste figures. | Reports → Sitting the longest | `app/reports.tsx`, `lib/reports.ts` |
| Monthly partner report | Selects a reporting month and generates a downloadable report for that month. | Reports → Reporting month → Download monthly report | `app/reports.tsx`, `lib/partner-report.ts` |
| CSV exports | Exports reporting data for use outside the app. | Reports → Export CSV | `app/reports.tsx`, `lib/reports.ts` |
| Invite volunteers | Shows the pantry's invite code for new volunteers. | Pantry menu or Settings → Team | `app/team.tsx` |
| Team roster and roles | Lists members and role explanations; authorized members can manage access. | Team | `app/team.tsx`, `lib/permissions.ts` |
| Member activity and uploads | Shows member contribution totals and recent scan uploads, with scan detail inspection. | Team → tap a member | `app/member.tsx`, `lib/scan-history.ts` |
| Role changes, ownership, removal | Lets authorized members change roles, transfer ownership, or remove pantry membership. | Team → member detail | `app/member.tsx`, `lib/permissions.ts` |

## Settings and shared behavior

| Feature | What it does | Where to find it | Source |
| --- | --- | --- | --- |
| Profile and profile photo | Manages the signed-in member's profile and avatar. | Pantry menu → profile; Settings → Your profile | `app/(tabs)/settings.tsx`, `components/profile-photo-editor.tsx` |
| Pantry details | Changes pantry name and donor drop-off location/hours. | Settings → Pantry details | `app/(tabs)/settings.tsx` |
| Box defaults | Sets boxes per distribution, usual family size, and default box contents. Needs uses these defaults; per-box household sizes apply to the current packing plan. | Settings → Box defaults | `app/(tabs)/settings.tsx` |
| Stock alert thresholds | Sets when a category counts as low stock. | Settings → Stock alerts | `app/(tabs)/settings.tsx` |
| Expiry warning window | Sets how far ahead food should be flagged as use-first. | Settings → Stock alerts → Flag stock as use-first | `app/(tabs)/settings.tsx`, `lib/expiry.ts` |
| Appearance | Selects light, dark, or automatic appearance. | Top bar → appearance control; Settings → Appearance & accessibility | `components/appearance-control.tsx`, `lib/appearance.ts` |
| Larger text | Enlarges text and strengthens contrast for readability. | Settings → Appearance & accessibility → Larger text; pantry menu | `lib/accessibility.ts`, `components/ui/text.tsx` |
| Reduced motion | Adapts supported animations to the device's reduced-motion setting. | Device accessibility settings | `components/motion.tsx`, `components/top-notification-bubble.tsx` |
| Haptics and sound | Enables or disables tap feedback and confirmation sounds. | Settings → Feel & sound | `app/(tabs)/settings.tsx`, `lib/feedback.ts` |
| Shared pantry updates | Refreshes pantry data across members through realtime subscriptions. | Automatic while signed in to a pantry | `lib/store.ts` |
| Pending offline changes | Queues supported inventory mutations and exposes a pending count with manual sync. Packing requires a successful server save. | Top-bar offline banner → Sync now | `lib/offline-queue.ts`, `components/app-header.tsx` |
| Development tools | Provides reset/replay tools and pantry deletion in development builds, subject to permissions. | Settings → Developer; absent from release builds | `app/(tabs)/settings.tsx` |

## Example with different household sizes

Open **Boxes → Plan boxes**, set **Boxes you want** to **20**, choose **Family sizes → Set per box**, and tap **Edit each box**. Give Box 1 a family size of 2, Box 2 a size of 5, Box 3 a size of 7, and continue for the remaining households. The arrows move through five boxes at a time. Every box can have a different value.

The plan adds each household's separately rounded recipe. Open **Details** for combined stock requirements, then start packing and use **See what goes in each box** to label and fill each numbered box. Finishing saves individual entries with household sizes in **Ready to go** so volunteers can identify the correct box at pickup.
