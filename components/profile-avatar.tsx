import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { useAppAppearance } from '../lib/appearance';
import { useProfilePhoto } from '../lib/profile-photos';
import { Text } from './ui/text';

export function ProfileAvatar({ userId, name, size = 40 }: { userId?: string; name: string; size?: number }) {
  useAppAppearance(state => state.scheme);
  const photo = useProfilePhoto(userId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = photo?.url;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: COLORS.secondaryTint, alignItems: 'center', justifyContent: 'center' }}>
      {url && url !== failedUrl ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover"
          accessibilityLabel={`${name}'s profile photo`} onError={() => setFailedUrl(url)} />
      ) : (
        <Text style={{ fontSize: size * 0.38, lineHeight: size * 0.5, fontWeight: '700', color: COLORS.secondaryDark }}>
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}
