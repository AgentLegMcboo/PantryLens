# PantryLens — Product Requirements Document (PRD)

**Version:** 1.0
**Context:** Congressional App Challenge (CAC) submission
**Document type:** Product Requirements Document
**Status:** Draft for build

---

## 1. One-line summary

PantryLens turns imperfect phone photos of food donations into a verified, structured inventory, then uses that inventory to build balanced family food boxes, flag expiring items, and tell the pantry exactly what to ask donors for.

**The core distinction:** A general AI model can *describe* a photo of a pantry. PantryLens builds a *persistent, human-verified inventory* and makes *distribution decisions* from it. The intelligence is not "recognize food" — it's the allocation engine on top of a real database.

---

## 2. Problem & motivation

Small food pantries — the kind run out of churches, schools, and community centers — almost never have inventory software. Tracking is done by hand: volunteers count cans, eyeball what's low, and pack boxes from memory. This causes real problems:

- **No visibility into shortages.** Pantries often have plenty of pasta and almost no protein, but nobody notices until boxes are already unbalanced.
- **Expired or near-expired food gets missed** and either handed out or thrown away.
- **Donation asks are guesses.** Pantries request "food" generally instead of the specific categories they're short on.
- **Volunteer time is wasted** on manual counting and spreadsheet entry instead of serving families.

This is a civic problem with a clear local impact — a strong fit for the Congressional App Challenge — and the builder has direct access to a real testing environment (a food pantry they volunteer at).

**Why now / why this is buildable:** Vision-capable AI models can now do rough item detection and read visible expiration dates well enough to *pre-fill* an inventory, as long as a human confirms. That "AI pre-fills, human verifies" pattern is what makes an accurate pantry inventory realistic for the first time without expensive scanners or staff.

---

## 3. Goals & non-goals

