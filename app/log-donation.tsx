import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { SAMPLE_PRESETS, processImageScan } from '../lib/ai_vision';
import { usePantryStore } from '../lib/store';

export default function LogDonationScreen() {
  const router = useRouter();
  const setDraft = usePantryStore(state => state.setDraft);

  const [selectedPreset, setSelectedPreset] = useState<string>(SAMPLE_PRESETS[0].id);
  const [photoCount, setPhotoCount] = useState<number>(2);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const handleDetectItems = () => {
    setIsAnalyzing(true);

    setTimeout(() => {
      const candidates = processImageScan(selectedPreset);
      setDraft(candidates as any);
      setIsAnalyzing(false);
      router.push('/review-verify');
    }, 1200);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.cameraBox}>
        <MaterialCommunityIcons name="camera" size={48} color={COLORS.primaryLight} />
        <Text style={styles.cameraTitle}>Simulated Camera Scanner</Text>
        <Text style={styles.cameraSub}>Point phone camera at donation bags, boxes, or shelf items</Text>

        <View style={styles.photoCounterBadge}>
          <MaterialCommunityIcons name="image-multiple" size={16} color={COLORS.textOnPrimary} />
          <Text style={styles.photoCounterText}>{photoCount} Photos Attached</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.addPhotoBtn}
        onPress={() => setPhotoCount(prev => prev + 1)}
      >
        <MaterialCommunityIcons name="camera-plus-outline" size={20} color={COLORS.primaryDark} />
        <Text style={styles.addPhotoBtnText}>Take Another Photo (Label / Close-up)</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Select Sample Donation Scenario</Text>
      {SAMPLE_PRESETS.map(preset => (
        <TouchableOpacity
          key={preset.id}
          style={[styles.presetCard, selectedPreset === preset.id && styles.presetCardActive]}
          onPress={() => setSelectedPreset(preset.id)}
        >
          <View style={styles.presetHeader}>
            <Text style={styles.presetTitle}>{preset.name}</Text>
            {selectedPreset === preset.id && (
              <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primaryLight} />
            )}
          </View>
          <Text style={styles.presetDesc}>{preset.description}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.detectBtn}
        onPress={handleDetectItems}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <>
            <MaterialCommunityIcons name="auto-fix" size={22} color={COLORS.textOnPrimary} />
            <Text style={styles.detectBtnText}>Detect Items with AI Vision</Text>
          </>
        )}
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
  cameraBox: {
    height: 200,
    backgroundColor: '#FAF1E8',
    borderRadius: RADII.lg,
    borderWidth: 2,
    borderColor: COLORS.primaryLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.md,
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
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
  photoCounterBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  photoCounterText: {
    color: COLORS.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  addPhotoBtn: {
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  addPhotoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryDark,
    marginLeft: SPACING.xs,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
  },
  presetCard: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  presetCardActive: {
    borderColor: COLORS.primaryLight,
    borderWidth: 2,
    backgroundColor: '#FFF9F6',
  },
  presetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  presetDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  detectBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
    minHeight: SPACING.touch,
  },
  detectBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
    marginLeft: SPACING.xs,
  },
});
