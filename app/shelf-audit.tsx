import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { COLORS, RULE_BELOW } from '../constants/theme';
import { FadeInUp, PRESS_SCALE_ROW, Tappable } from '../components/motion';
import { Button, Card, EmptyState, InfoLabel, Row, Screen, Sheet, Text } from '../components/ui';
import { cueTap } from '../lib/feedback';
import { usePantryStore } from '../lib/store';
import { orderShelves } from '../lib/shelves';

/**
 * Counting a shelf.
 *
 * Pick the shelf, photograph it with the same camera as Scan donations, and
 * the reading goes to audit-review, which reconciles rather than inserts: the
 * count replaces what this one shelf says, and nothing is written until a
 * volunteer confirms each line. The how-to lives in a popup, not on the page.
 */
export default function ShelfAuditScreen() {
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const { locations, inventory, setAuditDraft } = usePantryStore();
  const shelves = orderShelves(locations);
  const [locationId, setLocationId] = useState<string | null>(shelves[0]?.loc.id ?? null);
  const [helpOpen, setHelpOpen] = useState(false);

  const selected = shelves.find(s => s.loc.id === locationId) ?? null;
  const unfiled = inventory.filter(i => !i.location_id).length;

  const photograph = () => {
    if (!locationId) return;
    cueTap();
    router.push({ pathname: '/log-donation', params: { mode: 'audit', location: locationId } });
  };

  const byHand = () => {
    if (!locationId) return;
    setAuditDraft({ locationId, photos: 0, counted: [] });
    router.push('/audit-review');
  };

  if (locations.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="bookshelf"
          title="No shelves yet"
          body="A count is a count of a shelf. Add your shelves on the Inventory tab first."
          actionLabel="Set up shelves"
          actionVariant="primary"
          onAction={() => router.replace('/(tabs)/inventory')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View className="gap-1 px-1 pt-1">
        <Text variant="title" className="font-bold">Check shelf inventory</Text>
        <Text variant="label" tone="soft">Correct the count of stock already here. Add new donations through intake.</Text>
      </View>

      <FadeInUp index={1}>
        <Card className="gap-2">
          <InfoLabel
            variant="body"
            label="Which shelf?"
            tip="The count replaces what this shelf says. Every other shelf is left alone."
          />
          <View className="mt-1">
            {shelves.map(({ loc, label, depth }, i) => {
              const active = loc.id === locationId;
              const items = inventory.filter(x => x.location_id === loc.id);
              const units = items.reduce((sum, x) => sum + x.count, 0);
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
                  className={`min-h-[56px] flex-row items-center gap-3 py-2.5 ${depth === 1 ? 'pl-6' : ''}`}
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
                    {items.length === 0 ? 'empty' : `${units} unit${units === 1 ? '' : 's'}`}
                  </Text>
                </Tappable>
              );
            })}
          </View>
        </Card>
      </FadeInUp>

      <FadeInUp index={2}>
        <View className="gap-3">
          <Button
            label={selected ? `Photograph ${selected.loc.name}` : 'Photograph the shelf'}
            block
            className="rounded-md"
            disabled={!locationId}
            icon={<MaterialCommunityIcons name="camera-outline" size={20} color={COLORS.textOnPrimary} />}
            onPress={photograph}
          />
          <Button
            label="Count by hand instead"
            variant="secondary"
            block
            className="rounded-md"
            disabled={!locationId}
            onPress={byHand}
          />
          <Tappable
            onPress={() => {
              cueTap();
              setHelpOpen(true);
            }}
            accessibilityRole="button"
            className="min-h-[44px] flex-row items-center justify-center gap-1.5"
          >
            <MaterialCommunityIcons name="help-circle-outline" size={17} color={COLORS.primary} />
            <Text variant="label" tone="brand" className="font-bold">
              How shelf checks work
            </Text>
          </Tappable>
        </View>
      </FadeInUp>

      <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="How shelf checks work">
        <Text variant="body">If 12 cans are recorded but you count 9, approving the count saves a −3 correction. It does not record food given out.</Text>
        <View>
          <Row
            icon="camera-retake-outline"
            label="Shoot in overlapping strips"
            hint="Left, middle, right. A gap is stock the count will miss."
          />
          <Row
            icon="eye-off-outline"
            label="Pull the front row forward"
            hint="Anything hidden behind it comes back short."
          />
          <Row
            icon="numeric"
            label="Every number is editable"
            hint="The photos are a first draft. Fix anything on the next screen."
          />
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
        <Text variant="micro" tone="soft">
          A count can lower numbers and take items off this shelf. Those corrections are kept apart
          from what you give out, so your reports stay right.
        </Text>
      </Sheet>
    </Screen>
  );
}
