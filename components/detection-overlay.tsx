import React, { useEffect, useState } from 'react';
import { Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, RADII } from '../constants/theme';
import { useAccessibilityStore } from '../lib/accessibility';
import {
  isTooSmall,
  moveBox,
  rectFromDrag,
  resizeBox,
  toFractions,
  toPixels,
  type Corner,
} from '../lib/box-geometry';
import type { DetectionBox } from '../lib/scan-normalize';

/**
 * The photo with what the scanner found drawn on top of it — and correctable.
 *
 * Boxes are not treated as the model's final word, because measured against a
 * test image they land roughly 5% off and clip the bottom of tall items. A box
 * that points at the gap beside a jar is worse than no box: it tells a volunteer
 * to confirm the wrong thing. So a selected box can be dragged and resized, and
 * anything the scanner missed entirely can be drawn by hand.
 *
 * Geometry is kept in pixels while a finger is down (that is what gestures speak)
 * and committed back as fractions of the image, which is what survives a rotation
 * or a different screen.
 */

/** Corner grab area: 44pt so older volunteer fingers can grab corners reliably. */
const HANDLE = 44;

export interface OverlayItem {
  id: string;
  label: string;
  count: number;
  box: DetectionBox | null;
  verified: boolean;
  needsAttention: boolean;
}

interface Props {
  uri: string;
  aspectRatio: number;
  items: OverlayItem[];
  selectedId: string | null;
  drawMode: boolean;
  onSelect: (id: string) => void;
  onBoxChange: (id: string, box: DetectionBox) => void;
  onDraw: (box: DetectionBox) => void;
  /** Lets the parent freeze the scroll view while a box is being dragged. */
  onDragStateChange: (dragging: boolean) => void;
}

