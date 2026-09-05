import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { FadeInUp } from '../components/motion';
import { Button, Card, CardHeader, Panel, Screen, Text } from '../components/ui';
import { processImageScan, ScanError } from '../lib/ai_vision';
import { cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { usePantryStore } from '../lib/store';

const MAX_SHOTS = 6;

const SECTIONS = [
  'Canned goods (Shelf A)',
  'Dry grains & rice (Shelf B)',
  'Breakfast & cereals (Shelf C)',
  'Proteins & beans (Shelf D)',
  'Hygiene & baby products',
];

/**
 * Re-counting a shelf.
 *
 * Built to look and work like Log Donation, because it is the same act: point
 * the camera at food, check what came back, write it down. It used to be a
 * different screen entirely — a green header block, chunky shelf rows with
 * their own card shadow, and three "Left / Center / Right" slots that showed a
 * green tick before a single photo had been taken.
 *
 * The photo grid is now the one from Log Donation, so a volunteer who has
 * scanned a donation already knows how this works.
 */
export default function ShelfAuditScreen() {
  const router = useRouter();
  const setDraft = usePantryStore(state => state.setDraft);

  const [section, setSection] = useState(SECTIONS[0]);
  const [shots, setShots] = useState<PreparedPhoto[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const atLimit = shots.length >= MAX_SHOTS;

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

  /**
   * Runs the same analyzer as a donation, then hands the result to the review
   * screen tagged as an audit.
   *
   * This used to insert two hardcoded cans of corn and green beans into whatever
   * real pantry was signed in, and report it as a completed audit. A demo that
   * writes fiction into live inventory is worse than one that does nothing.
   */
  const handleRunAudit = async () => {
    if (shots.length === 0) {
      log.warn('scan', 'audit pressed with no photos attached');
      cueWarn();
      Alert.alert('No photos yet', 'Photograph the shelf first, then read the counts.');
      return;
    }
    if (isAuditing) return;

    log.debug('scan', `audit pressed for "${section}" with ${shots.length} photo(s)`);
    setIsAuditing(true);

    try {
      const { candidates, photosRead, photosSent } = await processImageScan(
        shots.map(s => s.base64),
      );
      log.debug('scan', `audit produced ${candidates.length} draft row(s)`);
      setDraft(
        candidates as any,
        shots.map(s => ({ uri: s.uri, width: s.width, height: s.height })),
      );

      const toReview = () =>
        router.push({ pathname: '/review-verify', params: { source: 'shelf_audit' } });

      // On an audit this matters more than on an intake: an unread photo means a
      // whole section of shelf silently missing from the re-count.
      if (photosRead < photosSent) {
        cueWarn();
        Alert.alert(
          `Read ${photosRead} of ${photosSent} photos`,
          'One or more photos could not be read, so part of the shelf is missing from this count. Re-shoot it before you save.',
          [{ text: 'Review the counts', onPress: toReview }],
        );
        return;
      }

      toReview();
    } catch (err) {
      log.error('scan', 'audit scan failed', err);
      cueWarn();
      const message =
        err instanceof ScanError
          ? err.message
          : 'Something went wrong reading the shelf. You can still correct counts by hand.';
      Alert.alert('Could not read the shelf', message, [
        { text: 'Correct by hand', onPress: () => router.replace('/(tabs)/inventory') },
        { text: 'Try again', style: 'cancel' },
      ]);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <Screen>
      <FadeInUp index={0}>
        <Card>
          <CardHeader
            title="Which shelf?"
            subtitle="Rows land tagged as an audit, so you can tell a re-count from an intake."
          />

          {SECTIONS.map((sec, i) => {
            const active = sec === section;
            return (
              <Pressable
                key={sec}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  cueTap();
                  setSection(sec);
                }}
                className={`min-h-[56px] flex-row items-center gap-3 py-2 ${
                  i === SECTIONS.length - 1 ? '' : 'border-b border-hairline'
                }`}
              >
                <MaterialCommunityIcons
                  name={active ? 'radiobox-marked' : 'radiobox-blank'}
                  size={24}
                  color={active ? COLORS.primaryLight : COLORS.borderStrong}
                />
                <Text
                  variant="body"
                  tone={active ? 'default' : 'soft'}
                  className={active ? 'flex-1 font-semibold' : 'flex-1'}
                >
                  {sec}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      </FadeInUp>

      {/* Same grid as Log Donation. Two screens that do the same thing should
          not need to be learned twice. */}
      <FadeInUp index={1}>
        {shots.length === 0 ? (
          <Pressable onPress={handleTakePhoto}>
            <View className="h-56 items-center justify-center rounded-lg border-2 border-dashed border-brand-light bg-subtle px-8">
              <MaterialCommunityIcons name="camera-outline" size={40} color={COLORS.primaryLight} />
              <Text variant="heading" className="mt-3">
                Photograph the shelf
              </Text>
              <Text variant="label" tone="soft" className="mt-2 text-center">
                Three overlapping shots — left, middle, right — so cans hiding behind the front
                row still get counted.
              </Text>
            </View>
          </Pressable>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {shots.map((shot, i) => (
              <View key={`${shot.uri}-${i}`} className="aspect-square w-[30%]">
                <Image source={{ uri: shot.uri }} className="h-full w-full rounded-md bg-muted" />
                <Pressable
                  onPress={() => removeShot(i)}
                  hitSlop={8}
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  className="absolute -right-2 -top-2 h-7 w-7 items-center justify-center rounded-full bg-ink"
                >
                  <MaterialCommunityIcons name="close" size={14} color={COLORS.textOnPrimary} />
                </Pressable>
              </View>
            ))}

            {!atLimit && (
              <Pressable
                onPress={handleTakePhoto}
                accessibilityLabel="Take another photo"
                className="aspect-square w-[30%] items-center justify-center rounded-md border-2 border-dashed border-brand-light bg-subtle"
              >
                <MaterialCommunityIcons
                  name="camera-plus-outline"
                  size={24}
                  color={COLORS.primaryLight}
                />
              </Pressable>
            )}
          </View>
        )}
      </FadeInUp>

      <FadeInUp index={2}>
        <View className="gap-3">
          <Button
            label={isAuditing ? 'Reading the shelf…' : 'Read the shelf'}
            block
            loading={isAuditing}
            disabled={shots.length === 0}
            icon={
              <MaterialCommunityIcons
                name="check-decagram"
                size={20}
                color={COLORS.textOnPrimary}
              />
            }
            onPress={handleRunAudit}
          />

          <Text variant="micro" tone="soft" className="text-center">
            {shots.length === 0
              ? `Up to ${MAX_SHOTS} photos of ${section.toLowerCase()}.`
              : atLimit
                ? `${MAX_SHOTS} photos — that's the limit for one shelf.`
                : `${shots.length} of ${MAX_SHOTS} attached.`}
          </Text>
        </View>
      </FadeInUp>

      <FadeInUp index={3}>
        <Panel className="flex-row gap-3">
          <MaterialCommunityIcons
            name="information-outline"
            size={18}
            color={COLORS.textSecondary}
          />
          <Text variant="micro" tone="soft" className="flex-1">
            Nothing is written yet — you check every count before it replaces what is on the shelf.
          </Text>
        </Panel>
      </FadeInUp>
    </Screen>
  );
}
