import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { DetectionOverlay, type OverlayItem } from '../components/detection-overlay';
import { Badge, Button, Card, Chip, Stepper, Text } from '../components/ui';
import { lookupBarcode } from '../lib/ai_vision';
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
  Partial<Pick<ScanCandidate, 'imageIndex' | 'box'>> & { uid: string };

let uidCounter = 0;
const nextUid = () => `row-${++uidCounter}`;

const CATEGORIES = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby'];

export default function ReviewVerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const { currentDraft, currentScanPhotos, addItems } = usePantryStore();

  const source: 'donation' | 'shelf_audit' =
    params.source === 'shelf_audit' ? 'shelf_audit' : 'donation';

  const [draftItems, setDraftItems] = useState<DraftRow[]>(() =>
    currentDraft.map(item => ({ ...item, uid: nextUid() })),
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
  const verifiedCount = draftItems.filter(i => verifiedIds[i.uid]).length;
  const allVerified = draftItems.length > 0 && verifiedCount === draftItems.length;

  const updateItemAtIndex = (index: number, updates: Partial<InventoryItem>) => {
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

  const handleBarcodeScan = (index: number) => {
    const item = lookupBarcode('0111222333');
    updateItemAtIndex(index, {
      name: item.name,
      category: item.category,
      expiration: item.expiration,
      confidence: 1.0
    });
    Alert.alert('Barcode Identified!', `Resolved to "${item.name}" (${item.category?.toUpperCase()})`);
  };

  const commit = async () => {
    setSaving(true);
    try {
      await addItems(draftItems, source);
      cueSuccess();
      Alert.alert(
        'Saved to inventory',
        `${draftItems.length} item${draftItems.length === 1 ? '' : 's'} added.`,
        [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]
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
    const namelessIndex = draftItems.findIndex(i => !i.name?.trim());
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
    <KeyboardScreen
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 96, gap: 16 }}
      scrollEnabled={scrollEnabled}
    >
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

      {selectedItem && selectedIndex >= 0 ? (
        <ItemEditor
          item={selectedItem}
          verified={!!verifiedIds[selectedId!]}
          onChange={updates => updateItemAtIndex(selectedIndex, updates)}
          onRemove={() => removeItemAtIndex(selectedIndex)}
          onBarcode={() => handleBarcodeScan(selectedIndex)}
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
        label={`Add ${draftItems.length} item${draftItems.length === 1 ? '' : 's'} to inventory`}
        block
        loading={saving}
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
        <Badge
          label={`${Math.round((item.confidence ?? 0) * 100)}% sure`}
          tone={isLowConf ? 'warn' : 'good'}
        />
        <View className="flex-row items-center gap-5">
          <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel="Remove this item">
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.textSecondary} />
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
            <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View className="mt-5 gap-2">
        <Text variant="label" tone="soft">
          Name
        </Text>
        <TextInput
          className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body text-ink"
          value={item.name}
          placeholder="What is it?"
          placeholderTextColor={COLORS.textSecondary}
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
        <View className="flex-1 gap-2">
          <Text variant="label" tone="soft">
            Expires
          </Text>
          <TextInput
            className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body text-ink"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textSecondary}
            value={item.expiration || ''}
            onChangeText={txt => onChange({ expiration: txt })}
          />
        </View>
      </View>

      {isLowConf && (
        <Button label="Scan barcode instead" variant="secondary" size="compact" className="mt-5" onPress={onBarcode} />
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
