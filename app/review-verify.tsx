import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RULE_ABOVE } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { DetectionOverlay, type OverlayItem } from '../components/detection-overlay';
import { Badge, Button, Card, Chip, Input, ItemThumb, Stepper, Text } from '../components/ui';
import * as Crypto from 'expo-crypto';
import { identifyRegion, ScanError } from '../lib/ai_vision';
import { recordConfirmations, type ConfirmationEntry } from '../lib/catalogue';
import { nextRowToCheck } from '../lib/review-order';
import { attachItemPhotos, type PhotoJob } from '../lib/item-photos';
import type { DetectionBox, ScanCandidate } from '../lib/scan-normalize';
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
  Partial<Pick<ScanCandidate, 'imageIndex' | 'box' | 'barcode' | 'resolvedBy'>> & {
    uid: string;
    /**
     * Exactly what the scanner said, frozen before anyone edited it.
     *
     * The catalogue learns by pairing what the model produced with what a human
     * left it as, so the original has to survive the editing. Reading it back off
     * the row at save time would only ever record the corrected name twice.
     */
    rawName: string;
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
    currentScanPhotos,
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
   * Whether the pantry has told the app what its bins are for.
   *
   * When it has, sorting stops being a step: each item files itself under the
   * place that claims its category, and the batch picker becomes an override for
   * the odd load that all goes one place.
   */
  const autoFiles = locations.some((l) => l.categories?.length > 0);

  const source: 'donation' | 'shelf_audit' =
    params.source === 'shelf_audit' ? 'shelf_audit' : 'donation';

  const [draftItems, setDraftItems] = useState<DraftRow[]>(() =>
    currentDraft.map((item, index) => ({
      ...item,
      uid: nextUid(),
      rawName: item.name ?? '',
      // start_scan returns the candidate ids in the order they were sent, and
      // currentDraft is those same candidates in that same order.
      scanItemId: currentScan?.itemIds[index],
      detected: {
        name: item.name ?? '',
        category: (item.category ?? 'unknown') as string,
        count: item.count ?? 0,
        expiration: item.expiration ?? null,
      },
      // normaliseItem hands this over as imageUrl; the row stores it the way the
      // database does.
      image_url: (item as any).imageUrl ?? null,
    })),
  );
  const [saving, setSaving] = useState(false);
  // Which photo is on screen, when the scan covered more than one.
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Record<string, boolean>>({});

  // Draw mode swaps tapping-to-select for dragging-out a new box.
  const [drawMode, setDrawMode] = useState(false);
  // A drag inside the photo must not also scroll the page under it.
  const [scrollEnabled, setScrollEnabled] = useState(true);

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

  const updateItemAtIndex = (index: number, updates: Partial<InventoryItem>) => {
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
        // whichever bin claims its category. Null when nothing claims it, which
        // leaves it unfiled rather than guessing.
        location_id: batchLocation ?? defaultLocationFor((row.category ?? 'unknown') as any),
        source_org: draftSource,
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
      void finishScan(
        currentScan?.scanId ?? null,
        rows.flatMap((row) =>
          row.scanItemId && row.detected
            ? [
                {
                  id: row.scanItemId,
                  verdict: verdictFor(row.detected, row),
                  item_id: row.id ?? null,
                  name: row.name ?? '',
                  category: (row.category ?? 'unknown') as string,
                  count: row.count ?? 0,
                  expiration: row.expiration ?? null,
                },
              ]
            : [],
        ),
      );
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

      cueSuccess();
      Alert.alert(
        'Saved to inventory',
        `${draftItems.length} item${draftItems.length === 1 ? '' : 's'} added.`,
        [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }],
      );
    } catch (err: any) {
      log.error('store', 'save from review failed', err);
      cueWarn();
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
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
      Alert.alert('One item still needs a name', 'Name the box you drew, then save.');
      return;
    }

    // Unconfirmed rows are a warning, not a wall. A volunteer who has looked at
    // the photo and is happy should not have to tap nineteen boxes to prove it.
    const unverified = draftItems.length - verifiedCount;
    if (unverified > 0) {
      cueWarn();
      Alert.alert(
        `${unverified} item${unverified === 1 ? '' : 's'} not confirmed`,
        'Tap a glowing box to check it against the photo, or save everything as the scanner read it.',
        [
          { text: 'Keep checking', style: 'cancel' },
          { text: 'Save anyway', style: 'destructive', onPress: commit },
        ],
      );
      return;
    }
    commit();
  };

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
      box: item.box ?? null,
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

  return (
    <View className="flex-1 bg-canvas">
      {/* Extra foot so the Save button can scroll clear of the pinned bar. */}
      <KeyboardScreen scrollEnabled={scrollEnabled} contentContainerClassName="pb-40">
        <View className="gap-2">
          <Text variant="micro" tone="brand" className="font-semibold tracking-wide">
            DONATION INTAKE · REVIEW
          </Text>
          <Text
            style={{
              fontWeight: '800',
            letterSpacing: -0.6,
              fontSize: 30,
              lineHeight: 36,
              color: COLORS.textPrimary,
            }}
          >
            Check your donation
          </Text>
          <Text variant="body" tone="soft">
            Check names, quantities and condition before adding anything to your shelf.
          </Text>
        </View>
        {/* Progress, stated once as a sentence rather than as a card full of
          chrome. The bar is the only ornament it needs. */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="heading">
              {allVerified
                ? 'Everything checked'
                : `${verifiedCount} of ${draftItems.length} confirmed`}
            </Text>
            <MaterialCommunityIcons
              name={allVerified ? 'shield-check' : 'shield-search'}
              size={20}
              color={allVerified ? COLORS.statusGood : COLORS.primaryLight}
            />
          </View>
          <View className="h-1.5 overflow-hidden rounded-sm bg-muted">
            <View
              className={
                allVerified ? 'h-full rounded-sm bg-good' : 'h-full rounded-sm bg-brand-light'
              }
              style={{ width: `${(verifiedCount / draftItems.length) * 100}%` }}
            />
          </View>
        </View>

        {photo ? (
          <View className="gap-3">
            <DetectionOverlay
              uri={photo.uri}
              aspectRatio={photo.width && photo.height ? photo.width / photo.height : 4 / 3}
              items={overlayItems}
              selectedId={selectedId}
              drawMode={drawMode}
              onSelect={(id) => {
                cueTap();
                setSelectedId((prev) => (prev === id ? null : id));
              }}
              onBoxChange={handleBoxChange}
              onDraw={handleDrawBox}
              onDragStateChange={(dragging) => setScrollEnabled(!dragging)}
            />

            <View className="flex-row items-center justify-between gap-3">
              <Text variant="micro" tone="soft" className="flex-1">
                {drawMode
                  ? 'Drag a rectangle around the item that was missed.'
                  : selectedId
                    ? 'Drag to move it, or pull a corner to resize.'
                    : 'Tap a box. Nudge it if it sits off the item.'}
              </Text>
              <Button
                label={drawMode ? 'Cancel' : 'Add missed item'}
                variant={drawMode ? 'primary' : 'secondary'}
                size="compact"
                onPress={() => {
                  setDrawMode((m) => !m);
                  setSelectedId(null);
                }}
              />
            </View>
          </View>
        ) : (
          <Card>
            <Text variant="label" tone="soft">
              The photo isn&apos;t available, so everything is listed below instead.
            </Text>
          </Card>
        )}

        {currentScanPhotos.length > 1 && (
          <View className="flex-row flex-wrap gap-2">
            {currentScanPhotos.map((_, i) => {
              const pending = draftItems.filter(
                (item) => (item.imageIndex ?? 0) === i && !verifiedIds[item.uid],
              ).length;
              return (
                <Chip
                  key={i}
                  label={pending > 0 ? `Photo ${i + 1} · ${pending}` : `Photo ${i + 1}`}
                  selected={i === photoIndex}
                  onPress={() => {
                    setPhotoIndex(i);
                    setSelectedId(null);
                  }}
                />
              );
            })}
          </View>
        )}

        {locations.length > 0 && (
          <View className="gap-2">
            <Text variant="label" tone="soft" className="font-semibold">
              {autoFiles ? 'Send the whole batch to one place?' : 'Where is this going?'}
            </Text>
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
            <Text variant="micro" tone="soft">
              {batchLocation
                ? 'Every item in this scan is filed there, whatever its category.'
                : autoFiles
                  ? 'Leave this off and each item goes to the bin that holds its category.'
                  : 'Optional — leave it off and these land unfiled. Set up which bin holds what in Settings and they will file themselves.'}
            </Text>
          </View>
        )}

        {selectedItem && selectedIndex >= 0 ? (
          <ItemEditor
            item={selectedItem}
            verified={!!verifiedIds[selectedId!]}
            onChange={(updates) => updateItemAtIndex(selectedIndex, updates)}
            onRemove={() => removeItemAtIndex(selectedIndex)}
            onBarcode={() => handleBarcodeScan(selectedItem.uid)}
            onUndoConfirm={() => unconfirm(selectedItem.uid)}
            onIdentify={() => handleIdentify(selectedItem.uid)}
            identifying={identifyingId === selectedItem.uid}
            onClose={() => setSelectedId(null)}
          />
        ) : null}

        <View className="gap-3">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text variant="heading">Donation items</Text>
            <Text variant="label" tone="soft">
              {draftItems.length} products ·{' '}
              {draftItems.reduce((sum, item) => sum + (item.count ?? 1), 0)} units
            </Text>
          </View>
          <Text variant="label" tone="soft">
            Tap an item to edit it or find it in the photo.
          </Text>
          {draftItems.map((item, index) => {
            const checked = !!verifiedIds[item.uid];
            const needsReview =
              !checked && ((item.confidence ?? 1) < 0.7 || !isUsableCondition(item.condition));
            return (
              <Card
                key={item.uid}
                className="gap-3 p-4"
                style={
                  selectedId === item.uid
                    ? { borderColor: COLORS.primary }
                    : needsReview
                      ? { borderLeftWidth: 3, borderLeftColor: COLORS.statusWarning }
                      : undefined
                }
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name || 'Unnamed item'}`}
                  className="flex-row items-start gap-3"
                  onPress={() => {
                    cueTap();
                    focusRow(item);
                  }}
                >
                  <ItemThumb
                    imageUrl={item.image_url}
                    category={item.category ?? 'unknown'}
                    size="md"
                  />
                  <View className="flex-1 gap-1">
                    <Text variant="body" className="font-semibold">
                      {item.name || 'Name this item'}
                    </Text>
                    <Text variant="label" tone="soft" className="capitalize">
                      {item.category ?? 'Unknown category'}
                    </Text>
                    <View className="flex-row items-center gap-1.5">
                      <MaterialCommunityIcons
                        name={checked ? 'check-circle-outline' : 'alert-circle-outline'}
                        size={16}
                        color={checked ? COLORS.statusGood : COLORS.primaryDark}
                      />
                      <Text variant="micro" tone={checked ? 'good' : 'soft'}>
                        {checked ? 'Confirmed' : needsReview ? 'Needs review' : 'Ready to check'}
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
                <View className="flex-row flex-wrap items-center justify-between gap-3 pt-3" style={RULE_ABOVE}>
                  <Stepper
                    value={item.count ?? 1}
                    min={1}
                    onChange={(count) => updateItemAtIndex(index, { count })}
                  />
                  <Button
                    label={checked ? 'Edit' : 'Check item'}
                    variant="secondary"
                    size="compact"
                    onPress={() => {
                      cueTap();
                      focusRow(item);
                    }}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      </KeyboardScreen>

      {/* THE CONFIRM BAR.
          Pinned to the screen rather than living at the end of the editor card,
          because that card changes height from item to item (no barcode button
          for a barcode match, a damage warning for a flagged tin), and a button
          that moves can't be tapped quickly. Anchored at the bottom, the button
          stays exactly where the thumb is. */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-canvas px-gutter pt-3"
        style={[RULE_ABOVE, { paddingBottom: insets.bottom + 12 }]}
      >
        {bar.hint ? (
          <Text variant="micro" tone="soft" numberOfLines={1} className="mb-2">
            {bar.hint}
          </Text>
        ) : null}

        {/* Confirm and Add, side by side. Adding used to be at the very bottom of
            the page, a scroll away from the button you'd just been confirming
            with.

            The two keep FIXED positions and widths. Confirm is the wide one on
            the left, where rapid taps land, and it ends as a non-tappable "All
            confirmed". Add is a separate target on the right, so a burst of
            confirms can never spill into saving. Adding with items still
            unconfirmed asks first (handleSaveToInventory). */}
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
              // Same height as a button with its lip, so nothing shifts when the
              // last confirm turns the button into this.
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
              label={`Add ${draftItems.length}`}
              accessibilityLabel={`Add ${draftItems.length} ${draftItems.length === 1 ? 'item' : 'items'} to inventory`}
              block
              // The obvious next step only once everything is checked.
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
    </View>
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
}: {
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

  return (
    <Card className={verified ? 'border-good' : 'border-brand-light'}>
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
            label="Expires"
            placeholder="YYYY-MM-DD"
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
