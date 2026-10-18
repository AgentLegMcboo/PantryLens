import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { BoxesMock, CameraMock, ScanMock } from '../components/onboarding-mocks';

type Appearance = 'auto' | 'light' | 'dark';
type Tab = 'today' | 'inventory' | 'boxes' | 'needs';
type PrototypeScreen =
  | 'main'
  | 'onboarding'
  | 'login'
  | 'signup'
  | 'pantry-selection'
  | 'photo-intake'
  | 'barcode'
  | 'manual-entry'
  | 'review-verify'
  | 'shelf-audit'
  | 'audit-review'
  | 'bulk-intake'
  | 'item-detail'
  | 'expiring'
  | 'ready-boxes'
  | 'packing-checklist'
  | 'reports'
  | 'team'
  | 'member'
  | 'settings'
  | 'places'
  | 'offline';

type Palette = {
  canvas: string;
  canvasEnd: string;
  surface: string;
  surfaceStrong: string;
  surfaceMuted: string;
  glass: string;
  text: string;
  secondaryText: string;
  tertiaryText: string;
  separator: string;
  brand: string;
  brandPressed: string;
  brandTint: string;
  onBrand: string;
  good: string;
  goodTint: string;
  warning: string;
  warningTint: string;
  critical: string;
  criticalTint: string;
  shadow: string;
  gradientA: string;
  gradientB: string;
  gradientC: string;
};

const LIGHT: Palette = {
  canvas: '#F7F5F1',
  canvasEnd: '#F3F1EC',
  surface: 'rgba(255,255,255,0.82)',
  surfaceStrong: '#FFFFFF',
  surfaceMuted: 'rgba(236,231,224,0.72)',
  glass: 'rgba(250,249,247,0.92)',
  text: '#1E1C1A',
  secondaryText: '#625D57',
  tertiaryText: '#817A72',
  separator: 'rgba(62,49,38,0.12)',
  brand: '#A5482D',
  brandPressed: '#87351E',
  brandTint: '#F7E7DF',
  onBrand: '#FFFFFF',
  good: '#47743D',
  goodTint: '#EAF2E7',
  warning: '#9B5D08',
  warningTint: '#FFF0D7',
  critical: '#B5352B',
  criticalTint: '#FBE9E6',
  shadow: '#3A2B21',
  gradientA: '#F6DCCF',
  gradientB: '#E6EFD9',
  gradientC: '#F1DFB9',
};

const DARK: Palette = {
  canvas: '#141311',
  canvasEnd: '#191714',
  surface: 'rgba(42,39,35,0.86)',
  surfaceStrong: '#2B2824',
  surfaceMuted: 'rgba(57,53,48,0.76)',
  glass: 'rgba(32,30,27,0.94)',
  text: '#F7F4EF',
  secondaryText: '#C7C0B7',
  tertiaryText: '#9D958B',
  separator: 'rgba(255,245,232,0.12)',
  brand: '#D06A49',
  brandPressed: '#B65335',
  brandTint: '#432820',
  onBrand: '#FFFFFF',
  good: '#8DBB80',
  goodTint: '#233520',
  warning: '#F0B75F',
  warningTint: '#42321C',
  critical: '#F08076',
  criticalTint: '#432421',
  shadow: '#000000',
  gradientA: '#713923',
  gradientB: '#3E5933',
  gradientC: '#675024',
};

const TABS: Array<{
  key: Tab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}> = [
  { key: 'today', label: 'Today', icon: 'home-outline', activeIcon: 'home' },
  { key: 'inventory', label: 'Inventory', icon: 'file-tray-stacked-outline', activeIcon: 'file-tray-stacked' },
  { key: 'boxes', label: 'Boxes', icon: 'cube-outline', activeIcon: 'cube' },
  { key: 'needs', label: 'Needs', icon: 'megaphone-outline', activeIcon: 'megaphone' },
];

const TITLES: Record<Tab, string> = {
  today: 'Today',
  inventory: 'Inventory',
  boxes: 'Boxes',
  needs: 'Needs',
};

export default function UIMockupScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = React.useState<Appearance>('auto');
  const [screen, setScreen] = React.useState<PrototypeScreen>('onboarding');
  const [onboardingStep, setOnboardingStep] = React.useState(0);
  const [tab, setTab] = React.useState<Tab>('today');
  const [intakeOpen, setIntakeOpen] = React.useState(false);
  const [directoryOpen, setDirectoryOpen] = React.useState(false);
  const [boxGoal, setBoxGoal] = React.useState(12);

  const scheme: 'light' | 'dark' = appearance === 'auto'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : appearance;
  const colors = scheme === 'dark' ? DARK : LIGHT;

  const cycleAppearance = () => {
    setAppearance(current => (current === 'auto' ? 'light' : current === 'light' ? 'dark' : 'auto'));
  };

  if (screen !== 'main') {
    return (
      <StandalonePrototypeScreen
        screen={screen}
        colors={colors}
        scheme={scheme}
        appearance={appearance}
        onboardingStep={onboardingStep}
        bottomInset={insets.bottom}
        topInset={insets.top}
        onCycleAppearance={cycleAppearance}
        onSetOnboardingStep={setOnboardingStep}
        onOpen={setScreen}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}> 
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <GradientArtwork colors={colors} />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}> 
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.eyebrow, { color: colors.secondaryText }]}>WARM PANTRY</Text>
          <Text accessibilityRole="header" style={[styles.largeTitle, { color: colors.text }]}> 
            {TITLES[tab]}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <RoundButton
            icon={appearance === 'dark' ? 'moon' : appearance === 'light' ? 'sunny' : 'contrast'}
            label={`Appearance: ${appearance}`}
            colors={colors}
            onPress={cycleAppearance}
            badge={appearance === 'auto' ? 'A' : undefined}
          />
          <RoundButton
            icon="grid-outline"
            label="Open the full app map"
            colors={colors}
            onPress={() => setDirectoryOpen(true)}
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 112,
        }}
      >
        {tab === 'today' ? (
          <TodayView colors={colors} onOpenIntake={() => setIntakeOpen(true)} />
        ) : tab === 'inventory' ? (
          <InventoryView colors={colors} />
        ) : tab === 'boxes' ? (
          <BoxesView colors={colors} goal={boxGoal} setGoal={setBoxGoal} />
        ) : (
          <NeedsView colors={colors} />
        )}
      </ScrollView>

      <TabBar
        colors={colors}
        selected={tab}
        bottomInset={insets.bottom}
        onSelect={setTab}
      />

      <IntakeSheet
        visible={intakeOpen}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setIntakeOpen(false)}
      />
      <FeatureDirectorySheet
        visible={directoryOpen}
        colors={colors}
        bottomInset={insets.bottom}
        onClose={() => setDirectoryOpen(false)}
        onOpen={next => {
          setDirectoryOpen(false);
          setScreen(next);
        }}
      />
    </View>
  );
}

function GradientArtwork({ colors }: { colors: Palette }) {
  return (
    <Svg
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <SvgLinearGradient id="canvas" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors.canvas} />
          <Stop offset="1" stopColor={colors.canvasEnd} />
        </SvgLinearGradient>
        <RadialGradient id="warm" cx="0" cy="0" rx="1" ry="1">
          <Stop offset="0" stopColor={colors.gradientA} stopOpacity="0.42" />
          <Stop offset="1" stopColor={colors.gradientA} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sage" cx="1" cy="0" rx="1" ry="1">
          <Stop offset="0" stopColor={colors.gradientB} stopOpacity="0.28" />
          <Stop offset="1" stopColor={colors.gradientB} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="sun" cx="1" cy="1" rx="1" ry="1">
          <Stop offset="0" stopColor={colors.gradientC} stopOpacity="0.18" />
          <Stop offset="1" stopColor={colors.gradientC} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#canvas)" />
      <Circle cx="2%" cy="3%" r="230" fill="url(#warm)" />
      <Circle cx="100%" cy="18%" r="250" fill="url(#sage)" />
      <Circle cx="96%" cy="92%" r="270" fill="url(#sun)" />
    </Svg>
  );
}

