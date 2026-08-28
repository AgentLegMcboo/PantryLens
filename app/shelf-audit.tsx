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
import { CARD_ELEVATION, COLORS, RADII, SPACING } from '../constants/theme';
import { processImageScan, ScanError } from '../lib/ai_vision';
import { cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { usePantryStore } from '../lib/store';

const SHOT_LABELS = ['Left view', 'Center view', 'Right view'];
const MAX_SHOTS = 6;

export default function ShelfAuditScreen() {
  const router = useRouter();
  const setDraft = usePantryStore(state => state.setDraft);

  const [section, setSection] = useState('Canned Goods (Shelf A)');
  const [shots, setShots] = useState<PreparedPhoto[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const sections = [
    'Canned Goods (Shelf A)',
    'Dry Grains & Rice (Shelf B)',
    'Breakfast & Cereals (Shelf C)',
    'Proteins & Beans (Shelf D)',
    'Hygiene & Baby Products'
  ];

  const handleTakePhoto = async () => {
    if (shots.length >= MAX_SHOTS) return;

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
      const candidates = await processImageScan(shots.map(s => s.base64));
      log.debug('scan', `audit produced ${candidates.length} draft row(s)`);
      setDraft(
        candidates as any,
        shots.map(s => ({ uri: s.uri, width: s.width, height: s.height })),
      );
      router.push({ pathname: '/review-verify', params: { source: 'shelf_audit' } });
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <MaterialCommunityIcons name="format-list-checks" size={32} color={COLORS.secondary} />
        <Text style={styles.headerTitle}>Shelf Audit Mode</Text>
        <Text style={styles.headerSub}>
          Photograph a shelf to re-count what is actually on it. You'll check every line before it
          is written, and rows land tagged as an audit so you can tell a re-count from an intake.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Select Shelf Section</Text>
      {sections.map(sec => (
        <TouchableOpacity
          key={sec}
          style={[styles.secChip, section === sec && styles.secChipActive]}
          onPress={() => setSection(sec)}
        >
          <Text style={[styles.secChipText, section === sec && styles.secChipTextActive]}>{sec}</Text>
          {section === sec && (
            <MaterialCommunityIcons name="check-circle" size={18} color={COLORS.primaryLight} />
          )}
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Guided Multi-Photo Capture</Text>
      <View style={styles.guidanceBox}>
        <Text style={styles.guidanceText}>
          Take 3 overlapping photos (Left, Middle, Right) so hidden cans behind front rows aren't missed:
        </Text>
        {/* The three slots fill as photos are actually taken. They used to show
            a green tick from the moment the screen opened, before anything had
            been photographed. */}
        <View style={styles.photoRow}>
          {SHOT_LABELS.map((stepName, i) => {
            const shot = shots[i];
            return (
              <TouchableOpacity
                key={stepName}
                style={styles.photoStepCard}
                onPress={handleTakePhoto}
                disabled={isAuditing}
              >
                {shot ? (
                  <Image source={{ uri: shot.uri }} style={styles.photoThumb} />
                ) : (
                  <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.primaryLight} />
                )}
                <Text style={styles.photoStepText}>{stepName}</Text>
                <MaterialCommunityIcons
                  name={shot ? 'check' : 'circle-outline'}
                  size={16}
                  color={shot ? COLORS.statusGood : COLORS.borderSoft}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.addShotBtn}
          onPress={handleTakePhoto}
          disabled={shots.length >= MAX_SHOTS || isAuditing}
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.addShotText}>
            {shots.length === 0
              ? 'Take the first photo'
              : shots.length >= MAX_SHOTS
                ? `${MAX_SHOTS} photos — that's the limit`
                : `Add another (${shots.length} taken)`}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.auditBtn, (shots.length === 0 || isAuditing) && { opacity: 0.45 }]}
        onPress={handleRunAudit}
        // Dimmed without photos but still pressable, so the tap explains itself.
        disabled={isAuditing}
      >
        {isAuditing ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <MaterialCommunityIcons name="check-decagram" size={22} color={COLORS.textOnPrimary} />
        )}
        <Text style={styles.auditBtnText}>
          {isAuditing ? 'Reading the shelf…' : 'Read Shelf & Review Counts'}
        </Text>
      </TouchableOpacity>
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
  headerBox: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    ...CARD_ELEVATION,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  secChip: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    ...CARD_ELEVATION,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  secChipActive: {
    borderColor: COLORS.primaryLight,
    backgroundColor: '#FFF9F6',
  },
  secChipText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  secChipTextActive: {
    fontWeight: '700',
    color: COLORS.primaryDark,
  },
  guidanceBox: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    ...CARD_ELEVATION,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  guidanceText: {
    fontSize: 13,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  photoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  photoStepCard: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADII.sm,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: 8,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  photoThumb: {
    width: 34,
    height: 34,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surfaceVariant,
  },
  addShotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
    minHeight: 44,
  },
  addShotText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryDark,
  },
  photoStepText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  auditBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: SPACING.touch,
  },
  auditBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
});
