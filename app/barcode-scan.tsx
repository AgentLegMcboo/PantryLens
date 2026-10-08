import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, Text } from '../components/ui';
import { COLORS } from '../constants/theme';
import { lookupBarcode, type BarcodeLookup } from '../lib/ai_vision';
import { cueSuccess, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { usePantryStore } from '../lib/store';

/**
 * Pointing the camera at one specific package.
 *
 * The highest-intent moment in the app: a volunteer is here because the scanner
 * got a row wrong and they want the truth about it. So the screen does one
 * thing, full-bleed, with no chrome to read — find the code, look it up, go
 * back with an answer.
 *
 * UPC-E is deliberately absent from the accepted formats. It is a six-digit
 * compression that has to be expanded before it means anything, and a
 * half-understood code that resolves to the wrong product is worse than no code
 * at all.
 */
const BARCODE_TYPES = ['upc_a', 'ean13', 'ean8'] as const;

export default function BarcodeScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  const setPendingBarcode = usePantryStore(state => state.setPendingBarcode);

  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BarcodeLookup | null>(null);

  // The camera fires this continuously while a code is in frame — several times
  // a second. Without a latch, one tin becomes a dozen lookups.
  const handled = useRef(false);

  const handleScanned = async ({ data }: { data: string }) => {
    if (handled.current || busy) return;
    handled.current = true;
    setBusy(true);
    setMessage(null);

    log.debug('scan', `barcode scanned: ${data}`);
    const result = await lookupBarcode(data);

    if (!result.found) {
      cueWarn();
      setMessage(result.error ?? 'That barcode is not in any product database.');
      setBusy(false);
      // Re-arm after a beat so the volunteer can try another angle, or another
      // package, without backing out and coming in again.
      setTimeout(() => {
        handled.current = false;
      }, 1500);
      return;
    }

    setCandidate(result);
    setBusy(false);
  };

  const confirm = () => {
    if (!candidate?.name || !uid) return;
    cueSuccess();
    setPendingBarcode({
      uid: String(uid ?? ''),
      barcode: candidate.barcode ?? '',
      name: candidate.name,
      category: (candidate.category as any) ?? null,
      imageUrl: (candidate as any).imageUrl ?? null,
    });
    router.back();
  };

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.primaryLight} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 justify-center bg-canvas">
        <EmptyState
          icon="camera-off-outline"
          title="Camera access needed"
          body="PantryLens reads the barcode on the package to identify it exactly. Nothing is recorded or uploaded but the digits."
          actionLabel="Allow the camera"
          onAction={requestPermission}
        />
        <Button
          label="Go back"
          variant="ghost"
          className="self-center"
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={busy ? undefined : handleScanned}
      />

      {/* Everything below floats over the camera. */}
      <View className="absolute inset-0" pointerEvents="box-none">
        <View
          className="flex-row items-center justify-between px-gutter"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Close the scanner"
            hitSlop={10}
            className="h-12 w-12 items-center justify-center rounded-full bg-black/50"
          >
            <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* The reticle. A barcode reader with no visible target leaves people
            guessing how close to hold the package. */}
        <View className="flex-1 items-center justify-center" pointerEvents="none">
          <View
            className="h-36 w-72 rounded-lg border-2"
            style={{ borderColor: busy ? COLORS.statusGood : 'rgba(255,255,255,0.85)' }}
          />
          <Text variant="label" className="mt-5 text-center text-white" style={{ lineHeight: 18 }}>
            {busy ? 'Looking it up…' : 'Line up the barcode'}
          </Text>
        </View>

        <View className="px-gutter" style={{ paddingBottom: insets.bottom + 24 }}>
          {candidate && <View className="mb-4 gap-3 rounded-lg bg-card p-card"><Text variant="heading">{candidate.name}</Text><Text variant="label" tone="soft">Check the name against the package. Product databases can contain mistakes.</Text><Button label="This matches the package" block onPress={confirm} /><Button label="Try another barcode" variant="secondary" block onPress={() => { setCandidate(null); handled.current = false; }} /></View>}
          {message ? (
            <View className="rounded-md bg-black/70 px-4 py-3">
              <Text variant="label" className="text-center text-white" style={{ lineHeight: 19 }}>
                {message}
              </Text>
            </View>
          ) : (
            <Text
              variant="micro"
              className="text-center text-white/70"
              style={{ lineHeight: 16 }}
            >
              Works with the barcodes on tins, boxes and jars.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
