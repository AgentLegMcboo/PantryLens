import { useAppAppearance } from "../../lib/appearance";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  Alert,
  SectionList,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { COLORS } from "../../constants/theme";
import { useAccessibilityStore } from "../../lib/accessibility";
import { isPastDate, windowEndISO } from "../../lib/expiry";
import { cueSuccess, cueTap, cueWarn } from "../../lib/feedback";
import { PlacesManager } from "../../components/places-manager";
import { orderShelves, shelfLabels } from "../../lib/shelves";
import { useDismissible } from "../../lib/dismissals";
import {
  InventoryDragLayer,
  useInventoryDrag,
  useRowDrag,
  type DragApi,
  type DropPlace,
} from "../../components/inventory-drag";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { GestureDetector } from "react-native-gesture-handler";
import type { SwipeableMethods } from "react-native-gesture-handler/lib/typescript/components/ReanimatedSwipeable/ReanimatedSwipeableProps";
import {
  Button,
  cardShadow,
  Chip,
  EmptyState,
  Input,
  ItemThumb,
  Row,
  Sheet,
  Stepper,
  Text,
} from "../../components/ui";
import {
  CONDITION_LABELS,
  type ExitReason,
  InventoryItem,
  isUsableCondition,
  usePantryStore,
} from "../../lib/store";
import { QuickAddStaplesModal } from "../../components/quick-add-staples";
import { useTabOverlayInset } from "../../lib/tab-overlay";
import { Tappable, PRESS_SCALE_ROW } from "../../components/motion";
import { SpotlightTour, useSpotlightTarget, type TourStep } from "../../components/spotlight";

const INVENTORY_TOUR: TourStep[] = [
  { target: "inventory.add", title: "Add by hand", body: "No photo? Type an item in here." },
  { target: "inventory.filter", title: "Find things fast", body: "Show one food group, or sort by date or count." },
  { target: "inventory.shelf", title: "Your shelves", body: "Add shelves, and shelves inside shelves, to match your pantry." },
  { target: "inventory.firstRow", title: "Hold and drag", body: "Hold an item, then drag it onto a shelf to move it." },
  { target: "inventory.firstRow", title: "Swipe right", body: "Swipe an item to the right to take it off the shelf." },
  { target: "inventory.select", title: "Select many", body: "Move or take off lots of items at once." },
];

/**
 * The shelf, as a list.
 *
 * The old version stacked a search bar, a pill row, a four-option sort bar and
 * then rows carrying up to three badges plus a stepper — six competing controls
 * before a single item. Sorting is now one chip row that doubles as the filter
 * summary, rows carry at most one status badge, and the count control has room
 * to be tapped.
 */

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "grain", label: "Grain" },
  { id: "vegetable", label: "Vegetables" },
  { id: "protein", label: "Protein" },
  { id: "breakfast", label: "Breakfast" },
  { id: "snack", label: "Snacks" },
  { id: "hygiene", label: "Hygiene" },
  { id: "baby", label: "Baby" },
];

/**
 * How the shelf is divided up.
 *
 * This screen used to be one flat list with filter chips on top, which is not
 * organisation — it is a search box. You could narrow it to one place or one
 * category, but you could never SEE the shape of the room: what is where, how
 * much of it, what has nothing filed against it.
 *
 * Sections give it that shape. Grouping by place replaces the place filter
 * entirely — you get every place at once, collapsible, with counts, instead of
 * flipping between them one at a time.
 */
const GROUPS = [
  { id: "place", label: "By shelf" },
  { id: "category", label: "By category" },
  { id: "none", label: "Flat list" },
] as const;

type GroupBy = (typeof GROUPS)[number]["id"];

/** How far the row travels when the action is fully open. */
const SWIPE_WIDTH = 96;

/** A sub-shelf, drawn inside its shelf: inset, with a rule down the left. */
const NESTED = {
  marginLeft: 8,
  paddingLeft: 14,
  borderLeftWidth: 2,
  borderLeftColor: "rgba(140, 110, 80, 0.25)",
};

/**
 * What sits in the gap a swipe opens up.
 *
 * A component rather than an inline renderer because it uses a hook, and
 * `renderLeftActions` is a plain callback — a hook in there is a Rules-of-Hooks
 * violation that bites the moment the list re-orders.
 *
 * The panel is exactly as wide as the finger has actually dragged: `translation`
 * is live, so the red grows out from under the row instead of sitting there
 * fully formed waiting to be uncovered. The label fades in with it, which is
 * what makes a short accidental drag read as "not yet" rather than "armed".
 */
function SwipeAction({ translation }: { translation: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    width: Math.max(0, translation.value),
    opacity: Math.min(1, Math.max(0, translation.value / SWIPE_WIDTH)),
  }));

  return (
    <Animated.View
      style={style}
      className="mb-3 items-end justify-center overflow-hidden rounded-lg bg-critical pr-5"
    >
      <View className="items-center">
        <MaterialCommunityIcons
          name="tray-arrow-up"
          size={22}
          color={COLORS.textOnPrimary}
        />
        <Text variant="micro" tone="on" className="mt-1 font-bold">
          Take off
        </Text>
      </View>
    </Animated.View>
  );
}

const SORTS = [
  { id: "expiration", label: "Expiry" },
  { id: "oldest", label: "Oldest" },
  { id: "count", label: "Most stock" },
  { id: "name", label: "A–Z" },
] as const;

/**
 * One inventory row, memoised.
 *
 * It used to be rendered inline from the screen, so every row was rebuilt on
 * every store change — a photo attaching in the background, a realtime refresh
 * — and the more rows a scroll had mounted, the longer each rebuild took
 * (React Native logged one at 35 seconds). The tab stays mounted while you use
 * the others, so that cost followed the volunteer around the whole app. Now a
 * row only re-renders when its own props change.
 */
