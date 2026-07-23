# PantryLens — Design Document

**Version:** 1.0
**Context:** Congressional App Challenge
**Covers:** Visual identity (color) + what every page does (functionality, not visuals)

---

## 1. Design principles

Everything in PantryLens follows three rules. When a decision is unclear, pick the option that best fits these:

1. **A tired volunteer can use it.** The main user is often busy, sometimes older, working fast in a back room. Every screen should be understandable in a few seconds with no training.
2. **The human is always in control.** The AI only *suggests*. Nothing is saved, packed, or requested until a person taps to approve it.
3. **One screen, one job.** Each page does a single clear thing. If a page starts trying to do two jobs, split it.

---

## 2. Color palette — "Warm Pantry"

A cozy, human, community-kitchen feel. Warm terracotta and sage rather than a cold "tech" look. This is the chosen palette for the whole app.

### Core colors

| Role | Name | Hex | Where it's used |
|---|---|---|---|
| Primary | Terracotta | `#BC5A3C` | Main buttons, active tabs, headers, the app's identity |
| Primary (dark) | Deep clay | `#8F3E24` | Pressed buttons, dark headings, text on light terracotta |
| Accent | Sage | `#6B8E4E` | Secondary buttons, highlights, links |
| Page background | Cream | `#FBF6EE` | The background behind everything |
| Card surface | Off-white | `#FEFBF6` | Cards, list rows, panels |
| Text (primary) | Warm brown | `#2B2420` | Main text |
| Text (secondary) | Muted brown | `#6B6259` | Labels, hints, less-important text |
| Border | Soft tan | `#E5DBCB` | Hairlines, dividers, input outlines |

### Status colors (these mean one thing only — never reuse them for anything else)

| Meaning | Hex | Used for |
|---|---|---|
| Good / in stock | `#5B8C51` (sage green) | "You have enough," healthy stock levels |
| Expiring soon | `#E39A3B` (amber) | "Use first" flags, upcoming expiration |
| Low stock / critical | `#C0392B` (deep red) | Shortages, the limiting category, empty categories |

### Category colors (for food types — separate from status colors)

| Category | Hex |
|---|---|
| Grain | `#C9A227` |
| Vegetable | `#5B9C4E` |
| Protein | `#A6432B` |
| Breakfast | `#D98A2B` |
| Snack | `#8E6FC4` |
| Hygiene | `#3AA0A0` |
| Baby | `#D46A9F` |
| Unknown | `#8A8880` |

### Two important color rules

- **Keep status colors sacred.** Green, amber, and red mean *good / expiring / low* everywhere in the app. Never use green as a decoration or a category, or a volunteer can't tell "this is well-stocked" from "this is a vegetable."
- **Never rely on color alone.** About 1 in 12 men have some color blindness, and volunteers skew older. Always pair a status color with an icon or a word — a warning triangle on "expiring," a "LOW" tag on shortages. (Note: the protein category `#A6432B` was nudged darker than the earlier swatch so it doesn't clash with the terracotta primary — keep an eye on that pairing.)

---

## 3. How the pages fit together (the map)

**Home is the hub.** Everything is reachable from Home, and a bottom navigation bar gives one-tap access to the five most-used areas from anywhere.

```
                          ┌─────── Home / Dashboard ───────┐
                          │                                │
   Log Donation ──▶ Review & Verify ──▶ (saves to) ──▶ Inventory ──▶ Item Detail
   Shelf Audit  ──▶ Review & Verify ──▶ (updates) ──▶ Inventory
   Build Boxes  ──▶ Packing Checklist
   Build Boxes  ──▶ What We Need (donation request)
   Inventory    ──▶ Expiring Soon (a filtered view)
   Settings (box rules, thresholds, account)
```

Bottom nav bar (always visible): **Home · Inventory · Build · Needs · Settings**

---

## 4. Page-by-page functionality

Each page below is described the same way: what it's for, what the user can do, what the app does, and where it leads. No visual design here — just how it works.

### 4.1 Sign in

**What it's for:** Getting a volunteer into their pantry's account.

**What the user can do:** Enter the pantry's shared login (one login per pantry, not per person — volunteers rotate, so you don't want everyone making accounts). Tap "Enter."

