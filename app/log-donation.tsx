import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { PressableScale } from '../components/motion';
import { cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { processImageScan, ScanError } from '../lib/ai_vision';
import { usePantryStore } from '../lib/store';

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

export default function LogDonationScreen() {
  const router = useRouter();
  const setDraft = usePantryStore(state => state.setDraft);

  const [shots, setShots] = useState<Shot[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
      const candidates = await processImageScan(shots.map(s => s.base64));
      log.debug('scan', `navigating to review with ${candidates.length} draft row(s)`);
      // The photos travel with the draft: review draws the detection boxes back
      // onto them, so the item and the thing on the shelf stay connected.
      setDraft(
        candidates as any,
        shots.map(s => ({ uri: s.uri, width: s.width, height: s.height })),
      );
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {shots.length === 0 ? (
        <TouchableOpacity style={styles.cameraBox} onPress={handleTakePhoto} activeOpacity={0.85}>
          <MaterialCommunityIcons name="camera-outline" size={44} color={COLORS.primaryLight} />
          <Text style={styles.cameraTitle}>Photograph the donation</Text>
          <Text style={styles.cameraSub}>
            Lay items out so labels face the camera. Several photos from different angles read
            better than one wide shot.
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.grid}>
          {shots.map((shot, i) => (
            <View key={`${shot.uri}-${i}`} style={styles.thumbWrap}>
              <Image source={{ uri: shot.uri }} style={styles.thumb} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeShot(i)}
                hitSlop={8}
                accessibilityLabel={`Remove photo ${i + 1}`}
              >
                <MaterialCommunityIcons name="close" size={14} color={COLORS.textOnPrimary} />
              </TouchableOpacity>
            </View>
          ))}

          {!atLimit && (
            <TouchableOpacity style={styles.addTile} onPress={handleTakePhoto}>
              <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.primaryLight} />
              <Text style={styles.addTileText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.sourceRow}>
        <TouchableOpacity
          style={[styles.sourceBtn, atLimit && styles.sourceBtnDisabled]}
          onPress={handleTakePhoto}
          disabled={atLimit || isAnalyzing}
        >
          <MaterialCommunityIcons name="camera-outline" size={20} color={COLORS.primaryDark} />
          <Text style={styles.sourceBtnText}>Camera</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.sourceBtn, atLimit && styles.sourceBtnDisabled]}
          onPress={handlePickFromLibrary}
          disabled={atLimit || isAnalyzing}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={20} color={COLORS.primaryDark} />
          <Text style={styles.sourceBtnText}>Photo library</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.counterText}>
        {shots.length === 0
          ? `Up to ${MAX_PHOTOS} photos per donation.`
          : atLimit
            ? `${MAX_PHOTOS} photos — that's the limit for one scan.`
            : `${shots.length} of ${MAX_PHOTOS} photos attached.`}
      </Text>

      {/* Dimmed when there is nothing to scan, but deliberately still pressable:
          a disabled button swallows the tap and teaches the volunteer nothing.
          Pressing it says what is missing instead. Only a scan already in
          flight actually blocks the press. */}
      <PressableScale
        style={[styles.detectBtn, (shots.length === 0 || isAnalyzing) && styles.detectBtnDisabled] as any}
        cue="press"
        onPress={handleDetectItems}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <>
            <ActivityIndicator color={COLORS.textOnPrimary} />
            <Text style={styles.detectBtnText}>Reading labels…</Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="auto-fix" size={22} color={COLORS.textOnPrimary} />
            <Text style={styles.detectBtnText}>Detect items with AI</Text>
          </>
        )}
      </PressableScale>

      <View style={styles.noteBox}>
        <MaterialCommunityIcons name="shield-check-outline" size={16} color={COLORS.textSecondary} />
        <Text style={styles.noteText}>
          Nothing is saved yet. You'll check and correct every line before it reaches inventory.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  cameraBox: {
    height: 200,
    backgroundColor: '#FAF1E8',
    borderRadius: RADII.lg,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cameraTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.xs,
  },
  cameraSub: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  thumbWrap: {
    width: '31%',
    aspectRatio: 1,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: RADII.md,
    backgroundColor: COLORS.surfaceVariant,
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: RADII.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.primaryLight,
    backgroundColor: '#FAF1E8',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  addTileText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  sourceBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    minHeight: SPACING.touch,
  },
  sourceBtnDisabled: { opacity: 0.45 },
  sourceBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  counterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  detectBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    minHeight: SPACING.touch,
  },
  detectBtnDisabled: { opacity: 0.45 },
  detectBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textSecondary,
  },
});
