import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { COLORS, RADII, SPACING } from '../../constants/theme';
import { BoxRules, usePantryStore } from '../../lib/store';

export default function SettingsScreen() {
  const { settings, boxRules, thresholds, updateSettings, updateBoxRules, updateThresholds, resetToDefaults } = usePantryStore();

  const [pantryName, setPantryName] = useState(settings.pantryName);

  const handleSavePantryName = () => {
    updateSettings({ pantryName });
    Alert.alert('Saved!', 'Pantry name updated successfully.');
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset Demo Data?',
      'This will restore sample inventory, box rules, and settings to original defaults.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetToDefaults();
            setPantryName('Grace Community Food Pantry');
            Alert.alert('Reset Complete', 'Store has been reloaded with initial demo data.');
          }
        }
      ]
    );
  };

  const categories = Object.keys(boxRules) as (keyof BoxRules)[];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
          <TouchableOpacity style={styles.saveBtn} onPress={handleSavePantryName}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Box Rules Configuration */}
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
              onPress={() => updateSettings({ expirationWarningDays: days })}
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

      {/* Reset Data */}
      <TouchableOpacity style={styles.resetBtn} onPress={handleResetData}>
        <MaterialCommunityIcons name="refresh" size={20} color={COLORS.statusCritical} />
        <Text style={styles.resetBtnText}>Reset All Demo Data to Defaults</Text>
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
