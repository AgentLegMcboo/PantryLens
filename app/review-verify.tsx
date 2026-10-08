import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { DetectionOverlay, type OverlayItem } from '../components/detection-overlay';
import { Badge, Button, Card, Chip, Input, Stepper, Text } from '../components/ui';
import * as Crypto from 'expo-crypto';
import { recordConfirmations, type ConfirmationEntry } from '../lib/catalogue';
import { attachItemPhotos, type PhotoJob } from '../lib/item-photos';
import type { DetectionBox, ScanCandidate } from '../lib/scan-normalize';
import {
  Condition,
  CONDITION_LABELS,
  InventoryItem,
  isUsableCondition,
  usePantryStore
} from '../lib/store';
import { cueSuccess, cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { clearSavedCapture } from '../lib/capture-queue';

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
    draftLocationId,
    setPendingBarcode,
  } = usePantryStore();

  /**
   * Where this whole intake is going.
   *
   * The pantry's process sorts a donation onto a table or into a bin and then
   * shelves it — and that decision is made once, for the batch, by the person
   * carrying it. Asking per item would be nonsense; asking once here is exactly
   * when they know the answer.
   */
  const [batchLocation, setBatchLocation] = useState<string | null>(params.source === 'shelf_audit' ? draftLocationId : null);

  /**
   * Whether the pantry has told the app what its bins are for.
   *
   * When it has, sorting stops being a step: each item files itself under the
   * place that claims its category, and the batch picker becomes an override for
   * the odd load that all goes one place.
   */
  const autoFiles = locations.some(l => l.categories?.length > 0);

  const source: 'donation' | 'shelf_audit' =
    params.source === 'shelf_audit' ? 'shelf_audit' : 'donation';

  const [draftItems, setDraftItems] = useState<DraftRow[]>(() =>
    currentDraft.map(item => ({
      ...item,
      uid: nextUid(),
      rawName: item.name ?? '',
      // normaliseItem hands this over as imageUrl; the row stores it the way the
      // database does.
      image_url: (item as any).imageUrl ?? null,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
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
  const verifiedCount = draftItems.filter(i => verifiedIds[i.uid]).length;
  const allVerified = draftItems.length > 0 && verifiedCount === draftItems.length;

  const updateItemAtIndex = (index: number, updates: Partial<InventoryItem>) => {
    const uid = draftItems[index].uid;
    setVerifiedIds(prev => ({ ...prev, [uid]: false }));
    setDraftItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const removeItemAtIndex = (index: number) => {
    const removedId = draftItems[index].uid;
    setDraftItems(prev => prev.filter((_, i) => i !== index));
    setVerifiedIds(prev => {
      const next = { ...prev };
      delete next[removedId];
      return next;
    });
    if (selectedId === removedId) setSelectedId(null);
  };

  /** A box the volunteer dragged or resized. Their placement beats the model's. */
  const handleBoxChange = (id: string, box: DetectionBox) => {
    setDraftItems(prev => prev.map(item => (item.uid === id ? { ...item, box } : item)));
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
    setDraftItems(prev => [...prev, row]);
    setSelectedId(row.uid);
    setDrawMode(false);
  };

  const toggleVerified = (id: string) => {
    const next = !verifiedIds[id];
    next ? cueSuccess() : cueTap();
    setVerifiedIds(prev => ({ ...prev, [id]: next }));
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
    const index = draftItems.findIndex(i => i.uid === pendingBarcode.uid);
    if (index < 0) {
      setPendingBarcode(null);
      return;
    }

    setDraftItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        name: pendingBarcode.name,
        category: (pendingBarcode.category ?? next[index].category) as any,
        barcode: pendingBarcode.barcode,
        resolvedBy: 'barcode',
        image_url: pendingBarcode.imageUrl ?? next[index].image_url ?? null,
        // The manufacturer said so. Nothing in this pipeline is more certain.
        confidence: 1,
      };
      return next;
    });
    // Identified by its barcode and already confirmed by the human who chose to
    // scan it — making them tick it again would be theatre.
    setVerifiedIds(prev => ({ ...prev, [pendingBarcode.uid]: true }));
    setPendingBarcode(null);
  }, [pendingBarcode]);

  const commit = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    let committed = false;
    setSaving(true);
    try {
      /**
       * Ids are minted here, before the insert, so the background photo upload
       * knows which row each crop belongs to. Letting Postgres assign them would
       * mean matching rows back by position afterwards, which it does not
       * promise to preserve.
       */
      const rows = draftItems.map(row => ({
        ...row,
        id: row.id ?? Crypto.randomUUID(),
        // An explicit choice for the batch wins; otherwise each item goes to
        // whichever bin claims its category. Null when nothing claims it, which
        // leaves it unfiled rather than guessing.
        location_id:
          batchLocation ?? defaultLocationFor((row.category ?? 'unknown') as any),
        source_org: draftSource,
      }));
      const result = await addItems(rows, source);
      committed = true;
      setSaved(true);
      if (settings.pantryId && usePantryStore.getState().session?.user.id) {
        await clearSavedCapture(usePantryStore.getState().session!.user.id, settings.pantryId).catch(() => {});
      }
      if (result === 'queued') {
        cueSuccess();
        usePantryStore.getState().setDraft([]);
        Alert.alert('Saved on this device', 'Your verified intake is waiting to sync. It will appear in inventory after the server confirms it.', [{ text: 'Back to pantry', onPress: () => router.replace('/(tabs)') }]);
        return;
      }

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
        .filter(row => row.resolvedBy !== 'barcode' && row.rawName.trim() && row.name?.trim())
        .map(row => ({
          raw_name: row.rawName,
          canonical_name: row.name!.trim(),
          category: (row.category ?? 'unknown') as any,
          was_corrected:
            row.rawName.trim().toLowerCase() !== row.name!.trim().toLowerCase(),
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
        const jobs: PhotoJob[] = rows.flatMap(row => {
          if (row.image_url) return [];
          const photo = currentScanPhotos[row.imageIndex ?? 0];
          if (!row.box || !photo?.uri || !photo.width || !photo.height) return [];
          return [{
            id: row.id!,
            pantryId: settings.pantryId!,
            box: row.box,
            uri: photo.uri,
            width: photo.width,
            height: photo.height,
          }];
        });
        attachItemPhotos(jobs).catch(err =>
          log.error('store', 'the photo attach threw', err),
        );
      }

      cueSuccess();
      usePantryStore.getState().setDraft([]);
      Alert.alert(
        'Saved to inventory',
        source === 'shelf_audit' ? 'Counts for the selected shelf have been replaced.' : `${draftItems.length} item${draftItems.length === 1 ? '' : 's'} added.`,
        [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]
      );
    } catch (err: any) {
      log.error('store', 'save from review failed', err);
      cueWarn();
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
      if (!committed) savingRef.current = false;
    }
  };

  const confirmCommit = () => {
    if (source === 'shelf_audit') {
      const shelf = locations.find(l => l.id === draftLocationId)?.name ?? 'the selected shelf';
      Alert.alert('Replace this shelf’s counts?', `The verified items will replace all recorded stock at ${shelf}. Include every item on that shelf; items absent from this audit will be removed.`, [{ text: 'Keep reviewing', style: 'cancel' }, { text: 'Replace shelf counts', onPress: commit }]);
    } else commit();
  };
  const handleSaveToInventory = () => {
    if (draftItems.length === 0 || savingRef.current) return;

    // A box drawn by hand starts with no name. Saving it would file "Unlabeled
    // Item" into the pantry, which is the one thing a hand-drawn box was meant
    // to avoid — so this one does block, and points at the row to fix.
    const namelessIndex = draftItems.findIndex(i => !i.name?.trim());
    if (namelessIndex >= 0) {
      cueWarn();
      setPhotoIndex(draftItems[namelessIndex].imageIndex ?? 0);
      setSelectedId(draftItems[namelessIndex].uid);
      Alert.alert('One item still needs a name', 'Name the box you drew, then save.');
      return;
    }

    // Uncertain detections need an individual decision before a batch can save.
    const uncertain = draftItems.find(i => !verifiedIds[i.uid] && ((i.confidence ?? 1) < 0.7 || i.category === 'unknown' || !isUsableCondition(i.condition)));
    if (uncertain) {
      setPhotoIndex(uncertain.imageIndex ?? 0); setSelectedId(uncertain.uid);
      Alert.alert('Check this item first', 'This item is uncertain or needs inspection. Confirm its name, category, quantity, and condition before saving.');
      return;
    }
    const unverified = draftItems.length - verifiedCount;
    if (unverified > 0) {
      cueWarn();
      Alert.alert(
        `${unverified} item${unverified === 1 ? '' : 's'} not confirmed`,
        'Compare every remaining name and count against the donation before confirming the batch.',
        [
          { text: 'Keep checking', style: 'cancel' },
          { text: 'I checked all remaining items', onPress: () => { setVerifiedIds(Object.fromEntries(draftItems.map(i => [i.uid, true]))); confirmCommit(); } },
        ],
      );
      return;
    }
    confirmCommit();
  };

  if (draftItems.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas px-10">
        <MaterialCommunityIcons name="camera-off-outline" size={44} color={COLORS.textSecondary} />
        <Text variant="title" className="mt-4">
          Nothing to review
        </Text>
        <Text variant="body" tone="soft" className="mt-2 text-center">
          Every line was removed, or the scan came back empty. Photograph the donation again, or
          add the items by hand.
        </Text>
        <Button label="Back to camera" className="mt-6" onPress={() => router.back()} />
      </View>
    );
  }

  const selectedIndex = selectedId ? draftItems.findIndex(i => i.uid === selectedId) : -1;
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

  // Detections the model could not place. They are still real items and still
  // need confirming, so they get a list rather than being quietly hidden.
  const unplaced = draftItems
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => !item.box && (item.imageIndex ?? 0) === photoIndex);

  return (
    <KeyboardScreen scrollEnabled={scrollEnabled}>
      {/* Progress, stated once as a sentence rather than as a card full of
          chrome. The bar is the only ornament it needs. */}
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <Text variant="heading">
            {allVerified ? 'Everything checked' : `${verifiedCount} of ${draftItems.length} confirmed`}
          </Text>
          <MaterialCommunityIcons
            name={allVerified ? 'shield-check' : 'shield-search'}
            size={20}
            color={allVerified ? COLORS.statusGood : COLORS.primaryLight}
          />
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-muted">
          <View
            className={allVerified ? 'h-full rounded-full bg-good' : 'h-full rounded-full bg-brand-light'}
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
            onSelect={id => {
              cueTap();
              setSelectedId(prev => (prev === id ? null : id));
            }}
            onBoxChange={handleBoxChange}
            onDraw={handleDrawBox}
            onDragStateChange={dragging => setScrollEnabled(!dragging)}
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
                setDrawMode(m => !m);
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
              item => (item.imageIndex ?? 0) === i && !verifiedIds[item.uid],
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

      {source === 'shelf_audit' && (
        <Card className="gap-2">
          <Text variant="label">Auditing: {locations.find(loc => loc.id === draftLocationId)?.name ?? 'Selected shelf'}</Text>
          <Text variant="micro" tone="soft">These verified counts will replace only this shelf. Other shelves stay as they are.</Text>
        </Card>
      )}
      {source !== 'shelf_audit' && locations.length > 0 && (
        <View className="gap-2">
          <Text variant="label" tone="soft" className="font-semibold">
            {autoFiles ? 'Send the whole batch to one place?' : 'Where is this going?'}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {locations.map(loc => (
              <Chip
                key={loc.id}
                label={loc.name}
                selected={batchLocation === loc.id}
                onPress={() =>
                  setBatchLocation(batchLocation === loc.id ? null : loc.id)
                }
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
          onChange={updates => updateItemAtIndex(selectedIndex, updates)}
          onRemove={() => removeItemAtIndex(selectedIndex)}
          onBarcode={() => handleBarcodeScan(selectedItem.uid)}
          onToggleVerified={() => toggleVerified(selectedId!)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {unplaced.length > 0 && (
        <Card>
          <Text variant="heading">Not pinned to a spot</Text>
          <Text variant="label" tone="soft" className="mt-1">
            Read, but the scanner could not say where they were.
          </Text>
          <View className="mt-4 gap-3">
            {unplaced.map(({ item }) => {
              const isVerified = !!verifiedIds[item.uid];
              return (
                <Pressable
                  key={item.uid}
                  className="flex-row items-center gap-3"
                  onPress={() => {
                    cueTap();
                    setSelectedId(prev => (prev === item.uid ? null : item.uid));
                  }}
                >
                  <MaterialCommunityIcons
                    name={isVerified ? 'check-circle' : 'circle-outline'}
                    size={20}
                    color={isVerified ? COLORS.statusGood : COLORS.textSecondary}
                  />
                  <Text variant="label" className="flex-1" numberOfLines={1}>
                    {item.count && item.count > 1 ? `${item.count}× ` : ''}
                    {item.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <Button
        label={saved ? 'Intake saved' : source === 'shelf_audit' ? 'Replace this shelf with verified counts' : `Add ${draftItems.length} item${draftItems.length === 1 ? '' : 's'} to inventory`}
        block
        loading={saving}
        disabled={saved}
        icon={<MaterialCommunityIcons name="database-check" size={20} color={COLORS.textOnPrimary} />}
        onPress={handleSaveToInventory}
      />
    </KeyboardScreen>
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
  onToggleVerified,
  onClose,
}: {
  item: DraftRow;
  verified: boolean;
  onChange: (updates: Partial<InventoryItem>) => void;
  onRemove: () => void;
  onBarcode: () => void;
  onToggleVerified: () => void;
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
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this item">
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.textSecondary} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View className="mt-5">
        <Input
          label="Name"
          value={item.name}
          placeholder="What is it?"
          onChangeText={txt => onChange({ name: txt })}
        />
      </View>

      <View className="mt-5 gap-2">
        <Text variant="label" tone="soft">
          Category
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.map(cat => (
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
          {(Object.keys(CONDITION_LABELS) as Condition[]).map(cond => {
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
          <Stepper value={item.count || 1} min={1} onChange={next => onChange({ count: next })} />
        </View>
        <View className="flex-1">
          <Input
            label="Expires"
            placeholder="YYYY-MM-DD"
            value={item.expiration || ''}
            onChangeText={txt => onChange({ expiration: txt })}
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
          icon={
            <MaterialCommunityIcons name="barcode-scan" size={17} color={COLORS.textPrimary} />
          }
          onPress={onBarcode}
        />
      )}

      <Button
        label={verified ? 'Confirmed — tap to undo' : 'Looks right, confirm it'}
        block
        variant={verified ? 'secondary' : 'primary'}
        className={verified ? 'mt-3' : 'mt-5'}
        icon={
          <MaterialCommunityIcons
            name={verified ? 'check-circle' : 'check-circle-outline'}
            size={18}
            color={verified ? COLORS.primaryDark : COLORS.textOnPrimary}
          />
        }
        onPress={onToggleVerified}
      />
    </Card>
  );
}
