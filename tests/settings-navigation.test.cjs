const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real components with deterministic native animation callbacks.
// Layout changes and UIKit dismissal are separate events, just as on a phone.
function mount(file, exportName, initialProps = {}, platform = 'ios', options = {}) {
  const slots = [], animations = [], pushes = [];
  let cursor = 0, dirty = false, effects = [], props = initialProps, tree;
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const React = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ?? (slots[index] = { current: initial });
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (changed(previous?.deps, deps)) {
        slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const gesture = new Proxy({}, { get: () => () => gesture });
  const state = {
    scheme: 'light', seniorMode: false, toggleSeniorMode() {},
    settings: { pantryId: 'pantry', pantryName: 'Test pantry', expirationWarningDays: 30 },
    session: { user: { id: 'user', email: 'member@example.test' } }, inventory: [], pantries: [],
    signOut: async () => {}, switchPantry() {}, setAddingPantry() {},
  };
  const teamAlerts = { alerts: [{ id: 'alert', message: 'We need grains and protein', created_at: '2026-10-17T12:00:00Z', created_by: 'someone-else' }], load() {} };
  const animate = (to, config, callback) => { animations.push({ to, config, callback }); return to; };
  const router = { push: route => pushes.push(route) };
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const output = {};
  vm.runInNewContext(compiled, {
    exports: output,
    require(name) {
      if (name === 'react') return { ...React, default: React, __esModule: true };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-native') return {
        View: 'View', Modal: 'Modal', Pressable: 'Pressable', KeyboardAvoidingView: 'KeyboardAvoidingView',
        Platform: { OS: platform }, StyleSheet: { absoluteFill: {}, create: x => x },
        useWindowDimensions: () => ({ width: 390, height: 844 }), Alert: { alert() {} },
      };
      if (name === 'react-native-reanimated') return {
        __esModule: true, default: { View: 'Animated.View', ScrollView: 'Animated.ScrollView' },
        useSharedValue: value => React.useRef({ value }).current,
        useReducedMotion: () => options.reduceMotion ?? false, useAnimatedStyle: fn => fn(), useAnimatedScrollHandler: fn => fn,
        withSpring: animate, withTiming: animate, withSequence: value => value, runOnJS: fn => fn,
        interpolate: () => 1, ReduceMotion: { Never: 'never' }, Easing: { out: fn => fn, cubic: x => x },
      };
      if (name === 'react-native-gesture-handler') return { Gesture: { Pan: () => gesture }, GestureDetector: 'GestureDetector', GestureHandlerRootView: 'GestureHandlerRootView' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 47, bottom: 24 }) };
      if (name === 'expo-router') return { useRouter: () => router, useSegments: () => ['(tabs)', 'index'], useFocusEffect: effect => React.useEffect(effect, []) };
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async () => '[]', setItem: async () => {} } };
      if (name.includes('constants/theme')) return { COLORS: {} };
      if (name.endsWith('/appearance')) return { useAppAppearance: selector => selector(state) };
      if (name.endsWith('/accessibility')) return { useAccessibilityStore: selector => selector(state) };
      if (name.endsWith('/store')) return { usePantryStore: selector => selector ? selector(state) : state };
      if (name.endsWith('/team-alerts')) return { useTeamAlerts: selector => selector(teamAlerts) };
      if (name.endsWith('/time')) return { timeAgo: () => '2 minutes ago' };
      if (name.endsWith('/notifications')) return { useUnreadCount: () => 0 };
      if (name.endsWith('/offline-queue')) return { offlineQueue: { subscribe: () => () => {} } };
      if (name.endsWith('/feedback')) return { cueTap() {} };
      if (name.endsWith('/motion-physics')) return { SPRING_SHEET: {}, SPRING_NOTIFICATION: { dampingRatio: 1, duration: 300 }, DRAG_SLOP: 10, projectDecay: () => 0, rubberband: x => x };
      if (name.endsWith('/cn')) return { cn: (...args) => args.filter(Boolean).join(' ') };
      if (name.endsWith('/spotlight')) return { useSpotlightTarget: () => () => {} };
      return new Proxy({}, { get: (_target, key) => key === '__esModule' ? true : String(key) });
    },
  });
  function render(next = {}) {
    props = { ...props, ...next };
    let count = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      tree = output[exportName](props);
      for (const effect of effects) effect();
      if (++count > 20) throw new Error('Component kept rendering');
    } while (dirty);
    return tree;
  }
  function find(type, predicate = () => true, node = tree) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) { if (child == null) continue; const match = find(type, predicate, child); if (match) return match; }
      return null;
    }
    if (node.type === type && predicate(node.props)) return node;
    return typeof node === 'object' && node.props?.children != null ? find(type, predicate, node.props.children) : null;
  }
  render();
  return { render, find, animations, pushes, layout: height => find('Animated.View', props => !!props.onLayout).props.onLayout({ nativeEvent: { layout: { height } } }) };
}