export function DetectionOverlay({
  uri,
  aspectRatio,
  items,
  selectedId,
  drawMode,
  onSelect,
  onBoxChange,
  onDraw,
  onDragStateChange,
}: Props) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setFrame({ width, height: width / aspectRatio });
  };

  const boxed = items.filter(i => i.box);
  const ready = frame.width > 0;

  return (
    <View style={styles.root} onLayout={onLayout}>
      <Image source={{ uri }} style={[styles.image, { aspectRatio }]} resizeMode="cover" />

      {ready &&
        boxed.map(item => (
          <EditableBox
            key={item.id}
            item={item}
            frame={frame}
            selected={item.id === selectedId}
            // A box cannot be grabbed while a new one is being drawn, or the
            // first touch inside an existing box would move it instead.
            locked={drawMode}
            onPress={() => onSelect(item.id)}
            onCommit={box => onBoxChange(item.id, box)}
            onDragStateChange={onDragStateChange}
          />
        ))}

      {ready && drawMode && (
        <DrawLayer frame={frame} onDraw={onDraw} onDragStateChange={onDragStateChange} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ box */

function EditableBox({
  item,
  frame,
  selected,
  locked,
  onPress,
  onCommit,
  onDragStateChange,
}: {
  item: OverlayItem;
  frame: { width: number; height: number };
  selected: boolean;
  locked: boolean;
  onPress: () => void;
  onCommit: (box: DetectionBox) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const box = item.box!;
  const reducedMotion = useReducedMotion();
  const seniorMode = useAccessibilityStore(state => state.seniorMode);

  // Live pixel geometry. Seeded from the fractions and written back on release.
  const x = useSharedValue(box.left * frame.width);
  const y = useSharedValue(box.top * frame.height);
  const w = useSharedValue(box.width * frame.width);
  const h = useSharedValue(box.height * frame.height);
  const glow = useSharedValue(0);

  // Re-seeded when the frame is measured, or when the parent moves the box for
  // some other reason. Without this a layout change strands the box off-screen.
  useEffect(() => {
    const px = toPixels(box, frame);
    x.value = px.x;
    y.value = px.y;
    w.value = px.w;
    h.value = px.h;
  }, [box.left, box.top, box.width, box.height, frame.width, frame.height]);

  useEffect(() => {
    if (item.verified) {
      glow.value = reducedMotion ? 0 : withTiming(0, { duration: 260 });
      return;
    }
    if (reducedMotion) {
      glow.value = 0.45;
      return;
    }
    glow.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [item.verified, reducedMotion, glow]);

  const commit = () => {
    onCommit(toFractions({ x: x.value, y: y.value, w: w.value, h: h.value }, frame));
    onDragStateChange(false);
  };

  // Only a selected box moves, so an accidental drag never nudges a box the
  // volunteer was not even looking at.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const movePan = Gesture.Pan()
    .enabled(selected && !locked)
    .onBegin(() => {
      startX.value = x.value;
      startY.value = y.value;
      runOnJS(onDragStateChange)(true);
    })
    .onUpdate(e => {
      const next = moveBox(
        { x: startX.value, y: startY.value, w: w.value, h: h.value },
        e.translationX,
        e.translationY,
        frame,
      );
      x.value = next.x;
      y.value = next.y;
    })
    .onFinalize(() => runOnJS(commit)());

  const animatedBox = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: item.verified ? 0 : interpolate(glow.value, [0, 1], [0.25, 0.75]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.045]) }],
  }));

  const accent = item.verified
    ? COLORS.statusGood
    : item.needsAttention
      ? COLORS.statusWarning
      : COLORS.primaryLight;

  return (
    <GestureDetector gesture={movePan}>
      <Animated.View style={[styles.boxRoot, animatedBox]}>
        <Animated.View
          style={[styles.halo, { borderColor: accent, shadowColor: accent }, haloStyle]}
          pointerEvents="none"
        />

        <Pressable
          onPress={onPress}
          disabled={locked}
          style={[
            styles.box,
            { borderColor: accent },
            selected && styles.boxSelected,
            item.verified && styles.boxVerified,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${item.label}, quantity ${item.count}${
            item.verified ? ', confirmed' : ', not yet confirmed'
          }`}
        >
          <View style={[styles.tag, { backgroundColor: accent }]}>
            {item.verified && (
              <Text style={[styles.tagTick, seniorMode && { fontSize: 13 }]}>✓</Text>
            )}
            <Text style={[styles.tagText, seniorMode && { fontSize: 14 }]} numberOfLines={1}>
              {item.count > 1 ? `${item.count}× ` : ''}
              {item.label}
            </Text>
          </View>
        </Pressable>

        {selected && !locked && (
          <>
            <CornerHandle corner="tl" {...{ x, y, w, h, frame, commit, onDragStateChange }} />
            <CornerHandle corner="tr" {...{ x, y, w, h, frame, commit, onDragStateChange }} />
            <CornerHandle corner="bl" {...{ x, y, w, h, frame, commit, onDragStateChange }} />
            <CornerHandle corner="br" {...{ x, y, w, h, frame, commit, onDragStateChange }} />
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function CornerHandle({
  corner,
  x,
  y,
  w,
  h,
  frame,
  commit,
  onDragStateChange,
}: {
  corner: Corner;
  x: SharedValue<number>;
  y: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
  frame: { width: number; height: number };
  commit: () => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const sw = useSharedValue(0);
  const sh = useSharedValue(0);

  const movesLeft = corner === 'tl' || corner === 'bl';
  const movesTop = corner === 'tl' || corner === 'tr';

  const pan = Gesture.Pan()
    .onBegin(() => {
      sx.value = x.value;
      sy.value = y.value;
      sw.value = w.value;
      sh.value = h.value;
      runOnJS(onDragStateChange)(true);
    })
    .onUpdate(e => {
      const next = resizeBox(
        corner,
        { x: sx.value, y: sy.value, w: sw.value, h: sh.value },
        e.translationX,
        e.translationY,
        frame,
      );
      x.value = next.x;
      y.value = next.y;
      w.value = next.w;
      h.value = next.h;
    })
    .onFinalize(() => runOnJS(commit)());

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.handleHit,
          movesLeft ? { left: -HANDLE / 2 } : { right: -HANDLE / 2 },
          movesTop ? { top: -HANDLE / 2 } : { bottom: -HANDLE / 2 },
        ]}
      >
        <View style={styles.handleDot} />
      </View>
    </GestureDetector>
  );
}

/* ----------------------------------------------------------------- draw */

function DrawLayer({
  frame,
  onDraw,
  onDragStateChange,
}: {
  frame: { width: number; height: number };
  onDraw: (box: DetectionBox) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const active = useSharedValue(0);

  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const finish = (rx: number, ry: number, rw: number, rh: number) => {
    onDragStateChange(false);
    const rect = { x: rx, y: ry, w: rw, h: rh };
    // A tap rather than a drag. Ignoring it beats littering the photo with
    // slivers every time someone touches the picture in draw mode.
    if (isTooSmall(rect)) return;
    onDraw(toFractions(rect, frame));
  };

  const pan = Gesture.Pan()
    .onBegin(e => {
      originX.value = e.x;
      originY.value = e.y;
      x.value = e.x;
      y.value = e.y;
      w.value = 0;
      h.value = 0;
      active.value = 1;
      runOnJS(onDragStateChange)(true);
    })
    .onUpdate(e => {
      const r = rectFromDrag(originX.value, originY.value, e.x, e.y, frame);
      x.value = r.x;
      y.value = r.y;
      w.value = r.w;
      h.value = r.h;
    })
    .onFinalize(() => {
      active.value = 0;
      runOnJS(finish)(x.value, y.value, w.value, h.value);
    });

  const preview = useAnimatedStyle(() => ({
    opacity: active.value,
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.drawLayer}>
        <Animated.View style={[styles.drawPreview, preview]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: '#1A1512',
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  image: { width: '100%' },

  boxRoot: { position: 'absolute' },
  halo: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderRadius: RADII.md,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  box: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderRadius: RADII.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  boxSelected: { borderWidth: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  boxVerified: { backgroundColor: 'rgba(91,140,81,0.22)' },

  tag: {
    position: 'absolute',
    top: -13,
    left: -2,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: RADII.sm,
  },
  tagText: { fontSize: 12, fontWeight: '700', color: COLORS.textOnPrimary },
  tagTick: { fontSize: 11, fontWeight: '900', color: COLORS.textOnPrimary },

  handleHit: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.textOnPrimary,
    borderWidth: 2.5,
    borderColor: COLORS.primaryDark,
  },

  drawLayer: { ...StyleSheet.absoluteFill },
  drawPreview: {
    position: 'absolute',
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: COLORS.textOnPrimary,
    borderRadius: RADII.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
