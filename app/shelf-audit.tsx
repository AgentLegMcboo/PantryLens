import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { CaptureCard, PhotoGrid } from '../components/photo-capture';
import { Button, Card, CardHeader, EmptyState, Panel, Row, Screen, Text } from '../components/ui';
import { processImageScan, ScanError } from '../lib/ai_vision';
import type { CountedRow } from '../lib/audit';
import { startScan, uploadScanPhotos } from '../lib/scan-history';
import { cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { usePantryStore } from '../lib/store';

const MAX_SHOTS = 6;

/**
 * Counting a shelf.
 *
 * This screen used to offer five hardcoded shelf names that matched nothing in
 * the pantry, and then hand its results to the intake flow — which inserted
 * them. "Re-counting" Shelf A added a second Shelf A on top of the first, while
 * the screen promised the count would "replace what is on the shelf".
 *
 * Now the scope is a real place from the pantry's own list, because an audit's
 * authority comes entirely from its scope: having counted Shelf A you may say
 * "Shelf A holds exactly this", and that claim is meaningless if "Shelf A" is a
 * string nothing else in the app has ever heard of.
 *
 * The count itself goes to audit-review, which reconciles rather than inserts.
 */
export default function ShelfAuditScreen() {
  const router = useRouter();
  const { locations, inventory, settings, setAuditDraft, setCurrentScan } = usePantryStore();

  const [locationId, setLocationId] = useState<string | null>(locations[0]?.id ?? null);
  const [shots, setShots] = useState<PreparedPhoto[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const atLimit = shots.length >= MAX_SHOTS;
  const selected = locations.find(l => l.id === locationId) ?? null;

  const onShelf = inventory.filter(i => i.location_id === locationId);
  const unitsOnShelf = onShelf.reduce((sum, i) => sum + i.count, 0);
  const unfiled = inventory.filter(i => !i.location_id).length;

  const handleTakePhoto = async () => {
    if (atLimit) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'PantryLens uses the camera to re-count what is on the shelf. Turn it on in Settings › PantryLens.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
      exif: false,
    });

    if (result.canceled) {
      log.debug('scan', 'shelf photo cancelled');
      return;
    }

    const prepared = (await Promise.all(result.assets.map(preparePhoto))).filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );
    if (prepared.length === 0) {
      log.warn('scan', 'no usable shelf photos came back from the picker');
      return;
    }

    cueTap();
    setShots(prev => [...prev, ...prepared].slice(0, MAX_SHOTS));
  };

  const removeShot = (index: number) => {
    cueTap();
    setShots(prev => prev.filter((_, i) => i !== index));
  };

  const toReview = (counted: CountedRow[], photos: number) => {
    setAuditDraft({ locationId: locationId!, photos, counted });
    router.push('/audit-review');
  };

  /**
   * Reads the shelf, then hands the counts to reconciliation.
   *
   * Nothing is written here and nothing is written by the next screen until a
   * volunteer confirms each line. An audit can delete stock, so the gap between
   * "the camera thinks" and "the books now say" has to have a person in it.
   */
  const handleRunAudit = async () => {
    if (!locationId) return;
    if (shots.length === 0) {
      log.warn('scan', 'audit pressed with no photos attached');
      cueWarn();
      Alert.alert('No photos yet', 'Photograph the shelf first, or count it by hand.');
      return;
    }
    if (isAuditing) return;

    log.debug('scan', `counting "${selected?.name}" from ${shots.length} photo(s)`);
    setIsAuditing(true);

    try {
      const startedAt = Date.now();
      const { candidates, photosRead, photosSent } = await processImageScan(
        shots.map(s => s.base64),
      );
      log.debug('scan', `count produced ${candidates.length} row(s)`);

      // A count is a scan too, and its accuracy is measured the same way.
      const record = await startScan({
        pantryId: settings.pantryId,
        mode: 'shelf_audit',
        photosSent,
        photosRead,
        durationMs: Date.now() - startedAt,
        candidates,
      });
      setCurrentScan(record);
      uploadScanPhotos(settings.pantryId, record?.scanId ?? null, shots);

      // On a count this matters far more than on an intake. An unread photo is
      // a section of shelf the count never saw — and on this screen, not seeing
      // something is what makes it look like it has gone missing.
      if (photosRead < photosSent) {
        cueWarn();
        Alert.alert(
          `Only read ${photosRead} of ${photosSent} photos`,
          'Part of the shelf is missing from this count, so anything in that part will look ' +
            'like it has disappeared. Re-shoot it, or check each line carefully.',
          [
            { text: 'Take more photos', style: 'cancel' },
            { text: 'Review anyway', onPress: () => toReview(candidates, shots.length) },
          ],
        );
        return;
      }

      toReview(candidates, shots.length);
    } catch (err) {
      log.error('scan', 'audit scan failed', err);
      cueWarn();
      const message =
        err instanceof ScanError
          ? err.message
          : 'Something went wrong reading the shelf.';
      Alert.alert('Could not read the shelf', message, [
        { text: 'Try again', style: 'cancel' },
        // The count still has to be possible when the camera is not. Going
        // through with an empty reading lists the shelf with every line at
        // zero, ready to be typed in.
        { text: 'Count by hand', onPress: () => toReview([], 0) },
      ]);
    } finally {
      setIsAuditing(false);
    }
  };

  if (locations.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="map-marker-off-outline"
          title="No shelves set up yet"
          body="A count has to be a count OF somewhere — that is what lets it say a shelf holds exactly this and nothing else. Add your shelves on the Inventory tab first."
          actionLabel="Set up shelves"
          actionVariant="primary"
          onAction={() => router.replace('/(tabs)/inventory')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FadeInUp index={0}>
        <Card>
          <CardHeader
            title="Which shelf are you counting?"
            subtitle="The count replaces what this shelf says. Everywhere else is left alone."
          />

          <View className="gap-2.5">
            {locations.map(place => {
              const active = place.id === locationId;
              const items = inventory.filter(x => x.location_id === place.id);
              const units = items.reduce((sum, x) => sum + x.count, 0);
              return (
                <Pressable
                  key={place.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    cueTap();
                    setLocationId(place.id);
                  }}
                  // The chosen shelf is outlined and tinted rather than ticked, so
                  // the one in play reads from across the room.
                  style={{
                    borderColor: active ? COLORS.primaryLight : COLORS.borderSoft,
                    backgroundColor: active ? 'rgba(188,90,60,0.07)' : COLORS.cardSurface,
                  }}
                  className="min-h-[60px] flex-row items-center gap-3 rounded-md border-2 px-3.5 py-2.5"
                >
                  <MaterialCommunityIcons
                    name={active ? 'check-circle' : 'circle-outline'}
                    size={24}
                    color={active ? COLORS.primaryLight : COLORS.borderStrong}
                  />
                  <View className="flex-1">
                    <Text variant="body" className="font-semibold">
                      {place.name}
                    </Text>
                    {/* What the books claim, so the scope is a number before a
                        single photo is taken. */}
                    <Text variant="micro" tone="soft" className="mt-0.5">
                      {items.length === 0
                        ? 'Nothing recorded here'
                        : `${units} unit${units === 1 ? '' : 's'} across ${items.length} item${
                            items.length === 1 ? '' : 's'
                          }`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>
      </FadeInUp>

      <FadeInUp index={1}>
        {shots.length === 0 ? (
          <CaptureCard
            title="Photograph the shelf"
            body="Overlapping shots — left, middle, right — so nothing between them is missed."
            disabled={isAuditing}
            onCamera={handleTakePhoto}
          />
        ) : (
          <PhotoGrid
            uris={shots.map(x => x.uri)}
            max={MAX_SHOTS}
            disabled={isAuditing}
            onRemove={removeShot}
            onAddCamera={handleTakePhoto}
          />
        )}
      </FadeInUp>

      <FadeInUp index={2}>
        <View className="gap-3">
          <Button
            label={isAuditing ? 'Reading the shelf…' : 'Count this shelf'}
            block
            loading={isAuditing}
            disabled={shots.length === 0}
            icon={
              <MaterialCommunityIcons
                name="clipboard-search-outline"
                size={20}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={handleRunAudit}
          />
          <Button
            label="Count by hand instead"
            variant="secondary"
            block
            onPress={() => locationId && toReview([], 0)}
          />

          <Text variant="micro" tone="soft" className="text-center">
            {shots.length === 0
              ? `Up to ${MAX_SHOTS} photos of ${selected?.name ?? 'this shelf'}.`
              : atLimit
                ? `${MAX_SHOTS} photos — that's the limit for one shelf.`
                : `${shots.length} of ${MAX_SHOTS} attached.`}
          </Text>
        </View>
      </FadeInUp>

      {/* The part people skip, kept short enough that they might not. Both
          halves are about the same thing: this is the one flow in the app that
          can take stock away, so it says what it can and cannot see. */}
      <FadeInUp index={3}>
        <Card className="gap-4">
          <CardHeader title="How to count a shelf" />

          <Row
            icon="camera-retake-outline"
            label="Shoot it in overlapping strips"
            hint="Left, middle, right, each overlapping the last. A gap between two photos is stock the count will think has vanished."
          />
          <Row
            icon="eye-off-outline"
            label="Pull the front row forward"
            hint="The camera only counts what it can see. Anything hidden behind the front row will come back short, and you will have to correct it by hand."
          />
          <Row
            icon="numeric"
            label="Every number is editable"
            hint="The photos are a first draft of the count, not the count. Fix anything that looks wrong on the next screen."
          />
          <Row
            icon="check-decagram-outline"
            label="Nothing is removed unless you say so"
            hint="Anything the camera did not see is shown as a question, never deleted for you."
            divider={false}
          />
        </Card>
      </FadeInUp>

      <FadeInUp index={4}>
        <Panel className="gap-3">
          <View className="flex-row gap-3">
            <MaterialCommunityIcons name="alert-outline" size={18} color={COLORS.statusWarning} />
            <Text variant="micro" tone="soft" className="flex-1">
              <Text variant="micro" className="font-bold">
                This is the one screen that can take stock away.
              </Text>{' '}
              Counting {selected?.name ?? 'a shelf'} can lower counts and remove items from it —
              that is what makes it a count rather than another delivery. Corrections are recorded
              separately from what you hand out, so they never inflate your give-out numbers.
            </Text>
          </View>

          {unfiled > 0 && (
            <View className="flex-row gap-3">
              <MaterialCommunityIcons
                name="map-marker-off-outline"
                size={18}
                color={COLORS.textSecondary}
              />
              <Text variant="micro" tone="soft" className="flex-1">
                {unfiled} item{unfiled === 1 ? '' : 's'} in this pantry {unfiled === 1 ? 'has' : 'have'}{' '}
                no shelf recorded, so no count will ever reach {unfiled === 1 ? 'it' : 'them'}. Give
                them a place on the Inventory tab to bring them in.
              </Text>
            </View>
          )}

          <View className="flex-row gap-3">
            <MaterialCommunityIcons
              name="clipboard-check-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text variant="micro" tone="soft" className="flex-1">
              {selected
                ? `The books say ${selected.name} holds ${unitsOnShelf} unit${
                    unitsOnShelf === 1 ? '' : 's'
                  }. You will see that against your count before anything is saved.`
                : 'Pick a shelf to see what the books claim is on it.'}
            </Text>
          </View>
        </Panel>
      </FadeInUp>
    </Screen>
  );
}
