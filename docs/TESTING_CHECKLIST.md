# PantryLens hands-on test checklist

Use a test pantry: these steps add stock and save real inventory corrections. Start the app from this folder with `npm start`, open the URL printed by Expo for web, or scan its QR code in a compatible Expo Go/development build. Sign in and choose your test pantry. Camera and date-photo recognition need a working deployed scanner, a signed-in session and network access; use a physical phone for camera testing.

The tests below describe expected behavior. They are a manual acceptance checklist, not a claim that physical-camera recognition or your live backend has already passed.

## 1. Liquid Glass

- Open Home or Inventory in Chrome/Edge. Scroll a card or item row behind the bottom navigation. The floating frame should catch light at its rim, and the content near its edges should bend as it passes underneath. Tab icons and labels stay sharp. This is live backdrop refraction, not a fixed background image.
- Tap each tab, including several quick changes. The selected pill follows the latest tap; navigation remains responsive. Scroll to the last button/item: it must clear the bar and remain tappable.
- Open Quick Add or an Inventory Group/Sort sheet. Its corners and rim should catch light, while the warm, heavier material keeps form text readable. Drag it down a little and release, then dismiss it. Scrolling a long sheet must still reach its final control.
- Try a narrow phone viewport and a wide desktop window. All four tabs must divide the full navigation width equally, with a 12px outer gutter. Sheets are capped at 640px. Neither should spill sideways.
- Enable the app's large-text mode, OS Reduce Transparency, browser reduced-transparency, or high-contrast settings. Expect solid cream surfaces with borders. This is intentional. Reduced Motion removes the sliding tab animation. Restore the settings afterward if you want translucent glass.
- On compatible iOS 26+ hardware/runtime the app uses Apple's native Liquid Glass. Rebuild a custom native app after adding `expo-glass-effect`; a browser refresh cannot update a native binary. Expo Go must match the project's SDK. Android/older iOS use a solid fallback. Safari/Firefox web use frosted glass rather than Chromium's SVG refraction. Native device rendering still needs a physical-device check.

## 2. Quick Add any item

1. Home → **Quick Add**. Type `157 cans of chickpeas` in **Item name and quantity**. Verify the summary says 157, correct the category if needed, then tap **Add 157 units**.
2. Expect a success message and a cleared field ready for another item. In Inventory, search for chickpeas and verify the new batch has 157 units.
3. Enter a product that is not a shortcut, such as `3 jars of artichokes`. It must be accepted; the category chooser lets you correct classification.
4. Enter `2 cases of beans`. Adding must wait until **Units in each case or pack** is filled. Enter `24`: the resulting quantity must be 48, not 2 and not an assumed case size.
5. Add the same product twice with different dates/conditions. They must be fresh delivery batches; existing dated or damaged stock must not be silently incremented.
6. Rapidly tap Add twice while saving. There should be one addition. Try an empty name, zero quantity and an impossible date: these must not create stock. Entries support up to 1,000,000 units each; “any item” means no preset-only restriction, not an infinite numeric value.

## 3. Printed dates and unknown dates

1. In Quick Add, expand **Date & condition**. Add a clearly named test item with date `2030-05-06`. Find it in Inventory → item details; the saved date must match.
2. Try `05/2030`: it should normalize to `2030-05-01`. The first day is the app's conservative month-only rule, explained beside the input.
3. Try `2030-02-30`: expect a validation error and no save. Also try an impossible date when editing an existing item's date.
4. Add a batch with no date. It must remain unknown, rather than receiving a made-up date. Open **Expiring Soon** from the header bell; its unknown-date work should offer an item to check.
5. Add a test batch dated `2020-01-01`. Verify it is marked past date and is not offered as usable stock when building boxes. A future, good-condition batch should remain eligible if it meets the box's other rules.
6. Home → **Scan Donations** → photograph an item → review → open its date/condition details → **Read date from a label photo**. Take a close, well-lit photo containing the product and printed date. A proposed date must ask for confirmation; cancel must preserve the previous date. An unreadable or conflicting date must ask for manual entry rather than inventing one.

Date-photo reading uses the existing donation analyzer. Test several real labels, including curved cans and faint ink. The app cannot promise every label will be read, and best-before/use-by label types are not stored separately yet.

## 4. Damaged units held for inspection

1. Scan a group of six matching cans. In review, correct the detected quantity to **6** if necessary.
2. Open date/condition details and mark the packaging as dented, rusted or broken seal. If the scanner already flagged damage, inspect that flag rather than assuming it is correct.
3. In **How many units need inspection?**, choose **2**, then **Separate 2 for inspection**.
4. Expect two rows: **4 good units + 2 held units = 6 total**. Confirm both and save. Inventory must preserve both quantities and the held condition.
5. Build a box using that category: the two held units must not be allocated. They remain recorded stock, not automatically discarded waste. A separate inspection decision is required before changing their condition.
6. Repeat with all six affected: none should become available. Use a real package photo to assess recognition; the manual condition controls are the fallback, not evidence that AI reliably detects every defect.

