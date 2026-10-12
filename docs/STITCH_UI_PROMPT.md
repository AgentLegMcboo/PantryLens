# PantryLens — Google Stitch redesign prompt

Attach the accompanying Home and Review & Verify concept images as visual references, then paste the prompt below. They are proposed designs, not screenshots of the current app. Numbers and products shown are sample data.

- [Home concept](stitch-references/pantrylens-home.png)
- [Review & Verify concept](stitch-references/pantrylens-review.png)

```text
Redesign PantryLens, a mobile app that helps food pantry volunteers record donations, check inventory, build balanced family boxes, and identify donation needs.

Make it more visually memorable, welcoming, and easy to use during a busy volunteer shift. Preserve its warm brown and terracotta identity. Improve the existing product rather than turning it into a shopping, recipe, or calorie-tracking app.

Use the attached images as the visual direction: the Home image establishes the brand and action hierarchy; the Review & Verify image establishes practical list layouts and clear confirmation controls. Carry one consistent design system across every screen. Refine these concepts wherever usability can improve.

VISUAL DIRECTION
- Terracotta primary #9C4226; warm brown text #2B2420; secondary text #6B6259; warm cream canvas #FBF6EE; white cards; sand borders #E0CDBB; sage accents #6B8E4E.
- Use terracotta for primary actions, sage for positive status, amber for attention, and red only for errors or critical conditions. Pair status colors with text and icons.
- Newsreader-style serif for the wordmark and selected headings; a readable system sans for labels, body copy, counts, and controls.
- Make it catchy through a confident headline, beautifully composed donation photography, crisp product thumbnails, and a distinctive warm palette. Keep operational screens calm and efficient.
- Use 24px page gutters, an 8px spacing rhythm, 12–16px card corners, subtle warm shadows, and restrained borders. Use rows and section spacing instead of wrapping everything in cards.
- Body text should be about 16px with strong contrast. Interactive targets should be at least 48px. Respect mobile safe areas, larger text, and comfortable one-handed use.

NAVIGATION
Keep four labeled tabs: Home, Inventory, Build, Needs. Make the selected tab obvious. Put settings and team access in the header menu. Keep the pantry selector easy to find. Use focused screens with back navigation for donation intake, scanning, and review; do not show the tab bar inside these flows. Each screen needs one unmistakable primary action.

DESIGN THESE SCREENS
1. Home: pantry selector, welcoming short headline, a prominent “Scan donation” action with purposeful food imagery, secondary “Weigh bulk” and “Audit shelf” actions, compact box-readiness and expiry summaries, actionable needs, and brief recent activity.
2. Inventory: visible search, category filters, readable product rows with thumbnails, quantities and expiry dates, clear low-stock/expiry labels, and an easy item-detail path. Prioritize scanning a list over decorative charts.
3. Donation capture: clear camera guidance, photo and barcode options with distinct labels, accessible manual entry, and a clear capture action. Explain the next step in one short sentence.
4. Review & Verify: editable product rows, large quantity steppers, clear category and expiry controls, “Barcode matched” versus “Needs review” states, add/remove item actions, and a sticky “Confirm & add [count] units” button. Nothing enters inventory before confirmation.
5. Barcode scanner and match preview: uncluttered viewfinder, flashlight, close and manual-entry actions. Show the detected product name and image before “Use this product”, with “Scan again” as a secondary action. Include a helpful no-match state.
6. Build boxes: clearly distinguish boxes already packed from boxes that current stock can support. Show target count, family size, box type, feasible result, and the limiting category. Keep detailed allocation in a secondary sheet. Only allow packing a feasible number.
7. Needs: rank shortages by packing impact, explain what to request and why, show useful quantities, and provide a clear share-needs action.
8. Onboarding: a short, skippable introduction explaining photograph → review → pack, with realistic product previews and concise benefits. Avoid lengthy slides.

Include loading, empty, offline/error, permission-denied, and success states for the main workflows. Use plain volunteer-friendly copy. Unknown expiry and missing allergen information must remain explicitly unknown; never infer safety from absent data. Sample numbers are illustrative, not live statistics.

Avoid purple/blue startup gradients, glassmorphism, neon, excessive pills, nested cards, tiny text, fake graphs, leaderboards, invented features, or ornamental clutter. The result should feel like a polished native mobile utility with warmth and personality.

Deliver the screen designs plus a reusable visual component system for headers, buttons, product rows, filters, quantity steppers, status labels, bottom sheets, and navigation. Keep spacing, typography, icons, and interaction hierarchy consistent throughout.
```
