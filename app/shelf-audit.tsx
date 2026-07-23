import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../constants/theme';
import { usePantryStore } from '../lib/store';

export default function ShelfAuditScreen() {
  const router = useRouter();
  const { addItems } = usePantryStore();

  const [section, setSection] = useState('Canned Goods (Shelf A)');
  const [photoStep, setPhotoStep] = useState<number>(3);
  const [isAuditing, setIsAuditing] = useState(false);

  const sections = [
    'Canned Goods (Shelf A)',
    'Dry Grains & Rice (Shelf B)',
    'Breakfast & Cereals (Shelf C)',
    'Proteins & Beans (Shelf D)',
    'Hygiene & Baby Products'
  ];

  const handleRunAudit = () => {
    setIsAuditing(true);

    setTimeout(() => {
      setIsAuditing(false);
      // Simulated corrected items from shelf section photo capture
      addItems([
        { name: 'Canned Sweet Corn (15 oz)', category: 'vegetable', count: 18, expiration: '2026-11-10' },
        { name: 'Canned Green Beans (14.5 oz)', category: 'vegetable', count: 12, expiration: '2026-08-15' }
      ], 'shelf_audit');

      Alert.alert(
        'Audit Completed!',
        `Stock counts for "${section}" have been updated in inventory.`,
        [{ text: 'View Inventory', onPress: () => router.replace('/(tabs)/inventory') }]
      );
    }, 1200);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <MaterialCommunityIcons name="format-list-checks" size={32} color={COLORS.secondary} />
        <Text style={styles.headerTitle}>Shelf Audit Mode</Text>
        <Text style={styles.headerSub}>
          Donations ADD stock. Shelf Audits CORRECT existing stock to keep your inventory accurate over time.
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
        <View style={styles.photoRow}>
          {['Left View', 'Center View', 'Right View'].map((stepName, i) => (
            <View key={i} style={styles.photoStepCard}>
              <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.primaryLight} />
              <Text style={styles.photoStepText}>{stepName}</Text>
              <MaterialCommunityIcons name="check" size={16} color={COLORS.statusGood} />
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.auditBtn}
        onPress={handleRunAudit}
        disabled={isAuditing}
      >
        <MaterialCommunityIcons name="check-decagram" size={22} color={COLORS.textOnPrimary} />
        <Text style={styles.auditBtnText}>
          {isAuditing ? 'Processing Audit Photos...' : 'Complete Audit & Sync Stock'}
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
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
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
