import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  SectionList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  View,
} from 'react-native';
import { COLORS } from '../../constants/theme';
import { daysUntil, isPastDate, windowEndISO } from '../../lib/expiry';
import { cn } from '../../lib/cn';
import { cueTap, cueWarn } from '../../lib/feedback';
import { PlacesManager } from '../../components/places-manager';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { SwipeableMethods } from 'react-native-gesture-handler/lib/typescript/components/ReanimatedSwipeable/ReanimatedSwipeableProps';
import {
  Button,
  Chip,
  EmptyState,
  Input,
  ItemThumb,
  Row,
  Sheet,
  Stepper,
  Text,
} from '../../components/ui';
import {
  CONDITION_LABELS,
  type ExitReason,
  InventoryItem,
  isUsableCondition,
  usePantryStore,
} from '../../lib/store';

/**
 * The shelf, as a list.
 *
 * The old version stacked a search bar, a pill row, a four-option sort bar and
 * then rows carrying up to three badges plus a stepper — six competing controls
 * before a single item. Sorting is now one chip row that doubles as the filter
 * summary, rows carry at most one status badge, and the count control has room
 * to be tapped.
 */

/** Whole days since the pantry received this item — the FIFO signal. */
function daysOnShelf(dateAdded: string): number {
  const then = new Date(`${dateAdded}T00:00:00`).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.round((Date.now() - then) / 86400000));
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'grain', label: 'Grain' },
  { id: 'vegetable', label: 'Vegetables' },
  { id: 'protein', label: 'Protein' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'snack', label: 'Snacks' },
  { id: 'hygiene', label: 'Hygiene' },
  { id: 'baby', label: 'Baby' },
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
  { id: 'place', label: 'By place' },
  { id: 'category', label: 'By category' },
  { id: 'none', label: 'Flat list' },
] as const;

type GroupBy = (typeof GROUPS)[number]['id'];

/** How far the row travels when the action is fully open. */
const SWIPE_WIDTH = 96;

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
      className="items-end justify-center overflow-hidden bg-critical pr-5"
    >
      <View className="items-center">
        <MaterialCommunityIcons name="tray-arrow-up" size={22} color={COLORS.textOnPrimary} />
        <Text variant="micro" tone="on" className="mt-1 font-bold">
          Take off
        </Text>
      </View>
    </Animated.View>
  );
}

/** One duration for the chevron and the rows, so they read as a single motion. */
const SECTION_MS = 260;

/**
 * A row that can fold itself away.
 *
 * LayoutAnimation was tried first and does nothing here: the rows were removed
 * from the list's data, so React unmounted them before anything could animate.
 * Instead the rows stay mounted while a section closes — shrinking to nothing
 * and fading — and the screen drops them once the motion is over (see
 * `toggleSection`).
 *
 * Rows are different heights (a long name wraps), so each measures itself. The
 * measured copy sits absolutely positioned inside a clipping wrapper whose height
 * is the animated number. Until it has been measured it lays out in the normal
 * flow — a row born closed is only transparent for that first frame, not zero
 * height, because a child inside a zero-height parent never reports its size.
 */
function CollapsibleRow({
  open,
  appear,
  children,
}: {
  open: boolean;
  /** True when the row is mounting because its section was just opened. */
  appear: boolean;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const startClosed = useRef(!open || appear).current;
  const progress = useSharedValue(startClosed ? 0 : 1);
  const natural = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : SECTION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [open, reduceMotion, progress]);

  const clip = useAnimatedStyle(() => ({
    height: natural.value * progress.value,
    opacity: progress.value,
  }));

  return (
    <Animated.View
      style={[
        { overflow: 'hidden' },
        measured ? clip : startClosed ? { opacity: 0 } : null,
      ]}
    >
      <View
        style={measured ? { position: 'absolute', top: 0, left: 0, right: 0 } : undefined}
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) {
            natural.value = h;
            if (!measured) setMeasured(true);
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/**
 * The turn of a section's chevron.
 *
 * It used to swap between two different glyphs, so the arrow snapped from
 * pointing right to pointing down while the rows below it did the same. One
 * glyph that rotates reads as the SAME arrow opening, and its motion is what
 * tells the eye the rows beneath are about to follow it.
 *
 * Its own component because it holds a shared value, and renderSectionHeader is
 * a plain callback where a hook is a Rules-of-Hooks violation.
 */
function SectionChevron({ collapsed }: { collapsed: boolean }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    turn.value = withTiming(collapsed ? 1 : 0, { duration: reduceMotion ? 0 : SECTION_MS });
  }, [collapsed, reduceMotion, turn]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-90 * turn.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.textSecondary} />
    </Animated.View>
  );
}