const ONBOARDING_PAGES: Array<{
  artwork: 'camera' | 'scan' | 'boxes';
  eyebrow: string;
  title: string;
  body: string;
}> = [
  {
    artwork: 'camera',
    eyebrow: 'STEP 1 · TAKE PHOTOS',
    title: 'A donation pile or a whole shelf.',
    body: 'We will lead you through the process for a smooth, stress-free inventory.',
  },
  {
    artwork: 'scan',
    eyebrow: 'STEP 2 · AUTOMATIC ITEM LIST',
    title: 'Photos become an item spreadsheet.',
    body: 'PantryLens automatically turns the photos into an item spreadsheet, so nobody has to manually add items into a spreadsheet.',
  },
  {
    artwork: 'boxes',
    eyebrow: 'PACK WITH CONFIDENCE',
    title: 'Plan boxes from current inventory.',
    body: 'Set limits for food close to expiry, then see how many balanced boxes your current inventory can make.',
  },
];

const FEATURE_META: Record<
  Exclude<PrototypeScreen, 'main' | 'onboarding' | 'login' | 'signup' | 'pantry-selection'>,
  { title: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  'photo-intake': { title: 'Scan donations', subtitle: 'Photograph bags, boxes, or individual items', icon: 'camera-outline' },
  barcode: { title: 'Scan a barcode', subtitle: 'Hold one package steady inside the frame', icon: 'barcode-outline' },
  'manual-entry': { title: 'Add an item', subtitle: 'Enter an item without using the camera', icon: 'create-outline' },
  'review-verify': { title: 'Review & verify', subtitle: 'Check the detected items before adding them', icon: 'checkmark-done-outline' },
  'shelf-audit': { title: 'Count a shelf', subtitle: 'Photograph one shelf section at a time', icon: 'layers-outline' },
  'audit-review': { title: 'Check the count', subtitle: 'Reconcile what PantryLens saw with the shelf', icon: 'clipboard-outline' },
  'bulk-intake': { title: 'Bulk donation', subtitle: 'Log crates, pallets, and grocery rescue by weight', icon: 'scale-outline' },
  'item-detail': { title: 'Item details', subtitle: 'See and update one inventory item', icon: 'file-tray-full-outline' },
  expiring: { title: 'Use first', subtitle: 'Items approaching or past their date', icon: 'calendar-outline' },
  'ready-boxes': { title: 'Ready boxes', subtitle: 'Boxes waiting for pickup or distribution', icon: 'cube-outline' },
  'packing-checklist': { title: 'Packing checklist', subtitle: 'A clear list volunteers can follow box by box', icon: 'list-outline' },
  reports: { title: 'Reports & activity', subtitle: 'Track intake, distribution, and waste', icon: 'bar-chart-outline' },
  team: { title: 'Team', subtitle: 'People who can work in this pantry', icon: 'people-circle-outline' },
  member: { title: 'Member details', subtitle: 'Role, access, and recent activity', icon: 'person-circle-outline' },
  settings: { title: 'Pantry settings', subtitle: 'Rules, thresholds, feedback, and account options', icon: 'settings-outline' },
  places: { title: 'Storage places', subtitle: 'Organize shelves, rooms, and box folders', icon: 'location-outline' },
  offline: { title: 'Offline & sync', subtitle: 'Work continues when the connection does not', icon: 'cloud-offline-outline' },
};

function StandalonePrototypeScreen({
  screen,
  colors,
  scheme,
  appearance,
  onboardingStep,
  topInset,
  bottomInset,
  onCycleAppearance,
  onSetOnboardingStep,
  onOpen,
}: {
  screen: Exclude<PrototypeScreen, 'main'>;
  colors: Palette;
  scheme: 'light' | 'dark';
  appearance: Appearance;
  onboardingStep: number;
  topInset: number;
  bottomInset: number;
  onCycleAppearance: () => void;
  onSetOnboardingStep: React.Dispatch<React.SetStateAction<number>>;
  onOpen: (screen: PrototypeScreen) => void;
}) {
  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}> 
      <StatusBar translucent backgroundColor="transparent" barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <GradientArtwork colors={colors} />
      {screen === 'onboarding' ? (
        <OnboardingPrototype
          colors={colors}
          step={onboardingStep}
          topInset={topInset}
          bottomInset={bottomInset}
          onSetStep={onSetOnboardingStep}
          onContinue={() => onOpen('login')}
        />
      ) : screen === 'login' || screen === 'signup' ? (
        <AuthPrototype
          mode={screen}
          colors={colors}
          topInset={topInset}
          bottomInset={bottomInset}
          onOpen={onOpen}
        />
      ) : screen === 'pantry-selection' ? (
        <PantrySelectionPrototype
          colors={colors}
          topInset={topInset}
          bottomInset={bottomInset}
          onOpen={onOpen}
        />
      ) : (
        <FeaturePrototype
          screen={screen}
          colors={colors}
          topInset={topInset}
          bottomInset={bottomInset}
          appearance={appearance}
          onCycleAppearance={onCycleAppearance}
          onClose={() => onOpen('main')}
        />
      )}
    </View>
  );
}

function OnboardingPrototype({
  colors,
  step,
  topInset,
  bottomInset,
  onSetStep,
  onContinue,
}: {
  colors: Palette;
  step: number;
  topInset: number;
  bottomInset: number;
  onSetStep: React.Dispatch<React.SetStateAction<number>>;
  onContinue: () => void;
}) {
  const page = ONBOARDING_PAGES[step];
  const last = step === ONBOARDING_PAGES.length - 1;
  const artwork = page.artwork === 'camera'
    ? <CameraMock />
    : page.artwork === 'scan'
      ? <ScanMock />
      : <BoxesMock limitLabel="Limits for close to expiry" stockLabel="balanced from current inventory" />;
  return (
    <View style={[styles.onboarding, { paddingTop: topInset + 12, paddingBottom: Math.max(bottomInset, 18) }]}> 
      <View style={styles.onboardingTop}>
        <View style={styles.brandLockup}>
          <View style={[styles.brandMark, { backgroundColor: colors.brand }]}> 
            <Ionicons name="aperture" size={23} color={colors.onBrand} />
          </View>
          <Text style={[styles.brandName, { color: colors.text }]}>PantryLens</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onContinue} hitSlop={10}>
          <Text style={[styles.skipText, { color: colors.secondaryText }]}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.onboardingArtwork}> 
        <View style={styles.onboardingMockCanvas}>
          {artwork}
        </View>
      </View>

      <View style={styles.onboardingCopy}>
        <Text style={[styles.eyebrow, { color: colors.brand }]}>{page.eyebrow}</Text>
        <Text style={[styles.onboardingTitle, { color: colors.text }]}>{page.title}</Text>
        <Text style={[styles.onboardingBody, { color: colors.secondaryText }]}>{page.body}</Text>
      </View>

      <View style={styles.onboardingFooter}>
        <View style={styles.pageDots}>
          {ONBOARDING_PAGES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.pageDot,
                { backgroundColor: index === step ? colors.brand : colors.separator },
                index === step && styles.pageDotActive,
              ]}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => (last ? onContinue() : onSetStep(current => current + 1))}
          style={({ pressed }) => [styles.onboardingButton, { backgroundColor: pressed ? colors.brandPressed : colors.brand }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{last ? 'Get started' : 'Next'}</Text>
          <Ionicons name="arrow-forward" size={21} color={colors.onBrand} />
        </Pressable>
      </View>
    </View>
  );
}

