import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { COLORS } from '../constants/theme';
import { Button, Card, Text } from './ui';
import { Pulse } from './motion';

/**
 * The two halves of every "photograph this" screen: the invitation to take the
 * first picture, and the strip of pictures once there are some.
 *
 * Log donation and shelf count each drew their own — a dashed beige rectangle
 * and a grid of squares — and the two had already drifted apart. One copy means
 * the main feature of the app looks the same whichever door you came in by.
 */

/**
 * Four corner marks round a camera: the picture of "aim at it".
 *
 * The old empty state was a dashed beige rectangle, which says "drop something
 * here" — the opposite of what a phone camera wants. Viewfinder corners say what
 * the next step is without a word, and the breathing disc inside invites the tap.
 */
export function Viewfinder() {
  const edge = COLORS.primaryLight;
  const corner = (extra: object) => (
    <View style={[styles.corner, { borderColor: edge }, extra]} pointerEvents="none" />
  );

  return (
    <View className="h-32 w-32 items-center justify-center">
      {corner({ left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 16 })}
      {corner({ right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 16 })}
      {corner({ left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 16 })}
      {corner({ right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 16 })}
      <Pulse>
        <View className="h-16 w-16 items-center justify-center rounded-full bg-subtle">
          <MaterialCommunityIcons name="camera-outline" size={32} color={COLORS.primaryLight} />
        </View>
      </Pulse>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', width: 30, height: 30 },
});

/** The empty state: what to shoot, and the two ways to get a picture. */
export function CaptureCard({
  title,
  body,
  onCamera,
  onLibrary,
  disabled,
}: {
  title: string;
  body: string;
  onCamera: () => void;
  /** Omitted where the screen only takes live photos. */
  onLibrary?: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="items-center gap-6 px-5 py-8">
      <Viewfinder />
      <View className="items-center gap-2">
        <Text variant="headline" className="text-center">
          {title}
        </Text>
        <Text variant="body" tone="soft" className="px-2 text-center">
          {body}
        </Text>
      </View>
      <View className="w-full gap-3">
        <Button
          label="Open camera"
          block
          disabled={disabled}
          icon={<MaterialCommunityIcons name="camera" size={20} color={COLORS.textOnPrimary} />}
          onPress={onCamera}
        />
        {onLibrary ? (
          <Button
            label="Choose from library"
            variant="secondary"
            block
            disabled={disabled}
            icon={
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={20}
                color={COLORS.primaryDark}
              />
            }
            onPress={onLibrary}
          />
        ) : null}
      </View>
    </Card>
  );
}

/** Numbered thumbnails, removable, with a tile to add the next one. */
export function PhotoGrid({
  uris,
  max,
  onRemove,
  onAddCamera,
  onAddLibrary,
  disabled,
}: {
  uris: string[];
  max: number;
  onRemove: (index: number) => void;
  onAddCamera: () => void;
  onAddLibrary?: () => void;
  disabled?: boolean;
}) {
  const atLimit = uris.length >= max;

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between px-1">
        <Text variant="heading">Your photos</Text>
        <Text variant="label" tone="soft" className="font-semibold">
          {uris.length} of {max}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {uris.map((uri, i) => (
          <View key={`${uri}-${i}`} className="aspect-square w-[30.5%]">
            <Image
              source={{ uri }}
              className="h-full w-full rounded-md border-2 border-hairline bg-muted"
            />
            <View className="absolute bottom-1.5 left-1.5 h-6 min-w-[24px] items-center justify-center rounded-full bg-ink/70 px-1.5">
              <Text variant="micro" className="font-bold text-ink-on">
                {i + 1}
              </Text>
            </View>
            <Pressable
              onPress={() => onRemove(i)}
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
            onPress={onAddCamera}
            accessibilityLabel="Add another photo"
            className="aspect-square w-[30.5%] items-center justify-center gap-1 rounded-md border-2 border-dashed border-outline bg-subtle"
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={26} color={COLORS.primaryLight} />
            <Text variant="micro" tone="brand" className="font-bold">
              Add
            </Text>
          </Pressable>
        )}
      </View>

      {!atLimit && onAddLibrary ? (
        <Button
          label="Add from library"
          variant="ghost"
          size="compact"
          disabled={disabled}
          onPress={onAddLibrary}
        />
      ) : null}
    </View>
  );
}
