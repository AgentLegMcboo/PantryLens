import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { KeyboardScreen } from '../components/keyboard-screen';
import { DetectionOverlay, type OverlayItem } from '../components/detection-overlay';
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
      <View style={styles.emptyState}>
        <MaterialCommunityIcons name="camera-off-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.emptyTitle}>Nothing to review</Text>
        <Text style={styles.emptySub}>
          Every line was removed, or the scan came back empty. Photograph the donation again, or
          add the items by hand.
        </Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.back()}>
          <Text style={styles.emptyBtnText}>Back to camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const selectedIndex = selectedId ? draftItems.findIndex(i => i.uid === selectedId) : -1;
  const selectedItem = selectedIndex >= 0 ? draftItems[selectedIndex] : null;

  // Only what was found in the photo currently on screen.
  const overlayItems: OverlayItem[] = draftItems
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => (item.imageIndex ?? 0) === photoIndex)
    .map(({ item, i }) => ({
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
      style={styles.container}
      contentContainerStyle={styles.content}
      scrollEnabled={scrollEnabled}
    >
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <MaterialCommunityIcons
            name={allVerified ? 'shield-check' : 'shield-search'}
            size={22}
            color={allVerified ? COLORS.statusGood : COLORS.primaryLight}
          />
          <Text style={styles.progressTitle}>
            {allVerified
              ? 'Everything checked'
              : `${verifiedCount} of ${draftItems.length} confirmed`}
          </Text>
        </View>
        <Text style={styles.progressSub}>
          {allVerified
            ? 'Save when you are ready.'
            : 'Tap a glowing box to check it against the shelf.'}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(verifiedCount / draftItems.length) * 100}%`,
                backgroundColor: allVerified ? COLORS.statusGood : COLORS.primaryLight,
              },
            ]}
          />
        </View>
      </View>

      {photo ? (
        <>
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

          <View style={styles.toolbar}>
            <TouchableOpacity
              style={[styles.toolBtn, drawMode && styles.toolBtnActive]}
              onPress={() => {
                cueTap();
                setDrawMode(m => !m);
                setSelectedId(null);
              }}
            >
              <MaterialCommunityIcons
                name={drawMode ? 'close' : 'vector-rectangle'}
                size={16}
                color={drawMode ? COLORS.textOnPrimary : COLORS.primaryDark}
              />
              <Text style={[styles.toolBtnText, drawMode && styles.toolBtnTextActive]}>
                {drawMode ? 'Cancel drawing' : 'Add missed item'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.toolHint}>
            {drawMode
              ? 'Drag a rectangle around the item the scanner missed.'
              : selectedId
                ? 'Drag the box to move it, or pull a corner to resize.'
                : 'The scanner places boxes roughly — tap one, then nudge it if it sits off the item.'}
          </Text>
        </>
      ) : (
        <View style={styles.noPhoto}>
          <MaterialCommunityIcons name="image-off-outline" size={22} color={COLORS.textSecondary} />
          <Text style={styles.noPhotoText}>
            The photo isn&apos;t available, so everything is listed below instead.
          </Text>
        </View>
      )}

      {currentScanPhotos.length > 1 && (
        <View style={styles.photoTabs}>
          {currentScanPhotos.map((_, i) => {
            const active = i === photoIndex;
            const pending = draftItems.filter(
              item => (item.imageIndex ?? 0) === i && !verifiedIds[item.uid],
            ).length;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.photoTab, active && styles.photoTabActive]}
                onPress={() => {
                  cueTap();
                  setPhotoIndex(i);
                  setSelectedId(null);
                }}
              >
                <Text style={[styles.photoTabText, active && styles.photoTabTextActive]}>
                  Photo {i + 1}
                </Text>
                {pending > 0 && (
                  <View style={styles.photoTabBadge}>
                    <Text style={styles.photoTabBadgeText}>{pending}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* The editor for whatever box is currently tapped. Only one is open at a
          time — this is a checking task, and nineteen expanded cards is the wall
          of forms the overlay exists to replace. */}
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
      ) : (
        <View style={styles.hintCard}>
          <MaterialCommunityIcons name="gesture-tap" size={20} color={COLORS.textSecondary} />
          <Text style={styles.hintText}>
            Tap any box on the photo to check its name, category, count and condition.
          </Text>
        </View>
      )}

      {unplaced.length > 0 && (
        <View style={styles.unplacedCard}>
          <Text style={styles.unplacedTitle}>Not pinned to a spot</Text>
          <Text style={styles.unplacedSub}>
            The scanner read these but could not say exactly where they were.
          </Text>
          {unplaced.map(({ item, i }) => {
            const id = item.uid;
            const isVerified = !!verifiedIds[id];
            return (
              <TouchableOpacity
                key={id}
                style={styles.unplacedRow}
                onPress={() => {
                  cueTap();
                  setSelectedId(prev => (prev === id ? null : id));
                }}
              >
                <MaterialCommunityIcons
                  name={isVerified ? 'check-circle' : 'circle-outline'}
                  size={20}
                  color={isVerified ? COLORS.statusGood : COLORS.textSecondary}
                />
                <Text style={styles.unplacedName} numberOfLines={1}>
                  {item.count && item.count > 1 ? `${item.count}× ` : ''}
                  {item.name}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={[styles.commitBtn, saving && { opacity: 0.6 }]}
        onPress={handleSaveToInventory}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons name="database-check" size={22} color={COLORS.textOnPrimary} />
            <Text style={styles.commitBtnText}>
              Add {draftItems.length} Item{draftItems.length === 1 ? '' : 's'} to Inventory
            </Text>
          </>
        )}
      </TouchableOpacity>
    </KeyboardScreen>
  );
}

/** The edit panel for a single tapped detection. */
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
    <View style={[styles.editor, verified && styles.editorVerified]}>
      <View style={styles.editorHeader}>
        {isLowConf ? (
          <View style={styles.lowConfBadge}>
            <MaterialCommunityIcons name="alert-circle" size={14} color={COLORS.statusWarning} />
            <Text style={styles.lowConfBadgeText}>
              CHECK THIS ONE ({Math.round((item.confidence ?? 0) * 100)}%)
            </Text>
          </View>
        ) : (
          <View style={styles.highConfBadge}>
            <MaterialCommunityIcons name="check" size={14} color={COLORS.statusGood} />
            <Text style={styles.highConfBadgeText}>
              HIGH CONFIDENCE ({Math.round((item.confidence ?? 0) * 100)}%)
            </Text>
          </View>
        )}

        <View style={styles.editorHeaderActions}>
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.inputLabel}>Item Name</Text>
      <TextInput
        style={styles.nameInput}
        value={item.name}
        onChangeText={txt => onChange({ name: txt })}
      />

      <Text style={styles.inputLabel}>Category</Text>
      <View style={styles.catRow}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, item.category === cat && styles.catChipActive]}
            onPress={() => {
              cueTap();
              onChange({ category: cat as any });
            }}
          >
            <Text style={[styles.catChipText, item.category === cat && styles.catChipTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.inputLabel}>Condition</Text>
      <View style={styles.catRow}>
        {(Object.keys(CONDITION_LABELS) as Condition[]).map(cond => {
          const active = (item.condition || 'ok') === cond;
          const good = cond === 'ok';
          return (
            <TouchableOpacity
              key={cond}
              style={[
                styles.catChip,
                active && {
                  backgroundColor: good ? COLORS.statusGood : COLORS.statusCritical,
                  borderColor: good ? COLORS.statusGood : COLORS.statusCritical
                }
              ]}
              onPress={() => {
                if (cond === 'ok') cueTap();
                else cueWarn();
                onChange({ condition: cond });
              }}
            >
              <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                {CONDITION_LABELS[cond]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!isUsableCondition(item.condition) && (
        <View style={styles.damageNote}>
          <MaterialCommunityIcons name="alert-outline" size={14} color={COLORS.statusCritical} />
          <Text style={styles.damageNoteText}>Held back from boxes until inspected again.</Text>
        </View>
      )}

      <View style={styles.bottomRow}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.inputLabel}>Quantity</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => {
                cueTap();
                onChange({ count: Math.max(1, (item.count || 1) - 1) });
              }}
            >
              <MaterialCommunityIcons name="minus" size={16} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.stepVal}>{item.count || 1}</Text>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => {
                cueTap();
                onChange({ count: (item.count || 1) + 1 });
              }}
            >
              <MaterialCommunityIcons name="plus" size={16} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1.2 }}>
          <Text style={styles.inputLabel}>Expiration Date</Text>
          <TextInput
            style={styles.expInput}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textSecondary}
            value={item.expiration || ''}
            onChangeText={txt => onChange({ expiration: txt })}
          />
        </View>
      </View>

      {isLowConf && (
        <TouchableOpacity style={styles.barcodeBtn} onPress={onBarcode}>
          <MaterialCommunityIcons name="barcode-scan" size={18} color={COLORS.primaryDark} />
          <Text style={styles.barcodeBtnText}>Scan Barcode Fast-Path</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.verifyBtn, verified && styles.verifyBtnDone]}
        onPress={onToggleVerified}
      >
        <MaterialCommunityIcons
          name={verified ? 'check-circle' : 'check-circle-outline'}
          size={20}
          color={COLORS.textOnPrimary}
        />
        <Text style={styles.verifyBtnText}>
          {verified ? 'Confirmed — tap to undo' : 'Looks right, confirm it'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },

  progressCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  progressTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  progressSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  progressTrack: {
    height: 6,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surfaceVariant,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: RADII.full },

  noPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  noPhotoText: { flex: 1, fontSize: 12, color: COLORS.textSecondary },

  photoTabs: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm, flexWrap: 'wrap' },
  photoTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cardSurface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADII.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  photoTabActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryLight },
  photoTabText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  photoTabTextActive: { color: COLORS.textOnPrimary },
  photoTabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.statusWarning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTabBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.textOnPrimary },

  toolbar: { flexDirection: 'row', gap: SPACING.xs, marginTop: SPACING.sm },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADII.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  toolBtnActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryLight },
  toolBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primaryDark },
  toolBtnTextActive: { color: COLORS.textOnPrimary },
  toolHint: {
    fontSize: 11,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    paddingHorizontal: 2,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.textSecondary },

  editor: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  editorVerified: { borderColor: COLORS.statusGood },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  editorHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },

  lowConfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FDF4E7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  lowConfBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.statusWarning },
  highConfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F2F8F1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.sm,
  },
  highConfBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.statusGood },

  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  nameInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 44,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  catChipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryLight },
  catChipText: { fontSize: 12, color: COLORS.textSecondary, textTransform: 'capitalize' },
  catChipTextActive: { color: COLORS.textOnPrimary, fontWeight: '700' },

  damageNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: SPACING.xs,
  },
  damageNoteText: { fontSize: 11, color: COLORS.statusCritical, flex: 1 },

  bottomRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    height: 44,
    paddingHorizontal: 4,
  },
  stepBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  stepVal: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  expInput: {
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 44,
    fontSize: 14,
    color: COLORS.textPrimary,
  },

  barcodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
  },
  barcodeBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primaryDark },

  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    minHeight: SPACING.touch,
  },
  verifyBtnDone: { backgroundColor: COLORS.statusGood },
  verifyBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textOnPrimary },

  unplacedCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  unplacedTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  unplacedSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.xs },
  unplacedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#F4EBE1',
  },
  unplacedName: { flex: 1, fontSize: 13, color: COLORS.textPrimary },

  commitBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    minHeight: SPACING.touch,
  },
  commitBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.textOnPrimary },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginTop: SPACING.sm },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  emptyBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    minHeight: SPACING.touch,
    justifyContent: 'center',
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textOnPrimary },
});