function AuthPrototype({
  mode,
  colors,
  topInset,
  bottomInset,
  onOpen,
}: {
  mode: 'login' | 'signup';
  colors: Palette;
  topInset: number;
  bottomInset: number;
  onOpen: (screen: PrototypeScreen) => void;
}) {
  const signup = mode === 'signup';
  return (
    <ScrollView
      contentContainerStyle={[styles.authScreen, { paddingTop: topInset + 28, paddingBottom: bottomInset + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.authBrand}>
        <View style={[styles.authBrandMark, { backgroundColor: colors.brand }]}> 
          <Ionicons name="aperture" size={31} color={colors.onBrand} />
        </View>
        <Text style={[styles.authTitle, { color: colors.text }]}>{signup ? 'Create your account' : 'Welcome back'}</Text>
        <Text style={[styles.authSubtitle, { color: colors.secondaryText }]}> 
          {signup ? 'Set up your volunteer access.' : 'Sign in to continue to your pantry.'}
        </Text>
      </View>

      <View style={[styles.authCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}> 
        {signup ? <MockField colors={colors} label="Full name" value="Your name" icon="person-outline" /> : null}
        <MockField colors={colors} label="Email" value="volunteer@example.org" icon="mail-outline" />
        <MockField colors={colors} label="Password" value="••••••••" icon="lock-closed-outline" />
        <PrimaryButton colors={colors} icon={signup ? 'person-add-outline' : 'log-in-outline'} label={signup ? 'Create account' : 'Sign in'} onPress={() => onOpen('pantry-selection')} />
        {!signup ? (
          <Pressable accessibilityRole="button" style={styles.centerAction}>
            <Text style={[styles.linkText, { color: colors.brand }]}>Forgot password?</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => onOpen(signup ? 'login' : 'signup')}
        style={styles.authSwitch}
      >
        <Text style={[styles.body, { color: colors.secondaryText }]}>{signup ? 'Already have an account? ' : 'New to PantryLens? '}</Text>
        <Text style={[styles.linkText, { color: colors.brand }]}>{signup ? 'Sign in' : 'Create an account'}</Text>
      </Pressable>
      <Pressable onPress={() => onOpen('onboarding')} style={styles.centerAction}>
        <Text style={[styles.body, { color: colors.secondaryText }]}>View introduction again</Text>
      </Pressable>
    </ScrollView>
  );
}

function PantrySelectionPrototype({
  colors,
  topInset,
  bottomInset,
  onOpen,
}: {
  colors: Palette;
  topInset: number;
  bottomInset: number;
  onOpen: (screen: PrototypeScreen) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingTop: topInset + 18, paddingBottom: bottomInset + 28, paddingHorizontal: 20, gap: 18 }}>
      <View style={styles.entryHeader}>
        <Pressable onPress={() => onOpen('login')} style={[styles.backCircle, { backgroundColor: colors.surface }]}> 
          <Ionicons name="chevron-back" size={23} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: colors.secondaryText }]}>YOUR WORKSPACE</Text>
          <Text style={[styles.entryTitle, { color: colors.text }]}>Choose a pantry</Text>
        </View>
      </View>
      <Text style={[styles.intro, { color: colors.secondaryText }]}>Select where you are working today. You can switch later.</Text>
      <GroupedSurface colors={colors}>
        <Pressable onPress={() => onOpen('main')} style={({ pressed }) => [{ opacity: pressed ? 0.55 : 1 }]}>
          <View style={styles.pantryRow}>
            <View style={[styles.pantryAvatar, { backgroundColor: colors.brand }]}> 
              <Text style={[styles.pantryInitial, { color: colors.onBrand }]}>W</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Warm Pantry</Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>Volunteer · 1,432 items</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.tertiaryText} />
          </View>
        </Pressable>
      </GroupedSurface>
      <SectionLabel colors={colors}>OTHER OPTIONS</SectionLabel>
      <GroupedSurface colors={colors}>
        <ActionRow colors={colors} icon="key-outline" title="Join with a pantry code" subtitle="Ask a coordinator for the code" />
        <Divider colors={colors} />
        <ActionRow colors={colors} icon="add-circle-outline" title="Create a new pantry" subtitle="For a new organization or location" />
      </GroupedSurface>
      <PrimaryButton colors={colors} icon="arrow-forward" label="Continue to Warm Pantry" onPress={() => onOpen('main')} />
    </ScrollView>
  );
}

function MockField({ colors, label, value, icon }: { colors: Palette; label: string; value: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={styles.mockFieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.mockField, { backgroundColor: colors.surfaceStrong, borderColor: colors.separator }]}> 
        <Ionicons name={icon} size={20} color={colors.secondaryText} />
        <Text style={[styles.fieldValue, { color: colors.secondaryText }]}>{value}</Text>
      </View>
    </View>
  );
}

function FeaturePrototype({
  screen,
  colors,
  topInset,
  bottomInset,
  appearance,
  onCycleAppearance,
  onClose,
}: {
  screen: Exclude<PrototypeScreen, 'main' | 'onboarding' | 'login' | 'signup' | 'pantry-selection'>;
  colors: Palette;
  topInset: number;
  bottomInset: number;
  appearance: Appearance;
  onCycleAppearance: () => void;
  onClose: () => void;
}) {
  const meta = FEATURE_META[screen];
  return (
    <View style={styles.root}>
      <View style={[styles.featureHeader, { paddingTop: topInset + 8 }]}> 
        <RoundButton icon="chevron-back" label="Back to the main app" colors={colors} onPress={onClose} />
        <View style={styles.featureTitleBlock}>
          <Text style={[styles.featureTitle, { color: colors.text }]}>{meta.title}</Text>
          <Text style={[styles.featureSubtitle, { color: colors.secondaryText }]}>{meta.subtitle}</Text>
        </View>
        <RoundButton
          icon={appearance === 'dark' ? 'moon' : appearance === 'light' ? 'sunny' : 'contrast'}
          label={`Appearance: ${appearance}`}
          colors={colors}
          onPress={onCycleAppearance}
        />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: bottomInset + 28 }}
      >
        <FeatureBody screen={screen} colors={colors} />
      </ScrollView>
    </View>
  );
}

