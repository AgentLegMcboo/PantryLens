import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RULE_ABOVE } from '../constants/theme';
import { DetectionOverlay, type OverlayItem } from '../components/detection-overlay';
import { Badge, Button, Card, Chip, Input, ItemThumb, Sheet, Stepper, Text } from '../components/ui';
import * as Crypto from 'expo-crypto';
import { identifyRegion, processImageScan, ScanError } from '../lib/ai_vision';
import { preparePhoto } from '../lib/photo';
import { recordConfirmations, type ConfirmationEntry } from '../lib/catalogue';
import { nextRowToCheck } from '../lib/review-order';
import { attachItemPhotos, type PhotoJob } from '../lib/item-photos';
import type { DetectionBox, ScanCandidate } from '../lib/scan-normalize';
import { fromRegion, itemsRegion, toRegion } from '../lib/box-geometry';
import { cropForDisplay } from '../lib/photo';
import { describeTags, normaliseDietTags } from '../lib/diet';
import { finishScan, verdictFor, type DetectedSnapshot } from '../lib/scan-history';
import {
  Condition,
  CONDITION_LABELS,
  InventoryItem,
  isUsableCondition,
  usePantryStore,
} from '../lib/store';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { useAccessibilityStore } from '../lib/accessibility';
import { canCombineIntake, parsePrintedDate, splitInspection } from '../lib/intake';
import { log } from '../lib/log';

/**
 * Confirming what the scanner found, against the photo it found it in.
 *
 * The list this replaced asked a volunteer to hold "row 12" and "the jar of
 * marinara" in their head simultaneously. Here the photo is the index: every
 * detection is a glowing box drawn where the item actually is, tapping one opens
 * it for editing, and confirming it stops the glow. Progress is legible at a
 * glance — what is still breathing is what still needs you.
 */

/**
 * A row being reviewed.
 *
 * `uid` is assigned once and never derived from array position or name. Both of
 * those change while reviewing — removing a row shifts every later index, and
 * fixing a typo rewrites the name — and either would silently move a "confirmed"
 * tick onto a different item. That is precisely the mistake this screen exists
 * to catch, so it must not be the one it makes.
 */
type DraftRow = Partial<InventoryItem> &
  Partial<Pick<ScanCandidate, 'imageIndex' | 'box' | 'barcode' | 'resolvedBy' | 'sourceDetections' | 'captureGroup'>> & {
    uid: string;
    /**
     * Exactly what the scanner said, frozen before anyone edited it.
     *
     * The catalogue learns by pairing what the model produced with what a human
     * left it as, so the original has to survive the editing. Reading it back off
     * the row at save time would only ever record the corrected name twice.
     */
    rawName: string;
    combinedRows?: DraftRow[];
    /** A box a volunteer drew over something the scan missed. */
    drawnByHand?: boolean;
    /**
     * The scan_items row this came from, and what that row said before anyone
     * touched it.
     *
     * `rawName` above already freezes the name for the catalogue. This freezes
     * the rest — count, category, date — because scan history has to be able to
     * say whether a human changed anything at all, and reading it back off the
     * row at save time would only ever compare the corrected values with
     * themselves. Absent on rows a volunteer added by hand, which belong to no
     * candidate.
     */
    scanItemId?: string;
    detected?: DetectedSnapshot;
  };

let uidCounter = 0;
const nextUid = () => `row-${++uidCounter}`;

const CATEGORIES = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'];