test('Pantry settings navigation waits for the pantry menu to finish dismissing', () => {
  const h = mount('components/app-header.tsx', 'AppHeader', { title: 'Home' });
  h.find('Tappable', props => /Opens pantry menu/.test(props.accessibilityLabel)).props.onPress();
  h.render();
  h.find('Row', props => props.label === 'Pantry settings').props.onPress();
  assert.equal(h.pushes.length, 0, 'must not navigate while UIKit still presents the menu');
  h.render();
  const sheet = h.find('Sheet');
  assert.equal(sheet.props.visible, false);
  sheet.props.onDismiss();
  assert.equal(h.pushes[0], '/(tabs)/settings');
  sheet.props.onDismiss();
  assert.equal(h.pushes.length, 1);
});

test('a visible sheet does not replay its entry animation when content height changes', () => {
  const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: true, title: 'Menu', children: 'Content', onClose() {} });
  h.layout(380);
  assert.equal(h.animations.length, 1);
  h.layout(381);
  h.layout(420);
  assert.equal(h.animations.length, 1, 'layout updates must not move an open sheet offscreen');
});

test('onDismiss does not run for a sheet that has never been opened', () => {
  let dismissed = 0;
  const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: false, title: 'Menu', onClose() {}, onDismiss: () => dismissed++ });
  h.render({ onDismiss: () => dismissed++ });
  assert.equal(dismissed, 0);
});

test('iOS navigation waits for native Modal dismissal, not just the closing spring', () => {
  let dismissed = 0;
  const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: true, title: 'Menu', children: 'Original content', onClose() {}, onDismiss: () => dismissed++ });
  h.layout(380);
  h.render({ visible: false, children: null, title: 'Settings' });
  assert.equal(h.find('Animated.ScrollView').props.children, 'Original content');
  h.animations.at(-1).callback(true);
  h.render();
  assert.equal(dismissed, 0, 'the native iOS modal has not dismissed yet');
  const modal = h.find('Modal');
  assert.ok(modal, 'keep the native Modal mounted to receive onDismiss');
  assert.equal(modal.props.visible, false);
  modal.props.onDismiss();
  assert.equal(dismissed, 1);
  modal.props.onDismiss();
  assert.equal(dismissed, 1);
});

test('an interrupted close cannot unmount a reopened sheet', () => {
  const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: true, title: 'Menu', onClose() {} });
  h.layout(380);
  h.render({ visible: false });
  const oldClose = h.animations.at(-1).callback;
  h.render({ visible: true });
  oldClose(true);
  h.render();
  assert.equal(h.find('Modal')?.props.visible, true);
});

test('Android and web notify once after the closed modal is removed', () => {
  for (const platform of ['android', 'web']) {
    let dismissed = 0;
    const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: true, title: 'Menu', onClose() {}, onDismiss: () => dismissed++ }, platform);
    h.layout(380);
    h.render({ visible: false });
    assert.equal(dismissed, 0);
    h.animations.at(-1).callback(true);
    h.render();
    assert.equal(h.find('Modal'), null);
    assert.equal(dismissed, 1);
    h.render({ onDismiss: () => dismissed++ });
    assert.equal(dismissed, 1);
  }
});

test('a fresh presentation animates even when its measured height is unchanged', () => {
  const h = mount('components/ui/sheet.tsx', 'Sheet', { visible: true, title: 'Menu', onClose() {} });
  h.layout(380);
  h.render({ visible: false });
  h.animations.at(-1).callback(true);
  h.render();
  h.find('Modal').props.onDismiss();
  h.render({ visible: true });
  const before = h.animations.length;
  h.layout(380);
  assert.equal(h.animations.length, before + 1);
  assert.equal(h.animations.at(-1).to, 0);
});