function FeatureBody({
  screen,
  colors,
}: {
  screen: Exclude<PrototypeScreen, 'main' | 'onboarding' | 'login' | 'signup' | 'pantry-selection'>;
  colors: Palette;
}) {
  if (screen === 'photo-intake' || screen === 'shelf-audit' || screen === 'barcode') {
    const barcode = screen === 'barcode';
    const shelf = screen === 'shelf-audit';
    return (
      <View style={styles.screenStack}>
        <View style={[styles.cameraMock, { backgroundColor: barcode ? '#111111' : '#2B2926' }]}> 
          <View style={styles.cameraTopRow}>
            <View style={styles.cameraRoundControl}><Ionicons name="close" size={22} color="#FFFFFF" /></View>
            <View style={styles.cameraRoundControl}><Ionicons name="flashlight-outline" size={22} color="#FFFFFF" /></View>
          </View>
          <View style={[barcode ? styles.barcodeFrame : styles.photoFrame, { borderColor: 'rgba(255,255,255,0.9)' }]}> 
            <Ionicons name={barcode ? 'barcode-outline' : shelf ? 'layers-outline' : 'scan-outline'} size={barcode ? 70 : 56} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.cameraInstruction}>{barcode ? 'Keep every bar inside the frame' : shelf ? 'Shelf 1 of 3 · left section' : 'Fit the whole donation inside the frame'}</Text>
          <View style={styles.cameraControls}>
            <View style={styles.cameraSmallControl}><Ionicons name="images-outline" size={24} color="#FFFFFF" /></View>
            <View style={styles.shutter}><View style={styles.shutterInner} /></View>
            <View style={styles.cameraSmallControl}><Text style={styles.photoCount}>{barcode ? '123' : '2'}</Text></View>
          </View>
        </View>
        {!barcode ? <PrimaryButton colors={colors} icon="sparkles-outline" label={shelf ? 'Review shelf count' : 'Detect items in 2 photos'} /> : null}
        <Text style={[styles.helperText, { color: colors.secondaryText }]}>{barcode ? 'You can also enter the digits manually.' : 'Add another photo when labels or dates are hard to read.'}</Text>
      </View>
    );
  }

  if (screen === 'manual-entry' || screen === 'bulk-intake') {
    const bulk = screen === 'bulk-intake';
    return (
      <View style={styles.screenStack}>
        <GroupedSurface colors={colors}>
          <View style={styles.formContent}>
            <MockField colors={colors} label={bulk ? 'Delivery name' : 'Item name'} value={bulk ? 'Grocery rescue' : 'Canned tomatoes'} icon={bulk ? 'business-outline' : 'nutrition-outline'} />
            <MockField colors={colors} label={bulk ? 'Total weight' : 'Category'} value={bulk ? '84 lb' : 'Vegetables'} icon={bulk ? 'scale-outline' : 'grid-outline'} />
            <MockField colors={colors} label={bulk ? 'Containers' : 'Expiration date'} value={bulk ? '6 crates' : 'Mar 2027'} icon={bulk ? 'cube-outline' : 'calendar-outline'} />
          </View>
        </GroupedSurface>
        <View style={[styles.infoBanner, { backgroundColor: colors.brandTint }]}> 
          <Ionicons name="information-circle-outline" size={22} color={colors.brand} />
          <Text style={[styles.body, styles.flex, { color: colors.text }]}>{bulk ? 'Bulk weights contribute to reports without inventing individual item counts.' : 'You can add a photo or barcode later.'}</Text>
        </View>
        <PrimaryButton colors={colors} icon="add-circle-outline" label={bulk ? 'Log bulk donation' : 'Add item to review'} />
      </View>
    );
  }

  if (screen === 'review-verify' || screen === 'audit-review') {
    return (
      <View style={styles.screenStack}>
        <View style={[styles.infoBanner, { backgroundColor: colors.warningTint }]}> 
          <Ionicons name="alert-circle" size={22} color={colors.warning} />
          <Text style={[styles.body, styles.flex, { color: colors.text }]}>2 items need your attention before this count can be saved.</Text>
        </View>
        <SectionLabel colors={colors}>NEEDS ATTENTION</SectionLabel>
        <GroupedSurface colors={colors}>
          <ReviewRow colors={colors} title="Unbranded peanut butter" category="Protein" count="1" warning />
          <Divider colors={colors} />
          <ReviewRow colors={colors} title="Assorted dented cans" category="Choose category" count="3" warning />
        </GroupedSurface>
        <SectionLabel colors={colors}>READY</SectionLabel>
        <GroupedSurface colors={colors}>
          <ReviewRow colors={colors} title="Canned corn" category="Vegetables" count="4" />
          <Divider colors={colors} />
          <ReviewRow colors={colors} title="White rice" category="Grains & pasta" count="2" />
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="checkmark-circle-outline" label={screen === 'audit-review' ? 'Update shelf count' : 'Add 7 items to inventory'} />
      </View>
    );
  }

  if (screen === 'item-detail') {
    return (
      <View style={styles.screenStack}>
        <View style={[styles.itemHero, { backgroundColor: colors.surface, borderColor: colors.separator }]}> 
          <View style={[styles.largeItemIcon, { backgroundColor: colors.brandTint }]}><Ionicons name="nutrition-outline" size={38} color={colors.brand} /></View>
          <View style={styles.flex}><Text style={[styles.resultTitle, { color: colors.text }]}>Peanut butter</Text><Text style={[styles.body, { color: colors.secondaryText }]}>Protein · 18 in stock</Text></View>
          <View style={[styles.statusBadge, { backgroundColor: colors.goodTint }]}><Text style={[styles.statusText, { color: colors.good }]}>In stock</Text></View>
        </View>
        <GroupedSurface colors={colors}>
          <DetailRow colors={colors} label="Count" value="18" />
          <Divider colors={colors} />
          <DetailRow colors={colors} label="Expiration" value="Aug 2027" />
          <Divider colors={colors} />
          <DetailRow colors={colors} label="Location" value="Shelf A · Bin 3" />
          <Divider colors={colors} />
          <DetailRow colors={colors} label="Source" value="Donation" />
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="create-outline" label="Edit item" />
      </View>
    );
  }

  if (screen === 'expiring') {
    return (
      <View style={styles.screenStack}>
        <View style={[styles.infoBanner, { backgroundColor: colors.warningTint }]}> 
          <Ionicons name="time-outline" size={22} color={colors.warning} />
          <Text style={[styles.body, styles.flex, { color: colors.text }]}>18 items should be used within 30 days.</Text>
        </View>
        <SectionLabel colors={colors}>PAST DATE</SectionLabel>
        <GroupedSurface colors={colors}><InventoryRow colors={colors} title="Tomato soup" subtitle="3 cans · Sep 28" icon="alert-circle-outline" status="Review" statusColor={colors.critical} statusBackground={colors.criticalTint} /></GroupedSurface>
        <SectionLabel colors={colors}>THIS WEEK</SectionLabel>
        <GroupedSurface colors={colors}>
          <InventoryRow colors={colors} title="Canned tuna" subtitle="2 cans · Friday" icon="time-outline" status="Use first" statusColor={colors.warning} statusBackground={colors.warningTint} />
          <Divider colors={colors} />
          <InventoryRow colors={colors} title="Oats" subtitle="5 boxes · Sunday" icon="time-outline" status="Soon" statusColor={colors.warning} statusBackground={colors.warningTint} />
        </GroupedSurface>
      </View>
    );
  }

  if (screen === 'ready-boxes' || screen === 'packing-checklist') {
    const checklist = screen === 'packing-checklist';
    return (
      <View style={styles.screenStack}>
        <View style={[styles.progressHero, { backgroundColor: colors.brandTint }]}> 
          <View><Text style={[styles.resultNumber, { color: colors.text }]}>{checklist ? '3/8' : '14'}</Text><Text style={[styles.body, { color: colors.secondaryText }]}>{checklist ? 'items packed in this box' : 'boxes ready for pickup'}</Text></View>
          <Ionicons name={checklist ? 'checkmark-done-circle-outline' : 'cube-outline'} size={48} color={colors.brand} />
        </View>
        <SectionLabel colors={colors}>{checklist ? 'BOX 1 OF 8' : 'READY TODAY'}</SectionLabel>
        <GroupedSurface colors={colors}>
          {checklist ? (
            <>
              <ChecklistRow colors={colors} label="2 canned vegetables" checked />
              <Divider colors={colors} />
              <ChecklistRow colors={colors} label="2 grains or pasta" checked />
              <Divider colors={colors} />
              <ChecklistRow colors={colors} label="1 protein" />
              <Divider colors={colors} />
              <ChecklistRow colors={colors} label="1 breakfast item" />
            </>
          ) : (
            <>
              <ActionRow colors={colors} icon="cube-outline" title="Family boxes" subtitle="8 boxes · families of 4" />
              <Divider colors={colors} />
              <ActionRow colors={colors} icon="cube-outline" title="Senior boxes" subtitle="6 boxes · pickup at 3:00 PM" />
            </>
          )}
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="checkmark-outline" label={checklist ? 'Finish this box' : 'Log a pickup'} />
      </View>
    );
  }

  if (screen === 'reports') {
    return (
      <View style={styles.screenStack}>
        <View style={styles.reportMetrics}>
          <ReportMetric colors={colors} value="428" label="Items received" icon="arrow-down-outline" />
          <ReportMetric colors={colors} value="176" label="Items given out" icon="arrow-up-outline" />
        </View>
        <GroupedSurface colors={colors}>
          <View style={styles.chartArea}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Inventory this month</Text>
            <View style={styles.barRow}>{[42, 64, 48, 78, 69, 88, 74].map((height, index) => <View key={index} style={[styles.chartBar, { height, backgroundColor: index === 5 ? colors.brand : colors.brandTint }]} />)}</View>
            <View style={styles.chartLabels}><Text style={[styles.chartLabel, { color: colors.tertiaryText }]}>Oct 1</Text><Text style={[styles.chartLabel, { color: colors.tertiaryText }]}>Today</Text></View>
          </View>
        </GroupedSurface>
        <SectionLabel colors={colors}>RECENT ACTIVITY</SectionLabel>
        <GroupedSurface colors={colors}>
          <ActionRow colors={colors} icon="camera-outline" title="Donation added" subtitle="42 items · Today, 10:32 AM" />
          <Divider colors={colors} />
          <ActionRow colors={colors} icon="cube-outline" title="8 boxes packed" subtitle="Yesterday · Maria" />
        </GroupedSurface>
      </View>
    );
  }

  if (screen === 'team' || screen === 'member') {
    if (screen === 'member') {
      return (
        <View style={styles.screenStack}>
          <View style={styles.memberHero}>
            <View style={[styles.memberAvatar, { backgroundColor: colors.brandTint }]}><Text style={[styles.memberInitials, { color: colors.brand }]}>MR</Text></View>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Maria Rodriguez</Text>
            <Text style={[styles.body, { color: colors.secondaryText }]}>Coordinator</Text>
          </View>
          <GroupedSurface colors={colors}>
            <DetailRow colors={colors} label="Role" value="Coordinator" />
            <Divider colors={colors} />
            <DetailRow colors={colors} label="Joined" value="Aug 2026" />
            <Divider colors={colors} />
            <DetailRow colors={colors} label="Last active" value="Today" />
          </GroupedSurface>
          <PrimaryButton colors={colors} icon="shield-checkmark-outline" label="Manage access" />
        </View>
      );
    }
    return (
      <View style={styles.screenStack}>
        <View style={[styles.infoBanner, { backgroundColor: colors.goodTint }]}><Ionicons name="people-outline" size={22} color={colors.good} /><Text style={[styles.body, styles.flex, { color: colors.text }]}>6 people can work in Warm Pantry.</Text></View>
        <GroupedSurface colors={colors}>
          <MemberRow colors={colors} initials="MR" name="Maria Rodriguez" role="Coordinator" />
          <Divider colors={colors} />
          <MemberRow colors={colors} initials="JL" name="Jordan Lee" role="Volunteer" />
          <Divider colors={colors} />
          <MemberRow colors={colors} initials="AP" name="Avery Patel" role="Volunteer" />
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="person-add-outline" label="Invite a team member" />
      </View>
    );
  }

  if (screen === 'places') {
    return (
      <View style={styles.screenStack}>
        <Text style={[styles.intro, { color: colors.secondaryText }]}>Give volunteers familiar names they can recognize immediately.</Text>
        <GroupedSurface colors={colors}>
          <ActionRow colors={colors} icon="storefront-outline" title="Main pantry room" subtitle="4 shelves · 812 items" />
          <Divider colors={colors} />
          <ActionRow colors={colors} icon="snow-outline" title="Cold storage" subtitle="2 freezers · 96 items" />
          <Divider colors={colors} />
          <ActionRow colors={colors} icon="archive-outline" title="Ready box folders" subtitle="Family, senior, and emergency" />
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="add-outline" label="Add a storage place" />
      </View>
    );
  }

  if (screen === 'offline') {
    return (
      <View style={styles.screenStack}>
        <View style={[styles.offlineHero, { backgroundColor: colors.warningTint }]}> 
          <Ionicons name="cloud-offline-outline" size={48} color={colors.warning} />
          <Text style={[styles.resultTitle, { color: colors.text }]}>You can keep working</Text>
          <Text style={[styles.body, styles.centerText, { color: colors.secondaryText }]}>Changes are saved on this phone and upload when a connection returns.</Text>
        </View>
        <GroupedSurface colors={colors}>
          <DetailRow colors={colors} label="Waiting to sync" value="3 changes" />
          <Divider colors={colors} />
          <DetailRow colors={colors} label="Last successful sync" value="8:42 AM" />
        </GroupedSurface>
        <PrimaryButton colors={colors} icon="sync-outline" label="Try syncing now" />
      </View>
    );
  }

  return (
    <View style={styles.screenStack}>
      <SectionLabel colors={colors}>PANTRY</SectionLabel>
      <GroupedSurface colors={colors}>
        <ActionRow colors={colors} icon="cube-outline" title="Box rules" subtitle="What belongs in a balanced box" />
        <Divider colors={colors} />
        <ActionRow colors={colors} icon="speedometer-outline" title="Low-stock thresholds" subtitle="When to flag a category" />
        <Divider colors={colors} />
        <ActionRow colors={colors} icon="calendar-outline" title="Expiration window" subtitle="30 days" />
      </GroupedSurface>
      <SectionLabel colors={colors}>ACCESSIBILITY & FEEDBACK</SectionLabel>
      <GroupedSurface colors={colors}>
        <SettingsToggle colors={colors} icon="text-outline" label="High legibility" enabled />
        <Divider colors={colors} />
        <SettingsToggle colors={colors} icon="phone-portrait-outline" label="Haptics" enabled />
        <Divider colors={colors} />
        <SettingsToggle colors={colors} icon="volume-medium-outline" label="Sounds" enabled={false} />
      </GroupedSurface>
      <SectionLabel colors={colors}>ACCOUNT</SectionLabel>
      <GroupedSurface colors={colors}><ActionRow colors={colors} icon="swap-horizontal-outline" title="Switch pantry" /><Divider colors={colors} /><ActionRow colors={colors} icon="log-out-outline" title="Sign out" /></GroupedSurface>
    </View>
  );
}

