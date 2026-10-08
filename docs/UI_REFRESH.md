# UI refresh — October 7, 2026

Refined the existing Expo Router / NativeWind app while restoring its warm brown identity after the user rejected the green redesign. Brand colors use the original terracotta (#9C4226), brown ink, cream canvas, warm outlines, Newsreader serif headings and wordmark, and the existing donation illustration.

Sources reviewed:
- https://www.skills.sh/moizibnyousaf/ai-agent-skills/expo-app-design (the supplied link redirects here)
- https://github.com/vibecode/vibecode-cli (cloud scaffolding; not required for this existing app)
- https://raw.githubusercontent.com/expo/skills/main/plugins/expo/skills/expo-design-system/SKILL.md
- https://raw.githubusercontent.com/expo/skills/main/plugins/expo/skills/expo-native-ui/SKILL.md
- https://pantrycheck.com/kb/inventory-screen/ — category sections, quantities, expiry cues, search and edit modes. Reviewed its annotated inventory screenshot.
- https://kitchenpalapp.com/en/ — inventory organization, expiration tracking, and list-based task flows. Reviewed its published shopping-list screenshot.

Changes:
- The original style of desktop top navigation, with four labelled destinations, and mobile bottom navigation. Audit, bulk intake, reports and settings are available from More.
- A compact terracotta donation card with the original illustration on wide screens, a white packing-capacity card, and a single divided stock summary. Stock, expiry, category levels, and activity use real data. Expiring-item rows open their details.
- Flatter inventory rows, explicit grouping and sorting menus, readable dates, visible selection controls, and a manual-entry sheet.
- A brown-and-cream box planner with a visible recipe, stock requirements, shortages, and a direct route to the packing checklist.
- Donation needs with priority categories, drop-off details, a message preview, and copy feedback.
- Consistent controls, page spacing, sheet layouts, and restrained borders and shadows. Donation and bulk-intake forms use narrower content widths on desktop.

Validation: npm run check passed (lint, TypeScript, 39 tests). Lint and TypeScript also passed after the final UI adjustments. Browser preview checked at 1280px desktop, 390px phone, and 320px compact-phone widths. Verified inventory search, selection, sorting, item-detail navigation, manual-entry sheet, family-size recipe updates, packing-checklist navigation, donation-request copy feedback, and mobile message preview using sample data. Native iOS device/simulator verification remains outstanding; Windows web preview does not validate native rendering, the iOS keyboard, or safe areas.

Preview: npm run web -- --port 8082, then /preview in development mode. This route uses clearly labelled sample data and the same shared navigation shell as the app. Production authentication and pantry access requirements remain enforced for saving data.

Current screenshots: ui-warm-desktop.png and ui-warm-mobile.png. Other screenshots record earlier design passes.