test('profile navigation cannot open a second sheet until the menu dismisses', () => {
  const h = mount('components/app-header.tsx', 'AppHeader', { title: 'Home' });
  h.find('Tappable', props => /Opens pantry menu/.test(props.accessibilityLabel)).props.onPress();
  h.render();
  const row = h.find('Row', props => props.label === 'Your profile');
  row.props.onPress();
  row.props.onPress();
  assert.equal(h.pushes.length, 0);
  h.render();
  h.find('Sheet').props.onDismiss();
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0].pathname, '/(tabs)/settings');
  assert.equal(h.pushes[0].params.section, 'profile');
});

test('team alerts use a top bubble instead of a blocking bottom sheet', async () => {
  const h = mount('components/team-alert-popup.tsx', 'TeamAlertPopup');
  await new Promise(resolve => setImmediate(resolve));
  h.render();
  assert.equal(h.find('Sheet'), null);
  const bubble = h.find('TopNotificationBubble');
  assert.ok(bubble);
  assert.equal(bubble.props.visible, true);
});

function mountBubble(props = {}, options = {}) {
  assert.ok(fs.existsSync(path.join(__dirname, '../components/top-notification-bubble.tsx')), 'Top notification bubble is not implemented');
  return mount('components/top-notification-bubble.tsx', 'TopNotificationBubble', {
    visible: true, message: 'We need grains and protein', detail: '2 minutes ago', onClose() {}, onPress() {}, ...props,
  }, 'ios', options);
}

test('notification bubbles sit below the top safe area without a modal or backdrop', () => {
  const h = mountBubble();
  const host = h.find('View', props => props.testID === 'top-notification-host');
  assert.ok(host);
  assert.equal(host.props.style.top, 55);
  assert.equal(host.props.pointerEvents, 'box-none');
  assert.equal(h.find('Modal'), null);
  assert.ok(h.find('Animated.View', props => !!props.onLayout).props.style[1].transform[0].translateY < 0,
    'the entrance starts above the top edge');
  h.layout(140);
  assert.equal(h.animations.at(-1).to, 1);
  assert.equal(h.animations.at(-1).config.duration, 300);
});

test('notification bubble keeps its content during exit and calls onDismiss once', () => {
  let dismissed = 0;
  const h = mountBubble({ onDismiss: () => dismissed++ });
  h.layout(140);
  h.render({ visible: false, message: '' });
  assert.ok(h.find('Text', props => props.children === 'We need grains and protein'));
  assert.equal(h.animations.at(-1).to, 0);
  assert.equal(h.animations.at(-1).config.duration, 150);
  assert.equal(h.find('Animated.View', props => !!props.onLayout).props.pointerEvents, 'none');
  assert.equal(dismissed, 0);
  h.animations.at(-1).callback(true);
  h.render();
  assert.equal(h.find('View', props => props.testID === 'top-notification-host'), null);
  assert.equal(dismissed, 1);
  h.render({ onDismiss: () => dismissed++ });
  assert.equal(dismissed, 1);
});

test('Reduce Motion makes notification bubbles fade without translating', () => {
  const h = mountBubble({}, { reduceMotion: true });
  h.layout(140);
  h.render();
  const card = h.find('Animated.View', props => !!props.onLayout);
  assert.equal(card.props.style[1].transform.length, 0);
  assert.equal(h.animations.at(-1).config.duration, 200);
});

test('See needs marks the alert seen and navigates once after the bubble leaves', async () => {
  const h = mount('components/team-alert-popup.tsx', 'TeamAlertPopup');
  await new Promise(resolve => setImmediate(resolve));
  h.render();
  h.find('TopNotificationBubble').props.onPress();
  h.render();
  const bubble = h.find('TopNotificationBubble');
  assert.equal(bubble.props.visible, false);
  assert.equal(h.pushes.length, 0);
  bubble.props.onDismiss();
  bubble.props.onDismiss();
  assert.equal(h.pushes.length, 1);
  assert.equal(h.pushes[0], '/(tabs)/needs');
});

test('a new alert can interrupt the bubble exit without being unmounted', () => {
  const h = mountBubble();
  h.layout(140);
  h.render({ visible: false });
  const closing = h.animations.at(-1).callback;
  h.render({ visible: true, message: 'Another team alert' });
  closing(true);
  h.render();
  assert.ok(h.find('View', props => props.testID === 'top-notification-host'));
  assert.ok(h.find('Text', props => props.children === 'Another team alert'));
});
