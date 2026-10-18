import React, { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../constants/theme';
import { cueSuccess } from '../lib/feedback';
import { loadProfilePhoto, saveProfilePhoto, useProfilePhoto } from '../lib/profile-photos';
import { ProfileAvatar } from './profile-avatar';
import { Button, Card, Text } from './ui';

export function ProfilePhotoEditor({ userId, email }: { userId: string; email: string }) {
  const photo = useProfilePhoto(userId);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const locked = useRef(false);

  const change = async (remove = false) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setSaved(false);
    setErrorMessage(null);
    try {
      if (remove) {
        await saveProfilePhoto(userId, null);
      } else {
        // The system photo picker grants access only to the selected image.
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        await saveProfilePhoto(userId, result.assets[0]);
      }
      setSaved(true);
      setConfirmRemove(false);
      cueSuccess();
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'Check your connection and try again.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  return (
    <Card className="gap-5">
      <View className="items-center gap-3">
        <ProfileAvatar userId={userId} name={email || 'You'} size={96} />
        <Text variant="body" className="font-semibold text-center">{email || 'Your profile'}</Text>
        <Text variant="label" tone="soft" className="text-center">
          Help your pantry team recognize you. Your photo follows you across your pantries.
        </Text>
      </View>
      {photo?.error ? (
        <View className="gap-1">
          <Text variant="label" tone="soft" accessibilityLiveRegion="polite">Could not load your profile photo.</Text>
          <Button label="Try again" variant="ghost" disabled={busy} onPress={() => { void loadProfilePhoto(userId, true); }} />
        </View>
      ) : null}
      {errorMessage ? (
        <Text variant="label" tone="critical" accessibilityRole="alert">Could not update your photo. {errorMessage}</Text>
      ) : null}
      <Button label={photo?.path ? 'Change photo' : 'Choose photo'} block loading={busy} onPress={() => { void change(); }} />
      {photo?.path && !confirmRemove ? (
        <Button label="Remove photo" variant="criticalGhost" disabled={busy} onPress={() => setConfirmRemove(true)} />
      ) : null}
      {photo?.path && confirmRemove ? (
        <View className="gap-2">
          <Text variant="label">Remove your photo? Your initial will appear instead.</Text>
          <View className="flex-row flex-wrap gap-4">
            <Button label="Remove photo" variant="criticalGhost" disabled={busy} onPress={() => { void change(true); }} />
            <Button label="Keep photo" variant="ghost" disabled={busy} onPress={() => setConfirmRemove(false)} />
          </View>
        </View>
      ) : null}
      {!photo && !busy ? <ActivityIndicator color={COLORS.primaryDark} accessibilityLabel="Loading profile photo" /> : null}
      {saved ? <Text variant="label" tone="soft" accessibilityLiveRegion="polite">Profile photo updated.</Text> : null}
    </Card>
  );
}