## 5. Multiple photo angles versus different stock

1. Put six matching units in one group. In **Scan Donations**, capture the first photo, then choose **Another angle** and photograph those same physical units again. Check that both thumbnails have the same group number.
2. Process the photos. For matching detections, two angles of the same stock must not add together. If readings are 6 and 4, the combined result is **6**, not 10. Review the AI quantity against the real shelf.
3. Start a new capture. Photograph six units, choose **New group**, and photograph four additional units. The second thumbnail must have a different group number. Matching products from these groups must remain separate, totaling **10** once saved.
4. Check that different printed dates, conditions or pack sizes stay separate even if their product names look similar. Selecting library photos is one at a time so you can state whether the next photo is another angle or new stock.

The 6/4 examples describe deterministic combining rules; real photos may produce different detections and still require correction. Do not “fix” a camera miscount by treating another angle as new stock.

## 6. Combined and separate rows

1. On review, tap **View all N items**. Look for **Combined from … photo(s)** and **Separate item** labels.
2. For a combined row, tap **Separate these items**. Read the proposed total and cancel first: the row must remain unchanged. Only confirm separation when the readings represent different physical stock; restoring duplicate angles would count the same cans twice.
3. With compatible separate rows available, select one and open the all-items list. Use **Combine with …** on the other. Names/barcodes, category, date and condition must be compatible.
4. Choose **Same physical units** for duplicate views: 6 and 4 become 6. Choose **Different units** for distinct stock: 6 and 4 become 10. Manually combined rows show **Combined by you** and can be separated again.
5. After combining, splitting or editing, check that the affected rows require confirmation again. The app must not silently save an unreviewed changed total.

## 7. Simple capture and review

1. Home → **Scan Donations**. Capture at least two detected items and open review. There should be no three-step guidance banner; review uses the compact confirmed-item count and existing action buttons.
2. Before confirming every row, verify **Save items** is disabled. Check quantity, printed date and condition, then tap **Confirm**. It should move to the next unchecked row.
3. Edit a confirmed row: it must need confirmation again. Navigate back and return during the same running session: review edits should remain in the draft. Restart persistence is not promised for this in-memory draft.
4. Confirm all rows and save once. Expect a completion summary listing total units, units held for inspection and batches with unknown dates. Compare those values with Inventory.
5. Try a small screen, large text and the keyboard open in a details sheet. Every field and the final action must remain reachable. Rapid double taps must not create duplicate saves. An error must stay visible instead of displaying a success message.

## 8. “Check a shelf” means correct existing inventory

1. Inventory → **Manage shelves**: create a test shelf. Assign a test batch of **12** units to it from item details.
2. Home → **Check a shelf**. Read the explanation: this corrects what is already here; new donations belong in intake. Select the test shelf.
3. Choose **Count by hand instead**. Enter a physical count of **9** for the existing test batch. Review must show **Recorded 12 → Counted 9 → Change −3** before saving.
4. Save and approve the count. Reopen Inventory: the shelf should contain 9. In activity/reporting, the change should be an inventory correction, not food distributed to a family.
5. Repeat with a deliberately omitted item. **Still on shelf** must preserve it; **It's gone** requires an explicit decision to remove that missing quantity. Do not mark unphotographed stock gone just because the AI missed it.
6. Repeat via shelf photos and **Count this shelf**. Overlap left/middle/right photos and review each proposed change. Other shelves must not be changed by this count.

## 9. Monthly food-bank report / Feeding America

1. In your test pantry, record known test exits through the normal item/box workflows: for example distribute **3**, discard **2**, and make a shelf correction of **3**, all in the current month. Record the categories and expected totals.
2. Open the header menu → **Reports & Activity** (or Home → **Reports & CSV**). Find **Food bank reporting**. Enter the current month as `YYYY-MM`, then **Download monthly report**.
3. Web should download CSV; a phone should offer the native share sheet. Open it in a spreadsheet and compare the category totals for recorded distribution, discard and correction with your test actions. They must be separate columns.
4. Try a different month and an invalid value such as `2026-13`. Activities outside the chosen month must be excluded, and invalid months must not export.
5. Confirm received totals, distributed pounds and household counts are blank when uncollected. Current stock is explicitly a snapshot taken now, not reconstructed month-end stock. A month with no records is not proof that no activity occurred.

**There is no automatic Feeding America submission.** This is a draft CSV to review with the partner food bank. An official template, required measurements, credentials and approved integration are still needed for direct reporting. No Send/Submit test is possible yet.

## Automated checks

Run from the project folder:

```powershell
npm run typecheck
npm test
```

The current suite has 46 tests, including date validation, count conservation during damage splits, maximum-versus-sum photo grouping, separation history, arbitrary Quick Adds, explicit pack sizes and report boundaries. These checks do not replace physical-phone camera, native glass, gestures, accessibility or live-backend acceptance testing.
