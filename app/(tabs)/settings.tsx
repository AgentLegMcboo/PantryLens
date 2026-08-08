import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  Switch,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { KeyboardScreen } from '../../components/keyboard-screen';
import {
  getFeedbackPrefs,
  setHapticsEnabled,
  setSoundEnabled,
} from '../../lib/feedback';
import { BoxRules, usePantryStore } from '../../lib/store';

export default function SettingsScreen() {
  const initialPrefs = getFeedbackPrefs();
  const [haptics, setHaptics] = useState(initialPrefs.hapticsEnabled);
  const [sound, setSound] = useState(initialPrefs.soundEnabled);

  const { settings, boxRules, thresholds, updateSettings, updateBoxRules, updateThresholds, signOut } =
    usePantryStore();

  const [pantryName, setPantryName] = useState(settings.pantryName);
  const [savingName, setSavingName] = useState(false);

  // The field is seeded from the store, which is empty until the pantry loads.
  useEffect(() => {
    setPantryName(settings.pantryName);
  }, [settings.pantryName]);

  const handleSavePantryName = async () => {
    const trimmed = pantryName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'A pantry needs a name your volunteers will recognise.');
      return;
    }

    setSavingName(true);
    try {
      await updateSettings({ pantryName: trimmed });
      Alert.alert('Saved', 'Everyone in this pantry will see the new name.');
    } catch (err: any) {
      // Admin-only under RLS, so a volunteer tapping Save gets told why.
      Alert.alert(
        'Could not save',
        err?.message?.includes('policy')
          ? 'Only a pantry admin can rename the pantry.'
          : err?.message ?? 'Please try again.',
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleSettingChange = async (updates: Parameters<typeof updateSettings>[0]) => {
    try {
      await updateSettings(updates);
    } catch (err: any) {
      Alert.alert('Could not save', err?.message ?? 'Please try again.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You will need to sign in again to reach this pantry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };


  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  return (
    <KeyboardScreen style={styles.container} contentContainerStyle={styles.content}>
      {/* Pantry Profile */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pantry Profile</Text>
        <Text style={styles.label}>Pantry Account Name</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={pantryName}
            onChangeText={setPantryName}
          />
          <TouchableOpacity
            style={[styles.saveBtn, savingName && { opacity: 0.6 }]}
            onPress={handleSavePantryName}
            disabled={savingName}
          >
            {savingName ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Box Rules Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Feel & Sound</Text>
        <Text style={styles.cardSub}>
          Sound is off by default — a pantry back room is loud and the phone is often shared.
        </Text>

        <View style={styles.feedbackRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleLabel}>Haptic feedback</Text>
            <Text style={styles.feedbackHint}>A light tick when you tap or confirm.</Text>
          </View>
          <Switch
            value={haptics}
            onValueChange={v => { setHaptics(v); setHapticsEnabled(v); }}
            trackColor={{ true: COLORS.secondary, false: COLORS.borderSoft }}
          />
        </View>

        <View style={styles.feedbackRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ruleLabel}>Sound effects</Text>
            <Text style={styles.feedbackHint}>Soft confirmation tones when something is saved.</Text>
          </View>
          <Switch
            value={sound}
            onValueChange={v => { setSound(v); setSoundEnabled(v); }}
            trackColor={{ true: COLORS.secondary, false: COLORS.borderSoft }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Box Target Rules</Text>
        <Text style={styles.cardSub}>Number of items per category required for 1 standard family box (4 people):</Text>

        {categories.map(cat => (
          <View key={cat} style={styles.ruleRow}>
            <Text style={styles.ruleLabel}>{cat.toUpperCase()}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => updateBoxRules({ [cat]: Math.max(0, boxRules[cat] - 1) })}
              >
                <MaterialCommunityIcons name="minus" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{boxRules[cat]}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => updateBoxRules({ [cat]: boxRules[cat] + 1 })}
              >
                <MaterialCommunityIcons name="plus" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Category Low Stock Thresholds */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Low Stock Warning Thresholds</Text>
        <Text style={styles.cardSub}>Minimum total stock count before a category turns red on the dashboard:</Text>

        {categories.map(cat => (
          <View key={cat} style={styles.ruleRow}>
            <Text style={styles.ruleLabel}>{cat.toUpperCase()}</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => updateThresholds({ [cat]: Math.max(1, thresholds[cat] - 1) })}
              >
                <MaterialCommunityIcons name="minus" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{thresholds[cat]}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => updateThresholds({ [cat]: thresholds[cat] + 1 })}
              >
                <MaterialCommunityIcons name="plus" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {/* Expiration Warning Window */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Expiration Warning Window</Text>
        <Text style={styles.cardSub}>Flag items as "Use First" if expiring within:</Text>

        <View style={styles.daysSelector}>
          {[14, 21, 30].map(days => (
            <TouchableOpacity
              key={days}
              style={[
                styles.dayChip,
                settings.expirationWarningDays === days && styles.dayChipActive
              ]}
              onPress={() => handleSettingChange({ expirationWarningDays: days })}
            >
              <Text style={[
                styles.dayChipText,
                settings.expirationWarningDays === days && styles.dayChipTextActive
              ]}>
                {days} Days
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Default Family Size */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Default Family Size</Text>
        <Text style={styles.cardSub}>
          What the dashboard and Build Boxes assume before anyone changes it:
        </Text>

        <View style={styles.daysSelector}>
          {[2, 4, 6].map(size => (
            <TouchableOpacity
              key={size}
              style={[styles.dayChip, settings.defaultFamilySize === size && styles.dayChipActive]}
              onPress={() => handleSettingChange({ defaultFamilySize: size })}
            >
              <Text
                style={[
                  styles.dayChipText,
                  settings.defaultFamilySize === size && styles.dayChipTextActive
                ]}
              >
                {size} People
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.cardSub}>
          Signed in to {settings.pantryName || 'this pantry'} as {settings.userRole}.
        </Text>

        <TouchableOpacity style={styles.resetBtn} onPress={handleSignOut}>
          <MaterialCommunityIcons name="logout" size={20} color={COLORS.statusCritical} />
          <Text style={styles.resetBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: COLORS.cardSurface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    paddingHorizontal: SPACING.sm,
    height: 44,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginRight: SPACING.sm,
  },
  saveBtn: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
  },
  feedbackHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F4EBE1',
  },
  ruleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
  },
  stepBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingHorizontal: 10,
  },
  daysSelector: {
    flexDirection: 'row',
    marginTop: SPACING.xs,
  },
  dayChip: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADII.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  dayChipActive: {
    backgroundColor: COLORS.primaryLight,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  dayChipTextActive: {
    color: COLORS.textOnPrimary,
  },
  resetBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDF3F2',
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.statusCritical,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  resetBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.statusCritical,
    marginLeft: SPACING.xs,
  },
});
