import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { COLORS } from "../constants/theme";
import { cuePress, cueTap } from "../lib/feedback";
import type { InventoryItem } from "../lib/store";
import { useTabBarHidden } from "../lib/tab-overlay";
import { ItemThumb, Text } from "./ui";

/**
 * Drag an inventory row onto a place to move it there.
 *
 * Hold a row for a moment, then drag: the page dims, the item lifts and
 * follows the finger, and a tray of places appears at the bottom to drop it
 * on. The tray, rather than the list's own section headers, is the target on
 * purpose: in a long list the right header is usually scrolled away, and the
 * tray is always in reach of a thumb.
 *
 * Hit-testing runs on the UI thread against the tray's measured rectangles,
 * so the hover follows the finger without a round trip to JS per frame.
 */

type Rect = { x: number; y: number; w: number; h: number };
export type DropPlace = {
  id: string | null;
  name: string;
  /** Set for a sub-shelf: the shelf it sits in, shown small above the name. */
  parent?: string;
};

export type DragApi = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  grabX: SharedValue<number>;
  grabY: SharedValue<number>;
  hover: SharedValue<number>;
  active: SharedValue<number>;
  moved: SharedValue<number>;
  rects: SharedValue<Rect[]>;
  begin: (id: string) => void;
  end: (id: string, hover: number, moved: number) => void;
  /** True from the moment a drag starts until just after it ends, so the
   *  row's own tap handler can ignore the release. */
  suppressPress: React.MutableRefObject<boolean>;
};

/** Movement under this many points counts as "just held", not a drag. */
const DRAG_SLOP = 14;

export function useInventoryDrag({
  items,
  places,
  onMove,
  onHold,
}: {
  items: InventoryItem[];
  places: DropPlace[];
  onMove: (item: InventoryItem, place: DropPlace) => void;
  /** A hold that never moved: the old long-press, which starts selecting. */
  onHold: (id: string) => void;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const hover = useSharedValue(-1);
  const active = useSharedValue(0);
  const moved = useSharedValue(0);
  const rects = useSharedValue<Rect[]>([]);
  const suppressPress = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Read through refs so `begin`/`end` stay stable and memoised rows never
  // re-render because the list or the places changed.
  const latest = useRef({ items, places, onMove, onHold });
  latest.current = { items, places, onMove, onHold };

  const begin = useCallback((id: string) => {
    suppressPress.current = true;
    cuePress();
    setDraggingId(id);
  }, []);

  const end = useCallback((id: string, hoverIndex: number, distance: number) => {
    setDraggingId(null);
    setTimeout(() => (suppressPress.current = false), 80);
    const { items: list, places: targets, onMove: move, onHold: hold } = latest.current;
    if (distance < DRAG_SLOP) {
      hold(id);
      return;
    }
    const item = list.find((i) => i.id === id);
    const place = hoverIndex >= 0 ? targets[hoverIndex] : undefined;
    if (item && place && (item.location_id ?? null) !== place.id) move(item, place);
  }, []);

  const api = useMemo<DragApi>(
    () => ({ x, y, grabX, grabY, hover, active, moved, rects, begin, end, suppressPress }),
    [x, y, grabX, grabY, hover, active, moved, rects, begin, end],
  );

  // The tray sits where the floating tab bar is, so the bar steps aside.
  const setTabBarHidden = useTabBarHidden((s) => s.setHidden);
  useEffect(() => {
    setTabBarHidden(!!draggingId);
    return () => setTabBarHidden(false);
  }, [draggingId, setTabBarHidden]);

  const dragging = draggingId ? (items.find((i) => i.id === draggingId) ?? null) : null;
  return { api, dragging, draggingId };
}

/** The hold-then-drag gesture for one row. Disabled while picking. */
export function useRowDrag(api: DragApi, id: string, enabled: boolean) {
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activateAfterLongPress(320)
        .onStart((e) => {
          api.grabX.value = e.x;
          api.grabY.value = e.y;
          api.x.value = e.absoluteX;
          api.y.value = e.absoluteY;
          api.moved.value = 0;
          api.hover.value = -1;
          api.active.value = 1;
          runOnJS(api.begin)(id);
        })
        .onUpdate((e) => {
          api.x.value = e.absoluteX;
          api.y.value = e.absoluteY;
          const d = Math.abs(e.translationX) + Math.abs(e.translationY);
          if (d > api.moved.value) api.moved.value = d;
          const list = api.rects.value;
          let hit = -1;
          for (let i = 0; i < list.length; i++) {
            const r = list[i];
            if (
              e.absoluteX >= r.x &&
              e.absoluteX <= r.x + r.w &&
              e.absoluteY >= r.y &&
              e.absoluteY <= r.y + r.h
            ) {
              hit = i;
              break;
            }
          }
          api.hover.value = hit;
        })
        .onFinalize(() => {
          if (api.active.value !== 1) return;
          api.active.value = 0;
          runOnJS(api.end)(id, api.hover.value, api.moved.value);
        }),
    [api, id, enabled],
  );
}

/**
 * The dimmed page, the lifted item and the tray of places. Render it last
 * inside the screen's root view, so it covers everything else on the screen.
 */
