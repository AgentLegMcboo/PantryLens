import { useAppAppearance } from '../lib/appearance';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Sheet, Text } from '../components/ui';
import { COLORS } from '../constants/theme';
import { processImageScan, ScanError } from '../lib/ai_vision';
import { cuePress, cueTap, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { preparePhoto, type PreparedPhoto } from '../lib/photo';
import { startScan, uploadScanPhotos } from '../lib/scan-history';
import { SOURCE_ORG_LABELS, type SourceOrg, usePantryStore } from '../lib/store';
import { shelfLabels } from '../lib/shelves';
import { PRESS_SCALE, Tappable } from '../components/motion';

/**
 * Photographing a donation — the camera IS the screen.
 *
 * It used to open on a form: a dashed "photograph the donation" box, source
 * chips and two buttons, and only then the system camera, which closed again
 * after every single shot. Now the live viewfinder is the first thing you see:
 * shoot as many photos as the pile needs without leaving it, add one from the
 * library if it's already on the phone, then Detect.
 *
 * Every photo still goes through preparePhoto before it reaches state — a raw
 * shot is close to a megabyte of base64, which measured at 24 seconds for one
 * image and would pass the function's timeout at six.
 */

const MAX_PHOTOS = 6;
const QUALITY = 0.6;

/** The same list bulk intake offers, so a donation reads the same either way in. */
const SOURCES: SourceOrg[] = ['grocery', 'food_bank', 'drive', 'individual', 'other'];

/** Translucent dark surface for controls floating over the live picture. */
const GLASS = 'rgba(20,16,14,0.55)';

export default function LogDonationScreen() {
  useAppAppearance(state => state.scheme);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setDraft = usePantryStore((state) => state.setDraft);
  const setDraftSource = usePantryStore((state) => state.setDraftSource);
  const setCurrentScan = usePantryStore((state) => state.setCurrentScan);
  const settings = usePantryStore((state) => state.settings);
  const setAuditDraft = usePantryStore((state) => state.setAuditDraft);
  const locations = usePantryStore((state) => state.locations);
  /**
   * Counting a shelf uses this same camera. Opened with `mode=audit` and the
   * shelf's id, it skips the donation source and hands the reading to the
   * count review instead of the intake review.
   */
  const params = useLocalSearchParams<{ mode?: string; location?: string }>();
  const auditLocation = params.mode === 'audit' && params.location ? params.location : null;
  const auditName = auditLocation ? shelfLabels(locations)[auditLocation] ?? 'this shelf' : null;

  const [permission, requestPermission] = useCameraPermissions();
  /**
   * The camera-access sheet. Normally it opens only while access hasn't been
   * granted; ALWAYS_ASK_FOR_CAMERA shows it on every visit so the design can be
   * checked on a phone that already allowed the camera. Turn it off before
   * release.
   */
  const ALWAYS_ASK_FOR_CAMERA = false;
  const [askDismissed, setAskDismissed] = useState(false);
  const camera = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shots, setShots] = useState<(PreparedPhoto & { group: number })[]>([]);
  const [captureMode, setCaptureMode] = useState<'angle' | 'new'>('angle');
  const reducedMotion = useReducedMotion();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /**
   * Who it came from. Grocery rescue and a school food drive are different
   * things to report on and different things to thank, so it's asked here as
   * well as in bulk intake — optional, one tap.
   */
  const [sourceOrg, setSourceOrg] = useState<SourceOrg | null>(null);

  // A brief white flash on capture: the shutter sound is often off, and without
  // it nothing on screen says the photo was taken.
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const atLimit = shots.length >= MAX_PHOTOS;
  const busy = capturing || isAnalyzing;

  const addPrepared = async (assets: ImagePicker.ImagePickerAsset[]) => {
    const prepared = (await Promise.all(assets.map(preparePhoto))).filter(
      (p): p is PreparedPhoto => p !== null,
    );
    if (prepared.length === 0) {
      log.warn('scan', 'no usable photos came back');
      return;
    }
    setShots((prev) => {
      const lastGroup = prev[prev.length - 1]?.group ?? -1;
      const firstGroup = prev.length === 0 ? 0 : captureMode === 'new' ? lastGroup + 1 : lastGroup;
      // Library selection follows the chosen intent; new-group mode treats each selected picture as separate stock.
      return [...prev, ...prepared.map((photo, index) => ({ ...photo, group: firstGroup + (captureMode === 'new' ? index : 0) }))].slice(0, MAX_PHOTOS);
    });
    setCaptureMode('angle');
  };

  const handleShutter = async () => {
    if (atLimit || busy || !camera.current) return;
    cuePress();
    setCapturing(true);
    if (!reducedMotion) flash.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 150 }));
    try {
      const photo = await camera.current.takePictureAsync({ quality: QUALITY, base64: true, exif: false });
      if (photo) {
        // preparePhoto reads the picker's asset shape; a camera capture carries
        // the same fields it uses (uri, width, height, base64).
        await addPrepared([photo as unknown as ImagePicker.ImagePickerAsset]);
      }
    } catch (err) {
      log.error('scan', 'capture failed', err);
      cueWarn();
    } finally {
      setCapturing(false);
    }
  };

  const handlePickFromLibrary = async () => {
    if (atLimit || busy) return;
    cueTap();
    const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!libraryPermission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow photo access in Settings › PantryLens to pick donation photos you already took.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: QUALITY,
      base64: true,
      exif: false,
      // One at a time so each picture has an explicit angle/group intent.
      allowsMultipleSelection: false,
    });
    if (result.canceled) return;
    await addPrepared(result.assets);
  };

  const removeShot = (index: number) => {
    cueTap();
    setShots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDetectItems = async () => {
    if (shots.length === 0 || isAnalyzing) return;
    log.debug('scan', `detect pressed with ${shots.length} photo(s)`);
    setIsAnalyzing(true);

    try {
      const startedAt = Date.now();
      const { candidates, photosRead, photosSent } = await processImageScan(shots.map((s) => s.base64), { photoGroups: shots.map((s) => s.group) });

      // Opened BEFORE the review, so a scan the volunteer walks away from is
      // still recorded. Best-effort: a null record changes nothing that follows.
      const record = await startScan({
        pantryId: settings.pantryId,
        mode: auditLocation ? 'shelf_audit' : 'donation',
        photosSent,
        photosRead,
        durationMs: Date.now() - startedAt,
        candidates,
      });
      setCurrentScan(record);
      uploadScanPhotos(settings.pantryId, record?.scanId ?? null, shots);

      if (auditLocation) {
        // Same item-by-item check as a donation (Review & Verify, with the
        // boxes on the photos), then the confirmed counts are compared with
        // what the books say for this shelf.
        const toCount = () => {
          setDraft(
            candidates as any,
            shots.map((s) => ({ uri: s.uri, width: s.width, height: s.height })),
          );
          router.replace({ pathname: '/review-verify', params: { audit: auditLocation } });
        };
        if (photosRead < photosSent) {
          cueWarn();
          Alert.alert(
            `Only read ${photosRead} of ${photosSent} photos`,
            'Anything in the unread part of the shelf will look like it has gone missing.',
            [
              { text: 'Take more photos', style: 'cancel' },
              { text: 'Review anyway', onPress: toCount },
            ],
          );
          return;
        }
        toCount();
        return;
      }

      // The photos travel with the draft: review draws the detection boxes back
      // onto them, so the item and the thing on the shelf stay connected.
      setDraft(
        candidates as any,
        shots.map((s) => ({ uri: s.uri, width: s.width, height: s.height })),
      );
      setDraftSource(sourceOrg);

      // A photo that failed on its own must be said out loud.
      if (photosRead < photosSent) {
        cueWarn();
        Alert.alert(
          `Read ${photosRead} of ${photosSent} photos`,
          'One or more photos could not be read. Check the list, and re-shoot anything missing.',
          [{ text: 'Review the list', onPress: () => router.push('/review-verify') }],
        );
        return;
      }
      router.push('/review-verify');
    } catch (err) {
      log.error('scan', 'scan failed', err);
      cueWarn();
      const message =
        err instanceof ScanError
          ? err.message
          : 'Something went wrong while scanning. You can still add these items by hand.';
      Alert.alert(auditLocation ? 'Could not read the shelf' : 'Could not scan', message, [
        auditLocation
          ? {
              text: 'Count by hand',
              onPress: () => {
                setAuditDraft({ locationId: auditLocation, photos: 0, counted: [] });
                router.replace('/audit-review');
              },
            }
          : { text: 'Add by hand', onPress: () => router.replace('/(tabs)/inventory') },
        { text: 'Try again', style: 'cancel' },
      ]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Still finding out whether we may use the camera.
  if (!permission) return <View className="flex-1 bg-black" />;

  const hint = isAnalyzing
    ? auditLocation
      ? 'Checking the shelf…'
      : 'Reading labels…'
    : atLimit
      ? `${MAX_PHOTOS} photos — that's the most for one scan`
      : auditLocation
        ? shots.length === 0
          ? `Stock check: ${auditName} · shoot left to right`
          : `${shots.length} of ${MAX_PHOTOS} · overlap each photo a little`
        : shots.length === 0
          ? 'Lay items out so the labels face the camera'
          : `${shots.length} of ${MAX_PHOTOS} · review counts before saving`;

  return (
    <View className="flex-1 bg-black">
      {permission.granted ? (
        <CameraView ref={camera} style={{ flex: 1 }} facing="back" enableTorch={torch} />
      ) : (
        <View style={{ flex: 1 }} />
      )}

      {/* Capture flash */}
      <Animated.View pointerEvents="none" className="absolute inset-0 bg-white" style={flashStyle} />

      <View className="absolute inset-0" pointerEvents="box-none">
        {/* Top: close and torch */}
        <View
          className="flex-row items-center justify-between px-gutter"
          style={{ paddingTop: insets.top + 8 }}
        >
          <RoundButton icon="close" label="Close" onPress={() => router.back()} />
          <RoundButton
            icon={torch ? 'flashlight' : 'flashlight-off'}
            label={torch ? 'Turn the light off' : 'Turn the light on'}
            active={torch}
            onPress={() => {
              cueTap();
              setTorch((t) => !t);
            }}
          />
        </View>

        {/* Viewfinder corners */}
        <View className="flex-1 items-center justify-center" pointerEvents="none">
          <View style={{ width: '78%', aspectRatio: 0.85 }}>
            <Corner style={{ top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 }} />
            <Corner style={{ top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 }} />
            <Corner style={{ bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 }} />
            <Corner style={{ bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 }} />
          </View>
        </View>

        <View className="px-gutter pb-2">
          {shots.length > 0 && (
            <View className="mt-2 gap-2 rounded-lg bg-card p-3">
              <Text variant="label" className="font-bold">What will the next photo show?</Text>
              <View className="flex-row gap-2">
                <Button className="flex-1 self-stretch" label="Another angle" size="compact" variant={captureMode === 'angle' ? 'primary' : 'secondary'} onPress={() => setCaptureMode('angle')} />
                <Button className="flex-1 self-stretch" label="New group" size="compact" variant={captureMode === 'new' ? 'primary' : 'secondary'} onPress={() => setCaptureMode('new')} />
              </View>
              <Text variant="micro" tone="soft">{captureMode === 'angle' ? 'Same physical items: overlapping counts will not be added twice.' : 'Different physical items: counts stay separate from earlier groups.'}</Text>
            </View>
          )}
        </View>
        {/* Hint */}
        <View className="items-center pb-3" pointerEvents="none">
          <View className="flex-row items-center gap-2 rounded-full px-4 py-2" style={{ backgroundColor: GLASS }}>
            {isAnalyzing && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text variant="label" className="font-semibold text-white">
              {hint}
            </Text>
          </View>
        </View>

        {/* Shots taken so far */}
        {shots.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 px-gutter pb-3 pt-2"
            style={{ flexGrow: 0 }}
          >
            {shots.map((shot, i) => (
              <View key={`${shot.uri}-${i}`}>
                <Text variant="micro" className="font-bold text-white">Group {shot.group + 1}</Text>
                <Image source={{ uri: shot.uri }} className="h-16 w-16 rounded-lg border-2 border-white" />
                <Tappable
                  disabled={busy}
                  onPress={() => removeShot(i)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${i + 1}`}
                  className="absolute -right-2 -top-2 h-8 w-8 items-center justify-center rounded-lg border border-white/60 bg-black"
                >
                  <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
                </Tappable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Where it came from — optional, one tap. Not asked when counting. */}
        {!auditLocation && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-gutter pb-3"
          style={{ flexGrow: 0 }}
        >
          {SOURCES.map((src) => {
            const on = sourceOrg === src;
            return (
              <Tappable
                key={src}
                onPress={() => {
                  cueTap();
                  setSourceOrg(on ? null : src);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className="min-h-[44px] items-center justify-center rounded-lg px-3.5 py-2"
                style={{ backgroundColor: on ? COLORS.textOnPrimary : GLASS }}
              >
                <Text variant="label" className={on ? 'font-bold text-ink' : 'font-semibold text-white'}>
                  {SOURCE_ORG_LABELS[src]}
                </Text>
              </Tappable>
            );
          })}
        </ScrollView>
        )}

        {/* Bottom bar: library · shutter · detect */}
        <View className="px-gutter" style={{ paddingBottom: insets.bottom + 14 }}>
          <View
            className="flex-row items-center justify-between rounded-2xl px-3 py-2.5"
            style={{ backgroundColor: GLASS }}
          >
            <RoundButton
              icon="image-multiple-outline"
              label="Add from library"
              onPress={handlePickFromLibrary}
              disabled={atLimit || busy}
            />

            <Pressable
              onPress={handleShutter}
              disabled={atLimit || busy}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              style={({ pressed }) => ({ transform: [{ scale: pressed && !busy && !atLimit && !reducedMotion ? 0.96 : 1 }] })}
              className="h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white"
            >
              <View
                className="h-[58px] w-[58px] items-center justify-center rounded-full"
                style={{ backgroundColor: atLimit ? 'rgba(255,255,255,0.35)' : COLORS.primaryLight }}
              >
                {capturing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <MaterialCommunityIcons name="camera" size={26} color="#FFFFFF" />
                )}
              </View>
            </Pressable>

            <Tappable
              onPress={handleDetectItems}
              disabled={shots.length === 0 || busy}
              accessibilityRole="button"
              accessibilityLabel={`Detect items in ${shots.length} photos`}
              className="h-12 min-w-[48px] flex-row items-center justify-center gap-1.5 rounded-xl px-3.5"
              style={{
                backgroundColor: shots.length > 0 ? COLORS.textOnPrimary : 'rgba(255,255,255,0.18)',
              }}
            >
              {isAnalyzing ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <MaterialCommunityIcons
                  name="auto-fix"
                  size={20}
                  color={shots.length > 0 ? COLORS.primary : '#FFFFFF'}
                />
              )}
              {shots.length > 0 && (
                <Text variant="label" className="font-bold" style={{ color: COLORS.primary }}>
                  {auditLocation ? 'Count' : 'Detect'} {shots.length}
                </Text>
              )}
            </Tappable>
          </View>
        </View>
      </View>
      {/* Camera access, as a sheet over the camera rather than a page of its
          own: the volunteer stays where they were going, and can still reach
          the library from here. */}
      <Sheet
        visible={(!permission.granted || ALWAYS_ASK_FOR_CAMERA) && !askDismissed}
        onClose={() => {
          setAskDismissed(true);
          if (!permission.granted) router.back();
        }}
        title="Allow the camera?"
        subtitle="To photograph donations"
      >
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-secondary-tint">
            <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.secondaryDark} />
          </View>
          <Text variant="body" tone="soft" className="flex-1">
            PantryLens reads the labels in your photos. Nothing is added until you check every
            line.
          </Text>
        </View>
        <Button
          label="Allow the camera"
          block
          className="rounded-md"
          onPress={async () => {
            if (!permission.granted) {
              const res = await requestPermission();
              if (!res.granted) return;
            }
            setAskDismissed(true);
          }}
        />
        <Button
          label="Choose from library instead"
          variant="secondary"
          block
          className="rounded-md"
          onPress={() => {
            setAskDismissed(true);
            handlePickFromLibrary();
          }}
        />
      </Sheet>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-12 w-12 items-center justify-center rounded-full"
      style={{
        backgroundColor: active ? COLORS.textOnPrimary : GLASS,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <MaterialCommunityIcons name={icon} size={22} color={active ? COLORS.textPrimary : '#FFFFFF'} />
    </Tappable>
  );
}

function Corner({ style }: { style: object }) {
  return (
    <View
      style={[{ position: 'absolute', width: 44, height: 44, borderColor: '#FFFFFF' }, style]}
    />
  );
}