function ReviewRow({ colors, title, category, count, warning }: { colors: Palette; title: string; category: string; count: string; warning?: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <View style={[styles.reviewIcon, { backgroundColor: warning ? colors.warningTint : colors.goodTint }]}><Ionicons name={warning ? 'help-outline' : 'checkmark-outline'} size={22} color={warning ? colors.warning : colors.good} /></View>
      <View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.body, { color: warning ? colors.warning : colors.secondaryText }]}>{category}</Text></View>
      <View style={[styles.miniStepper, { backgroundColor: colors.surfaceMuted }]}><Ionicons name="remove" size={17} color={colors.brand} /><Text style={[styles.miniStepperValue, { color: colors.text }]}>{count}</Text><Ionicons name="add" size={17} color={colors.brand} /></View>
    </View>
  );
}

function DetailRow({ colors, label, value }: { colors: Palette; label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={[styles.rowTitle, styles.flex, { color: colors.text }]}>{label}</Text><Text style={[styles.body, { color: colors.secondaryText }]}>{value}</Text><Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} /></View>;
}

function ChecklistRow({ colors, label, checked }: { colors: Palette; label: string; checked?: boolean }) {
  return <View style={styles.checklistRow}><Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={checked ? colors.good : colors.tertiaryText} /><Text style={[styles.rowTitle, styles.flex, { color: colors.text }, checked && styles.completedText]}>{label}</Text></View>;
}

function ReportMetric({ colors, value, label, icon }: { colors: Palette; value: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  return <View style={[styles.reportMetric, { backgroundColor: colors.surface, borderColor: colors.separator }]}><Ionicons name={icon} size={22} color={colors.brand} /><Text style={[styles.metricBig, { color: colors.text }]}>{value}</Text><Text style={[styles.body, { color: colors.secondaryText }]}>{label}</Text></View>;
}

function MemberRow({ colors, initials, name, role }: { colors: Palette; initials: string; name: string; role: string }) {
  return <View style={styles.memberRow}><View style={[styles.smallAvatar, { backgroundColor: colors.brandTint }]}><Text style={[styles.smallAvatarText, { color: colors.brand }]}>{initials}</Text></View><View style={styles.flex}><Text style={[styles.rowTitle, { color: colors.text }]}>{name}</Text><Text style={[styles.body, { color: colors.secondaryText }]}>{role}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} /></View>;
}

function SettingsToggle({ colors, icon, label, enabled }: { colors: Palette; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; enabled: boolean }) {
  return <View style={styles.settingToggle}><Ionicons name={icon} size={22} color={colors.brand} /><Text style={[styles.rowTitle, styles.flex, { color: colors.text }]}>{label}</Text><View style={[styles.switchTrack, { backgroundColor: enabled ? colors.good : colors.surfaceMuted }, !enabled && { borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth }]}><View style={[styles.switchThumb, { backgroundColor: colors.surfaceStrong }, enabled && styles.switchThumbOn]} /></View></View>;
}

function TodayView({ colors, onOpenIntake }: { colors: Palette; onOpenIntake: () => void }) {
  return (
    <View style={styles.screenStack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a donation"
        onPress={onOpenIntake}
        style={({ pressed }) => [
          styles.heroPressable,
          {
            transform: [{ scale: pressed ? 0.985 : 1 }],
            shadowColor: colors.shadow,
          },
        ]}
      >
        <LinearGradient
          colors={[colors.brand, colors.brandPressed]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons name="scan" size={29} color={colors.onBrand} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.heroTitle, { color: colors.onBrand }]}>Scan a donation</Text>
            <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.84)' }]}> 
              Add food in a few taps
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={colors.onBrand} />
        </LinearGradient>
      </Pressable>

      <View style={[styles.notice, { backgroundColor: colors.warningTint, borderColor: colors.separator }]}> 
        <View style={[styles.noticeIcon, { backgroundColor: colors.surfaceStrong }]}> 
          <Ionicons name="alert-circle" size={22} color={colors.warning} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Protein is running low</Text>
          <Text style={[styles.body, { color: colors.secondaryText }]}> 
            7 more items are needed for this week’s boxes.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={19} color={colors.tertiaryText} />
      </View>

      <SectionLabel colors={colors}>QUICK ACTIONS</SectionLabel>
      <GroupedSurface colors={colors}>
        <ActionRow
          colors={colors}
          icon="add-circle-outline"
          title="Quick add staples"
          subtitle="Beans, rice, pasta, and soup"
        />
        <Divider colors={colors} />
        <ActionRow
          colors={colors}
          icon="camera-outline"
          title="Count a shelf"
          subtitle="Update what is currently in stock"
        />
      </GroupedSurface>

      <SectionLabel colors={colors}>PANTRY AT A GLANCE</SectionLabel>
      <GroupedSurface colors={colors}>
        <MetricRow colors={colors} icon="file-tray-stacked-outline" label="Items in stock" value="1,432" />
        <Divider colors={colors} />
        <MetricRow colors={colors} icon="cube-outline" label="Boxes" value="24" />
        <Divider colors={colors} />
        <MetricRow
          colors={colors}
          icon="calendar-outline"
          label="Use first"
          value="18"
          valueColor={colors.warning}
        />
      </GroupedSurface>
    </View>
  );
}