**What the app does:** Confirms the login and opens the pantry's data. Everyone at that pantry sees the same shared inventory.

**Leads to:** Home.

---

### 4.2 Home / Dashboard

**What it's for:** The front door. See the pantry's status at a glance and choose what to do.

**What the user can do:**
- Read a quick summary without tapping anything: total items in stock, how many balanced boxes can be made *right now*, how many items are expiring soon, and which category is running lowest.
- Tap one of the big action buttons: **Log Donation**, **Audit Shelf**, **Build Boxes**, **View Inventory**, **What We Need**.

**What the app does:** Pulls the latest numbers from the inventory and the allocation engine so the summary is always current. Routes the user to whichever action they pick.

**Leads to:** Any main page.

---

### 4.3 Log Donation

**What it's for:** Adding brand-new donations to the inventory using photos. This is the most common task.

**What the user can do:**
- Take one photo of the donation bag or box.
- Add close-up photos of any labels or expiration dates that are hard to see.
- Add more photos if there's more than one bag.
- Tap "Detect items" when done.

**What the app does:** Sends the photos to the AI, which reads them and produces a *draft* list of items — each with a guessed name, count, and category, plus how confident it is. It does **not** save anything yet.

**Leads to:** Review & Verify.

*Plain version: you photograph what just came in, and the app writes a first-draft list so you don't have to type everything.*

---

### 4.4 Review & Verify

**What it's for:** Checking and fixing the AI's draft before anything is saved. This is the trust step — the whole app depends on it.

**What the user can do:** For each item on the draft list, the volunteer can:
- **Confirm** it's correct.
- **Change the count** with plus/minus buttons.
- **Change the category** (e.g., move something from "unknown" to "protein").
- **Rename** an item.
- **Mark unknown** or **rescan** a close-up.
- **Scan a barcode** for a mystery item to identify it fast.

Items the AI was unsure about are pushed to the top so the human looks at them first. When everything looks right, tap **"Add to inventory."**

**What the app does:** Waits. Nothing is saved until the volunteer taps "Add to inventory." At that point the confirmed items are written into the inventory database.

**Leads to:** Inventory (updated), then back to Home.

*Plain version: the app made a guess — you check it, fix anything wrong, and only then does it save. The AI never gets the final say.*

---

### 4.5 Shelf Audit

**What it's for:** Re-counting what's already on the shelves every so often, so the inventory stays accurate over time. (Donations *add* stock; audits *correct* stock.)

**What the user can do:**
- Pick which shelf or section to count (e.g., "Canned goods, Shelf A").
- Follow the app's prompts to take a few photos of that section (left, middle, right) so nothing is hidden.
- Review the counts the AI found and fix any that are wrong or double-counted.
- Tap to save the corrected counts.

**What the app does:** Guides the photo-taking so the section is fully covered, counts the visible items, and helps the volunteer avoid counting the same can twice across overlapping photos. Optionally shows what changed since the last audit ("protein dropped about 18 since last week"). Then updates the existing counts rather than adding new ones.

**Leads to:** Review & Verify → Inventory (updated).

---

### 4.6 Inventory

**What it's for:** The full, searchable list of everything the pantry currently has. This is the source of truth.

