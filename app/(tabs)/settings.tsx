import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import { KeyboardScreen } from '../../components/keyboard-screen';
import { FadeInUp } from '../../components/motion';
import {
  Button,
  Card,
  CardHeader,
  categoryIcon,
  Input,
  Row,
  Segmented,
  Stepper,
  Text,
  Toggle,
} from '../../components/ui';
import { getFeedbackPrefs, setHapticsEnabled, setSoundEnabled } from '../../lib/feedback';
import { BoxRules, usePantryStore } from '../../lib/store';

/**
 * Pantry settings.
 *
 * Seven cards of stacked label-and-control pairs, each drawn slightly
 * differently — 32px steppers here, a full-width chip row there, a red Sign Out
 * slab at the bottom — which is how a settings page ends up reading as a
 * spreadsheet nobody wants to scroll.
 *
 * It is the same seven groups, but every line is now the same `Row` at the same
 * height with the same divider, and every control is the one the rest of the app
 * uses. The two numeric groups are the ones a volunteer will actually change, so
 * they get the full 44px stepper rather than the cramped one they had.
 */
export default function SettingsScreen() {
  const initialPrefs = getFeedbackPrefs();
  const [haptics, setHaptics] = useState(initialPrefs.hapticsEnabled);
  const [sound, setSound] = useState(initialPrefs.soundEnabled);

  const {
    settings,
    boxRules,
    thresholds,
    updateSettings,
    updateBoxRules,
    updateThresholds,
    signOut,
  } = usePantryStore();

  const [pantryName, setPantryName] = useState(settings.pantryName);
  const [savingName, setSavingName] = useState(false);

  // The field is seeded from the store, which is empty until the pantry loads.
  useEffect(() => {
    setPantryName(settings.pantryName);
  }, [settings.pantryName]);

  const categories = Object.keys(boxRules) as (keyof BoxRules)[];
  const nameChanged = pantryName.trim() !== settings.pantryName;

  const handleSavePantryName = async () => {
    const trimmed = pantryName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'A pantry needs a name your volunteers will recognise.');
      return;
    }

    setSavingName(true);
    try {
      await updateSettings({ pantryName: trimmed });
    } catch (err: any) {
      // Admin-only under RLS, so a volunteer tapping Save gets told why.
      Alert.alert(
        'Could not save',
        err?.message?.includes('policy')
          ? 'Only a pantry admin can rename the pantry.'
          : (err?.message ?? 'Please try again.'),
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

  return (
    <KeyboardScreen>
      <FadeInUp index={0}>
        <Card className="gap-4">
          <Input
            label="Pantry name"
            value={pantryName}
            onChangeText={setPantryName}
            hint="What every volunteer sees at the top of the app."
          />
          {/* Only appears once there is something to save — a Save button that
              is always there is a Save button nobody reads. */}
          {nameChanged && (
            <Button
              label="Save the new name"
              loading={savingName}
              onPress={handleSavePantryName}
            />
          )}
        </Card>
      </FadeInUp>

      <FadeInUp index={1}>
        <Card>
          <CardHeader
            title="Feel & sound"
            subtitle="Sound is off by default — a back room is loud and the phone is often shared."
          />
          <Row
            icon="vibrate"
            label="Haptic feedback"
            hint="A light tick when you tap or confirm."
            right={
              <Toggle
                value={haptics}
                accessibilityLabel="Haptic feedback"
                onValueChange={v => {
                  setHaptics(v);
                  setHapticsEnabled(v);
                }}
              />
            }
          />
          <Row
            icon="volume-high"
            label="Sound effects"
            hint="Soft confirmation tones when something is saved."
            divider={false}
            right={
              <Toggle
                value={sound}
                accessibilityLabel="Sound effects"
                onValueChange={v => {
                  setSound(v);
                  setSoundEnabled(v);
                }}
              />
            }
          />
        </Card>
      </FadeInUp>

      <FadeInUp index={2}>
        <Card>
          <CardHeader
            title="What goes in a box"
            subtitle="Items per category in one standard box, for a family of four."
          />
          {categories.map((cat, i) => (
            <Row
              key={cat}
              icon={categoryIcon(String(cat))}
              label={String(cat).charAt(0).toUpperCase() + String(cat).slice(1)}
              divider={i < categories.length - 1}
              right={
                <Stepper
                  value={boxRules[cat]}
                  min={0}
                  onChange={next => updateBoxRules({ [cat]: next })}
                />
              }
            />
          ))}
        </Card>
      </FadeInUp>

      <FadeInUp index={3}>
        <Card>
          <CardHeader
            title="Tell me when stock is low"
            subtitle="Below this total, a category starts showing up on the dashboard and in Needs."
          />
          {categories.map((cat, i) => (
            <Row
              key={cat}
              icon={categoryIcon(String(cat))}
              label={String(cat).charAt(0).toUpperCase() + String(cat).slice(1)}
              divider={i < categories.length - 1}
              right={
                <Stepper
                  value={thresholds[cat]}
                  min={1}
                  onChange={next => updateThresholds({ [cat]: next })}
                />
              }
            />
          ))}
        </Card>
      </FadeInUp>

      <FadeInUp index={4}>
        <Card>
          <CardHeader
            title="Flag stock as use-first"
            subtitle="How far ahead to look when deciding what is about to expire."
          />
          <Segmented
            value={settings.expirationWarningDays}
            options={[14, 21, 30].map(days => ({ value: days, label: `${days} days` }))}
            onChange={days => handleSettingChange({ expirationWarningDays: days })}
          />
        </Card>
      </FadeInUp>

      <FadeInUp index={5}>
        <Card>
          <CardHeader
            title="Usual family size"
            subtitle="What the dashboard and Build Boxes assume before anyone changes it."
          />
          <Segmented
            value={settings.defaultFamilySize}
            options={[2, 4, 6].map(size => ({ value: size, label: `${size} people` }))}
            onChange={size => handleSettingChange({ defaultFamilySize: size })}
          />
        </Card>
      </FadeInUp>

      <FadeInUp index={6}>
        <View className="gap-4">
          <Text variant="micro" tone="soft" className="px-1 text-center">
            Signed in to {settings.pantryName || 'this pantry'} as {settings.userRole}.
          </Text>
          <Button
            label="Sign out"
            variant="criticalGhost"
            className="self-center"
            icon={
              <MaterialCommunityIcons name="logout" size={18} color={COLORS.statusCritical} />
            }
            onPress={handleSignOut}
          />
        </View>
      </FadeInUp>
    </KeyboardScreen>
  );
}