// Read at render, not at load: COLORS follows light and dark mode.
const rowEdge = (selected: boolean) =>
  selected
    ? { borderWidth: 1.5, borderColor: COLORS.primary }
    : { borderWidth: 1, borderColor: COLORS.borderSoft };

const InventoryRow = React.memo(function InventoryRow({
  item,
  picking,
  isSelected,
  placeName,
  showPlace,
  warningStr,
  onToggle,
  onSwipeOut,
  drag,
  isDragging,
}: {
  item: InventoryItem;
  picking: boolean;
  isSelected: boolean;
  placeName?: string;
  showPlace: boolean;
  warningStr: string;
  onToggle: (id: string) => void;
  onSwipeOut: (id: string) => void;
  drag: DragApi;
  /** This row is the one lifted under the finger: leave a faint placeholder. */
  isDragging: boolean;
}) {
  const router = useRouter();
  // Hold, then drag onto a place in the tray to move it. A hold that doesn't
  // move still starts selecting, which is what the long press used to do.
  const pan = useRowDrag(drag, item.id, !picking);
  const pastDate = isPastDate(item.expiration);
  const expiringSoon =
    !pastDate && !!item.expiration && item.expiration <= warningStr;
  const damaged = !isUsableCondition(item.condition);
  // Both keep it out of the boxes, so both get the red treatment.
  const blocked = damaged || pastDate;

  // Deliberately cheap. This row can exist hundreds of times over, so it uses
  // a plain Pressable with an instant dip (no per-row animation driver) and a
  // flat bordered surface (no blurred shadow — layered blur on every row was
  // what made scrolling this list drag, on Android most of all).
  const row = (
    <GestureDetector gesture={pan}>
      <Pressable
        style={({ pressed }) =>
          isDragging
            ? { opacity: 0.25 }
            : pressed
              ? { transform: [{ scale: PRESS_SCALE_ROW }] }
              : undefined
        }
        // In picking mode a tap picks; otherwise it opens. Holding is handled by
        // the drag gesture above: hold and drag to move, hold still to pick.
        onPress={() => {
          if (drag.suppressPress.current) return;
          if (picking) onToggle(item.id);
          else
            router.push({ pathname: "/item-detail", params: { id: item.id } });
        }}
      >
        {/* One line per product: picture, name with what's worth knowing
          under it, and the count on the right. Expiry only when there is
          one — "No expiry recorded" on every tin of soap was just noise. */}
        <View
          // One line per item: photo, name and status, count on the right.
          // Selected keeps the white card; only the edge changes.
          className="mb-2 flex-row items-center gap-3 rounded-lg bg-card px-3 py-2.5"
          style={rowEdge(isSelected)}
        >
          <View className="flex-1 flex-row items-center gap-3">
            {picking && (
              <MaterialCommunityIcons
                name={isSelected ? "check-circle" : "circle-outline"}
                size={24}
                color={isSelected ? COLORS.primaryLight : COLORS.borderStrong}
              />
            )}
            {/* The actual product where we have a picture of it, the category
              glyph where we do not. */}
            <ItemThumb
              imageUrl={item.image_url}
              category={item.category}
              size="md"
              tone={blocked ? "critical" : "secondary"}
              className="h-10 w-10"
            />

            <View className="flex-1 gap-1">
              <Text variant="body" className="font-semibold" numberOfLines={2}>
                {item.name}
              </Text>
              {/* At most one status, worst first, then the details that exist. */}
              {(() => {
                const status = damaged
                  ? {
                      text: CONDITION_LABELS[item.condition || "ok"],
                      tone: "critical" as const,
                    }
                  : pastDate
                    ? { text: "Out of date", tone: "critical" as const }
                    : expiringSoon
                      ? { text: "Use first", tone: "warn" as const }
                      : null;
                const details = [
                  item.expiration ? `Exp ${shortDate(item.expiration)}` : null,
                  showPlace && placeName ? placeName : null,
                ].filter(Boolean) as string[];
                if (!status && details.length === 0) return null;
                return (
                  <Text variant="micro" tone="soft" numberOfLines={1}>
                    {status ? (
                      <Text
                        variant="micro"
                        tone={status.tone}
                        className="font-bold"
                      >
                        {status.text}
                        {details.length ? " · " : ""}
                      </Text>
                    ) : null}
                    {details.join(" · ")}
                  </Text>
                );
              })()}
            </View>
          </View>
          {/* The stepper is meaningless while picking — the row is a checkbox
              then, and a control that also changes stock would fight the tap. */}
            {picking ? (
              <Text variant="label" tone="soft" className="font-semibold">
                {item.count} units
              </Text>
            ) : (
              <Stepper
                value={item.count}
                min={0}
                onChange={(next) => {
                  // Stepping from 1 to 0 must never silently delete the row:
                  // route through the "Where is it going?" sheet so an accidental
                  // double-tap cannot destroy inventory and a real exit records
                  // whether the item was given out, discarded, or a mistake.
                  if (next === 0) {
                    cueWarn();
                    onSwipeOut(item.id);
                    return;
                  }
                  usePantryStore
                    .getState()
                    .updateItem(item.id, { count: next })
                    .catch((err: any) => {
                      cueWarn();
                      Alert.alert(
                        "Could not save that change",
                        err?.message ?? "Please try again.",
                      );
                    });
                }}
              />
            )}
        </View>
      </Pressable>
    </GestureDetector>
  );

  // Swiping while picking would fight the selection, so it is switched off
  // then, not removed. Removing it swapped every row's wrapper on entering or
  // leaving selection, which rebuilt each visible row (photo, gesture,
  // stepper) and made Select, the X, and picking feel stuck.

  // Captured from renderLeftActions so the row can be sprung shut again once
  // the sheet takes over — otherwise it sits open behind it and stays open if
  // the volunteer backs out.
  let methods: SwipeableMethods | null = null;

  return (
    <ReanimatedSwipeable
      enabled={!picking}
      friction={2}
      leftThreshold={SWIPE_WIDTH * 0.6}
      overshootLeft={false}
      renderLeftActions={(_progress, translation, swipeableMethods) => {
        methods = swipeableMethods;
        return <SwipeAction translation={translation} />;
      }}
      onSwipeableOpen={(direction) => {
        if (direction !== "left") return;
        cueWarn();
        methods?.close();
        // Straight to the reason sheet rather than a silent delete: "a family
        // took it home", "it was mouldy" and "I typed this twice" are three
        // different facts, and two of them are numbers this pantry reports on.
        onSwipeOut(item.id);
      }}
    >
      {row}
    </ReanimatedSwipeable>
  );
});