**What the user can do:**
- Browse everything, grouped by category.
- See each item's name, count, category, and expiration date (if known), with small tags for "expiring soon" or "low."
- Search for a specific item.
- Filter by category, or sort by expiration date, count, or name.
- Tap any item to open its detail page.
- Tap "Add item" to enter something manually (for donations you didn't photograph).

**What the app does:** Shows live data straight from the database and keeps the tags (expiring, low stock) up to date based on the settings.

**Leads to:** Item Detail, Expiring Soon.

---

### 4.7 Item Detail

**What it's for:** Looking at or fixing one single item.

**What the user can do:** See all the details for one item — name, category, count, expiration, when it was added, and how it got there (donation or audit). Edit any of these, adjust the count, or delete the item.

**What the app does:** Saves any change immediately back to the inventory.

**Leads to:** Back to Inventory.

---

### 4.8 Build Boxes

**What it's for:** The smart core of the app — planning how to pack balanced family food boxes from what's actually in stock. This is what makes PantryLens more than a photo tool.

**What the user can do:**
- Enter how many boxes are needed and the family size.
- Tap "Build."
- Read the plan the app produces.
- Jump to the packing checklist, or generate a donation request for whatever is short.

**What the app does:** Using the box rules from Settings, it calculates:
- **How many balanced boxes you can actually make** with current stock.
- **Which category is holding you back** (the "limiting category") and by how much — e.g., "You wanted 12 boxes but can only make 8; protein is the limit, short by 4."
- **Which specific items to use first**, prioritizing anything expiring soon.
- A **per-box plan** listing what goes in each box.

**Leads to:** Packing Checklist, What We Need.

*Plain version: you say "I need 12 boxes for families of 4," and the app tells you how many you can really make, what's stopping you, and what to grab first.*

---

### 4.9 Packing Checklist

**What it's for:** Dead-simple instructions for whoever is physically packing the boxes.

**What the user can do:** Read a plain list — "Each box: 2 grains, 2 vegetables, 1 protein, 1 breakfast, 1 snack" — plus the specific items to grab (expiring ones first). Check off items as they're packed. Print or share the list.

**What the app does:** Generates the list from the Build Boxes plan and keeps track of what's been checked off.

**Leads to:** Back to Build Boxes or Home.

---

### 4.10 What We Need (Donation Request)

**What it's for:** Turning shortages into a clear ask that can be shared with donors, schools, or the community.

**What the user can do:** See the auto-generated list of what the pantry needs most this week — e.g., "Most needed: protein, baby food, hygiene items." Copy it, share it, or export it as a simple flyer/text.

**What the app does:** Builds the list automatically from the low-stock thresholds and the limiting category, so the pantry asks for exactly what it's short on instead of a vague "please donate food."

**Leads to:** Sharing (out of the app), then back to Home.

---

### 4.11 Expiring Soon

**What it's for:** A focused view of everything that needs to be used first.

**What the user can do:** See all items expiring within the warning window, soonest first, so they get packed before they go to waste. (This can be built as a filtered view of the Inventory page rather than a fully separate page — simpler to build, same result.)

**What the app does:** Filters inventory by expiration date and flags each item as "use first," which also feeds into how Build Boxes chooses items.

**Leads to:** Item Detail, Build Boxes.

---

### 4.12 Settings

**What it's for:** Setting up the app to match how this particular pantry works. Mostly done once by the coordinator, then left alone.

**What the user can do:**
- Set the **box rules** — how many of each category go in a standard box.
- Set **low-stock thresholds** per category — when should a category turn red?
- Set the **expiration warning window** — 14, 21, or 30 days.
- Set the **default family size**.
- Manage the **category list**.
- Edit the **pantry name / account**.

**What the app does:** Applies these settings everywhere — the dashboard warnings, the "expiring soon" flags, the box-building math, and the donation requests all use these numbers.

**Leads to:** Back to Home.

---

## 5. A typical session (to sanity-check the flow)

To confirm the pages connect intuitively, here's a real volunteer's afternoon:

1. Opens the app → **Home**. Sees "protein is low" and "6 items expiring soon."
2. A school drop-off arrives → taps **Log Donation**, photographs 4 bags.
3. Reviews the AI's guesses on **Review & Verify**, fixes one wrong count, confirms → inventory updates.
4. Time to pack for tonight → taps **Build Boxes**, enters "10 boxes, family of 4."
5. App says: "You can make 8 balanced boxes — protein is the limit. Use the tuna expiring this week first."
6. Opens the **Packing Checklist**, packs the boxes, checking each off.
7. Taps **What We Need**, copies "Most needed: protein, baby food," and texts it to the drive organizer.

Every step is one obvious tap from the last. That's the test the design has to keep passing.

---

*End of Design Document v1.0.*