export function InventoryDragLayer({
  api,
  dragging,
  places,
  rootY,
}: {
  api: DragApi;
  dragging: InventoryItem | null;
  places: DropPlace[];
  /** The screen root's top edge in window coordinates. */
  rootY: SharedValue<number>;
}) {
  const { width } = useWindowDimensions();
  const cardW = width - 40;

  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: api.x.value - api.grabX.value },
      { translateY: api.y.value - rootY.value - api.grabY.value },
      { scale: 1.04 },
      { rotate: "-1.5deg" },
    ],
  }));

  if (!dragging) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Everything else steps back */}
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(120)}
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(26, 18, 14, 0.55)" }]}
      />

      <Tray api={api} places={places} currentPlace={dragging.location_id ?? null} />

      {/* The item, lifted */}
      <Animated.View style={[styles.float, surfaceColors().float, { width: cardW }, floatStyle]}>
        <ItemThumb imageUrl={dragging.image_url} category={dragging.category} size="sm" />
        <Text variant="body" numberOfLines={1} className="flex-1 font-semibold">
          {dragging.name}
        </Text>
        <Text variant="heading" className="font-bold">
          {dragging.count}
        </Text>
      </Animated.View>
    </View>
  );
}

function Tray({
  api,
  places,
  currentPlace,
}: {
  api: DragApi;
  places: DropPlace[];
  currentPlace: string | null;
}) {
  const [hover, setHover] = useState(-1);
  const insets = useSafeAreaInsets();
  const colors = surfaceColors();
  const refs = useRef<(View | null)[]>([]);

  // Hover lives on the UI thread; mirror changes here for the highlight and a
  // tick of haptics as the finger crosses into a new place.
  useAnimatedReaction(
    () => api.hover.value,
    (next, prev) => {
      if (next !== prev) runOnJS(setHoverAndTick)(next);
    },
  );
  function setHoverAndTick(next: number) {
    setHover(next);
    if (next >= 0) cueTap();
  }

  const measureAll = () => {
    const out: Rect[] = new Array(places.length);
    let pending = places.length;
    places.forEach((_, i) => {
      const node = refs.current[i];
      if (!node) {
        pending -= 1;
        return;
      }
      node.measureInWindow((x, y, w, h) => {
        out[i] = { x, y, w, h };
        pending -= 1;
        if (pending === 0) api.rects.value = out.map((r) => r ?? { x: 0, y: 0, w: 0, h: 0 });
      });
    });
  };

  return (
    <Animated.View entering={FadeIn.duration(150)} style={[styles.tray, { bottom: 12 + insets.bottom }]} onLayout={measureAll}>
      <Text variant="label" className="mb-2 font-bold" style={{ color: COLORS.textOnPrimary }}>
        Drop on a shelf to move it
      </Text>
      <View style={styles.trayGrid}>
        {places.map((p, i) => {
          const here = p.id === currentPlace;
          const on = hover === i && !here;
          return (
            <View
              key={p.id ?? "none"}
              ref={(node) => {
                refs.current[i] = node;
              }}
              style={[
                styles.place,
                colors.place,
                on && styles.placeOn,
                on && colors.placeOn,
                here && colors.placeHere,
              ]}
            >
              <MaterialCommunityIcons
                name={
                  !p.id
                    ? "folder-remove-outline"
                    : p.parent
                      ? "subdirectory-arrow-right"
                      : on
                        ? "folder-open"
                        : "folder-outline"
                }
                size={20}
                color={on ? COLORS.primary : here ? COLORS.textSecondary : COLORS.secondaryDark}
              />
              <View className="flex-1">
                {p.parent ? (
                  <Text
                    variant="micro"
                    numberOfLines={1}
                    style={{ color: on ? COLORS.primaryDark : COLORS.textSecondary }}
                  >
                    {p.parent}
                  </Text>
                ) : null}
                <Text
                  variant="label"
                  numberOfLines={1}
                  className="font-bold"
                  style={{
                    color: on ? COLORS.primaryDark : here ? COLORS.textSecondary : COLORS.textPrimary,
                  }}
                >
                  {p.name}
                </Text>
              </View>
              {here && (
                <Text variant="micro" tone="soft">
                  here
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  float: {
    position: "absolute",
    left: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    boxShadow: "0 12px 28px 0 rgba(26, 18, 14, 0.35)",
  },
  tray: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  trayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  place: {
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
  },
  placeOn: {
    transform: [{ scale: 1.04 }],
  },
});

/**
 * Colours read at render, not in StyleSheet.create: COLORS follows light and
 * dark mode, and a module-level read froze whichever mode the app loaded in.
 */
function surfaceColors() {
  return {
    float: { backgroundColor: COLORS.cardSurface, borderColor: COLORS.primary },
    place: { backgroundColor: COLORS.cardSurface, borderColor: COLORS.borderSoft },
    // The shelf under the finger: the brand's warm tint with an orange edge,
    // not a solid fill, so it reads as "here" without shouting.
    placeOn: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
    // Solid, not see-through: the dimmed page shouldn't show through it.
    placeHere: { backgroundColor: COLORS.surfaceVariant, borderColor: COLORS.surfaceVariant },
  };
}