export default function InventoryScreen() {
  useAppAppearance((state) => state.scheme);
  const tabOverlayInset = useTabOverlayInset();
  const router = useRouter();
  // Only what this screen uses, compared shallowly, so unrelated store changes
  // (members loading, photos attaching, scan state) don't re-render it.
  const {
    inventory,
    locations,
    defaultLocationFor,
    updateItem,
    deleteItem,
    deleteItems,
    updateItems,
    recordExit,
    addItems,
    settings,
  } = usePantryStore(
    useShallow((s) => ({
      inventory: s.inventory,
      locations: s.locations,
      defaultLocationFor: s.defaultLocationFor,
      updateItem: s.updateItem,
      deleteItem: s.deleteItem,
      deleteItems: s.deleteItems,
      updateItems: s.updateItems,
      recordExit: s.recordExit,
      addItems: s.addItems,
      settings: s.settings,
    })),
  );

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] =
    useState<(typeof SORTS)[number]["id"]>("expiration");

  /**
   * Which rows are picked, and therefore whether the screen is in picking mode at
   * all — one piece of state rather than two, so they cannot disagree.
   *
   * A pantry clears a whole shelf of expired stock at once, or recategorises
   * everything a food drive brought in. Doing that one row at a time is the kind
   * of tedium that makes people stop keeping the inventory accurate.
   */
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [recategorising, setRecategorising] = useState(false);
  const [relocating, setRelocating] = useState(false);
  /** Which rows the exit sheet is about: a selection, or the single row swiped. */
  const [exitIds, setExitIds] = useState<string[] | null>(null);
  const [managingPlaces, setManagingPlaces] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("place");
  /** Sections the volunteer has folded away, by section id. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /**
   * Show only stock a human flagged as dented, rusted, seal-broken or past date.
   *
   * Inspecting every tin is a step in the pantry's process, and the app was
   * recording the result and then doing nothing visible with it: flagged stock is
   * silently held out of every box, so it neither goes out nor gets dealt with —
   * it just quietly accumulates. This is where it surfaces.
   */
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [staplesModalVisible, setStaplesModalVisible] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<InventoryItem["category"]>("grain");
  const [newCount, setNewCount] = useState(1);
  const [newExp, setNewExp] = useState("");

  const warningStr = windowEndISO(settings.expirationWarningDays);

  /**
   * Stock that cannot go into a box as things stand.
   *
   * Box building excludes damaged AND out-of-date stock, so this filter has to
   * mean the same thing or the two screens disagree in front of the volunteer:
   * Build refusing to use a tin it can see, Inventory showing that tin as
   * ordinary stock. Past dates used to be invisible here — only the condition
   * flag counted, and that flag is written at intake and never revisited.
   */
  const needsAttention = (item: InventoryItem) =>
    !isUsableCondition(item.condition) || isPastDate(item.expiration);

  /**
   * The list works from deferred copies of the controls. Tapping a category or
   * typing updates the chip / field straight away; the list catches up in a
   * render React can interrupt, instead of every tap waiting on a full
   * re-filter, re-sort, re-group and a batch of rows (each with a swipe
   * gesture) mounting before anything on screen responds.
   */
  const dCategory = useDeferredValue(selectedCategory);
  const dSearch = useDeferredValue(search);
  const dFlagged = useDeferredValue(onlyFlagged);
  const dSort = useDeferredValue(sortBy);
  const dGroup = useDeferredValue(groupBy);

  const filteredItems = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    const rows = inventory.filter(
      (item) =>
        (dCategory === "all" || item.category === dCategory) &&
        (!q || item.name.toLowerCase().includes(q)) &&
        (!dFlagged || needsAttention(item)),
    );
    if (dSort === "name")
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    if (dSort === "count") return rows.sort((a, b) => b.count - a.count);
    // FIFO: what has been sitting on the shelf longest goes out first.
    if (dSort === "oldest")
      return rows.sort((a, b) =>
        (a.date_added || "").localeCompare(b.date_added || ""),
      );
    // ISO dates compare as strings, so no Date parsing inside the comparator.
    // Two tins with the same printed date are separated by which arrived first.
    return rows.sort((a, b) => {
      if (!a.expiration) return b.expiration ? 1 : 0;
      if (!b.expiration) return -1;
      const byDate = a.expiration.localeCompare(b.expiration);
      return byDate !== 0
        ? byDate
        : (a.date_added || "").localeCompare(b.date_added || "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, dCategory, dSearch, dFlagged, dSort]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flaggedCount = useMemo(
    () => inventory.filter(needsAttention).length,
    [inventory],
  );
  // The banner can be closed; it comes back when a different set of items
  // needs attention. The same list lives on the Notifications page.
  const flaggedSignature = useMemo(
    () =>
      inventory
        .filter(needsAttention)
        .map((i) => i.id)
        .sort()
        .join(","),
    [inventory],
  );
  const [flagBannerVisible, dismissFlagBanner] = useDismissible(
    `inventory-flagged.${settings.pantryId ?? "none"}`,
    flaggedSignature,
  );

  /**
   * The list, cut into sections.
   *
   * A collapsed section keeps its header and its counts and drops its rows —
   * folding a shelf away must not make it look like the shelf is empty.
   */
  const sections = useMemo(() => {
    if (dGroup === "none") {
      return [
        {
          id: "all",
          title: "",
          depth: 0 as const,
          units: 0,
          data: filteredItems,
        },
      ];
    }

    const buckets: {
      id: string;
      title: string;
      depth: 0 | 1;
      data: InventoryItem[];
    }[] =
      dGroup === "place"
        ? [
            // Each shelf, then its sub-shelves under it.
            ...orderShelves(locations).map((s) => ({
              id: s.loc.id,
              title: s.loc.name,
              depth: s.depth,
              data: [] as InventoryItem[],
            })),
            {
              id: "none",
              title: "Not filed anywhere",
              depth: 0 as const,
              data: [] as InventoryItem[],
            },
          ]
        : CATEGORIES.filter((c) => c.id !== "all").map((c) => ({
            id: c.id,
            title: c.label,
            depth: 0 as const,
            data: [] as InventoryItem[],
          }));

    const fallback = buckets[buckets.length - 1];
    for (const item of filteredItems) {
      const key =
        dGroup === "place" ? (item.location_id ?? "none") : item.category;
      (buckets.find((b) => b.id === key) ?? fallback).data.push(item);
    }

    // An empty shelf is worth seeing when you are looking at the room; an empty
    // one while you are searching is just noise.
    const searching = !!dSearch || dFlagged || dCategory !== "all";
    return buckets
      .filter((b) => b.data.length > 0 || (!searching && dGroup === "place"))
      .map((b) => ({
        ...b,
        units: b.data.reduce((sum, i) => sum + i.count, 0),
        data: collapsed[b.id] ? [] : b.data,
      }));
  }, [
    filteredItems,
    dGroup,
    locations,
    collapsed,
    dSearch,
    dFlagged,
    dCategory,
  ]);

  const seniorMode = useAccessibilityStore((s) => s.seniorMode);
  const [selectMode, setSelectMode] = useState(false);
  const [groupSortSheet, setGroupSortSheet] = useState<"filters" | null>(null);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const picking = selectMode || selectedIds.length > 0;

  const toggleSelect = (id: string) => {
    cueTap();
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearSelection = () => {
    setSelectMode(false);
    setSelected({});
  };

  /** Applies an action to the picked rows, then leaves picking mode. */
  const runOnSelection = async (
    action: () => Promise<void>,
    failureTitle: string,
  ) => {
    try {
      await action();
      clearSelection();
    } catch (err: any) {
      cueWarn();
      Alert.alert(failureTitle, err?.message ?? "Please try again.");
    }
  };

  /**
   * Taking stock off the shelf, and saying why.
   *
   * There used to be one exit — Remove — which meant "a family took it home",
   * "it was mouldy" and "I typed this in twice" were the same event: a row
   * vanishing. Two of those are numbers a pantry reports on, and both were being
   * thrown away with the row.
   */
  const handleExit = (reason: ExitReason) => {
    const ids = exitIds ?? [];
    const count = ids.length;
    const units = inventory
      .filter((i) => ids.includes(i.id))
      .reduce((sum, i) => sum + i.count, 0);

    const prompts: Record<
      ExitReason,
      { title: string; body: string; verb: string }
    > = {
      given_out: {
        title: `Give out ${units} ${units === 1 ? "unit" : "units"}?`,
        body: "They come off the shelf and are counted as food that reached a household.",
        verb: "Give out",
      },
      discarded: {
        title: `Throw away ${units} ${units === 1 ? "unit" : "units"}?`,
        body: "They come off the shelf and are counted as waste — the other number funders ask for.",
        verb: "Throw away",
      },
      correction: {
        title: `Remove ${count} ${count === 1 ? "row" : "rows"}?`,
        body: "For fixing a mistake. Nothing is counted as given out or wasted.",
        verb: "Remove",
      },
    };
    const prompt = prompts[reason];

    setExitIds(null);
    Alert.alert(prompt.title, prompt.body, [
      { text: "Cancel", style: "cancel" },
      {
        text: prompt.verb,
        style: reason === "given_out" ? "default" : "destructive",
        onPress: () =>
          runOnSelection(
            () => recordExit(ids, reason),
            "Could not record that",
          ),
      },
    ]);
  };

  const resolveManualShelfId = (
    name: string,
    cat: typeof newCat,
  ): string | null => {
    const lower = name.trim().toLowerCase();
    if (lower) {
      const exact = inventory.find(
        (i) => i.location_id && i.name.trim().toLowerCase() === lower,
      );
      if (exact?.location_id) return exact.location_id;
    }
    const byRule = defaultLocationFor(cat);
    if (byRule) return byRule;
    const peer = inventory.find((i) => i.location_id && i.category === cat);
    return peer?.location_id ?? null;
  };

  const handleManualAdd = () => {
    if (!newName.trim()) return;
    const location_id = resolveManualShelfId(newName, newCat);
    addItems(
      [
        {
          name: newName,
          category: newCat,
          count: newCount,
          expiration: newExp.trim() || null,
          location_id,
        },
      ],
      "manual",
    );
    setNewName("");
    setNewCount(1);
    setNewExp("");
    setModalVisible(false);
  };

  // Stable, so memoised rows don't re-render just because the screen did.
  const toggleSelectStable = useCallback((id: string) => {
    cueTap();
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const swipeOut = useCallback((id: string) => setExitIds([id]), []);
  const placeNames = useMemo(() => shelfLabels(locations), [locations]);

  // Places to drop a dragged item on: every shelf, plus "Not filed".
  const dropPlaces = useMemo<DropPlace[]>(
    () => [
      ...orderShelves(locations).map((s) => ({
        id: s.loc.id,
        name: s.loc.name,
        parent: s.depth === 1 ? s.label.split(" › ")[0] : undefined,
      })),
      { id: null, name: "Not filed" },
    ],
    [locations],
  );
  const {
    api: dragApi,
    dragging,
    draggingId,
  } = useInventoryDrag({
    items: inventory,
    places: dropPlaces,
    onHold: toggleSelectStable,
    onMove: (item, place) => {
      updateItem(item.id, { location_id: place.id })
        .then(() => cueSuccess())
        .catch((err: any) => {
          cueWarn();
          Alert.alert(
            "Could not move that item",
            err?.message ?? "Please try again.",
          );
        });
    },
  });
  // Where this screen starts in the window, for placing the lifted item.
  const rootRef = React.useRef<View>(null);
  const rootY = useSharedValue(0);

  const firstRowTarget = useSpotlightTarget("inventory.firstRow");
  const selectTarget = useSpotlightTarget("inventory.select");
  const addTarget = useSpotlightTarget("inventory.add");
  const filterTarget = useSpotlightTarget("inventory.filter");
  const shelfTarget = useSpotlightTarget("inventory.shelf");
  const renderItemRow = ({
    item,
    index,
    section,
  }: {
    item: InventoryItem;
    index: number;
    section: { depth?: 0 | 1 };
  }) => (
    // A sub-shelf's items sit inset behind a rule, inside their parent shelf.
    <View
      ref={index === 0 && section === sections[0] ? firstRowTarget : undefined}
      collapsable={false}
      style={section.depth === 1 && dGroup !== "none" && !picking ? NESTED : undefined}
    >
    <InventoryRow
      item={item}
      picking={picking}
      isSelected={!!selected[item.id]}
      placeName={item.location_id ? placeNames[item.location_id] : undefined}
      showPlace={dGroup !== "place"}
      warningStr={warningStr}
      onToggle={toggleSelectStable}
      onSwipeOut={swipeOut}
      drag={dragApi}
      isDragging={draggingId === item.id}
    />
    </View>
  );

  return (
    <View
      ref={rootRef}
      className="flex-1 bg-transparent"
      onLayout={() =>
        rootRef.current?.measureInWindow((_x, y) => {
          rootY.value = y;
        })
      }
    >
      <View className="px-gutter pt-gutter gap-4">
        {!picking && (
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Text variant="headline">Your shelves</Text>
              <Text variant="label" tone="soft">
                {inventory.length}{" "}
                {inventory.length === 1 ? "product" : "products"} ·{" "}
                {inventory.reduce((sum, item) => sum + item.count, 0)} units
              </Text>
            </View>
            {inventory.length > 0 && (
              <View ref={selectTarget} collapsable={false}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select items to move or take off shelf"
                onPress={() => {
                  cueTap();
                  setSelectMode(true);
                }}
                className="min-h-[44px] flex-row items-center gap-1.5 rounded-md border-[1.5px] border-outline bg-card px-3 py-2"
              >
                <MaterialCommunityIcons
                  name="checkbox-multiple-marked-outline"
                  size={18}
                  color={COLORS.primaryDark}
                />
                <Text variant="label" className="font-bold" style={{ color: COLORS.primaryDark }}>
                  Select
                </Text>
              </Pressable>
              </View>
            )}
          </View>
        )}
        {picking ? (
          /* One bar, one job. Search and category filters are not what anyone
             wants once they have already chosen what they are acting on. */
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Tappable
                // Instant feedback, then the heavy part: leaving picking
                // re-mounts every row's swipe gesture, which used to freeze
                // the tap long enough to feel ignored.
                onPress={() => {
                  cueTap();
                  React.startTransition(clearSelection);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel selection"
                hitSlop={12}
                className="h-12 w-12 items-center justify-center rounded-md border-[1.5px] border-outline bg-card"
              >
                <MaterialCommunityIcons
                  name="close"
                  size={22}
                  color={COLORS.textPrimary}
                />
              </Tappable>

              <Text variant="heading" className="flex-1">
                {selectedIds.length === 0
                  ? "Tap items to select"
                  : `${selectedIds.length} selected`}
              </Text>

              <Tappable
                onPress={() => {
                  cueTap();
                  const all = filteredItems.every((i) => selected[i.id]);
                  setSelected(
                    all
                      ? {}
                      : Object.fromEntries(
                          filteredItems.map((i) => [i.id, true]),
                        ),
                  );
                }}
                accessibilityRole="button"
                hitSlop={8}
                className="min-h-[48px] justify-center px-3 py-2"
              >
                <Text variant="label" tone="brand" className="font-bold">
                  {filteredItems.every((i) => selected[i.id])
                    ? "Select None"
                    : "Select All"}
                </Text>
              </Tappable>
            </View>

            <View className="flex-row gap-2">
              {locations.length > 0 && (
                <Button
                  label="Move to"
                  variant="secondary"
                  size="compact"
                  disabled={selectedIds.length === 0}
                  className="flex-1 justify-center gap-1.5 px-2"
                  icon={
                    <MaterialCommunityIcons
                      name="map-marker-outline"
                      size={17}
                      color={COLORS.textPrimary}
                    />
                  }
                  onPress={() => setRelocating(true)}
                />
              )}
              <Button
                label="Category"
                variant="secondary"
                size="compact"
                disabled={selectedIds.length === 0}
                className="flex-1 justify-center gap-1.5 px-2"
                icon={
                  <MaterialCommunityIcons
                    name="tag-outline"
                    size={17}
                    color={COLORS.textPrimary}
                  />
                }
                onPress={() => setRecategorising(true)}
              />
              <Button
                label="Take off shelf"
                variant="critical"
                size="compact"
                disabled={selectedIds.length === 0}
                className="flex-1 justify-center gap-1.5 px-2"
                icon={
                  <MaterialCommunityIcons
                    name="tray-arrow-up"
                    size={17}
                    color={COLORS.textOnPrimary}
                  />
                }
                onPress={() => setExitIds(selectedIds)}
              />
            </View>
          </View>
        ) : (
          <View className="flex-row items-center gap-2.5">
            <View
              style={seniorMode ? { minHeight: 54 } : undefined}
              className="min-h-[48px] flex-1 flex-row items-center gap-2 rounded-md border-[1.5px] border-outline bg-card px-3"
            >
              <MaterialCommunityIcons
                name="magnify"
                size={20}
                color={COLORS.textSecondary}
              />
              <TextInput
                maxFontSizeMultiplier={2.2}
                style={seniorMode ? { fontSize: 19 } : undefined}
                className="flex-1 text-body text-ink"
                placeholder="Search items"
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={COLORS.textSecondary}
              />
              {search ? (
                <Tappable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => setSearch("")}
                  hitSlop={8}
                  className="h-10 w-10 items-center justify-center"
                >
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Tappable>
              ) : null}
            </View>

            <View ref={addTarget} collapsable={false}>
            <Pressable
              onPress={() => setModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Add an item by hand"
              style={({ pressed }) => ({
                borderBottomWidth: pressed ? 2 : 4,
                borderBottomColor: COLORS.primaryDeep,
                transform: [{ translateY: pressed ? 2 : 0 }],
              })}
              className="min-h-[48px] flex-row items-center justify-center gap-1.5 rounded-md bg-brand px-3.5"
            >
              <MaterialCommunityIcons
                name="plus"
                size={20}
                color={COLORS.textOnAccent}
              />
              <Text variant="label" tone="on" className="font-bold" style={{ color: COLORS.textOnAccent }}>
                Add
              </Text>
            </Pressable>
            </View>
          </View>
        )}

        {!picking && flaggedCount > 0 && (flagBannerVisible || onlyFlagged) && (
          <Tappable
            scaleTo={PRESS_SCALE_ROW}
            onPress={() => {
              cueTap();
              setOnlyFlagged((v) => !v);
            }}
            className={`flex-row items-center gap-3 rounded-md border-[1.5px] px-4 py-3 ${
              onlyFlagged
                ? "border-critical bg-critical"
                : "border-hairline bg-subtle"
            }`}
          >
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={20}
              color={onlyFlagged ? COLORS.textOnPrimary : COLORS.statusCritical}
            />
            <Text
              variant="label"
              tone={onlyFlagged ? "on" : "default"}
              className="flex-1 font-semibold"
            >
              {flaggedCount} {flaggedCount === 1 ? "item is" : "items are"} out
              of date or damaged
            </Text>
            <Text
              variant="micro"
              tone={onlyFlagged ? "on" : "soft"}
              className="font-bold"
            >
              {onlyFlagged ? "Show all" : "Show them"}
            </Text>
            {!onlyFlagged && (
              <Tappable
                onPress={() => {
                  cueTap();
                  dismissFlagBanner();
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss. It stays on the Notifications page."
                className="-mr-1 h-8 w-8 items-center justify-center"
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={COLORS.textSecondary}
                />
              </Tappable>
            )}
          </Tappable>
        )}

        {!picking && (
          <View className="flex-row gap-3">
            <View ref={filterTarget} collapsable={false} style={{ flex: 1 }}>
            <Tappable
              onPress={() => {
                cueTap();
                setGroupSortSheet("filters");
              }}
              accessibilityRole="button"
              accessibilityLabel="Filter and sort inventory"
              className="min-h-[48px] flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-hairline bg-card px-3"
            >
              <MaterialCommunityIcons
                name="tune-variant"
                size={20}
                color={COLORS.textSecondary}
              />
              <Text variant="label" className="shrink font-medium">
                Filter &amp; sort{selectedCategory !== "all" ? " · 1" : ""}
              </Text>
            </Tappable>
            </View>
            <Tappable
              onPress={() => {
                cueTap();
                setManagingPlaces(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Shelves: add, rename or nest shelves"
              className="min-h-[48px] flex-row items-center justify-center gap-2 rounded-lg border border-hairline bg-card px-3"
            >
              <MaterialCommunityIcons
                name="bookshelf"
                size={20}
                color={COLORS.textSecondary}
              />
              <Text variant="label">Shelves</Text>
            </Tappable>
            <View ref={shelfTarget} collapsable={false}>
            <Tappable
              onPress={() => {
                cueTap();
                setManagingPlaces(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add a shelf or sub-shelf"
              className="min-h-[48px] flex-row items-center justify-center gap-1.5 rounded-lg border border-hairline bg-card px-3"
            >
              <MaterialCommunityIcons
                name="folder-plus-outline"
                size={20}
                color={COLORS.textSecondary}
              />
              <Text variant="label">Shelf</Text>
            </Tappable>
            </View>
          </View>
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItemRow}
        // Keep only a few screens' worth of rows mounted. Every mounted row
        // carries a swipe gesture and a stepper; holding hundreds of them made
        // each update slow.
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android"}
        stickySectionHeadersEnabled={dGroup !== "none"}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-gutter pt-4 pb-6"
        contentContainerStyle={{ paddingBottom: tabOverlayInset + 24 }}
        renderSectionHeader={({ section }) => {
          if (dGroup === "none" || picking) return null;
          const isCollapsed = !!collapsed[section.id];
          return (
            <Pressable
              onPress={() => {
                cueTap();
                setCollapsed((prev) => ({
                  ...prev,
                  [section.id]: !prev[section.id],
                }));
              }}
              // Opaque, because it sticks: a translucent header would let rows
              // scroll through the text behind it.
              className="mb-3 flex-row items-center gap-2 bg-canvas pb-2 pt-1"
              style={section.depth === 1 ? NESTED : undefined}
            >
              <MaterialCommunityIcons
                name={isCollapsed ? "chevron-right" : "chevron-down"}
                size={section.depth === 1 ? 18 : 20}
                color={COLORS.secondary}
              />
              <Text
                variant={section.depth === 1 ? "body" : "heading"}
                className={
                  section.depth === 1 ? "flex-1 font-semibold" : "flex-1"
                }
              >
                {section.title}
              </Text>
              {/* Units, not rows. "12 tins" is the number a volunteer standing in
                  front of the shelf is actually checking against. */}
              <Text
                variant="micro"
                className="font-bold"
                style={{ color: COLORS.secondaryDark }}
              >
                {section.units === 0
                  ? "empty"
                  : `${section.units} ${section.units === 1 ? "unit" : "units"}`}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-text-search-outline"
            title="Nothing here yet"
            body={
              onlyFlagged
                ? "Nothing is flagged for inspection. Everything on the shelf is fit to give out."
                : search || selectedCategory !== "all"
                  ? "Try another search, or clear the filters."
                  : "Photograph a donation to fill the shelves."
            }
            actionLabel={
              onlyFlagged || search || selectedCategory !== "all"
                ? "Clear the filters"
                : undefined
            }
            onAction={
              onlyFlagged || search || selectedCategory !== "all"
                ? () => {
                    setSearch("");
                    setSelectedCategory("all");
                    setOnlyFlagged(false);
                  }
                : undefined
            }
          />
        }
      />

      <Sheet
        visible={groupSortSheet === "filters"}
        onClose={() => setGroupSortSheet(null)}
        title="Filter & sort"
        subtitle="Choose what to show and how to arrange it."
      >
        <View className="gap-3">
          <Text variant="heading">Category</Text>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <Chip
                key={category.id}
                label={category.label}
                selected={selectedCategory === category.id}
                onPress={() => setSelectedCategory(category.id)}
              />
            ))}
          </View>
        </View>
        <View>
          <Text variant="heading" className="mb-2">
            Group shelves by
          </Text>
          {GROUPS.map((group, index) => (
            <Row
              key={group.id}
              label={group.label}
              selected={groupBy === group.id}
              divider={index < GROUPS.length - 1}
              onPress={() => setGroupBy(group.id)}
              right={
                groupBy === group.id ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={22}
                    color={COLORS.primaryDark}
                  />
                ) : (
                  <View style={{ width: 22 }} />
                )
              }
            />
          ))}
        </View>
        <View>
          <Text variant="heading" className="mb-2">
            Sort items by
          </Text>
          {SORTS.map((sort, index) => (
            <Row
              key={sort.id}
              label={sort.label}
              selected={sortBy === sort.id}
              divider={index < SORTS.length - 1}
              onPress={() => setSortBy(sort.id)}
              right={
                sortBy === sort.id ? (
                  <MaterialCommunityIcons
                    name="check"
                    size={22}
                    color={COLORS.primaryDark}
                  />
                ) : (
                  <View style={{ width: 22 }} />
                )
              }
            />
          ))}
        </View>
        <Button label="Done" block onPress={() => setGroupSortSheet(null)} />
      </Sheet>

      <Sheet
        visible={managingPlaces}
        onClose={() => setManagingPlaces(false)}
        title="Shelves"
        subtitle="Shelves, bins and freezers, and the sub-shelves inside them."
      >
        <PlacesManager />
      </Sheet>

      <Sheet
        visible={!!exitIds}
        onClose={() => setExitIds(null)}
        title="Where is it going?"
        subtitle={`${exitIds?.length ?? 0} ${exitIds?.length === 1 ? "item" : "items"} leaving the shelf`}
      >
        <Row
          icon="hand-heart-outline"
          label="Given out"
          hint="A household took it home. Counted as food distributed."
          onPress={() => handleExit("given_out")}
        />
        <Row
          icon="delete-alert-outline"
          label="Thrown away"
          hint="Expired, damaged or unsafe. Counted as waste."
          onPress={() => handleExit("discarded")}
        />
        <Row
          icon="pencil-outline"
          label="Remove — it was a mistake"
          hint="Never really on the shelf. Counted as neither."
          divider={false}
          onPress={() => handleExit("correction")}
        />
      </Sheet>

      <Sheet
        visible={relocating}
        onClose={() => setRelocating(false)}
        title="Move to"
        subtitle={`Where these ${selectedIds.length} ${selectedIds.length === 1 ? "item goes" : "items go"}`}
      >
        <View className="flex-row flex-wrap gap-2">
          {orderShelves(locations).map(({ loc, label }) => (
            <Chip
              key={loc.id}
              label={label}
              onPress={() => {
                setRelocating(false);
                runOnSelection(
                  () => updateItems(selectedIds, { location_id: loc.id }),
                  "Could not move those items",
                );
              }}
            />
          ))}
          <Chip
            label="Not filed"
            onPress={() => {
              setRelocating(false);
              runOnSelection(
                () => updateItems(selectedIds, { location_id: null }),
                "Could not move those items",
              );
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={recategorising}
        onClose={() => setRecategorising(false)}
        title="Change category"
        subtitle={`Applies to all ${selectedIds.length} selected ${selectedIds.length === 1 ? "item" : "items"}`}
      >
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
            <Chip
              key={cat.id}
              label={cat.label}
              onPress={() => {
                setRecategorising(false);
                runOnSelection(
                  () => updateItems(selectedIds, { category: cat.id as any }),
                  "Could not change those categories",
                );
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Add an item"
        subtitle="Add food by hand or open common staples."
      >
        {/* Same row as Home's Quick add, so the shortcut looks like itself. */}
        <Tappable
          accessibilityRole="button"
          onPress={() => {
            setModalVisible(false);
            setStaplesModalVisible(true);
          }}
          className="flex-row items-center gap-3 rounded-lg border border-hairline bg-card p-3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-secondary-tint">
            <MaterialCommunityIcons
              name="lightning-bolt"
              size={22}
              color={COLORS.secondaryDark}
            />
          </View>
          <View className="flex-1">
            <Text variant="body" className="font-bold" numberOfLines={1}>
              Quick add staples
            </Text>
            <Text variant="label" tone="soft" numberOfLines={1}>
              Beans, rice, pasta, soup
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={COLORS.textSecondary}
          />
        </Tappable>

        <Input
          label="Name"
          placeholder="Canned black beans 15 oz"
          value={newName}
          onChangeText={setNewName}
        />

        <View className="gap-2">
          <Text variant="label" tone="soft" className="font-semibold">
            Category
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
              <Chip
                key={cat.id}
                label={cat.label}
                selected={newCat === cat.id}
                onPress={() => setNewCat(cat.id as any)}
              />
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="label" tone="soft" className="font-semibold">
            How many
          </Text>
          <View className="flex-row items-center gap-2">
            <Stepper value={newCount} min={1} onChange={setNewCount} />
            {/* Case sizes, as on Review & Verify. */}
            {[6, 12, 24].map((add) => (
              <Tappable
                key={add}
                accessibilityRole="button"
                accessibilityLabel={`Add ${add} more`}
                onPress={() => {
                  cueTap();
                  setNewCount((c) => (c === 1 ? add : c + add));
                }}
                className="h-12 flex-1 items-center justify-center rounded-md border border-hairline bg-subtle"
              >
                <Text variant="label" tone="brand" className="font-bold">
                  +{add}
                </Text>
              </Tappable>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text variant="label" tone="soft" className="font-semibold">
            Best by (optional)
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {[
              { label: "3 months", days: 90 },
              { label: "6 months", days: 180 },
              { label: "1 year", days: 365 },
              { label: "2 years", days: 730 },
            ].map((preset) => {
              const iso = windowEndISO(preset.days);
              return (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  selected={newExp === iso}
                  onPress={() => setNewExp(newExp === iso ? "" : iso)}
                />
              );
            })}
          </View>
          <Input
            placeholder="Or type the date: 2027-06-30"
            value={newExp}
            onChangeText={setNewExp}
          />
        </View>

        {(() => {
          const locId = resolveManualShelfId(newName, newCat);
          const locName = locId ? placeNames[locId] : null;
          if (!locName) return null;
          return (
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons
                name="bookshelf"
                size={18}
                color={COLORS.secondaryDark}
              />
              <Text variant="label" tone="soft">
                Goes on{" "}
                <Text
                  variant="label"
                  className="font-bold"
                  style={{ color: COLORS.secondaryDark }}
                >
                  {locName}
                </Text>
              </Text>
            </View>
          );
        })()}

        <Button
          label="Add to inventory"
          block
          disabled={!newName.trim()}
          className="rounded-md"
          onPress={handleManualAdd}
        />
      </Sheet>

      <QuickAddStaplesModal
        visible={staplesModalVisible}
        onClose={() => setStaplesModalVisible(false)}
      />

      <SpotlightTour tourKey="inventory" steps={INVENTORY_TOUR} />
      <InventoryDragLayer
        api={dragApi}
        dragging={dragging}
        places={dropPlaces}
        rootY={rootY}
      />
    </View>
  );
}

/**
 * A list setting that opens a choice sheet: what it is (caption), what it's
 * set to (value, bold), and a chevron. Group and Sort share it so they read as a pair.
 */
function ListControl({
  icon,
  caption,
  value,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  caption: string;
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="min-h-[52px] w-full flex-row items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2"
    >
      <View className="h-8 w-8 items-center justify-center rounded-md bg-secondary-tint">
        <MaterialCommunityIcons
          name={icon}
          size={17}
          color={COLORS.secondaryDark}
        />
      </View>
      <View className="flex-1">
        <Text variant="micro" tone="soft">
          {caption}
        </Text>
        <Text variant="label" className="font-bold">
          {value}
        </Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-down"
        size={18}
        color={COLORS.textSecondary}
      />
    </Tappable>
  );
}

/** "Feb 4, 2027" from an ISO date; the raw string if it isn't one. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