function InventoryView({ colors }: { colors: Palette }) {
  return (
    <View style={styles.screenStack}>
      <View style={[styles.searchField, { backgroundColor: colors.surfaceMuted }]}> 
        <Ionicons name="search" size={21} color={colors.secondaryText} />
        <Text style={[styles.searchText, { color: colors.secondaryText }]}>Search inventory</Text>
        <View style={[styles.filterButton, { backgroundColor: colors.surfaceStrong }]}> 
          <Ionicons name="options-outline" size={20} color={colors.text} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        <FilterChip selected colors={colors} label="All" />
        <FilterChip colors={colors} label="Use first" />
        <FilterChip colors={colors} label="Low stock" />
        <FilterChip colors={colors} label="Protein" />
      </ScrollView>

      <SectionLabel colors={colors}>GRAINS &amp; PASTA</SectionLabel>
      <GroupedSurface colors={colors}>
        <InventoryRow colors={colors} title="White rice" subtitle="12 in stock · Dec 2026" icon="restaurant-outline" />
        <Divider colors={colors} />
        <InventoryRow
          colors={colors}
          title="Oats"
          subtitle="5 in stock · Use first"
          icon="time-outline"
          status="Soon"
          statusColor={colors.warning}
          statusBackground={colors.warningTint}
        />
      </GroupedSurface>

      <SectionLabel colors={colors}>PROTEIN</SectionLabel>
      <GroupedSurface colors={colors}>
        <InventoryRow colors={colors} title="Peanut butter" subtitle="18 in stock · Aug 2027" icon="nutrition-outline" />
        <Divider colors={colors} />
        <InventoryRow
          colors={colors}
          title="Canned tuna"
          subtitle="4 in stock"
          icon="fish-outline"
          status="Low"
          statusColor={colors.critical}
          statusBackground={colors.criticalTint}
        />
      </GroupedSurface>
    </View>
  );
}

function BoxesView({
  colors,
  goal,
  setGoal,
}: {
  colors: Palette;
  goal: number;
  setGoal: React.Dispatch<React.SetStateAction<number>>;
}) {
  const possible = Math.min(goal, 8);
  const shortfall = Math.max(0, goal - possible);
  return (
    <View style={[styles.screenStack, styles.compactStack]}>
      <Text style={[styles.intro, { color: colors.secondaryText }]}> 
        Plan boxes from today’s inventory.
      </Text>

      <GroupedSurface colors={colors}>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Box goal</Text>
            <Text style={[styles.body, { color: colors.secondaryText }]}>For families of 4</Text>
          </View>
          <Stepper colors={colors} value={goal} onChange={setGoal} />
        </View>
      </GroupedSurface>

      <View style={[styles.boxResultCard, { backgroundColor: colors.surface, borderColor: colors.separator }]}> 
        <View style={styles.boxResultTop}>
          <View style={[styles.resultIcon, styles.boxResultIcon, { backgroundColor: colors.goodTint }]}> 
            <Ionicons name="cube" size={27} color={colors.good} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.boxResultNumber, { color: colors.text }]}>{possible}</Text>
            <Text style={[styles.boxResultLabel, { color: colors.text }]}>Boxes</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors.goodTint }]}>
            <Text style={[styles.statusText, { color: colors.good }]}>READY</Text>
          </View>
        </View>
        <View style={[styles.boxLimitRow, { backgroundColor: shortfall > 0 ? colors.warningTint : colors.goodTint }]}> 
          <Ionicons name={shortfall > 0 ? 'alert-circle' : 'checkmark-circle'} size={21} color={shortfall > 0 ? colors.warning : colors.good} />
          <Text style={[styles.boxLimitText, { color: colors.text }]}> 
            {shortfall > 0 ? (
              <><Text style={{ fontWeight: '700' }}>Protein limits this plan.</Text> Need {shortfall} more items.</>
            ) : (
              <><Text style={{ fontWeight: '700' }}>Goal covered.</Text> Current inventory supports all {goal} boxes.</>
            )}
          </Text>
        </View>
      </View>

      <PrimaryButton colors={colors} icon="checkmark-circle-outline" label={`Pack ${possible} boxes`} />

      <SectionLabel colors={colors}>PACK FIRST</SectionLabel>
      <GroupedSurface colors={colors}>
        <ActionRow
          colors={colors}
          icon="time-outline"
          iconTone="warning"
          title="2 cans of tuna"
          subtitle="Use first · Expiring this week"
        />
        <Divider colors={colors} />
        <ActionRow colors={colors} icon="list-outline" title="View the full packing list" />
      </GroupedSurface>
    </View>
  );
}

function NeedsView({ colors }: { colors: Palette }) {
  return (
    <View style={[styles.screenStack, styles.compactStack]}>
      <View style={[styles.summaryCard, { backgroundColor: colors.brandTint, borderColor: colors.separator }]}> 
        <View style={[styles.summaryIcon, { backgroundColor: colors.surfaceStrong }]}> 
          <Ionicons name="heart-outline" size={25} color={colors.brand} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.resultTitle, styles.summaryTitle, { color: colors.text }]}>3 urgent categories</Text>
          <Text style={[styles.body, { color: colors.secondaryText }]}>Based on your box goal and current stock.</Text>
        </View>
      </View>

      <PrimaryButton colors={colors} icon="share-outline" label="Share needs list" />

      <SectionLabel colors={colors}>MOST NEEDED</SectionLabel>
      <GroupedSurface colors={colors}>
        <NeedRow colors={colors} rank="1" title="Protein" subtitle="Tuna, beans, peanut butter" amount="Need 7" tone="critical" />
        <Divider colors={colors} />
        <NeedRow colors={colors} rank="2" title="Breakfast" subtitle="Oats and cereal" amount="Need 5" tone="warning" />
        <Divider colors={colors} />
        <NeedRow colors={colors} rank="3" title="Baby needs" subtitle="Formula and baby food" amount="Need 3" tone="neutral" />
      </GroupedSurface>

    </View>
  );
}

