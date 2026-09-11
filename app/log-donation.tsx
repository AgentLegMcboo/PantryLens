import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { Button, Chip, Screen, Text } from '../components/ui';
import { cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { processImageScan, ScanError } from '../lib/ai_vision';
import { SOURCE_ORG_LABELS, type SourceOrg, usePantryStore } from '../lib/store';

/**
 * Photographing a donation.
 *
 * Built on expo-image-picker rather than a camera view so it runs in Expo Go,
 * where custom native modules are not available.
 *
 * Every photo goes through preparePhoto before it reaches state — straight off
 * the picker a single shot is close to a megabyte of base64, which measured at
 * 24 seconds for one image and would pass the function's timeout at six.
 */

const MAX_PHOTOS = 6;
const PICKER_QUALITY = 0.6;

/** Exactly what preparePhoto returns — dimensions included, because the review
 *  overlay needs them to place detection boxes. */
type Shot = PreparedPhoto;

/** The same list bulk intake offers, so a donation reads the same either way in. */
const SOURCES: SourceOrg[] = ['grocery', 'food_bank', 'drive', 'individual', 'other'];

export default function LogDonationScreen() {
  const router = useRouter();
  const setDraft = usePantryStore(state => state.setDraft);
  const setDraftSource = usePantryStore(state => state.setDraftSource);

  const [shots, setShots] = useState<Shot[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /**
   * Who it came from.
   *
   * The pantry's process starts with "we receive donations from local groceries
   * or food banks", and bulk intake has always asked — but photographing a
   * donation, the path actually used most, threw that away. Grocery rescue and a
   * school food drive are different things to report on and different things to
   * thank.
   */
  const [sourceOrg, setSourceOrg] = useState<SourceOrg | null>(null);

  const addShots = async (assets: ImagePicker.ImagePickerAsset[]) => {
    // Shrunk before it ever reaches state, so what is held in memory and what is
    // uploaded are the same modest thing.
    const prepared = (await Promise.all(assets.map(preparePhoto))).filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );

    if (prepared.length === 0) {
      log.warn('scan', 'no usable photos came back from the picker');
      return;
    }

    cueTap();
    setShots(prev => [...prev, ...prepared].slice(0, MAX_PHOTOS));
  };

  const handleTakePhoto = async () => {
    if (shots.length >= MAX_PHOTOS) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    log.debug('scan', `camera permission: ${permission.status}`);
    if (!permission.granted) {
      // Denying twice makes this permanent on iOS, so say where to undo it.
      Alert.alert(
        'Camera access needed',
        'PantryLens uses the camera to read donation labels. Turn it on in Settings › PantryLens.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PICKER_QUALITY,
      base64: true,
      exif: false,
    });

    if (result.canceled) {
      log.debug('scan', 'camera cancelled');
      return;
    }
    await addShots(result.assets);
  };

  const handlePickFromLibrary = async () => {
    if (shots.length >= MAX_PHOTOS) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings › PantryLens to pick donation photos you already took.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PICKER_QUALITY,
      base64: true,
      exif: false,
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - shots.length,
    });

    if (result.canceled) {
      log.debug('scan', 'library picker cancelled');
      return;
    }
    await addShots(result.assets);
  };

  const removeShot = (index: number) => {
    cueTap();
    setShots(prev => prev.filter((_, i) => i !== index));
  };

  const handleDetectItems = async () => {
    // This used to return silently, which is exactly what a disabled-looking
    // button pressed with no photos attached feels like: nothing happens and
    // nothing explains why.
    if (shots.length === 0) {
      log.warn('scan', 'detect pressed with no photos attached');
      cueWarn();
      Alert.alert('No photos yet', 'Take a photo of the donation first, then detect items.');
      return;
    }
    if (isAnalyzing) {
      log.debug('scan', 'detect pressed while a scan was already running — ignored');
      return;
    }

    log.debug('scan', `detect pressed with ${shots.length} photo(s)`);
    setIsAnalyzing(true);

    try {
      const { candidates, photosRead, photosSent } = await processImageScan(
        shots.map(s => s.base64),
      );
      log.debug('scan', `navigating to review with ${candidates.length} draft row(s)`);
      // The photos travel with the draft: review draws the detection boxes back
      // onto them, so the item and the thing on the shelf stay connected.
      setDraft(
        candidates as any,
        shots.map(s => ({ uri: s.uri, width: s.width, height: s.height })),
      );
      setDraftSource(sourceOrg);

      // A photo that failed on its own must be said out loud. The rows from the
      // others are still worth having, but a volunteer who is not told will
      // assume everything in the pile made it onto the list.
      if (photosRead < photosSent) {
        cueWarn();
        Alert.alert(
          `Read ${photosRead} of ${photosSent} photos`,
          'One or more photos could not be read. Check the list, and re-shoot anything missing.',
          [{ text: 'Review the list', onPress: () => router.push('/review-verify') }],
        );
        return;
      }

      router.push('/review-verify');
    } catch (err) {
      log.error('scan', 'scan failed', err);
      cueWarn();
      // ScanError messages are written for the volunteer holding the phone.
      // Anything else is a bug, and saying so is more useful than a stack trace.
      const message =
        err instanceof ScanError
          ? err.message
          : 'Something went wrong while scanning. You can still add these items by hand.';
      Alert.alert('Could not scan', message, [
        { text: 'Add by hand', onPress: () => router.replace('/(tabs)/inventory') },
        { text: 'Try again', style: 'cancel' },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const atLimit = shots.length >= MAX_PHOTOS;

  return (
    <Screen>
      {shots.length === 0 ? (
        <Pressable onPress={handleTakePhoto}>
          <View className="h-56 items-center justify-center rounded-lg border-2 border-dashed border-brand-light bg-subtle px-8">
            <MaterialCommunityIcons name="camera-outline" size={40} color={COLORS.primaryLight} />
            <Text variant="heading" className="mt-3">
              Photograph the donation
            </Text>
            <Text variant="label" tone="soft" className="mt-2 text-center">
              Lay items out so the labels face the camera.
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
              className="aspect-square w-[30%] items-center justify-center rounded-md border-2 border-dashed border-brand-light bg-subtle"
            >
              <MaterialCommunityIcons name="camera-plus-outline" size={24} color={COLORS.primaryLight} />
            </Pressable>
          )}
        </View>
      )}

      <View className="gap-2">
        <Text variant="label" tone="soft" className="font-semibold">
          Where did this come from?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SOURCES.map(src => (
            <Chip
              key={src}
              label={SOURCE_ORG_LABELS[src]}
              selected={sourceOrg === src}
              onPress={() => setSourceOrg(sourceOrg === src ? null : src)}
            />
          ))}
        </View>
      </View>

      <View className="flex-row gap-3">
        <Button
          label="Camera"
          variant="secondary"
          size="compact"
          className="flex-1 justify-center"
          disabled={atLimit || isAnalyzing}
          onPress={handleTakePhoto}
        />
        <Button
          label="Photo library"
          variant="secondary"
          size="compact"
          className="flex-1 justify-center"
          disabled={atLimit || isAnalyzing}
          onPress={handlePickFromLibrary}
        />
      </View>

      <Button
        label={isAnalyzing ? 'Reading labels…' : 'Detect items'}
        block
        loading={isAnalyzing}
        disabled={shots.length === 0}
        icon={<MaterialCommunityIcons name="auto-fix" size={20} color={COLORS.textOnPrimary} />}
        onPress={handleDetectItems}
      />

      <Text variant="micro" tone="soft" className="text-center">
        {shots.length === 0
          ? `Up to ${MAX_PHOTOS} photos. Several close shots beat one wide one.`
          : atLimit
            ? `${MAX_PHOTOS} photos — that's the limit for one scan.`
            : `${shots.length} of ${MAX_PHOTOS} attached. A big pile reads better in sections.`}
      </Text>

      <Text variant="micro" tone="soft" className="text-center">
        Nothing is saved yet — you check every line before it reaches inventory.
      </Text>
    </Screen>
  );
}