const SORTS = [
  { id: 'expiration', label: 'Expiring first' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'count', label: 'Most stock' },
  { id: 'name', label: 'A–Z' },
] as const;

export default function InventoryScreen() {
  const router = useRouter();
  const {
    inventory,
    locations,
    updateItem,
    deleteItem,
    deleteItems,
    updateItems,
    recordExit,
    addItems,
    settings,
  } = usePantryStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]['id']>('expiration');

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
  const [groupBy, setGroupBy] = useState<GroupBy>('place');
  /** Sections the volunteer has folded away, by section id. */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /**
   * Sections whose rows have finished folding and been dropped from the list.
   * Trails `collapsed` by one animation, so the rows can be seen shrinking.
   */
  const [dropped, setDropped] = useState<Record<string, boolean>>({});
  /** Sections that were opened a moment ago, whose rows should grow in. */
  const appearing = useRef(new Set<string>());
  /** True for the first moments after the screen opens, while rows may stagger in. */
  const arriving = useRef(true);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const t = setTimeout(() => {
      arriving.current = false;
    }, 900);
    return () => clearTimeout(t);
  }, []);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);
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
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState<InventoryItem['category']>('grain');
  const [newCount, setNewCount] = useState(1);
  const [newExp, setNewExp] = useState('');

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

  const filteredItems = inventory
    .filter(item => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchFlag = !onlyFlagged || needsAttention(item);
      return matchCat && matchSearch && matchFlag;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'count') return b.count - a.count;
      // FIFO: what has been sitting on the shelf longest goes out first.
      if (sortBy === 'oldest') return (a.date_added || '').localeCompare(b.date_added || '');
      if (!a.expiration) return 1;
      if (!b.expiration) return -1;
      const byDate =
        new Date(a.expiration).getTime() - new Date(b.expiration).getTime();
      // Two tins with the same printed date are separated by which arrived
      // first, which is what FIFO actually means.
      return byDate !== 0 ? byDate : (a.date_added || '').localeCompare(b.date_added || '');
    });

  const flaggedCount = inventory.filter(needsAttention).length;

  /**
   * The list, cut into sections.
   *
   * A collapsed section keeps its header and its counts and drops its rows —
   * folding a shelf away must not make it look like the shelf is empty.
   */
  const sections = (() => {
    if (groupBy === 'none') {
      return [{ id: 'all', title: '', units: 0, data: filteredItems }];
    }

    const buckets: { id: string; title: string; data: InventoryItem[] }[] =
      groupBy === 'place'
        ? [
            ...locations.map(l => ({ id: l.id, title: l.name, data: [] as InventoryItem[] })),
            { id: 'none', title: 'Not filed anywhere', data: [] as InventoryItem[] },
          ]
        : CATEGORIES.filter(c => c.id !== 'all').map(c => ({
            id: c.id,
            title: c.label,
            data: [] as InventoryItem[],
          }));

    const fallback = buckets[buckets.length - 1];
    for (const item of filteredItems) {
      const key = groupBy === 'place' ? (item.location_id ?? 'none') : item.category;
      (buckets.find(b => b.id === key) ?? fallback).data.push(item);
    }

    // An empty shelf is worth seeing when you are looking at the room; an empty
    // one while you are searching is just noise.
    const searching = !!search || onlyFlagged || selectedCategory !== 'all';
    return buckets
      .filter(b => b.data.length > 0 || (!searching && groupBy === 'place'))
      .map(b => ({
        ...b,
        units: b.data.reduce((sum, i) => sum + i.count, 0),
        data: dropped[b.id] ? [] : b.data,
      }));
  })();

  /**
   * Folds or opens a section.
   *
   * Collapsing used to drop the rows in one frame and everything under them
   * jumped up the screen. Now the rows shrink and fade (CollapsibleRow) while the
   * sections beneath ride up with them, and only then are they removed from the
   * list, so a long inventory is not kept mounted while folded. Opening mounts
   * them back at zero height and grows them in.
   */
  const toggleSection = (id: string) => {
    cueTap();
    const pending = timers.current.get(id);
    if (pending) clearTimeout(pending);

    if (!collapsed[id]) {
      setCollapsed(prev => ({ ...prev, [id]: true }));
      timers.current.set(
        id,
        setTimeout(() => setDropped(prev => ({ ...prev, [id]: true })), SECTION_MS + 60),
      );
    } else {
      appearing.current.add(id);
      setDropped(prev => ({ ...prev, [id]: false }));
      setCollapsed(prev => ({ ...prev, [id]: false }));
      timers.current.set(
        id,
        setTimeout(() => appearing.current.delete(id), SECTION_MS + 120),
      );
    }
  };

  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const picking = selectedIds.length > 0;

  const toggleSelect = (id: string) => {
    cueTap();
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const clearSelection = () => setSelected({});

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
      Alert.alert(failureTitle, err?.message ?? 'Please try again.');
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
      .filter(i => ids.includes(i.id))
      .reduce((sum, i) => sum + i.count, 0);

    const prompts: Record<ExitReason, { title: string; body: string; verb: string }> = {
      given_out: {
        title: `Give out ${units} ${units === 1 ? 'unit' : 'units'}?`,
        body: 'They come off the shelf and are counted as food that reached a household.',
        verb: 'Give out',
      },
      discarded: {
        title: `Throw away ${units} ${units === 1 ? 'unit' : 'units'}?`,
        body: 'They come off the shelf and are counted as waste — the other number funders ask for.',
        verb: 'Throw away',
      },
      correction: {
        title: `Remove ${count} ${count === 1 ? 'row' : 'rows'}?`,
        body: 'For fixing a mistake. Nothing is counted as given out or wasted.',
        verb: 'Remove',
      },
    };
    const prompt = prompts[reason];

    setExitIds(null);
    Alert.alert(prompt.title, prompt.body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: prompt.verb,
        style: reason === 'given_out' ? 'default' : 'destructive',
        onPress: () =>
          runOnSelection(() => recordExit(ids, reason), 'Could not record that'),
      },
    ]);
  };

  const handleManualAdd = () => {
    if (!newName.trim()) return;
    addItems(
      [
        {
          name: newName,
          category: newCat,
          count: newCount,
          expiration: newExp.trim() || null,
        },
      ],
      'manual',
    );
    setNewName('');
    setNewCount(1);
    setNewExp('');
    setModalVisible(false);
  };

  const renderRowContent = ({
    item,
    index,
    section,
  }: {
    item: InventoryItem;
    index: number;
    section: { data: readonly InventoryItem[] };
  }) => {
    const pastDate = isPastDate(item.expiration);
    const expiringSoon = !pastDate && !!item.expiration && item.expiration <= warningStr;
    const damaged = !isUsableCondition(item.condition);
    // Both keep it out of the boxes, so both get the red treatment.
    const blocked = damaged || pastDate;
    const placeName = locations.find(l => l.id === item.location_id)?.name;

    const isSelected = !!selected[item.id];
    const first = index === 0;
    const last = index === section.data.length - 1;

    const days = daysUntil(item.expiration);
    const shortDate = item.expiration
      ? new Date(`${item.expiration}T00:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

    /**
     * One line of status, worst first, in words that carry their own urgency.
     *
     * This was a grey "Expires 2026-10-17 · on shelf 20d" line plus a separate
     * badge underneath it, so every flagged row grew a third line and a colour
     * chip to say what the line above already half said. Now the line itself
     * changes: "Use first · 14 days left" is the warning, there is nothing
     * further to attach to it, and a row stays two lines whatever state it is in.
     * "Damaged" outranks "out of date" outranks "use first" — it is the order in
     * which they stop food leaving the building.
     */
    const status: { text: string; tone: 'critical' | 'warn'; suffix?: string } | null = damaged
      ? { text: CONDITION_LABELS[item.condition || 'ok'], tone: 'critical' }
      : pastDate
        ? { text: 'Out of date', tone: 'critical', suffix: shortDate ?? undefined }
        : expiringSoon
          ? {
              text:
                days === 0
                  ? 'Use first · expires today'
                  : `Use first · ${days} ${days === 1 ? 'day' : 'days'} left`,
              tone: 'warn',
            }
          : null;

    // Context that only earns its space when it is not already the heading above
    // the row (place) or the thing the list is sorted by (shelf age).
    const context = [
      groupBy !== 'place' && placeName ? placeName : null,
      sortBy === 'oldest' && item.date_added ? `on shelf ${daysOnShelf(item.date_added)}d` : null,
    ].filter(Boolean) as string[];

    const row = (
      <Pressable
        // In picking mode a tap picks; otherwise it opens. A long press starts
        // picking from anywhere, which is the gesture people already expect from
        // a photo library.
        onPress={() =>
          picking
            ? toggleSelect(item.id)
            : router.push({ pathname: '/item-detail', params: { id: item.id } })
        }
        onLongPress={() => toggleSelect(item.id)}
        delayLongPress={250}
        // One card per SECTION, not per product. Each product used to be its own
        // bordered, shadowed, bottom-lipped box, which is why three items filled
        // a screen and the list read as a stack of heavy slabs. Rows now share a
        // container and are told apart by a hairline, the way every list people
        // find calm is built; the lip is kept on the group's last row so the
        // group still sits on the page like the other cards do.
        className={cn(
          'border-x-[1.5px] border-hairline',
          isSelected ? 'bg-subtle' : 'bg-card',
          first && 'rounded-t-lg border-t-[1.5px]',
          last && 'rounded-b-lg border-b-[3px]',
        )}
      >
        <View className="flex-row items-center gap-3 px-4 py-3">
          {picking && (
            <MaterialCommunityIcons
              name={isSelected ? 'check-circle' : 'circle-outline'}
              size={26}
              color={isSelected ? COLORS.primaryLight : COLORS.borderStrong}
            />
          )}
          {/* The actual product where we have a picture of it, the category
              glyph where we do not. A volunteer at a shelf is matching what
              the app says against what is in their hand, and a thumbnail does
              that instantly in a way a line of text never can. */}
          <ItemThumb
            imageUrl={item.image_url}
            category={item.category}
            tone={blocked ? 'critical' : 'brand'}
          />

          <View className="flex-1">
            <Text variant="body" numberOfLines={2} className="font-semibold">
              {item.name}
            </Text>

            {status ? (
              <View className="mt-1 flex-row items-center gap-1.5">
                <View
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    status.tone === 'critical' ? 'bg-critical' : 'bg-warn',
                  )}
                />
                <Text variant="micro" tone={status.tone} className="flex-shrink font-bold">
                  {status.text}
                  {status.suffix ? (
                    <Text variant="micro" tone="soft" className="font-normal">
                      {` · ${status.suffix}`}
                    </Text>
                  ) : null}
                </Text>
              </View>
            ) : (
              <Text variant="micro" tone="soft" className="mt-1">
                {shortDate ? `Expires ${shortDate}` : 'No expiry date'}
              </Text>
            )}

            {context.length > 0 && (
              <Text variant="micro" tone="soft" numberOfLines={1} className="mt-0.5">
                {context.join(' · ')}
              </Text>
            )}
          </View>

          {/* The stepper is meaningless while picking — the row is a checkbox
              then, and a control that also changes stock would fight the tap. */}
          {!picking && (
            <Stepper
              size="compact"
              value={item.count}
              min={0}
              onChange={next => {
                const write =
                  next === 0 ? deleteItem(item.id) : updateItem(item.id, { count: next });
                // These used to be fired and forgotten, so a rejected write was
                // an unhandled promise and a silently unchanged shelf.
                write.catch((err: any) => {
                  cueWarn();
                  Alert.alert('Could not save that change', err?.message ?? 'Please try again.');
                });
              }}
            />
          )}
        </View>

        {/* Inset to the text column, so the line separates names rather than
            cutting the thumbnails off from their own row. */}
        {!last && (
          <View
            pointerEvents="none"
            className="absolute bottom-0 right-0 h-px bg-hairline"
            style={{ left: picking ? 114 : 76 }}
          />
        )}
      </Pressable>
    );

    // Swiping while picking would fight the selection, so the gesture is only
    // live when a tap means "open this".
    if (picking) return row;

    // Captured from renderLeftActions so the row can be sprung shut again once
    // the sheet takes over — otherwise it sits open behind it and stays open if
    // the volunteer backs out.
    let methods: SwipeableMethods | null = null;

    return (
      <ReanimatedSwipeable
        friction={2}
        leftThreshold={SWIPE_WIDTH * 0.6}
        overshootLeft={false}
        renderLeftActions={(_progress, translation, swipeableMethods) => {
          methods = swipeableMethods;
          return <SwipeAction translation={translation} />;
        }}
        onSwipeableOpen={direction => {
          if (direction !== 'left') return;
          cueWarn();
          methods?.close();
          // Straight to the reason sheet rather than a silent delete: "a family
          // took it home", "it was mouldy" and "I typed this twice" are three
          // different facts, and two of them are numbers this pantry reports on.
          setExitIds([item.id]);
        }}
      >
        {row}
      </ReanimatedSwipeable>
    );
  };

  const renderItemRow = (info: {
    item: InventoryItem;
    index: number;
    section: { id: string; data: readonly InventoryItem[] };
  }) => (
    // Outside the collapsing wrapper so the two never fight over opacity. Only
    // while the screen is first arriving, and only the first few rows of a
    // section: rows scrolled in later should simply be there.
    <Animated.View
      entering={
        arriving.current && info.index < 5 && !reduceMotion
          ? FadeInDown.duration(320).delay(info.index * 55)
          : undefined
      }
    >
      <CollapsibleRow
        open={!collapsed[info.section.id]}
        appear={appearing.current.has(info.section.id)}
      >
        {renderRowContent(info)}
      </CollapsibleRow>
    </Animated.View>
  );

  return (
    <View className="flex-1 bg-canvas">
      <View className="px-gutter pt-4 gap-4">
        {picking ? (
          /* One bar, one job. Search and category filters are not what anyone
             wants once they have already chosen what they are acting on. */
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={clearSelection}
                accessibilityLabel="Cancel selection"
                hitSlop={8}
                className="h-12 w-12 items-center justify-center rounded-md border-[1.5px] border-outline bg-card"
              >
                <MaterialCommunityIcons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>

              <Text variant="heading" className="flex-1">
                {selectedIds.length} selected
              </Text>

              <Pressable
                onPress={() => {
                  cueTap();
                  const all = filteredItems.every(i => selected[i.id]);
                  setSelected(
                    all ? {} : Object.fromEntries(filteredItems.map(i => [i.id, true])),
                  );
                }}
                hitSlop={8}
                className="px-2 py-2"
              >
                <Text variant="label" tone="brand" className="font-bold">
                  {filteredItems.every(i => selected[i.id]) ? 'None' : 'All'}
                </Text>
              </Pressable>
            </View>

            <View className="flex-row gap-2">
              {locations.length > 0 && (
                <Button
                  label="Move to"
                  variant="secondary"
                  size="compact"
                  className="flex-1 justify-center"
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
                className="flex-1 justify-center"
                icon={
                  <MaterialCommunityIcons name="tag-outline" size={17} color={COLORS.textPrimary} />
                }
                onPress={() => setRecategorising(true)}
              />
              <Button
                label="Take off shelf"
                variant="critical"
                size="compact"
                className="flex-1 justify-center"
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
        <View className="flex-row items-center gap-3">
          <View className="h-12 flex-1 flex-row items-center gap-2 rounded-md border-[1.5px] border-outline bg-card px-3">
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textSecondary} />
            <TextInput
              className="flex-1 text-body text-ink"
              placeholder="Search items"
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={COLORS.textSecondary}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={18} color={COLORS.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => setModalVisible(true)}
            accessibilityLabel="Add an item by hand"
            style={({ pressed }) => ({
              borderBottomWidth: pressed ? 2 : 4,
              borderBottomColor: COLORS.primaryDeep,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
            className="h-12 w-12 items-center justify-center rounded-md bg-brand"
          >
            <MaterialCommunityIcons name="plus" size={22} color={COLORS.textOnPrimary} />
          </Pressable>
        </View>
        )}

        {!picking && (
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={c => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-gutter"
          // Out-of-date or damaged stock used to get its own full-width banner
          // above the filters — the loudest thing on the screen for what is, most
          // days, a single item. It is a filter like the others, so it is a chip
          // like the others, just red so it still cannot be missed. It only
          // exists while there is something to show.
          ListHeaderComponent={
            flaggedCount > 0 ? (
              <Pressable
                onPress={() => {
                  cueTap();
                  setOnlyFlagged(v => !v);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: onlyFlagged }}
                accessibilityLabel={`${flaggedCount} out of date or damaged. ${
                  onlyFlagged ? 'Showing only these. Tap to show all.' : 'Tap to show only these.'
                }`}
                className={cn(
                  'min-h-[40px] flex-row items-center gap-1.5 rounded-full border-[1.5px] px-3.5',
                  onlyFlagged ? 'border-critical bg-critical' : 'border-critical bg-card',
                )}
              >
                <MaterialCommunityIcons
                  name="alert-circle"
                  size={16}
                  color={onlyFlagged ? COLORS.textOnPrimary : COLORS.statusCritical}
                />
                <Text
                  variant="label"
                  tone={onlyFlagged ? 'on' : 'critical'}
                  className="font-semibold"
                >
                  {flaggedCount} to check
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected={selectedCategory === item.id}
              onPress={() => setSelectedCategory(item.id)}
            />
          )}
        />
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={renderItemRow}
        stickySectionHeadersEnabled={groupBy !== 'none'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="px-gutter pt-4 pb-28"
        renderSectionFooter={() => <View className="h-5" />}
        renderSectionHeader={({ section }) => {
          if (groupBy === 'none' || picking) return null;
          const isCollapsed = !!collapsed[section.id];
          return (
            <Pressable
              onPress={() => toggleSection(section.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: !isCollapsed }}
              // Opaque, because it sticks: a translucent header would let rows
              // scroll through the text behind it.
              className="flex-row items-center gap-1.5 bg-canvas pb-2.5 pt-1"
            >
              <SectionChevron collapsed={isCollapsed} />
              {/* A label, not a heading: a section name at 17px bold competed with
                  the product names beneath it at 15, so the eye had no idea which
                  line was the thing and which was the shelf it was on. */}
              <Text variant="label" tone="soft" className="flex-1 font-bold">
                {section.title}
              </Text>
              {/* Units, not rows. "12 tins" is the number a volunteer standing in
                  front of the shelf is actually checking against. */}
              <Text variant="micro" tone="soft" className="font-semibold">
                {section.units === 0
                  ? 'empty'
                  : `${section.units} ${section.units === 1 ? 'unit' : 'units'}`}
              </Text>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          picking ? null : (
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <Pressable
                onPress={() => {
                  cueTap();
                  const i = GROUPS.findIndex(g => g.id === groupBy);
                  setGroupBy(GROUPS[(i + 1) % GROUPS.length].id);
                }}
                className="flex-row items-center gap-1"
                accessibilityLabel={`Grouped ${GROUPS.find(g => g.id === groupBy)?.label}. Tap to change.`}
              >
                <MaterialCommunityIcons
                  name="view-agenda-outline"
                  size={16}
                  color={COLORS.primaryDark}
                />
                <Text variant="micro" tone="brand" className="font-semibold">
                  {GROUPS.find(g => g.id === groupBy)?.label}
                </Text>
              </Pressable>

              {groupBy === 'place' && (
                <Pressable
                  onPress={() => {
                    cueTap();
                    setManagingPlaces(true);
                  }}
                  hitSlop={8}
                  accessibilityLabel="Manage places"
                  className="flex-row items-center gap-1"
                >
                  <MaterialCommunityIcons
                    name="map-marker-outline"
                    size={16}
                    color={COLORS.primaryDark}
                  />
                  <Text variant="micro" tone="brand" className="font-semibold">
                    Places
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  const i = SORTS.findIndex(s => s.id === sortBy);
                  setSortBy(SORTS[(i + 1) % SORTS.length].id);
                }}
                className="flex-row items-center gap-1"
                accessibilityLabel={`Sorted by ${SORTS.find(s => s.id === sortBy)?.label}. Tap to change.`}
              >
                <MaterialCommunityIcons name="swap-vertical" size={16} color={COLORS.primaryDark} />
                <Text variant="micro" tone="brand" className="font-semibold">
                  {SORTS.find(s => s.id === sortBy)?.label}
                </Text>
              </Pressable>
            </View>
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-text-search-outline"
            title="Nothing here yet"
            body={
              onlyFlagged
                ? 'Nothing is flagged for inspection. Everything on the shelf is fit to give out.'
                : search || selectedCategory !== 'all'
                  ? 'Try another search, or clear the filters.'
                  : 'Photograph a donation to fill the shelves.'
            }
            actionLabel={
              onlyFlagged || search || selectedCategory !== 'all' ? 'Clear the filters' : undefined
            }
            onAction={
              onlyFlagged || search || selectedCategory !== 'all'
                ? () => {
                    setSearch('');
                    setSelectedCategory('all');
                    setOnlyFlagged(false);
                  }
                : undefined
            }
          />
        }
      />

      <Sheet
        visible={managingPlaces}
        onClose={() => setManagingPlaces(false)}
        title="Places in your pantry"
        subtitle="Shelves, bins, freezers — wherever donations actually get put."
      >
        <PlacesManager />
      </Sheet>

      <Sheet
        visible={!!exitIds}
        onClose={() => setExitIds(null)}
        title="Where is it going?"
        subtitle={`${exitIds?.length ?? 0} ${exitIds?.length === 1 ? 'item' : 'items'} leaving the shelf`}
      >
        <Row
          icon="hand-heart-outline"
          label="Given out"
          hint="A household took it home. Counted as food distributed."
          onPress={() => handleExit('given_out')}
        />
        <Row
          icon="delete-alert-outline"
          label="Thrown away"
          hint="Expired, damaged or unsafe. Counted as waste."
          onPress={() => handleExit('discarded')}
        />
        <Row
          icon="pencil-outline"
          label="Remove — it was a mistake"
          hint="Never really on the shelf. Counted as neither."
          divider={false}
          onPress={() => handleExit('correction')}
        />
      </Sheet>

      <Sheet
        visible={relocating}
        onClose={() => setRelocating(false)}
        title="Move to"
        subtitle={`Where these ${selectedIds.length} ${selectedIds.length === 1 ? 'item goes' : 'items go'}`}
      >
        <View className="flex-row flex-wrap gap-2">
          {locations.map(loc => (
            <Chip
              key={loc.id}
              label={loc.name}
              onPress={() => {
                setRelocating(false);
                runOnSelection(
                  () => updateItems(selectedIds, { location_id: loc.id }),
                  'Could not move those items',
                );
              }}
            />
          ))}
          <Chip
            label="Unassign"
            onPress={() => {
              setRelocating(false);
              runOnSelection(
                () => updateItems(selectedIds, { location_id: null }),
                'Could not move those items',
              );
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={recategorising}
        onClose={() => setRecategorising(false)}
        title="Change category"
        subtitle={`Applies to all ${selectedIds.length} selected ${selectedIds.length === 1 ? 'item' : 'items'}`}
      >
        <View className="flex-row flex-wrap gap-2">
          {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
            <Chip
              key={cat.id}
              label={cat.label}
              onPress={() => {
                setRecategorising(false);
                runOnSelection(
                  () => updateItems(selectedIds, { category: cat.id as any }),
                  'Could not change those categories',
                );
              }}
            />
          ))}
        </View>
      </Sheet>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 justify-end bg-black/50">
            <View className="rounded-t-lg bg-canvas px-gutter pb-10 pt-6 gap-4">
              <View className="flex-row items-center justify-between">
                <Text variant="title">Add an item</Text>
                <Pressable onPress={() => setModalVisible(false)} hitSlop={8}>
                  <MaterialCommunityIcons name="close" size={24} color={COLORS.textPrimary} />
                </Pressable>
              </View>

              <Input
                label="Name"
                placeholder="Canned black beans 15 oz"
                value={newName}
                onChangeText={setNewName}
              />

              <View className="gap-2">
                <Text variant="label" tone="soft">
                  Category
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <Chip
                      key={cat.id}
                      label={cat.label}
                      selected={newCat === cat.id}
                      onPress={() => setNewCat(cat.id as any)}
                    />
                  ))}
                </View>
              </View>

              <View className="flex-row gap-4">
                <View className="gap-2">
                  <Text variant="label" tone="soft">
                    Quantity
                  </Text>
                  <Stepper value={newCount} min={1} onChange={setNewCount} />
                </View>
                <View className="flex-1">
                  <Input
                    label="Expires (optional)"
                    placeholder="YYYY-MM-DD"
                    value={newExp}
                    onChangeText={setNewExp}
                  />
                </View>
              </View>

              <Button label="Add to inventory" block className="mt-2" onPress={handleManualAdd} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