function IntakeSheet({
  visible,
  colors,
  bottomInset,
  onClose,
}: {
  visible: boolean;
  colors: Palette;
  bottomInset: number;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close donation intake"
          onPress={onClose}
          style={styles.modalBackdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.glass,
              paddingBottom: Math.max(bottomInset, 16),
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Add a donation</Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>Choose the quickest method for what is in front of you.</Text>
            </View>
            <RoundButton icon="close" label="Close" colors={colors} onPress={onClose} />
          </View>

          <View style={[styles.sheetOptions, { backgroundColor: colors.surfaceStrong }]}> 
            <ActionRow
              colors={colors}
              icon="camera-outline"
              title="Take photos"
              subtitle="Best for bags, boxes, and mixed donations"
              onPress={onClose}
            />
            <Divider colors={colors} />
            <ActionRow
              colors={colors}
              icon="barcode-outline"
              title="Scan a barcode"
              subtitle="Best for one packaged item"
              onPress={onClose}
            />
            <Divider colors={colors} />
            <ActionRow
              colors={colors}
              icon="create-outline"
              title="Enter items manually"
              subtitle="Add something without the camera"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const FEATURE_GROUPS: Array<{
  title: string;
  description: string;
  items: Array<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    screen: PrototypeScreen;
  }>;
}> = [
  {
    title: 'Get started',
    description: 'Before a volunteer reaches the main app',
    items: [
      { icon: 'sparkles-outline', label: 'Onboarding', screen: 'onboarding' },
      { icon: 'log-in-outline', label: 'Sign in', screen: 'login' },
      { icon: 'person-add-outline', label: 'Create an account', screen: 'signup' },
      { icon: 'people-outline', label: 'Choose, join, or create a pantry', screen: 'pantry-selection' },
    ],
  },
  {
    title: 'Add and count food',
    description: 'Fast paths for different kinds of donations',
    items: [
      { icon: 'camera-outline', label: 'Photo donation intake', screen: 'photo-intake' },
      { icon: 'barcode-outline', label: 'Barcode scanning', screen: 'barcode' },
      { icon: 'create-outline', label: 'Manual item entry', screen: 'manual-entry' },
      { icon: 'layers-outline', label: 'Shelf audit', screen: 'shelf-audit' },
      { icon: 'checkmark-circle-outline', label: 'Shelf count review', screen: 'audit-review' },
      { icon: 'scale-outline', label: 'Bulk delivery intake', screen: 'bulk-intake' },
      { icon: 'checkmark-done-outline', label: 'Review and verify', screen: 'review-verify' },
    ],
  },
  {
    title: 'Manage inventory',
    description: 'Everything already in the pantry',
    items: [
      { icon: 'file-tray-stacked-outline', label: 'Item details and editing', screen: 'item-detail' },
      { icon: 'calendar-outline', label: 'Expiring soon', screen: 'expiring' },
      { icon: 'location-outline', label: 'Storage places and folders', screen: 'places' },
    ],
  },
  {
    title: 'Pack and distribute',
    description: 'Turn stock into useful family boxes',
    items: [
      { icon: 'cube-outline', label: 'Ready boxes', screen: 'ready-boxes' },
      { icon: 'list-outline', label: 'Packing checklist', screen: 'packing-checklist' },
    ],
  },
  {
    title: 'Run the pantry',
    description: 'Coordinator tools stay available without crowding volunteer tasks',
    items: [
      { icon: 'bar-chart-outline', label: 'Reports and activity', screen: 'reports' },
      { icon: 'people-circle-outline', label: 'Team', screen: 'team' },
      { icon: 'person-circle-outline', label: 'Member details', screen: 'member' },
      { icon: 'settings-outline', label: 'Settings, rules, and thresholds', screen: 'settings' },
      { icon: 'cloud-offline-outline', label: 'Offline and sync status', screen: 'offline' },
    ],
  },
];

function FeatureDirectorySheet({
  visible,
  colors,
  bottomInset,
  onClose,
  onOpen,
}: {
  visible: boolean;
  colors: Palette;
  bottomInset: number;
  onClose: () => void;
  onOpen: (screen: PrototypeScreen) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close full app map"
          onPress={onClose}
          style={styles.modalBackdrop}
        />
        <View
          style={[
            styles.directorySheet,
            {
              backgroundColor: colors.glass,
              paddingBottom: Math.max(bottomInset, 16),
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Full app map</Text>
              <Text style={[styles.body, { color: colors.secondaryText }]}>Every existing PantryLens capability remains in the revamp.</Text>
            </View>
            <RoundButton icon="close" label="Close" colors={colors} onPress={onClose} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.directoryContent}>
            {FEATURE_GROUPS.map(group => (
              <View key={group.title} style={styles.directoryGroup}>
                <Text style={[styles.directoryTitle, { color: colors.text }]}>{group.title}</Text>
                <Text style={[styles.directoryDescription, { color: colors.secondaryText }]}>{group.description}</Text>
                <View style={[styles.directoryList, { backgroundColor: colors.surfaceStrong }]}> 
                  {group.items.map((item, index) => (
                    <React.Fragment key={item.label}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onOpen(item.screen)}
                        style={({ pressed }) => [styles.directoryRow, { opacity: pressed ? 0.52 : 1 }]}
                      >
                        <Ionicons name={item.icon} size={21} color={colors.brand} />
                        <Text style={[styles.directoryRowLabel, { color: colors.text }]}>{item.label}</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.tertiaryText} />
                      </Pressable>
                      {index < group.items.length - 1 ? <View style={[styles.directoryDivider, { backgroundColor: colors.separator }]} /> : null}
                    </React.Fragment>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TabBar({
  colors,
  selected,
  bottomInset,
  onSelect,
}: {
  colors: Palette;
  selected: Tab;
  bottomInset: number;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <View
      style={[
        styles.tabBar,
        {
          bottom: Math.max(bottomInset, 8),
          backgroundColor: colors.glass,
          borderColor: colors.separator,
          shadowColor: colors.shadow,
        },
      ]}
    >
      {TABS.map(item => {
        const active = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onSelect(item.key)}
            style={({ pressed }) => [styles.tabItem, { opacity: pressed ? 0.62 : 1 }]}
          >
            <View style={[styles.tabIconWrap, active && { backgroundColor: colors.brandTint }]}> 
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={22}
                color={active ? colors.brand : colors.secondaryText}
              />
            </View>
            <Text style={[styles.tabLabel, { color: active ? colors.brand : colors.secondaryText }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function GroupedSurface({ colors, children }: { colors: Palette; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.groupedSurface,
        {
          backgroundColor: colors.surface,
          borderColor: colors.separator,
          shadowColor: colors.shadow,
        },
      ]}
    >
      {children}
    </View>
  );
}

function ActionRow({
  colors,
  icon,
  title,
  subtitle,
  iconTone = 'brand',
  onPress,
}: {
  colors: Palette;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  iconTone?: 'brand' | 'warning';
  onPress?: () => void;
}) {
  const foreground = iconTone === 'warning' ? colors.warning : colors.brand;
  const background = iconTone === 'warning' ? colors.warningTint : colors.brandTint;
  const body = (
    <View style={styles.actionRow}>
      <View style={[styles.rowIcon, { backgroundColor: background }]}> 
        <Ionicons name={icon} size={22} color={foreground} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.body, { color: colors.secondaryText }]}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.tertiaryText} />
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.58 : 1 })}>
      {body}
    </Pressable>
  );
}

function MetricRow({
  colors,
  icon,
  label,
  value,
  valueColor,
}: {
  colors: Palette;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Ionicons name={icon} size={22} color={colors.secondaryText} />
      <Text style={[styles.rowTitle, styles.flex, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: valueColor ?? colors.text }]}>{value}</Text>
    </View>
  );
}

function InventoryRow({
  colors,
  title,
  subtitle,
  icon,
  status,
  statusColor,
  statusBackground,
}: {
  colors: Palette;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  status?: string;
  statusColor?: string;
  statusBackground?: string;
}) {
  return (
    <View style={styles.inventoryRow}>
      <View style={[styles.inventoryIcon, { backgroundColor: colors.surfaceMuted }]}> 
        <Ionicons name={icon} size={23} color={colors.secondaryText} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>{subtitle}</Text>
      </View>
      {status ? (
        <View style={[styles.statusBadge, { backgroundColor: statusBackground }]}> 
          <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={19} color={colors.tertiaryText} />
    </View>
  );
}

function NeedRow({
  colors,
  rank,
  title,
  subtitle,
  amount,
  tone,
}: {
  colors: Palette;
  rank: string;
  title: string;
  subtitle: string;
  amount: string;
  tone: 'critical' | 'warning' | 'neutral';
}) {
  const foreground = tone === 'critical' ? colors.critical : tone === 'warning' ? colors.warning : colors.brand;
  const background = tone === 'critical' ? colors.criticalTint : tone === 'warning' ? colors.warningTint : colors.brandTint;
  return (
    <View style={styles.needRow}>
      <View style={[styles.rank, { backgroundColor: background }]}> 
        <Text style={[styles.rankText, { color: foreground }]}>{rank}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>{subtitle}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.amountText, { color: foreground }]}>{amount}</Text>
    </View>
  );
}

function Stepper({
  colors,
  value,
  onChange,
}: {
  colors: Palette;
  value: number;
  onChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surfaceMuted }]}> 
      <StepperButton colors={colors} icon="remove" label="Decrease boxes" onPress={() => onChange(current => Math.max(1, current - 1))} />
      <Text style={[styles.stepperValue, { color: colors.text }]}>{value}</Text>
      <StepperButton colors={colors} icon="add" label="Increase boxes" onPress={() => onChange(current => Math.min(99, current + 1))} />
    </View>
  );
}

function StepperButton({
  colors,
  icon,
  label,
  onPress,
}: {
  colors: Palette;
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, { opacity: pressed ? 0.45 : 1 }]}
    >
      <Ionicons name={icon} size={21} color={colors.brand} />
    </Pressable>
  );
}

function PrimaryButton({
  colors,
  icon,
  label,
  onPress,
}: {
  colors: Palette;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        {
          backgroundColor: pressed ? colors.brandPressed : colors.brand,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <Ionicons name={icon} size={21} color={colors.onBrand} />
      <Text style={[styles.primaryButtonText, { color: colors.onBrand }]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({ selected, colors, label }: { selected?: boolean; colors: Palette; label: string }) {
  return (
    <View
      style={[
        styles.filterChip,
        {
          backgroundColor: selected ? colors.brand : colors.surface,
          borderColor: selected ? colors.brand : colors.separator,
        },
      ]}
    >
      <Text style={[styles.filterText, { color: selected ? colors.onBrand : colors.text }]}>{label}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  colors,
  onPress,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  colors: Palette;
  onPress?: () => void;
  badge?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundButton,
        {
          backgroundColor: colors.surface,
          borderColor: colors.separator,
          opacity: pressed ? 0.55 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      {badge ? (
        <View style={[styles.modeBadge, { backgroundColor: colors.brand }]}> 
          <Text style={[styles.modeBadgeText, { color: colors.onBrand }]}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function SectionLabel({ colors, children }: { colors: Palette; children: React.ReactNode }) {
  return <Text style={[styles.sectionLabel, { color: colors.secondaryText }]}>{children}</Text>;
}

function Divider({ colors }: { colors: Palette }) {
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    minHeight: 110,
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  headerTitleBlock: { flex: 1, gap: 1 },
  headerActions: { flexDirection: 'row', gap: 10, paddingBottom: 3 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8 },
  largeTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: Platform.OS === 'ios' ? '700' : '800',
    letterSpacing: -0.8,
  },
  screenStack: { gap: 16 },
  compactStack: { gap: 12 },
  heroPressable: {
    borderRadius: 22,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  hero: {
    minHeight: 116,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.25 },
  heroSubtitle: { marginTop: 2, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  notice: {
    minHeight: 82,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  groupedSurface: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  sectionLabel: { marginTop: 6, marginLeft: 4, fontSize: 13, lineHeight: 17, fontWeight: '700', letterSpacing: 0.55 },
  actionRow: { minHeight: 72, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
  metricRow: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  metricValue: { fontSize: 19, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  searchField: { height: 52, borderRadius: 16, paddingLeft: 15, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchText: { flex: 1, fontSize: 17, lineHeight: 22 },
  filterButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filters: { gap: 9, paddingRight: 20 },
  filterChip: { minHeight: 42, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, justifyContent: 'center' },
  filterText: { fontSize: 15, fontWeight: '600' },
  inventoryRow: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  inventoryIcon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  intro: { fontSize: 17, lineHeight: 24, marginBottom: 2 },
  settingRow: { minHeight: 84, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center' },
  stepperButton: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 30, textAlign: 'center', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  resultCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 22, alignItems: 'center' },
  resultIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  resultNumber: { marginTop: 12, fontSize: 48, lineHeight: 54, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  resultTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  centerText: { textAlign: 'center', marginTop: 7, maxWidth: 300 },
  boxResultCard: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 11 },
  boxResultTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  boxResultIcon: { width: 52, height: 52, borderRadius: 17 },
  boxResultNumber: { fontSize: 38, lineHeight: 40, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  boxResultLabel: { fontSize: 13, lineHeight: 17, fontWeight: '800', letterSpacing: 0.65 },
  boxLimitRow: { minHeight: 54, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  boxLimitText: { flex: 1, fontSize: 14, lineHeight: 19 },
  primaryButton: { minHeight: 54, borderRadius: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  summaryCard: { minHeight: 88, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  summaryIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { textAlign: 'left' },
  needRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rank: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 16, fontWeight: '800' },
  amountText: { minWidth: 58, textAlign: 'right', fontSize: 14, lineHeight: 18, fontWeight: '700' },
  helpNote: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, paddingHorizontal: 4, flexDirection: 'row', gap: 9 },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 72,
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
  },
  tabItem: { flex: 1, minWidth: 44, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tabIconWrap: { width: 40, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  roundButton: { width: 46, height: 46, borderRadius: 23, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  modeBadge: { position: 'absolute', right: -2, bottom: -2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  modeBadgeText: { fontSize: 9, lineHeight: 11, fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.36)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 9, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 20 },
  directorySheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 18, paddingTop: 9, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 20 },
  grabber: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { minHeight: 74, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { fontSize: 25, lineHeight: 31, fontWeight: '700', letterSpacing: -0.4 },
  sheetOptions: { borderRadius: 20, overflow: 'hidden', marginTop: 10 },
  directoryContent: { gap: 22, paddingTop: 12, paddingBottom: 16 },
  directoryGroup: { gap: 4 },
  directoryTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  directoryDescription: { fontSize: 14, lineHeight: 19, marginBottom: 7 },
  directoryList: { borderRadius: 18, overflow: 'hidden' },
  directoryRow: { minHeight: 56, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  directoryRowLabel: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500' },
  directoryDivider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  onboarding: { flex: 1, paddingHorizontal: 20 },
  onboardingTop: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  skipText: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  onboardingArtwork: { flex: 1, maxHeight: 340, minHeight: 290, marginTop: 16, alignItems: 'center', justifyContent: 'center' },
  onboardingMockCanvas: { width: 430, height: 430, transform: [{ scale: 0.73 }] },
  onboardingCopy: { paddingTop: 22 },
  onboardingTitle: { marginTop: 7, fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  onboardingBody: { marginTop: 10, fontSize: 17, lineHeight: 24 },
  pointList: { gap: 9, marginTop: 16 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  onboardingFooter: { marginTop: 'auto', paddingTop: 18, gap: 15 },
  pageDots: { height: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pageDot: { width: 8, height: 8, borderRadius: 4 },
  pageDotActive: { width: 28 },
  onboardingButton: { minHeight: 56, borderRadius: 17, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  authScreen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, gap: 22 },
  authBrand: { alignItems: 'center', gap: 8 },
  authBrandMark: { width: 66, height: 66, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  authTitle: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7, textAlign: 'center' },
  authSubtitle: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  authCard: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 16 },
  mockFieldGroup: { gap: 7 },
  fieldLabel: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  mockField: { minHeight: 52, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldValue: { fontSize: 16, lineHeight: 21 },
  centerAction: { minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  authSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  backCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { marginTop: 1, fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7 },
  pantryRow: { minHeight: 82, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 13 },
  pantryAvatar: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pantryInitial: { fontSize: 21, fontWeight: '800' },
  featureHeader: { minHeight: 100, paddingHorizontal: 18, paddingBottom: 11, flexDirection: 'row', alignItems: 'flex-end', gap: 11 },
  featureTitleBlock: { flex: 1, paddingBottom: 2 },
  featureTitle: { fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  featureSubtitle: { marginTop: 1, fontSize: 13, lineHeight: 17 },
  cameraMock: { minHeight: 520, borderRadius: 24, padding: 18, justifyContent: 'space-between', overflow: 'hidden' },
  cameraTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cameraRoundControl: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  photoFrame: { alignSelf: 'center', width: '84%', aspectRatio: 1, borderWidth: 2, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  barcodeFrame: { alignSelf: 'center', width: '86%', height: 150, borderWidth: 2, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  cameraInstruction: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '600', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'center' },
  cameraControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  cameraSmallControl: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.48)', alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  photoCount: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  helperText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 14 },
  formContent: { padding: 16, gap: 16 },
  infoBanner: { minHeight: 68, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 },
  reviewRow: { minHeight: 82, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  reviewIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  miniStepper: { height: 40, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniStepperValue: { minWidth: 16, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  itemHero: { minHeight: 104, borderRadius: 21, borderWidth: StyleSheet.hairlineWidth, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  largeItemIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailRow: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressHero: { minHeight: 122, borderRadius: 22, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checklistRow: { minHeight: 61, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  completedText: { textDecorationLine: 'line-through', opacity: 0.58 },
  reportMetrics: { flexDirection: 'row', gap: 12 },
  reportMetric: { flex: 1, minHeight: 126, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 16, justifyContent: 'space-between' },
  metricBig: { fontSize: 31, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7, fontVariant: ['tabular-nums'] },
  chartArea: { minHeight: 220, padding: 17 },
  barRow: { flex: 1, marginTop: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  chartBar: { flex: 1, maxWidth: 28, borderRadius: 7 },
  chartLabels: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between' },
  chartLabel: { fontSize: 12, lineHeight: 16 },
  memberHero: { alignItems: 'center', gap: 5, paddingVertical: 12 },
  memberAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  memberInitials: { fontSize: 28, fontWeight: '800' },
  memberRow: { minHeight: 72, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { fontSize: 14, fontWeight: '800' },
  offlineHero: { minHeight: 250, borderRadius: 24, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 11 },
  settingToggle: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTrack: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 24, height: 24, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  switchThumbOn: { alignSelf: 'flex-end' },
});
