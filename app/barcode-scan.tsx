import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button,
  Card,
  EmptyState,
  Input,
  ItemThumb,
  Segmented,
  Sheet,
  Text,
} from '../components/ui';
import { COLORS } from '../constants/theme';
import { lookupBarcode, type BarcodeLookup } from '../lib/ai_vision';
import { createBarcodeGate, decodeCameraBarcode, normaliseBarcode } from '../lib/barcode-scanner';
import { normaliseDietTags } from '../lib/diet';
import { cueSuccess, cueWarn } from '../lib/feedback';
import { log } from '../lib/log';
import { usePantryStore } from '../lib/store';

const BARCODE_TYPES = ['upc_a', 'ean13', 'ean8', 'upc_e', 'itf14'] as const;

export default function BarcodeScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  const setPendingBarcode = usePantryStore((state) => state.setPendingBarcode);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BarcodeLookup | null>(null);
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [digits, setDigits] = useState('');
  const [format, setFormat] = useState<'regular' | 'upc_e'>('regular');
  const gate = useRef(createBarcodeGate());
  const handled = useRef(false);
  const inFlight = useRef(false);
  const committed = useRef(false);
  const request = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);

  const reset = () => {
    request.current++;
    handled.current = false;
    inFlight.current = false;
    committed.current = false;
    gate.current.reset();
    setBusy(false);
    setMessage(null);
    setCandidate(null);
  };

  const lookup = async (code: string) => {
    if (handled.current || inFlight.current) return;
    handled.current = true;
    inFlight.current = true;
    const attempt = ++request.current;
    setBusy(true);
    setMessage(null);
    try {
      const result = await lookupBarcode(code);
      if (!mounted.current || request.current !== attempt) return;
      if (!result.found) {
        cueWarn();
        setMessage(result.error ?? 'No product was found. Check the digits or try another scan.');
        // Wait for an explicit retry: a stationary unknown tin must not trigger
        // a new network request every time the camera emits another frame.
        return;
      }
      setCandidate(result);
      setManual(false);
      setTorch(false);
    } catch (error) {
      if (!mounted.current || request.current !== attempt) return;
      log.error('scan', 'barcode lookup failed', error);
      cueWarn();
      setMessage('Could not look up this code. Please retry.');
    } finally {
      if (mounted.current && request.current === attempt) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  const handleScanned = ({ data, type }: BarcodeScanningResult) => {
    if (handled.current || manual || candidate) return;
    const code = gate.current.read(data, type, Date.now());
    if (code) void lookup(code);
  };

  const openManual = () => {
    reset();
    setManual(true);
  };
  const closeManual = () => {
    setManual(false);
    reset();
  };
  const submitDigits = () => {
    if (inFlight.current) return;
    const raw = digits.replace(/[\s-]/g, '');
    const code = format === 'upc_e' ? decodeCameraBarcode(raw, 'upc_e') : normaliseBarcode(digits);
    if (!code) {
      setMessage(
        'Those digits do not pass the barcode check. Include every digit, including the small digits at each end.',
      );
      return;
    }
    handled.current = false;
    void lookup(code);
  };

  const confirm = () => {
    if (committed.current || !candidate?.found || !candidate.barcode || !candidate.name || !uid)
      return;
    committed.current = true;
    cueSuccess();
    setPendingBarcode({
      uid,
      barcode: candidate.barcode,
      name: candidate.name,
      category: candidate.category ?? null,
      imageUrl: candidate.imageUrl ?? null,
      dietTags: normaliseDietTags(candidate.dietTags),
    });
    request.current++;
    router.back();
  };

  const manualSheet = (
    <Sheet
      visible={manual}
      title="Enter the barcode"
      subtitle="Copy the digits printed below the bars."
      onClose={closeManual}
    >
      <Segmented
        options={[
          { value: 'regular', label: 'UPC / EAN' },
          { value: 'upc_e', label: 'Short UPC-E' },
        ]}
        value={format}
        onChange={(value) => {
          setFormat(value);
          setMessage(null);
        }}
        disabled={busy}
      />
      <Input
        label="Barcode digits"
        value={digits}
        onChangeText={(value) => {
          setDigits(value);
          setMessage(null);
        }}
        keyboardType="number-pad"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        hint={format === 'upc_e' ? 'UPC-E has 6 middle digits and a small digit at each end.' : undefined}
        maxLength={24}
        error={message}
        placeholder={
          format === 'upc_e' ? '8 digits, including both end digits' : '8, 12, 13 or 14 digits'
        }
      />
      <Button
        label="Find this product"
        block
        loading={busy}
        disabled={!digits.trim()}
        onPress={submitDigits}
      />
    </Sheet>
  );

  if (!permission?.granted) {
    return (
      <>
        <View className="flex-1 justify-center bg-canvas">
          {!permission ? (
            <ActivityIndicator color={COLORS.primaryLight} />
          ) : (
            <EmptyState
              icon="camera-off-outline"
              title="Camera access needed"
              body="Use the camera to read the package, or type the barcode below."
              actionLabel="Allow the camera"
              onAction={requestPermission}
            />
          )}
          <View className="gap-3 px-gutter">
            <Button label="Enter barcode digits" block variant="secondary" onPress={openManual} />
            <Button
              label="Go back"
              variant="ghost"
              className="self-center"
              onPress={() => router.back()}
            />
            {candidate && (
              <Card className="gap-3">
                <Text variant="title">{candidate.name}</Text>
                <Text tone="soft">{candidate.barcode}</Text>
                <Button label="Use this product" block disabled={!uid} onPress={confirm} />
                <Button label="Try another code" variant="secondary" block onPress={openManual} />
              </Card>
            )}
          </View>
        </View>
        {manualSheet}
      </>
    );
  }

  return (
    <>
      <View className="flex-1 bg-black">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          autofocus="off"
          active={!candidate && !manual}
          enableTorch={torch && !candidate && !manual}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={busy || message || candidate || manual ? undefined : handleScanned}
          onMountError={() =>
            setMessage('The camera could not start. Enter the barcode digits instead.')
          }
        />
        <View className="absolute inset-0" pointerEvents="box-none">
          <View
            className="flex-row items-center justify-between px-gutter"
            style={{ paddingTop: insets.top + 8 }}
          >
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close the scanner"
              hitSlop={10}
              className="h-12 w-12 items-center justify-center rounded-lg bg-black/60"
            >
              <MaterialCommunityIcons name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() => setTorch((value) => !value)}
              disabled={busy || !!candidate || manual}
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
              accessibilityState={{ selected: torch }}
              className="h-12 w-12 items-center justify-center rounded-lg bg-black/60"
            >
              <MaterialCommunityIcons
                name={torch ? 'flashlight' : 'flashlight-off'}
                size={24}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
          <View className="flex-1 items-center justify-center" pointerEvents="none">
            {!candidate && (
              <>
                <View
                  className="h-36 w-72 rounded-lg border-2"
                  style={{ borderColor: busy ? COLORS.statusGood : 'rgba(255,255,255,0.85)' }}
                />
                <Text variant="label" className="mt-5 text-center text-white">
                  {busy ? 'Looking it up…' : 'Hold one barcode steady'}
                </Text>
                <Text variant="micro" className="mt-2 px-gutter text-center text-white/70">
                  Keep all the bars visible. Move back a little if blurry.
                </Text>
              </>
            )}
          </View>
          <View className="gap-3 px-gutter" style={{ paddingBottom: insets.bottom + 24 }}>
            {candidate ? (
              <Card className="gap-4">
                <Text variant="label" tone="soft">
                  Does this match the package?
                </Text>
                <View className="flex-row items-center gap-3">
                  <ItemThumb
                    imageUrl={candidate.imageUrl}
                    category={candidate.category ?? 'unknown'}
                    size="md"
                  />
                  <View className="flex-1 gap-1">
                    <Text variant="title">{candidate.name}</Text>
                    <Text variant="micro" tone="soft" selectable>
                      {candidate.barcode}
                    </Text>
                  </View>
                </View>
                {!uid && (
                  <Text variant="label" tone="soft">
                    Open the scanner from an item in Review &amp; Verify to use this product.
                  </Text>
                )}
                <Button label="Use this product" block disabled={!uid} onPress={confirm} />
                <Button
                  label="Not this product — scan again"
                  variant="secondary"
                  block
                  onPress={reset}
                />
              </Card>
            ) : (
              <>
                {message && (
                  <View className="gap-3 rounded-md bg-black/70 px-4 py-3">
                    <Text
                      variant="label"
                      className="text-center text-white"
                      accessibilityLiveRegion="polite"
                    >
                      {message}
                    </Text>
                    <Button label="Scan again" block onPress={reset} />
                  </View>
                )}
                <Button
                  label="Enter barcode digits"
                  variant="secondary"
                  block
                  disabled={busy}
                  onPress={openManual}
                />
              </>
            )}
          </View>
        </View>
      </View>
      {manualSheet}
    </>
  );
}