export default function ReviewVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const {
    currentDraft,
    setDraft,
    currentScanPhotos,
    inventory,
    addItems,
    settings,
    locations,
    draftSource,
    defaultLocationFor,
    pendingBarcode,
    setPendingBarcode,
    currentScan,
    setCurrentScan,
  } = usePantryStore();
  const { height: windowHeight } = useWindowDimensions();
  const seniorMode = useAccessibilityStore((s) => s.seniorMode);

  /**
   * Where this whole intake is going.
   *
   * The pantry's process sorts a donation onto a table or into a bin and then
   * shelves it — and that decision is made once, for the batch, by the person
   * carrying it. Asking per item would be nonsense; asking once here is exactly
   * when they know the answer.
   */
  const [batchLocation, setBatchLocation] = useState<string | null>(null);

  /**
   * Resolves where a scanned item belongs: batch override first, then an
   * existing shelf item with the same name, then category rules or existing
   * category peers on the shelves.
   */
  const resolveLocationForRow = (row: DraftRow): string | null => {
    if (batchLocation) return batchLocation;
    const lower = (row.name ?? '').trim().toLowerCase();
    if (lower) {
      const exact = inventory.find(
        (i) => i.location_id && i.name.trim().toLowerCase() === lower,
      );
      if (exact?.location_id) return exact.location_id;
    }
    const cat = (row.category ?? 'unknown') as any;
    const byRule = defaultLocationFor(cat);
    if (byRule) return byRule;
    if (cat && cat !== 'unknown') {
      const peer = inventory.find((i) => i.location_id && i.category === cat);
      if (peer?.location_id) return peer.location_id;
    }
    return null;
  };

  /**
   * Whether the pantry has told the app what its bins are for.
   *
   * When it has, sorting stops being a step: each item files itself under the
   * place that claims its category, and the batch picker becomes an override for
   * the odd load that all goes one place.
   */
  const autoFiles =
    locations.some((l) => l.categories?.length > 0) ||
    inventory.some((i) => !!i.location_id);

  const source: 'donation' | 'shelf_audit' =
    params.source === 'shelf_audit' ? 'shelf_audit' : 'donation';

  const [draftItems, setDraftItems] = useState<DraftRow[]>(() =>
    currentDraft.map((item, index) => ({
      ...item,
      uid: (item as DraftRow).uid ?? nextUid(),
      rawName: (item as DraftRow).rawName ?? item.name ?? '',
      // start_scan returns the candidate ids in the order they were sent, and
      // currentDraft is those same candidates in that same order.
      scanItemId: (item as DraftRow).uid ? (item as DraftRow).scanItemId : currentScan?.itemIds[index],
      detected: (item as DraftRow).detected ?? {
        name: item.name ?? '',
        category: (item.category ?? 'unknown') as string,
        count: item.count ?? 0,
        expiration: item.expiration ?? null,
      },
      // normaliseItem hands this over as imageUrl; the row stores it the way the
      // database does.
      image_url: (item as any).imageUrl ?? item.image_url ?? null,
    })),
  );
  useEffect(() => {
    setDraft(draftItems as InventoryItem[], currentScanPhotos);
  }, [draftItems, setDraft]);
  const [saving, setSaving] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{ units: number; held: number; unknownDates: number } | null>(null);
  const savingRef = useRef(false);
  // Which photo is on screen, when the scan covered more than one.
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Record<string, boolean>>({});

  // Draw mode swaps tapping-to-select for dragging-out a new box.
  const [drawMode, setDrawMode] = useState(false);
  // Details and batch-filing open as sheets over the review.
  const [listOpen, setListOpen] = useState(false);
  const [heldQuantity, setHeldQuantity] = useState(1);
  const [readingDate, setReadingDate] = useState(false);
  const [dateReadError, setDateReadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ title: string; message: string; actions: { text: string; style?: string; onPress?: () => void }[] } | null>(null);
  const ask = (title: string, message: string, actions: { text: string; style?: string; onPress?: () => void }[]) => {
    setMoreOpen(false); setListOpen(false); setDecision({ title, message, actions });
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const [filingOpen, setFilingOpen] = useState(false);
  // Space left for the photo, so it can be sized to fit without scrolling.
  const [photoArea, setPhotoArea] = useState({ w: 0, h: 0 });
  /**
   * Each photo cropped to the part that holds the donation, for display.
   * Worked out once from where the scan found things, so the picture doesn't
   * jump about while boxes are being nudged. Boxes are shown and edited in the
   * crop's coordinates and stored back in the full photo's.
   */
  const [crops, setCrops] = useState<
    Record<number, { region: DetectionBox; uri: string; width: number; height: number }>
  >({});
  useEffect(() => {
    let cancelled = false;
    currentScanPhotos.forEach(async (p, index) => {
      if (!p?.uri || !p.width || !p.height) return;
      const boxes = currentDraft
        .filter((item: any) => (item.imageIndex ?? 0) === index && item.box)
        .map((item: any) => item.box as DetectionBox);
      const region = itemsRegion(boxes);
      if (!region) return;
      const cropped = await cropForDisplay({ uri: p.uri, width: p.width, height: p.height }, region);
      if (cropped && !cancelled) setCrops((prev) => ({ ...prev, [index]: { region, ...cropped } }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    log.debug(
      'nav',
      `review-verify mounted: ${currentDraft.length} rows, ` +
        `${currentScanPhotos.length} photo(s) (source=${source})`,
    );
  }, []);

  const photo = currentScanPhotos[photoIndex];
  const verifiedCount = draftItems.filter((i) => verifiedIds[i.uid]).length;
  const allVerified = draftItems.length > 0 && verifiedCount === draftItems.length;

  useEffect(() => {
    const row = draftItems.find(item => item.uid === selectedId);
    setHeldQuantity(row?.count ?? 1);
  }, [selectedId]);

  const updateItemAtIndex = (index: number, updates: Partial<InventoryItem>) => {
    setNotice(null);
    const uid = draftItems[index]?.uid;
    if (uid) setVerifiedIds(prev => { const next = { ...prev }; delete next[uid]; verifiedRef.current = next; return next; });
    setDraftItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removeItemAtIndex = (index: number) => {
    const removedId = draftItems[index].uid;
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
    setVerifiedIds((prev) => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    if (selectedId === removedId) setSelectedId(null);
  };

  /** A box the volunteer dragged or resized. Their placement beats the model's. */
  const handleBoxChange = (id: string, box: DetectionBox) => {
    setDraftItems((prev) => prev.map((item) => (item.uid === id ? { ...item, box } : item)));
  };

  /**
   * A box drawn over something the scanner missed entirely.
   *
   * It starts unnamed and selected, with the editor open on it — there is
   * nothing useful to guess, and an empty name is a visible prompt rather than a
   * wrong one. Confidence is 1 because a human pointed at it.
   */
  const handleDrawBox = (box: DetectionBox) => {
    const row: DraftRow = {
      uid: nextUid(),
      // A box a human drew has no model reading behind it, so there is nothing
      // for the catalogue to learn from — an empty rawName excludes it.
      rawName: '',
      drawnByHand: true,
      name: '',
      category: 'unknown',
      count: 1,
      expiration: null,
      condition: 'ok',
      confidence: 1,
      imageIndex: photoIndex,
      box,
    };
    cueSuccess();
    setDraftItems((prev) => [...prev, row]);
    setSelectedId(row.uid);
    setDrawMode(false);
  };

  const insets = useSafeAreaInsets();
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);

  /**
   * The confirmed set as of the latest tap, not the latest render.
   *
   * Confirming is meant to be tapped quickly. Two taps can land before React
   * re-renders, and working out "what's next" from the rendered state would
   * pick the row the previous tap just confirmed.
   */
  const verifiedRef = useRef(verifiedIds);
  verifiedRef.current = verifiedIds;

  /**
   * There is always a current item in the footer: when nothing is selected
   * (on arrival, after switching photos, after removing one), take the first
   * unchecked item in the photo on screen, else its first item.
   */
  useEffect(() => {
    if (drawMode) return;
    if (selectedId && draftItems.some((i) => i.uid === selectedId)) return;
    const here = draftItems.filter((i) => (i.imageIndex ?? 0) === photoIndex);
    const pick = here.find((i) => !verifiedRef.current[i.uid]) ?? here[0];
    if (pick) setSelectedId(pick.uid);
  }, [draftItems, selectedId, drawMode, photoIndex]);

  /** Puts a row on screen, switching to its photo if it lives on another. */
  const focusRow = (row: DraftRow | null) => {
    if (!row) return;
    setSelectedId(row.uid);
    setPhotoIndex(row.imageIndex ?? 0);
  };

  /**
   * Confirms a row and moves straight to the next one waiting.
   *
   * Confirm-only, never a toggle. The old button undid a confirmation when
   * tapped again, so a double-tap that beat a re-render took back the confirm it
   * had just made. Undo lives in the editor, away from the button being tapped.
   *
   * It confirms the row that was RENDERED when tapped. If taps outrun the
   * screen, the extra one re-confirms a row that is already confirmed, which
   * does nothing. That beats confirming a row nobody has seen.
   */
  const confirmAndAdvance = (uid: string) => {
    const row = draftItems.find((r) => r.uid === uid);
    if (!row || !row.name?.trim()) return;
    if (row.expiration?.trim() && !parsePrintedDate(row.expiration)) {
      Alert.alert('Check the printed date', 'Enter a real date in YYYY-MM-DD or MM/YYYY, or leave it unknown.');
      setMoreOpen(true); return;
    }
    if (!Number.isSafeInteger(row.count) || (row.count ?? 0) < 1) {
      setNotice('Enter a whole-number quantity greater than zero.'); return;
    }

    setNotice(null);
    let map = verifiedRef.current;
    if (!map[uid]) {
      map = { ...map, [uid]: true };
      verifiedRef.current = map;
      setVerifiedIds(map);
    }

    const next = nextRowToCheck(draftItems, map, uid, photoIndex, currentScanPhotos.length);
    if (next) {
      cueTap();
      focusRow(next);
    } else {
      // Stays on the last row. The bar turns into a non-tappable "All
      // confirmed", so a stray tap after the end can't land on Save.
      cueSuccess();
    }
  };

  const unconfirm = (uid: string) => {
    cueTap();
    const map = { ...verifiedRef.current };
    delete map[uid];
    verifiedRef.current = map;
    setVerifiedIds(map);
  };

  /**
   * Asks the model what is inside a box the volunteer drew.
   *
   * Only the box is sent, cropped out of the photo. The volunteer's box is kept
   * as drawn. If the model saw more than one thing in there, the clearest one
   * fills the row and the rest are named so they can be boxed separately.
   */
  const handleIdentify = async (uid: string) => {
    if (identifyingId) return;
    const row = draftItems.find((r) => r.uid === uid);
    const source = row ? currentScanPhotos[row.imageIndex ?? 0] : undefined;
    if (!row?.box || !source?.uri || !source.width || !source.height) {
      Alert.alert(
        'Nothing to look at',
        'This item has no box on a photo. Type the name in instead.',
      );
      return;
    }

    cueTap();
    setIdentifyingId(uid);
    try {
      const { item, alsoSaw } = await identifyRegion(
        { uri: source.uri, width: source.width, height: source.height },
        row.box,
      );

      setDraftItems((prev) =>
        prev.map((r) =>
          r.uid !== uid
            ? r
            : {
                ...r,
                name: item.name,
                // The model produced this reading, so a correction to it is
                // worth teaching the catalogue, just like any scanned row.
                rawName: item.name,
                category: item.category,
                count: item.count,
                expiration: item.expiration,
                condition: item.condition,
                confidence: item.confidence,
                barcode: item.barcode ?? null,
                resolvedBy: item.resolvedBy ?? null,
                image_url: item.imageUrl ?? r.image_url ?? null,
              },
        ),
      );
      cueSuccess();

      if (alsoSaw.length > 0) {
        Alert.alert(
          'There was more in that box',
          `Filled this in as the clearest one. Also in there: ${alsoSaw.join(', ')}. Draw separate boxes to add them.`,
        );
      }
    } catch (err) {
      cueWarn();
      log.error('scan', 'identifying a hand-drawn box failed', err);
      Alert.alert(
        "Couldn't identify it",
        err instanceof ScanError ? err.message : 'Something went wrong. Type the name in instead.',
      );
    } finally {
      setIdentifyingId(null);
    }
  };

  /**
   * Opens the scanner for one specific row.
   *
   * This used to call lookupBarcode with a hardcoded barcode against a hardcoded
   * table of three products, so pressing it returned the same imaginary tin of
   * garbanzo beans for every item in the app, forever. It now points the camera
   * at the actual package.
   */
  const handleBarcodeScan = (uid: string) => {
    cueTap();
    router.push({ pathname: '/barcode-scan', params: { uid } });
  };

  /**
   * Collects a result the scanner parked in the store on its way back.
   *
   * Cleared as soon as it is applied, so a result can never land twice or drift
   * onto a different row.
   */
  useEffect(() => {
    if (!pendingBarcode) return;
    const index = draftItems.findIndex((i) => i.uid === pendingBarcode.uid);
    if (index < 0) {
      setPendingBarcode(null);
      return;
    }

    setDraftItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        name: pendingBarcode.name,
        category: (pendingBarcode.category ?? next[index].category) as any,
        barcode: pendingBarcode.barcode,
        resolvedBy: 'barcode',
        image_url: pendingBarcode.imageUrl ?? next[index].image_url ?? null,
        // Allergens from the product database, merged with anything a volunteer
        // had already ticked by hand — a scan should add knowledge, never erase
        // somebody's own observation that the tin has no pull tab.
        diet_tags: normaliseDietTags([
          ...(next[index].diet_tags ?? []),
          ...pendingBarcode.dietTags,
        ]),
        // The manufacturer said so. Nothing in this pipeline is more certain.
        confidence: 1,
      };
      return next;
    });
    // The scanner only returns a product after the volunteer checks its preview.
    setVerifiedIds((prev) => ({ ...prev, [pendingBarcode.uid]: true }));
    setPendingBarcode(null);
  }, [pendingBarcode]);

  const commit = async () => {
    if (savingRef.current || savedSummary) return;
    savingRef.current = true;
    setSaving(true);
    try {
      /**
       * Ids are minted here, before the insert, so the background photo upload
       * knows which row each crop belongs to. Letting Postgres assign them would
       * mean matching rows back by position afterwards, which it does not
       * promise to preserve.
       */
      const rows = draftItems.map((row) => ({
        ...row,
        id: row.id ?? Crypto.randomUUID(),
        // An explicit choice for the batch wins; otherwise each item goes to
        // whichever shelf holds that product or category.
        location_id: resolveLocationForRow(row),
        source_org: draftSource,
        expiration: row.expiration ? parsePrintedDate(row.expiration) : null,
      }));
      await addItems(rows, source, currentScan?.scanId ?? null);

      /**
       * Close the scan record with what actually happened to each candidate.
       *
       * Only rows that still exist are reported. Anything the volunteer deleted
       * during the review reports nothing and the server marks it rejected —
       * which is the fact worth having: the model proposed it and a human threw
       * it away. Rows drawn by hand have no candidate and are skipped.
       *
       * Best-effort, and after the save: losing the bookkeeping is a wrong
       * measurement, losing the donation would be a wrong app.
       */
      // A source may split into usable/held rows, or several sources may combine.
      // Keep every source connected to its outcome rather than marking a merged source rejected.
      const originsOf = (row: DraftRow): DraftRow[] => row.combinedRows ? row.combinedRows.flatMap(originsOf) : [row];
      const outcomes = new Map<string, { id: string; verdict: ReturnType<typeof verdictFor>; item_id: string | null; name: string; category: string; count: number; expiration: string | null }>();
      for (const row of rows) {
        const seen = new Set<string>();
        for (const origin of originsOf(row)) {
          if (!origin.scanItemId || !origin.detected || seen.has(origin.scanItemId)) continue;
          seen.add(origin.scanItemId);
          const previous = outcomes.get(origin.scanItemId);
          const count = (previous?.count ?? 0) + (row.count ?? 0);
          outcomes.set(origin.scanItemId, {
            id: origin.scanItemId, verdict: verdictFor(origin.detected, { ...row, count }),
            item_id: previous?.item_id ?? row.id ?? null, name: row.name ?? '',
            category: row.category ?? 'unknown', count, expiration: row.expiration ?? null,
          });
        }
      }
      void finishScan(currentScan?.scanId ?? null, [...outcomes.values()]);
      setCurrentScan(null);

      /**
       * Teach the catalogue what this pantry just agreed to.
       *
       * After the save, never before — only rows that actually reached the shelf
       * are worth learning from. Rows whose name came from a barcode are skipped:
       * they were never the model's guess, so pairing them with it would teach
       * the catalogue a relationship that does not exist.
       *
       * Untouched rows are recorded too. A reading a human ticked without
       * changing is the strongest evidence the catalogue can hold, and learning
       * only from corrections would remember every product the scanner gets
       * wrong and none of the ones it gets right.
       */
      const lessons: ConfirmationEntry[] = draftItems
        .filter((row) => row.resolvedBy !== 'barcode' && row.rawName.trim() && row.name?.trim())
        .map((row) => ({
          raw_name: row.rawName,
          canonical_name: row.name!.trim(),
          category: (row.category ?? 'unknown') as any,
          was_corrected: row.rawName.trim().toLowerCase() !== row.name!.trim().toLowerCase(),
        }));
      await recordConfirmations(settings.pantryId, lessons);

      /**
       * Photographs, after the fact.
       *
       * A row whose name came from a barcode already has the manufacturer's pack
       * shot and needs nothing; everything else with a detection box gets a crop
       * of the pantry's own photo. Deliberately NOT awaited — the volunteer is
       * done, the stock is written, and twenty crops and uploads have no business
       * standing between them and the confirmation.
       */
      if (settings.pantryId) {
        const jobs: PhotoJob[] = rows.flatMap((row) => {
          if (row.image_url) return [];
          const photo = currentScanPhotos[row.imageIndex ?? 0];
          if (!row.box || !photo?.uri || !photo.width || !photo.height) return [];
          return [
            {
              id: row.id!,
              pantryId: settings.pantryId!,
              box: row.box,
              uri: photo.uri,
              width: photo.width,
              height: photo.height,
            },
          ];
        });
        attachItemPhotos(jobs).catch((err) => log.error('store', 'the photo attach threw', err));
      }

      usePantryStore.getState().setDraft([], []);
      cueSuccess();
      setSavedSummary({
        units: rows.reduce((sum, row) => sum + (row.count ?? 0), 0),
        held: rows.filter(row => !isUsableCondition(row.condition)).reduce((sum, row) => sum + (row.count ?? 0), 0),
        unknownDates: rows.filter(row => !row.expiration).length,
      });
    } catch (err: any) {
      log.error('store', 'save from review failed', err);
      cueWarn();
      setNotice(err?.message ?? 'Could not save. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSaveToInventory = () => {
    if (draftItems.length === 0 || saving) return;

    // A box drawn by hand starts with no name. Saving it would file "Unlabeled
    // Item" into the pantry, which is the one thing a hand-drawn box was meant
    // to avoid — so this one does block, and points at the row to fix.
    const namelessIndex = draftItems.findIndex((i) => !i.name?.trim());
    if (namelessIndex >= 0) {
      cueWarn();
      setPhotoIndex(draftItems[namelessIndex].imageIndex ?? 0);
      setSelectedId(draftItems[namelessIndex].uid);
      setNotice('Name this item before saving.');
      return;
    }

    const invalid = draftItems.find(row => (row.expiration?.trim() && !parsePrintedDate(row.expiration)) || !Number.isSafeInteger(row.count) || (row.count ?? 0) < 1);
    if (invalid) { focusRow(invalid); setMoreOpen(true); Alert.alert('Check the date and quantity', 'Use a real printed date or Unknown, and a positive whole-number quantity.'); return; }
    const unverified = draftItems.length - verifiedCount;
    if (unverified > 0) {
      const next = draftItems.find(row => !verifiedIds[row.uid]);
      if (next) focusRow(next);
      Alert.alert('Finish checking the items', `${unverified} items still need confirmation. Check the count, printed date and condition before saving.`);
      return;
    }
    commit();
  };

  if (savedSummary) return (
    <View className="flex-1 justify-center gap-5 bg-canvas px-gutter">
      <Text variant="headline">Donation added</Text>
      <Text variant="body">{savedSummary.units} units recorded · {savedSummary.held} held for inspection · {savedSummary.unknownDates} batches with unknown dates.</Text>
      <Button label="View inventory" block onPress={() => router.replace('/(tabs)/inventory')} />
    </View>
  );

  if (draftItems.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-10">
        <MaterialCommunityIcons name="camera-off-outline" size={44} color={COLORS.textSecondary} />
        <Text variant="title" className="mt-4">
          Nothing to review
        </Text>
        <Text variant="body" tone="soft" className="mt-2 text-center">
          Every line was removed, or the scan came back empty. Photograph the donation again, or add
          the items by hand.
        </Text>
        <Button label="Back to camera" className="mt-6" onPress={() => router.back()} />
      </View>
    );
  }

  const selectedIndex = selectedId ? draftItems.findIndex((i) => i.uid === selectedId) : -1;
  const selectedItem = selectedIndex >= 0 ? draftItems[selectedIndex] : null;

  // Only what was found in the photo currently on screen.
  const overlayItems: OverlayItem[] = draftItems
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (item.imageIndex ?? 0) === photoIndex)
    .map(({ item }) => ({
      id: item.uid,
      label: item.name ?? 'Item',
      count: item.count ?? 1,
      box: item.box ? (crops[photoIndex] ? toRegion(item.box, crops[photoIndex].region) : item.box) : null,
      verified: !!verifiedIds[item.uid],
      needsAttention: (item.confidence ?? 1) < 0.7 || !isUsableCondition(item.condition),
    }));

  /**
   * What the pinned bar offers right now: the obvious next move for the row on
   * screen. Inert states have no action and render as a plain status, not a
   * disabled button, so a tap on them does nothing at all.
   */
  const unverifiedCount = draftItems.length - verifiedCount;
  const bar: {
    label: string;
    hint?: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    action?: () => void;
    primary?: boolean;
    loading?: boolean;
    done?: boolean;
  } = (() => {
    if (allVerified) {
      return {
        label: 'All confirmed',
        hint: `All ${draftItems.length} checked. Add them when you're ready.`,
        icon: 'check-all',
        done: true,
      };
    }
    if (!selectedItem) {
      return {
        label: 'Start checking',
        hint: `${unverifiedCount} left to confirm`,
        icon: 'arrow-right',
        primary: true,
        action: () => {
          cueTap();
          focusRow(
            nextRowToCheck(
              draftItems,
              verifiedRef.current,
              null,
              photoIndex,
              currentScanPhotos.length,
            ),
          );
        },
      };
    }
    const uid = selectedItem.uid;
    if (!selectedItem.name?.trim()) {
      const source = currentScanPhotos[selectedItem.imageIndex ?? 0];
      return selectedItem.box && source?.uri
        ? {
            label: 'Identify with AI',
            hint: 'Or type the name in above.',
            icon: 'auto-fix',
            primary: true,
            loading: identifyingId === uid,
            action: () => handleIdentify(uid),
          }
        : {
            label: 'Name it first',
            hint: 'Type a name above to confirm it.',
            icon: 'pencil-outline',
          };
    }
    if (verifiedIds[uid]) {
      return {
        label: 'Next item',
        hint: `${unverifiedCount} left to confirm`,
        icon: 'arrow-right',
        action: () => confirmAndAdvance(uid),
      };
    }
    return {
      label: 'Confirm',
      hint: `${selectedItem.count ?? 1}× ${selectedItem.name}`,
      icon: 'check',
      primary: true,
      action: () => confirmAndAdvance(uid),
    };
  })();

  const currentIndex = selectedItem ? selectedIndex : -1;
  const photoItems = draftItems.filter((item) => (item.imageIndex ?? 0) === photoIndex);
  const isLowConf = (selectedItem?.confidence ?? 1) < 0.7;
  const damaged = selectedItem ? !isUsableCondition(selectedItem.condition) : false;

  // The photo is sized to whatever height is left, never wider than the screen,
  // so the whole review fits without scrolling.
  const crop = crops[photoIndex];
  const shownUri = crop?.uri ?? photo?.uri;
  const aspect = crop
    ? crop.width / crop.height
    : photo?.width && photo?.height
      ? photo.width / photo.height
      : 4 / 3;
  const photoWidth = photoArea.w > 0 ? Math.min(photoArea.w, photoArea.h * aspect) : 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {/* Progress, and where the batch is going. One slim row instead of a
          title block, a paragraph and a progress card. */}
      <View className="gap-2 px-gutter pb-2 pt-2">
        <Button label={`View all ${draftItems.length} items`} variant="secondary" size="compact" onPress={() => setListOpen(true)} />
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="body" className="font-bold">
            {allVerified ? 'Everything checked' : `${verifiedCount} of ${draftItems.length} confirmed`}
          </Text>
          {locations.length > 0 && (
            <Pressable
              onPress={() => {
                cueTap();
                setFilingOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Choose where this batch is filed"
              className="flex-row items-center gap-1.5 min-h-[48px] rounded-lg border border-hairline bg-card px-3 py-2"
            >
              <MaterialCommunityIcons name="map-marker-outline" size={15} color={COLORS.textSecondary} />
              <Text variant="micro" className="font-semibold" numberOfLines={1}>
                {batchLocation
                  ? locations.find((l) => l.id === batchLocation)?.name ?? 'Filed'
                  : autoFiles
                    ? 'Suggested shelf'
                    : 'Choose shelf'}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={15} color={COLORS.textSecondary} />
            </Pressable>
          )}
        </View>
        <View className="h-1.5 overflow-hidden rounded-sm bg-muted">
          <View
            className={allVerified ? 'h-full rounded-sm bg-good' : 'h-full rounded-sm bg-brand-light'}
            style={{ width: `${draftItems.length ? (verifiedCount / draftItems.length) * 100 : 0}%` }}
          />
        </View>
      </View>

      {/* The photo, with this item's box selected on it. */}
      <View
        className="items-center justify-center px-gutter"
        style={{ height: photo ? Math.min(260, Math.max(140, windowHeight * 0.25)) : 60 }}
        onLayout={(e) => setPhotoArea({ w: e.nativeEvent.layout.width - 40, h: e.nativeEvent.layout.height })}
      >
        {photo && photoWidth > 0 ? (
          <View style={{ width: photoWidth }}>
            <DetectionOverlay
              key={shownUri}
              uri={shownUri!}
              aspectRatio={aspect}
              items={overlayItems}
              selectedId={selectedId}
              drawMode={drawMode}
              onSelect={(id) => {
                cueTap();
                setSelectedId(id);
              }}
              onBoxChange={(id, box) => handleBoxChange(id, crop ? fromRegion(box, crop.region) : box)}
              onDraw={(box) => handleDrawBox(crop ? fromRegion(box, crop.region) : box)}
              onDragStateChange={() => {}}
            />
            {/* Controls sit on the picture itself, so nothing appears or
                disappears around it and the photo never resizes mid-draw. */}
            <View className="absolute left-2 right-2 top-2 flex-row items-start justify-between" pointerEvents="box-none">
              {drawMode ? (
                <View className="rounded-full bg-black/60 px-3 py-1.5" pointerEvents="none">
                  <Text variant="micro" className="font-bold text-white">
                    Drag around the missed item
                  </Text>
                </View>
              ) : (
                <View />
              )}
              <Pressable
                onPress={() => {
                  cueTap();
                  setDrawMode((m) => !m);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={drawMode ? 'Cancel drawing' : 'Add an item the scan missed'}
                className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
                style={{ backgroundColor: drawMode ? COLORS.primary : 'rgba(0,0,0,0.6)' }}
              >
                <MaterialCommunityIcons name={drawMode ? 'close' : 'plus-box-outline'} size={16} color="#FFFFFF" />
                <Text variant="micro" className="font-bold text-white">
                  {drawMode ? 'Cancel' : 'Add missed'}
                </Text>
              </Pressable>
            </View>
            {currentScanPhotos.length > 1 && !drawMode && (
              <View className="absolute bottom-2 left-2 flex-row items-center rounded-full bg-black/55">
                <PhotoArrow
                  icon="chevron-left"
                  disabled={photoIndex === 0}
                  onPress={() => {
                    setPhotoIndex(photoIndex - 1);
                    setSelectedId(null);
                  }}
                />
                <Text variant="micro" className="font-bold text-white">
                  Photo {photoIndex + 1}/{currentScanPhotos.length}
                </Text>
                <PhotoArrow
                  icon="chevron-right"
                  disabled={photoIndex === currentScanPhotos.length - 1}
                  onPress={() => {
                    setPhotoIndex(photoIndex + 1);
                    setSelectedId(null);
                  }}
                />
              </View>
            )}
          </View>
        ) : !photo ? (
          <Text variant="label" tone="soft" className="text-center">
            The photo isn&apos;t available, so step through the items below.
          </Text>
        ) : null}
      </View>


      {/* Everything found in THIS photo, as a strip right under it. Tap one to
          bring it into the footer. Replaces the long list of item cards. */}
      {/* Fixed height, empty or not, so the photo above never resizes. */}
      <View style={{ height: 58 }}>
        {photoItems.length === 0 ? (
          <Text variant="micro" tone="soft" className="px-gutter pt-4">
            Nothing found in this photo yet.
          </Text>
        ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="items-center gap-2 px-gutter py-2"
          style={{ flexGrow: 0 }}
        >
          {photoItems.map((item) => {
            const checked = !!verifiedIds[item.uid];
            const flagged = !checked && ((item.confidence ?? 1) < 0.7 || !isUsableCondition(item.condition));
            const current = item.uid === selectedId;
            return (
              <Pressable
                key={item.uid}
                onPress={() => {
                  cueTap();
                  focusRow(item);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                className="min-h-[44px] max-w-[190px] flex-row items-center gap-1.5 rounded-lg border px-3 py-2"
                style={{
                  borderColor: current ? COLORS.primary : COLORS.borderSoft,
                  backgroundColor: current ? COLORS.surfaceContainer : COLORS.cardSurface,
                }}
              >
                <MaterialCommunityIcons
                  name={checked ? 'check-circle' : flagged ? 'alert-circle' : 'circle-outline'}
                  size={16}
                  color={checked ? COLORS.statusGood : flagged ? COLORS.statusWarning : COLORS.borderStrong}
                />
                <Text variant="label" numberOfLines={1} className={current ? 'font-bold' : 'font-semibold'}>
                  {item.name?.trim() || 'Unnamed'}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        )}
      </View>

      {/* THE FOOTER: one item at a time, and the buttons that move through them.
          Pinned at the bottom so the thumb never has to travel, and everything
          needed for the common case is here; the rest is behind "More". */}
      <View
        className="gap-3 bg-card px-gutter pt-3"
        style={[RULE_ABOVE, { paddingBottom: 12 }]}
      >
        {selectedItem ? (
          <>
            {/* Who: thumbnail, then the name and what we know about it stacked
                in one column, so every line starts at the same edge. */}
            <View className="flex-row items-start gap-3">
              <ItemThumb
                imageUrl={selectedItem.image_url}
                category={selectedItem.category ?? 'unknown'}
                tone={damaged ? 'critical' : 'secondary'}
              />
              <View className="flex-1 gap-1.5">
                {/* Visibly editable input so volunteers know they can tap to fix the item name directly. */}
                <View className="flex-row items-center gap-2 rounded-md border border-hairline bg-canvas px-2.5 py-1.5">
                  <TextInput
                    value={selectedItem.name ?? ''}
                    placeholder="Tap to name this item"
                    placeholderTextColor={COLORS.textSecondary}
                    onChangeText={(txt) => updateItemAtIndex(selectedIndex, { name: txt })}
                    multiline
                    blurOnSubmit
                    maxFontSizeMultiplier={2.2}
                    accessibilityLabel="Item name"
                    className="flex-1 p-0 font-bold text-ink"
                    style={{
                      paddingTop: 0,
                      paddingBottom: 0,
                      textAlignVertical: 'top',
                      fontSize: seniorMode ? 20 : 17,
                      lineHeight: seniorMode ? 26 : 22,
                    }}
                  />
                  <MaterialCommunityIcons name="pencil-outline" size={16} color={COLORS.textSecondary} />
                </View>
                <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                  <Text variant="micro" tone={isLowConf ? 'warn' : 'soft'} className="font-semibold">
                    {selectedItem.resolvedBy === 'barcode'
                      ? 'From the barcode'
                      : selectedItem.resolvedBy === 'catalogue'
                        ? 'Named by your pantry'
                        : `${Math.round((selectedItem.confidence ?? 0) * 100)}% sure`}
                  </Text>
                  <Text variant="micro" tone="soft">·</Text>
                  {/* Category cycles on tap; the full list is under details. */}
                  <Pressable
                    onPress={() => {
                      cueTap();
                      setMoreOpen(true);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${selectedItem.category}. Open item details to change.`}
                    className="flex-row items-center gap-1 rounded-md bg-subtle px-2 py-1"
                  >
                    <Text variant="label" className="font-bold capitalize">
                      {selectedItem.category ?? 'unknown'}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={15} color={COLORS.textSecondary} />
                  </Pressable>
                  <Text variant="micro" tone="soft">·</Text>
                  <Text variant="micro" tone={damaged ? 'critical' : 'soft'} className="font-semibold">
                    {CONDITION_LABELS[selectedItem.condition || 'ok']}
                  </Text>
                  {(() => {
                    const locId = resolveLocationForRow(selectedItem);
                    const locName = locId ? locations.find((l) => l.id === locId)?.name : null;
                    if (!locName) return null;
                    return (
                      <>
                        <Text variant="micro" tone="soft">·</Text>
                        <Pressable
                          onPress={() => {
                            cueTap();
                            setFilingOpen(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Auto-assigned to ${locName}. Tap to change shelf.`}
                          className="flex-row items-center gap-1 rounded bg-secondary-tint px-1.5 py-0.5"
                        >
                          <MaterialCommunityIcons
                            name="map-marker-outline"
                            size={12}
                            color={COLORS.secondaryDark}
                          />
                          <Text
                            variant="micro"
                            className="font-bold"
                            style={{ color: COLORS.secondaryDark }}
                          >
                            {locName}
                          </Text>
                        </Pressable>
                      </>
                    );
                  })()}
                </View>
              </View>
            </View>

            <Button label={`${selectedItem.expiration ? `Date: ${selectedItem.expiration}` : 'Date unknown'} · ${damaged ? 'Inspect damage' : 'Check condition'}`} variant="secondary" size="compact" onPress={() => setMoreOpen(true)} />
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="label" tone="soft" className="font-semibold">Quantity</Text>
              <Stepper value={selectedItem.count ?? 1} min={1} onChange={(count) => updateItemAtIndex(selectedIndex, { count })} />
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1"><Button label="Previous item" size="compact" variant="ghost" disabled={currentIndex <= 0} onPress={() => focusRow(draftItems[currentIndex - 1])} /></View>
              <View className="flex-1"><Button label="Next item" size="compact" variant="ghost" disabled={currentIndex >= draftItems.length - 1} onPress={() => focusRow(draftItems[currentIndex + 1])} /></View>
            </View>
          </>
        ) : (
          <Text variant="label" tone="soft">
            {photoItems.length === 0
              ? 'Nothing was found in this photo. Use "Add missed item" to box something.'
              : 'Tap an item to check it.'}
          </Text>
        )}

      </View>
      </ScrollView>
      <View className="gap-3 bg-card px-gutter pt-3" style={[RULE_ABOVE, { paddingBottom: insets.bottom + 12 }]}>
        {notice && <Text variant="label" tone="critical" accessibilityRole="alert">{notice}</Text>}
        {/* Confirm and Add, side by side, in fixed positions. Confirm is the wide
            one on the left, where rapid taps land, and it ends as a
            non-tappable "All confirmed", so a burst of confirms can never spill
            into saving. Saving stays unavailable until every item is confirmed. */}
        <View className="flex-row gap-2">
          <View className="flex-[3]">
            {bar.action ? (
              <Button
                label={bar.label}
                block
                variant={bar.primary ? 'primary' : 'secondary'}
                loading={bar.loading}
                className="px-3"
                icon={
                  <MaterialCommunityIcons
                    name={bar.icon}
                    size={19}
                    color={bar.primary ? COLORS.textOnPrimary : COLORS.textPrimary}
                  />
                }
                onPress={bar.action}
              />
            ) : (
              <View className="min-h-[54px] flex-row items-center justify-center gap-2">
                <MaterialCommunityIcons
                  name={bar.icon}
                  size={19}
                  color={bar.done ? COLORS.statusGood : COLORS.textSecondary}
                />
                <Text variant="body" tone={bar.done ? 'good' : 'soft'} className="font-bold">
                  {bar.label}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-[2]">
            <Button
              label="Save items"
              disabled={!allVerified}
              accessibilityLabel={`Add ${draftItems.length} ${draftItems.length === 1 ? 'item' : 'items'} to inventory`}
              block
              variant={allVerified ? 'primary' : 'secondary'}
              loading={saving}
              className="px-3"
              icon={
                <MaterialCommunityIcons
                  name="tray-arrow-down"
                  size={19}
                  color={allVerified ? COLORS.textOnPrimary : COLORS.textPrimary}
                />
              }
              onPress={handleSaveToInventory}
            />
          </View>
        </View>
      </View>

      {/* Everything else about the current item. */}
      <Sheet
        visible={moreOpen && !!selectedItem}
        onClose={() => setMoreOpen(false)}
        title={selectedItem?.name?.trim() || 'This item'}
        subtitle="Check the date and packaging."
      >
        {selectedItem && (
          <View className="mb-3 gap-2">
            <Button label="Read date from a label photo" variant="secondary" size="compact" loading={readingDate} onPress={async () => {
              if (readingDate) return;
              setDateReadError(null);
              const uid = selectedItem.uid;
              setReadingDate(true);
              try {
                const permission = Platform.OS === 'web' ? null : await ImagePicker.requestCameraPermissionsAsync();
                if (permission && !permission.granted) throw new Error('Allow camera access, or enter the printed date manually.');
                const result = Platform.OS === 'web'
                  ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 })
                  : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
                if (result.canceled) return;
                const prepared = await preparePhoto(result.assets[0]);
                if (!prepared) throw new Error('Could not read that photo. Try again or type the date.');
                const { candidates } = await processImageScan(prepared.base64);
                const dates = [...new Set(candidates.map(item => item.expiration).filter((date): date is string => !!date))];
                if (dates.length !== 1) throw new Error(dates.length ? 'Several dates were visible. Type the date for this item to avoid assigning the wrong one.' : 'No printed date was readable. Take a closer photo including the product label, or enter it manually.');
                ask('Confirm the printed date', `The photo suggests ${dates[0]}. Does that match this package?`, [
                  { text: 'Keep current date', style: 'cancel' },
                  { text: 'Use this date', onPress: () => {
                    setDraftItems(prev => prev.map(row => row.uid === uid ? { ...row, expiration: dates[0] } : row));
                    setVerifiedIds(prev => { const next = { ...prev }; delete next[uid]; verifiedRef.current = next; return next; });
                  } },
                ]);
              } catch (error: any) { setDateReadError(error?.message || 'Enter the date printed on the package.'); }
              finally { setReadingDate(false); }
            }} />
            {dateReadError && <Text variant="label" tone="critical" accessibilityRole="alert">{dateReadError}</Text>}
            <Text variant="micro" tone="soft">Photograph this product and its printed date together. A reading always needs your confirmation.</Text>
          </View>
        )}
        {selectedItem && damaged && selectedItem.condition !== 'expired' && (
          <Card className="mb-3 gap-3">
            <Text variant="label" className="font-bold">How many units need inspection?</Text>
            <Text variant="micro" tone="soft">Keep usable units available. Hold only the affected units out of boxes.</Text>
            <Stepper value={Math.min(heldQuantity, selectedItem.count ?? 1)} min={1} max={selectedItem.count ?? 1} onChange={setHeldQuantity} />
            <Text variant="micro" tone="soft">{(selectedItem.count ?? 1) - Math.min(heldQuantity, selectedItem.count ?? 1)} units stay available after you check their condition and date.</Text>
            <Button label={`Separate ${Math.min(heldQuantity, selectedItem.count ?? 1)} for inspection`} size="compact" onPress={() => {
              const parts = splitInspection(selectedItem, Math.min(heldQuantity, selectedItem.count ?? 1));
              const rows = parts.map((row, index) => ({ ...row, uid: nextUid(), id: undefined, scanItemId: row.scanItemId, sourceDetections: undefined, combinedRows: undefined }));
              setDraftItems(prev => prev.flatMap(row => row.uid === selectedItem.uid ? rows : [row]));
              setSelectedId(rows[rows.length - 1].uid); setMoreOpen(false); cueTap();
            }} />
          </Card>
        )}
        {selectedItem ? (
          <ItemEditor
            compact
            item={selectedItem}
            verified={!!verifiedIds[selectedItem.uid]}
            onChange={(updates) => updateItemAtIndex(selectedIndex, updates)}
            onRemove={() => {
              setMoreOpen(false);
              removeItemAtIndex(selectedIndex);
            }}
            onBarcode={() => {
              setMoreOpen(false);
              handleBarcodeScan(selectedItem.uid);
            }}
            onUndoConfirm={() => unconfirm(selectedItem.uid)}
            onIdentify={() => handleIdentify(selectedItem.uid)}
            identifying={identifyingId === selectedItem.uid}
            onClose={() => setMoreOpen(false)}
          />
        ) : null}
      </Sheet>


      <Sheet visible={listOpen} onClose={() => setListOpen(false)} title="Every item in this scan" subtitle="Review every item here. Open a combined item to check whether the photos show the same stock.">
        {draftItems.map(row => (
          <Card key={row.uid} className="gap-2">
            <Text variant="body" className="font-bold">{row.count} × {row.name || 'Unnamed item'}</Text>
            <Text variant="micro" tone="soft">{row.expiration || 'Date unknown'} · {CONDITION_LABELS[row.condition || 'ok']} · {verifiedIds[row.uid] ? 'Confirmed' : 'Needs review'}</Text>
            <Text variant="micro" tone="brand">{row.sourceDetections && row.sourceDetections.length > 1 ? `Combined from ${new Set(row.sourceDetections.map(d => d.imageIndex)).size} photo(s), ${row.sourceDetections.length} readings` : row.combinedRows ? 'Combined by you' : 'Separate item'}</Text>
            <Button label="Review this item" variant="secondary" size="compact" onPress={() => { focusRow(row); setListOpen(false); }} />
            {(row.combinedRows || (row.sourceDetections?.length ?? 0) > 1) && <Button label="Separate these items" variant="ghost" size="compact" onPress={() => {
              const readings: DraftRow[] = row.combinedRows ?? row.sourceDetections!.map((reading, index) => ({ ...reading, image_url: reading.imageUrl ?? row.image_url, rawName: reading.name, uid: nextUid(), scanItemId: row.scanItemId, detected: row.detected }));
              ask('Are these different physical items?', `Separating restores ${readings.reduce((sum, r) => sum + (r.count ?? 0), 0)} units across ${readings.length} rows. Do this only if the photos show different stock, then check every count.`, [
                { text: 'Keep combined', style: 'cancel' },
                { text: 'Separate items', onPress: () => { setDraftItems(prev => prev.flatMap(r => r.uid === row.uid ? readings.map(r => ({ ...r, uid: nextUid(), sourceDetections: undefined, combinedRows: undefined })) : [r])); cueTap(); } },
              ]);
            }} />}
            {selectedItem && selectedItem.uid !== row.uid && canCombineIntake(selectedItem, row) && <Button label={`Combine with ${selectedItem.name}`} variant="ghost" size="compact" onPress={() => {
              const current = selectedItem;
              const combine = (sameUnits: boolean) => {
                const combined: DraftRow = { ...current, uid: nextUid(), count: sameUnits ? Math.max(current.count ?? 1, row.count ?? 1) : (current.count ?? 1) + (row.count ?? 1), combinedRows: [current, row], sourceDetections: undefined };
                setDraftItems(prev => prev.flatMap(r => r.uid === current.uid ? [combined] : r.uid === row.uid ? [] : [r])); setSelectedId(combined.uid); cueTap();
              };
              ask('How should these counts combine?', 'Combine only matching products and pack sizes. Another angle uses the larger count; different stock adds the counts.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Same physical units', onPress: () => combine(true) }, { text: 'Different units', onPress: () => combine(false) }]);
            }} />}
          </Card>
        ))}
      </Sheet>

      <Sheet visible={!!decision} onClose={() => setDecision(null)} title={decision?.title || 'Check this change'} subtitle={decision?.message}>
        <View className="gap-3">{decision?.actions.map(action => <Button key={action.text} label={action.text} block variant={action.style === 'cancel' ? 'secondary' : 'primary'} onPress={() => { setDecision(null); action.onPress?.(); }} />)}</View>
      </Sheet>

      {/* Where this whole batch is going — decided once, by the person carrying it. */}
      <Sheet
        visible={filingOpen}
        onClose={() => setFilingOpen(false)}
        title={autoFiles ? 'Send the whole batch to one place?' : 'Where is this going?'}
      >
        <View className="flex-row flex-wrap gap-2">
          {locations.map((loc) => (
            <Chip
              key={loc.id}
              label={loc.name}
              selected={batchLocation === loc.id}
              onPress={() => setBatchLocation(batchLocation === loc.id ? null : loc.id)}
            />
          ))}
        </View>
        <Text variant="micro" tone="soft" className="mt-3">
          {batchLocation
            ? 'Every item in this scan is filed there, whatever its category.'
            : autoFiles
              ? 'Leave this off and each item goes to the bin that holds its category.'
              : 'Optional — leave it off and these land unfiled. Set up which bin holds what in Settings and they will file themselves.'}
        </Text>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

/** A small round arrow: photo paging (on the picture) or item paging (footer). */
function PhotoArrow({
  icon,
  onPress,
  disabled,
  dark,
  label,
}: {
  icon: 'chevron-left' | 'chevron-right';
  onPress: () => void;
  disabled?: boolean;
  dark?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        cueTap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label ?? (icon === 'chevron-left' ? 'Previous photo' : 'Next photo')}
      className={dark ? 'h-12 w-12 items-center justify-center rounded-md bg-subtle' : 'h-11 w-11 items-center justify-center'}
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <MaterialCommunityIcons name={icon} size={24} color={dark ? COLORS.textPrimary : '#FFFFFF'} />
    </Pressable>
  );
}

/**
 * The edit panel for a single tapped detection.
 *
 * One card, one column, generous gaps. Previously this was five labelled blocks
 * with 12px gaps and its own confidence badge styling, which made an eight-field
 * form feel like a tax return.
 */
function ItemEditor({
  item,
  verified,
  onChange,
  onRemove,
  onBarcode,
  onUndoConfirm,
  onIdentify,
  identifying,
  onClose,
  compact,
}: {
  /** The short version for the Details sheet: no card, one row per choice. */
  compact?: boolean;
  item: DraftRow;
  verified: boolean;
  onChange: (updates: Partial<InventoryItem>) => void;
  onRemove: () => void;
  onBarcode: () => void;
  onUndoConfirm: () => void;
  onIdentify: () => void;
  identifying: boolean;
  onClose: () => void;
}) {
  const isLowConf = (item.confidence ?? 1) < 0.7;
  const confirmRemove = () => {
    cueWarn();
    Alert.alert(
      'Remove this item?',
      `Take "${item.name?.trim() || 'Unnamed item'}" out of this scan?`,
      [
        { text: 'Keep item', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onRemove },
      ],
    );
  };

  if (compact) {
    return (
      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          {item.resolvedBy === 'barcode' ? (
            <Badge label="From the barcode" tone="good" />
          ) : item.resolvedBy === 'catalogue' ? (
            <Badge label="Named by your pantry" tone="brand" />
          ) : (
            <Badge
              label={`${Math.round((item.confidence ?? 0) * 100)}% sure`}
              tone={isLowConf ? 'warn' : 'good'}
            />
          )}
          <View className="flex-row items-center gap-4">
            {verified && (
              <Pressable
                onPress={onUndoConfirm}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Undo confirm"
                className="min-h-[44px] flex-row items-center gap-1 px-2"
              >
                <MaterialCommunityIcons name="undo-variant" size={17} color={COLORS.primaryDark} />
                <Text variant="label" tone="brand" className="font-bold">
                  Undo confirm
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={confirmRemove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove this item"
              className="min-h-[44px] flex-row items-center gap-1 px-2"
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLORS.statusCritical} />
              <Text variant="label" tone="critical" className="font-bold">
                Remove
              </Text>
            </Pressable>
          </View>
        </View>

        <Input
          label="Item name"
          placeholder="e.g. Canned Black Beans"
          value={item.name ?? ''}
          onChangeText={(txt) => onChange({ name: txt })}
        />

        {describeTags(item.diet_tags ?? []) ? (
          <View className="flex-row gap-2 rounded-md bg-subtle px-3 py-2">
            <MaterialCommunityIcons name="information-outline" size={15} color={COLORS.textSecondary} />
            <Text variant="micro" tone="soft" className="flex-1 capitalize">
              {describeTags(item.diet_tags ?? [])}
            </Text>
          </View>
        ) : null}

        {item.drawnByHand && (
          <Button
            label={item.name?.trim() ? 'Identify again with AI' : 'Identify with AI'}
            variant="secondary"
            size="compact"
            loading={identifying}
            icon={<MaterialCommunityIcons name="auto-fix" size={17} color={COLORS.textPrimary} />}
            onPress={onIdentify}
          />
        )}

        <View className="gap-1.5">
          <Text variant="micro" tone="soft" className="font-semibold">
            Category
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                selected={item.category === cat}
                onPress={() => onChange({ category: cat as any })}
              />
            ))}
          </ScrollView>
        </View>

        <View className="gap-1.5">
          <Text variant="micro" tone="soft" className="font-semibold">
            Condition
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {(Object.keys(CONDITION_LABELS) as Condition[]).map((cond) => {
              const active = (item.condition || 'ok') === cond;
              const good = cond === 'ok';
              return (
                <Chip
                  key={cond}
                  label={CONDITION_LABELS[cond]}
                  selected={active}
                  className={active && !good ? 'border-critical bg-critical' : undefined}
                  onPress={() => {
                    if (!good) cueWarn();
                    onChange({ condition: cond });
                  }}
                />
              );
            })}
          </ScrollView>
          {!isUsableCondition(item.condition) && (
            <Text variant="micro" tone="critical">
              Held back from boxes until inspected again.
            </Text>
          )}
        </View>

        <View className="gap-2">
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              <Input
                label="Printed date"
                placeholder="YYYY-MM-DD or MM/YYYY"
                error={item.expiration?.trim() && !parsePrintedDate(item.expiration) ? "Check this printed date, or choose Unknown." : null}
                value={item.expiration || ''}
                onChangeText={(txt) => onChange({ expiration: txt })}
              />
            </View>
            {item.resolvedBy !== 'barcode' && (
              <Button
                label="Barcode"
                variant="secondary"
                size="compact"
                className="mb-1"
                icon={<MaterialCommunityIcons name="barcode-scan" size={17} color={COLORS.textPrimary} />}
                onPress={onBarcode}
              />
            )}
          </View>
          <Button label="Date unknown / not printed" variant="ghost" size="compact" onPress={() => onChange({ expiration: null })} />
          <Text variant="micro" tone="soft">Read the package. Never guess a date from shelf life. Month-only dates use the first day of that month for review.</Text>
        </View>
      </View>
    );
  }

  return (
    <Card style={{ borderColor: verified ? COLORS.statusGood : COLORS.primaryLight }}>
      <View className="flex-row items-center justify-between">
        {/* WHERE this name came from, not just how sure something is about it.
            "The manufacturer says so" and "your pantry has called it this a
            dozen times" are different kinds of trustworthy, and both are
            different from the model having had a good look. */}
        {item.resolvedBy === 'barcode' ? (
          <Badge label="From the barcode" tone="good" />
        ) : item.resolvedBy === 'catalogue' ? (
          <Badge label="Named by your pantry" tone="brand" />
        ) : (
          <Badge
            label={`${Math.round((item.confidence ?? 0) * 100)}% sure`}
            tone={isLowConf ? 'warn' : 'good'}
          />
        )}
        <View className="flex-row items-center gap-5">
          {/* Up here, well away from the confirm bar, so undoing is always
              deliberate and never the side effect of tapping quickly. */}
          {verified && (
            <Pressable
              onPress={onUndoConfirm}
              hitSlop={8}
              accessibilityLabel="Undo confirm"
              className="flex-row items-center gap-1"
            >
              <MaterialCommunityIcons name="undo-variant" size={16} color={COLORS.primaryDark} />
              <Text variant="micro" tone="brand" className="font-bold">
                Undo confirm
              </Text>
            </Pressable>
          )}
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this item">
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={COLORS.textSecondary}
            />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* What the product database knows about allergens, when a barcode named
          this. Read-only here — this screen is for getting the item right, and
          the full set is editable on the item itself. It is shown at all because
          a volunteer sorting a donation is the last person who can catch a
          mislabelled tin before it reaches a household that cannot eat it. */}
      {describeTags(item.diet_tags ?? []) ? (
        <View className="mt-4 flex-row gap-2 rounded-md bg-subtle px-3 py-2">
          <MaterialCommunityIcons
            name="information-outline"
            size={15}
            color={COLORS.textSecondary}
            style={{ marginTop: 1 }}
          />
          <Text variant="micro" tone="soft" className="flex-1 capitalize">
            {describeTags(item.diet_tags ?? [])}
          </Text>
        </View>
      ) : null}

      <View className="mt-5">
        <Input
          label="Name"
          value={item.name}
          placeholder="What is it?"
          onChangeText={(txt) => onChange({ name: txt })}
        />
        {/* Only for boxes a volunteer drew. Scanned rows already have the
            model's reading, and re-asking would just return it again. Offered
            again after a first try, since nudging the box and retrying is the
            natural fix for a wrong answer. */}
        {item.drawnByHand && (
          <Button
            label={item.name?.trim() ? 'Identify again with AI' : 'Identify with AI'}
            variant="secondary"
            size="compact"
            className="mt-3"
            loading={identifying}
            icon={<MaterialCommunityIcons name="auto-fix" size={17} color={COLORS.textPrimary} />}
            onPress={onIdentify}
          />
        )}
      </View>

      <View className="mt-5 gap-2">
        <Text variant="label" tone="soft">
          Category
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={cat}
              selected={item.category === cat}
              onPress={() => onChange({ category: cat as any })}
            />
          ))}
        </View>
      </View>

      <View className="mt-5 gap-2">
        <Text variant="label" tone="soft">
          Condition
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {(Object.keys(CONDITION_LABELS) as Condition[]).map((cond) => {
            const active = (item.condition || 'ok') === cond;
            const good = cond === 'ok';
            return (
              <Chip
                key={cond}
                label={CONDITION_LABELS[cond]}
                selected={active}
                className={active && !good ? 'border-critical bg-critical' : undefined}
                onPress={() => {
                  // A damage flag is a decision worth feeling, not a silent toggle.
                  if (!good) cueWarn();
                  onChange({ condition: cond });
                }}
              />
            );
          })}
        </View>
        {!isUsableCondition(item.condition) && (
          <Text variant="micro" tone="critical" className="mt-1">
            Held back from boxes until inspected again.
          </Text>
        )}
      </View>

      <View className="mt-5 flex-row gap-4">
        <View className="gap-2">
          <Text variant="label" tone="soft">
            Quantity
          </Text>
          <Stepper value={item.count || 1} min={1} onChange={(next) => onChange({ count: next })} />
        </View>
        <View className="flex-1">
          <Input
            label="Printed date"
            placeholder="YYYY-MM-DD or MM/YYYY"
                error={item.expiration?.trim() && !parsePrintedDate(item.expiration) ? "Check this printed date, or choose Unknown." : null}
            value={item.expiration || ''}
            onChangeText={(txt) => onChange({ expiration: txt })}
          />
        </View>
      </View>

      {/* Offered on every row that a barcode has not already settled — a
          volunteer who doubts a confident-looking reading should not have to
          talk the app into letting them check it. */}
      {item.resolvedBy !== 'barcode' && (
        <Button
          label={isLowConf ? 'Scan the barcode instead' : 'Scan the barcode'}
          variant="secondary"
          size="compact"
          className="mt-5"
          icon={<MaterialCommunityIcons name="barcode-scan" size={17} color={COLORS.textPrimary} />}
          onPress={onBarcode}
        />
      )}
    </Card>
  );
}
