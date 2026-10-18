import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { cueTap } from '../lib/feedback';
import { orderShelves } from '../lib/shelves';
import { usePantryStore } from '../lib/store';
import { PRESS_SCALE_ROW, Tappable } from './motion';
import { Button, EmptyState, Row, Sheet, Text } from './ui';

/**
 * Counting a shelf: pick the shelf, then photograph it or count by hand.
 *
 * The photo goes to audit-review, which reconciles rather than inserts: the
 * count replaces what this one shelf says, and nothing is written until a
 * volunteer confirms each line.
 *
 * One body, two homes: the Home screen opens it as a popup (like Quick Add),
 * and the /shelf-audit route shows it as a page for the app map and for
 * audit-review's way back. `go` is how each home leaves: the page navigates
 * straight away, the popup closes first and then navigates.
 */
export function ShelfCheckContent({ go, onHelp }: { go: (to: Href) => void; onHelp: () => void }) {
  const { locations, inventory, setAuditDraft } = usePantryStore();
  const shelves = orderShelves(locations);
  const [locationId, setLocationId] = useState<string | null>(shelves[0]?.loc.id ?? null);
  const selected = shelves.find(s => s.loc.id === locationId) ?? null;

  if (locations.length === 0) {
    return (
      <EmptyState
        className="py-6"
        icon="bookshelf"
        title="No shelves yet"
        body="Add your shelves on the Inventory tab first."
        actionLabel="Set up shelves"
        actionVariant="primary"
        onAction={() => go('/(tabs)/inventory')}
      />
    );
  }

  return (
    <View className="gap-3">
      <Text variant="body" className="font-bold">
        Which shelf?
      </Text>
      <View>
        {shelves.map(({ loc, label, depth }, i) => {
          const active = loc.id === locationId;
          const units = inventory.filter(x => x.location_id === loc.id).reduce((sum, x) => sum + x.count, 0);
          return (
            <Tappable
              scaleTo={PRESS_SCALE_ROW}
              key={loc.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                cueTap();
                setLocationId(loc.id);
              }}
              className={`min-h-[52px] flex-row items-center gap-3 py-2 ${depth === 1 ? 'pl-6' : ''}`}
              style={i === shelves.length - 1 ? undefined : RULE_BELOW}
            >
              <MaterialCommunityIcons
                name={active ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={active ? COLORS.primary : COLORS.borderStrong}
              />
              <Text variant="body" className={`flex-1 ${active ? 'font-bold' : 'font-semibold'}`} numberOfLines={1}>
                {depth === 1 ? label.split(' › ').pop() : label}
              </Text>
              <Text variant="micro" tone="soft" className="font-semibold">
                {units === 0 ? 'empty' : `${units} unit${units === 1 ? '' : 's'}`}
              </Text>
            </Tappable>
          );
        })}
      </View>

      <Button
        label={selected ? `Photograph ${selected.loc.name}` : 'Photograph the shelf'}
        block
        className="rounded-md"
        disabled={!locationId}
        icon={<MaterialCommunityIcons name="camera-outline" size={20} color={COLORS.textOnPrimary} />}
        onPress={() => {
          if (!locationId) return;
          cueTap();
          go({ pathname: '/log-donation', params: { mode: 'audit', location: locationId } });
        }}
      />
      <Button
        label="Count by hand instead"
        variant="secondary"
        block
        className="rounded-md"
        disabled={!locationId}
        onPress={() => {
          if (!locationId) return;
          setAuditDraft({ locationId, photos: 0, counted: [] });
          go('/audit-review');
        }}
      />
      <Tappable
        onPress={() => {
          cueTap();
          onHelp();
        }}
        accessibilityRole="button"
        className="min-h-[44px] flex-row items-center justify-center gap-1.5"
      >
        <MaterialCommunityIcons name="help-circle-outline" size={17} color={COLORS.primaryDark} />
        <Text variant="label" className="font-bold" style={{ color: COLORS.primaryDark }}>
          How shelf checks work
        </Text>
      </Tappable>
    </View>
  );
}

/** The how-to, kept off the page until asked for. */
export function ShelfCheckHelp() {
  const { inventory } = usePantryStore();
  const unfiled = inventory.filter(i => !i.location_id).length;
  return (
    <View className="gap-3">
      <Text variant="body">
        If 12 cans are recorded but you count 9, approving the count saves a −3 correction. It does not record food given out.
      </Text>
      <View>
        <Row icon="camera-retake-outline" label="Shoot in overlapping strips" hint="Left, middle, right. A gap is stock the count will miss." />
        <Row icon="eye-off-outline" label="Pull the front row forward" hint="Anything hidden behind it comes back short." />
        <Row icon="numeric" label="Every number is editable" hint="Fix anything on the next screen." />
        <Row
          icon="check-decagram-outline"
          label="Nothing is removed unless you say so"
          hint="Anything not seen is shown as a question first."
          divider={unfiled > 0}
        />
        {unfiled > 0 && (
          <Row
            icon="map-marker-off-outline"
            label={`${unfiled} item${unfiled === 1 ? ' has' : 's have'} no shelf`}
            hint="No count can reach them. File them from Inventory."
            divider={false}
          />
        )}
      </View>
    </View>
  );
}

/** Home's popup version. Help swaps in place, so no sheet opens on a sheet. */
export function ShelfCheckSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  // Navigating under an open modal leaves it stuck on top; wait for it to go.
  const pending = useRef<Href | null>(null);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setHelp(false);
        onClose();
      }}
      onDismiss={() => {
        setHelp(false);
        const to = pending.current;
        pending.current = null;
        if (to) router.push(to);
      }}
      title={help ? 'How shelf checks work' : 'Check a shelf'}
      subtitle={help ? undefined : 'Fix the count of food already on a shelf.'}
    >
      {help ? (
        <>
          <ShelfCheckHelp />
          <Button label="Back" variant="secondary" block className="rounded-md" onPress={() => setHelp(false)} />
        </>
      ) : (
        <ShelfCheckContent
          go={to => {
            pending.current = to;
            onClose();
          }}
          onHelp={() => setHelp(true)}
        />
      )}
    </Sheet>
  );
}