### Goals (what success looks like)
1. Let a volunteer log a donation from photos in **under half the time** manual counting takes.
2. Maintain a **persistent, accurate inventory** across sessions (95%+ accuracy *after* human verification).
3. Automatically identify the **limiting category** (what's actually short) and generate a **donation request list**.
4. Build **balanced family boxes** from current stock, using expiring items first.
5. Be **demoable end-to-end** in under 3 minutes for the CAC video.

### Non-goals (explicitly NOT trying to do)
- **Perfect one-shot AI counting.** The app is designed around human verification, not around the AI being right.
- **Replacing a warehouse management system.** This is for small pantries, not regional food banks.
- **Nutrition analysis / dietary planning** beyond simple category balance.
- **Barcode/UPC databases as the primary path** (optional fast-path only — see §14).
- **Multi-organization SaaS platform.** One pantry per account for v1.

---

## 4. Target users

| Persona | Role | What they need |
|---|---|---|
| **Volunteer (primary)** | Logs donations, packs boxes | Fast, guided, forgiving photo capture; simple confirm/edit taps |
| **Pantry coordinator** | Oversees stock & donations | Shortage reports, donation request lists, box-building plans |
| **Donor / drive organizer (indirect)** | Runs school/community drives | A clear "most needed" list to share |

Design assumption: the primary user is a **non-technical volunteer on a phone**, possibly older, working quickly. Every interaction must survive a cluttered bag, bad lighting, and a rushed tap.

---

## 5. User stories

**Donation intake**
- As a volunteer, I take one photo of a donation bag and PantryLens pre-fills the items so I only tap to confirm.
- As a volunteer, when the AI is unsure about an item, it asks me directly instead of guessing silently.

**Inventory**
- As a coordinator, I can see current stock by category at any time without a spreadsheet.
- As a coordinator, I get alerts when a category (e.g., protein) drops below a threshold.

**Expiration**
- As a volunteer, I photograph labels and PantryLens flags anything expiring soon and marks it "use first."

**Distribution**
- As a coordinator, I tell PantryLens I need to pack 12 boxes for families of 4, and it tells me how many balanced boxes I can actually make and what's limiting me.
- As a volunteer, I get a simple per-box packing checklist.

**Donations**
- As a coordinator, I generate a "most needed this week" list to send to donors.

---

## 6. Feature requirements (prioritized)

Priorities: **P0** = MVP / must-have for CAC demo. **P1** = strong add if time allows. **P2** = stretch / future.

### P0 — MVP (build this first)
1. **Guided donation intake** — pick "donation" mode, take 1–3 photos, AI detects items → list of {item, count, category, confidence}.
2. **Human verification screen** — confirm / edit count / change category / mark unknown / rescan. Low-confidence items surfaced first.
3. **Persistent inventory database** — verified items stored with category, count, expiration (if known), date added.
4. **Expiration flagging** — items with a known expiration within a threshold (e.g., 30 days) flagged "use first."
5. **Balanced box builder** — given a box template (rules), compute how many boxes can be made and the limiting category; prioritize expiring items.
6. **Donation request generator** — output the short list of categories/items the pantry is most short on.

### P1 — high value
7. **Shelf audit mode** — guided multi-photo capture per shelf (left/center/right), running count, edit before commit.
8. **Barcode fast-path** — scan a UPC to identify hard/unknown items instantly.
9. **Family-size adjustment** — scale box contents for family size (e.g., 2 vs 6 people).
10. **Exportable packing checklist** — printable/shareable per-box list for volunteers.

### P2 — stretch / future
11. **Week-over-week comparison** — "protein dropped 18 units since last scan."
12. **Damaged-packaging detection.**
13. **Multi-pantry / role-based accounts.**
14. **Auto-generated donation flyer** (designed, not just a list).
15. **Analytics dashboard** (trends over months).

---

## 7. Core mechanism (the pipeline)

The whole product is one loop, run in different "modes":

```
guided capture → AI extraction → human verification → structured DB → decisions
```

This is deliberately *not* "upload a photo, trust the answer." Each stage matters:

**Step 1 — Guided capture.** The app never accepts random photos. It tells the user what to shoot based on mode (donation box, shelf section, expiration close-up). This is what makes multi-photo counting tractable.

**Step 2 — AI extraction.** A vision model returns structured candidates: item name, rough count, category, visible expiration date, and a **confidence score** per item.

**Step 3 — Human verification.** The app shows candidates, surfaces low-confidence and "unknown" items for attention, and lets the volunteer confirm or correct in one tap. *Nothing enters inventory unverified.*

**Step 4 — Structured database.** Confirmed items become persistent rows. This is the point where PantryLens stops being a photo-describer and becomes a system of record.

**Step 5 — Decisions.** The allocation engine (§9) reads inventory state and produces box plans, limiting-category alerts, expiration priorities, and donation requests.

---

## 8. AI / detection approach

- **Model:** A multimodal (vision) LLM API for detection + OCR of visible dates in one call. (Provider is swappable — Gemini, Claude, or GPT-4o class; keep it behind one interface so you can switch.)
- **Output contract:** The model is prompted to return **strict JSON only** — an array of `{name, count, category, expiration, confidence}` — no prose. The app parses this; if parsing fails, it retries or falls back to manual entry.
- **Confidence-driven UX:** Items below a confidence threshold (e.g., 70%) are not silently accepted — they're flagged for the human. "Unknown" items always prompt confirmation or a barcode scan.
- **De-duplication across photos:** When multiple photos cover one scan (a shelf), the app keeps a per-scan working set and asks the human to reconcile overlaps rather than blindly summing. (Honest limitation — see §15.)

**Design principle:** treat the AI as a fast, fallible assistant that *drafts* the inventory. The human is always the source of truth.

---

## 9. The allocation engine (the differentiator)

This is the part that makes PantryLens defensible and worth building. It is ordinary code you write — no AI required — operating on the verified inventory.

### 9a. Box template (rules)
A configurable target for one balanced box, e.g.:
```
2 × grain
2 × vegetable
1 × protein
1 × breakfast
1 × snack
1 × hygiene (if available)
```

### 9b. Algorithm (greedy, expiration-aware)
```
INPUT: inventory (items grouped by category, each with count + expiration),
       box_template, requested_box_count, family_size

1. Scale box_template by family_size.
2. For each category, compute max_boxes_possible = floor(category_count / per_box_need).
3. limiting_category = category with the smallest max_boxes_possible.
4. achievable_boxes = min(max_boxes_possible across required categories, requested_box_count).
5. To fill boxes, within each category pick items in EXPIRATION order
   (soonest-expiring first) → "use first."
6. Decrement inventory as items are allocated.
7. OUTPUT:
   - achievable_boxes
   - limiting_category (+ how short)
   - per-box packing list
   - leftover / shortfall per category
```

### 9c. Example output
> "You can make **11 balanced boxes**. **Protein is the limiting category** — you're short by 7 to reach your goal of 12. Use the 2 peanut butter jars first (expire Sep 2026). Suggested donation ask: **canned tuna, beans, peanut butter, baby food.**"

This requires *inventory state + rules + math* — exactly what a single photo thrown into a general AI model cannot reliably produce. **If you build only the recognition and skip this engine, the project reads as an AI wrapper. The allocation engine is what makes it a real app — build it.**

---

## 10. Data model (minimum)

**InventoryItem**
| field | type | notes |
|---|---|---|
| id | string | |
| name | string | e.g., "canned corn" |
| category | enum | grain, vegetable, protein, breakfast, snack, hygiene, baby, unknown |
| count | int | verified quantity |
| expiration | date? | null if unknown |
| date_added | datetime | |
| source | enum | donation / shelf_audit |
| confidence | float? | last AI confidence before verification |

**Scan** (an intake or audit event)
| field | type |
|---|---|
| id | string |
| mode | enum (donation / shelf / expiration) |
| photos | list<url> |
| detected_items | list<candidate> (pre-verification) |
| verified_at | datetime |

**BoxTemplate**
| field | type |
|---|---|
| category | enum |
| qty_per_box | int |
| required | bool |

**CategoryThreshold** (for shortage alerts)
| field | type |
|---|---|
| category | enum |
| min_count | int |

---

## 11. Key screens / UX flow

1. **Home** — big buttons: *Log Donation*, *Audit Shelf*, *Build Boxes*, *Inventory*, *What We Need*.
2. **Capture (guided)** — mode-specific prompts, live camera, "take another / done."
3. **Review & verify** — candidate list, low-confidence items on top, tap to confirm/edit/rescan, "Add to inventory."
4. **Inventory** — grouped by category, expiring items badged, low categories highlighted red.
5. **Build boxes** — set box count + family size → results (achievable boxes, limiting category, packing checklist, export).
6. **What we need** — auto-generated donation request list, shareable.

**UX rules:** mobile-first; every AI result is editable; never block on the network mid-capture (queue and sync); forgiving of bad photos ("couldn't read this — rescan or enter manually").

---

## 12. Technical architecture (realistic for a student build)

- **Client:** Mobile-first web app / PWA (React), or React Native if you want a true app. PWA is fastest — one codebase, uses the phone camera via the browser, installable. **Recommended for CAC timeline: PWA.**
- **Backend / storage / auth:** Firebase or Supabase (Firestore/Postgres for the DB, cloud storage for photos, built-in auth). Avoids running your own server.
- **AI:** One vision-model API call per scan, behind a single `detectItems(photo)` interface so the provider is swappable.
- **Allocation engine:** Plain application code (runs client-side or in a cloud function). This is *yours* — no external dependency.
- **Offline consideration:** Pantries may have weak Wi-Fi. Queue scans locally and sync when connected (nice-to-have, note it even if not fully built).

Keep the stack boring and reliable. Judges reward a working demo over an ambitious broken one.

---

## 13. Success metrics (use these in your demo & writeup)

| Metric | How to measure | Target |
|---|---|---|
| **Post-verification accuracy** | Set up N known items, compare final inventory to ground truth | ≥ 95% |
| **Time saved** | Time manual count+entry vs PantryLens flow on same 50 items | ≥ 50% faster |
| **Box balance quality** | Compare PantryLens boxes vs random volunteer packing | More balanced; correctly IDs limiting category |
| **Usefulness (qualitative)** | 5–10 volunteer testers rate + comment | Mostly positive, actionable feedback |

Concrete claims like *"reduced intake from 18 min to 7 min on a 50-item test"* and *"95% accuracy after verification"* are far more credible than "our AI perfectly inventories a pantry."

---

## 14. Testing plan

You do **not** need hundreds of users. A handful of honest tests beats vague claims.

- **Test 1 — Accuracy:** 40 staged grocery items → photos → compare actual vs AI-detected vs corrected counts.
- **Test 2 — Time saved:** manual count+spreadsheet vs PantryLens on the same 50 items.
- **Test 3 — Box quality:** feed inventory for 20 families; compare PantryLens boxes vs random packing.
- **Test 4 — Real feedback:** ask real pantry volunteers — is it useful? what's annoying? which categories matter? what report would help donations?

A **fake pantry at home** is enough for Tests 1–3; use the real pantry for Test 4.

---

## 15. Risks & honest limitations

| Risk | Reality | Mitigation |
|---|---|---|
| Cans block each other; labels face backward | One photo often can't see everything | Guided multi-photo capture; human verification |
| Tiny expiration dates | OCR misses them | Dedicated close-up "expiration scan"; allow manual entry; expiration is optional, not required |
| AI confuses similar items | Counts/names will be wrong sometimes | Confidence scores + human confirm; barcode fast-path for unknowns |
| Double-counting across shelf photos | Summing overlapping photos overcounts | Per-scan reconciliation step; human edits before commit |
| Weak pantry Wi-Fi | Uploads fail mid-session | Queue locally, sync later |

**The honest framing to use everywhere (pitch, video, writeup):**
> "PantryLens reduces manual inventory work by using AI to pre-fill item counts, then lets volunteers quickly verify and correct them."

Not: "Our AI perfectly inventories a pantry." Judges respect a team that designs around AI's weaknesses.

---

## 16. Congressional App Challenge alignment

- **Real civic problem, local impact:** food insecurity, served through small community pantries.
- **Authentic testing environment:** the builder volunteers at a pantry — real users, real feedback.
- **Genuine technical depth beyond an AI wrapper:** the allocation engine, persistent verified inventory, and confidence-driven human-in-the-loop design.
- **Clear, tellable story for the demo video** (see §17).
- **Measurable outcomes** (§13) instead of hand-waving.

---

## 17. The killer demo (script for your video)

1. Photograph a donation box/bag.
2. PantryLens detects items → shows candidates.
3. Volunteer confirms counts (edits one, resolves one "unknown" via barcode).
4. Inventory updates.
5. App announces: **"Protein is now the limiting category."**
6. Build 12 balanced family boxes → app shows achievable count + "use expiring peanut butter first."
7. Generate donation request: **"Most needed: peanut butter, canned tuna, beans, baby food."**
8. Export a volunteer packing checklist.

This sequence is impossible to reproduce cleanly by throwing one photo into a general AI model — which is exactly the point.

---

## 18. What I excluded (and why)

You said I could keep or scrap the original ideas — here's what I intentionally cut or downgraded from the brainstorm, so nothing's a silent omission:

- **Week-over-week shelf comparison ("protein dropped 18 since last scan")** → moved to **P2**. It sounds great but requires spatial photo registration and reliable repeat counting, which is exactly where the AI is weakest. High effort, high failure risk on a deadline. Ship the single-point inventory first.
- **Damaged-packaging detection** → **P2/cut.** Adds AI scope and edge cases for little demo payoff.
- **Auto-generated donation *flyer* (designed graphic)** → downgraded to a **plain "what we need" list** (P0). The list delivers the value; the designed flyer is polish, not core.
- **Multi-organization / role-based accounts** → **cut from v1.** One pantry per account keeps auth and data simple. Adding orgs is a real product later, not a CAC MVP.
- **Barcode scanning as the main identification path** → kept only as an **optional fast-path (P1)** for unknown items. Building a full UPC-database flow would compete with the photo-first story that makes the project distinctive.
- **Analytics dashboard / long-term trends** → **P2.** You won't have months of data during the challenge, so it can't be demoed convincingly anyway.
- **Receipts/inventory-sheet OCR intake** (mentioned in the brainstorm) → **cut from MVP.** It's a different input modality with its own parsing headaches; the donation-photo flow is enough to prove the concept.

What I deliberately **kept and elevated** because it's the whole point: the **allocation engine** (limiting-category + expiration-priority box building) and the **human-verification loop**. Without those two, this is a wrapper; with them, it's a real app.

---

## 19. Open questions to decide before building

1. **PWA or native app?** (Recommended: PWA for speed. Native only if you specifically want app-store presence.)
2. **Which vision model provider** for detection/OCR, and what's the cost per scan at demo volume?
3. **Default box template** — confirm the exact category rules with a real coordinator.
4. **Expiration threshold** for "use first" — 14, 21, or 30 days?
5. **How much offline support** is worth building given your pantry's Wi-Fi?
6. **Team size & timeline** — this determines whether you attempt any P1 items.

---

## 20. Suggested build order (fastest path to a working demo)

1. Data model + inventory screen (manual add first — proves the DB works).
2. `detectItems(photo)` → JSON contract → verification screen.
3. Donation intake end-to-end (photo → verify → inventory).
4. Expiration flagging.
5. **Allocation engine + build-boxes screen** (the differentiator — don't skip).
6. Donation request generator.
7. Polish: guided capture prompts, export checklist.
8. Then, only if time: shelf audit mode, barcode fast-path.

---

*End of PRD v1.0.*
