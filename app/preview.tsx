import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Dashboard from '../components/dashboard';
import Inventory from './(tabs)/inventory';
import Build from './(tabs)/build';
import Needs from './(tabs)/needs';
import Settings from './(tabs)/settings';
import LogDonation from './log-donation';
import BulkIntake from './bulk-intake';
import ShelfAudit from './shelf-audit';
import Reports from './reports';
import ExpiringSoon from './expiring-soon';
import ItemDetail from './item-detail';
import PackingChecklist from './packing-checklist';
import AuditReview from './audit-review';
import ReadyBoxes from './ready-boxes';
import Team from './team';
import { COLORS } from '../constants/theme';
import { Text } from '../components/ui';
import { AppShell } from '../components/app-shell';
import { NavigationOverride } from '../components/app-navigation';
import { usePantryStore } from '../lib/store';
import { previewBulk, previewInventory, previewSettings } from '../lib/preview-data';

const screens: Record<string, React.ComponentType> = {
  index: Dashboard, inventory: Inventory, build: Build, needs: Needs, settings: Settings,
  'log-donation': LogDonation, 'bulk-intake': BulkIntake, 'shelf-audit': ShelfAudit,
  reports: Reports, 'expiring-soon': ExpiringSoon, 'item-detail': ItemDetail,
  'packing-checklist': PackingChecklist, 'audit-review': AuditReview, 'ready-boxes': ReadyBoxes, team: Team,
};
const titles: Record<string,string> = {
  'audit-review':'Review shelf count', 'ready-boxes':'Ready to go', team:'Your team',
  'log-donation':'Add donation','bulk-intake':'Bulk intake','shelf-audit':'Shelf audit',
  reports:'Reports','expiring-soon':'Expiring stock','item-detail':'Item details','packing-checklist':'Packing checklist',
};

/** Real screens with sample data; preview never supplies an authenticated pantry. */
export default function Preview() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState('index');
  const [previousScreen, setPreviousScreen] = useState('index');
  useEffect(() => {
    if (!__DEV__) return;
    const previous = usePantryStore.getState();
    usePantryStore.setState({
      settings: previewSettings, inventory: previewInventory, bulkLots: previewBulk,
      locations: [{ id:'preview-shelf-a',name:'Shelf A',pantry_id:'preview',sort_order:0,categories:[] },{ id:'preview-shelf-b',name:'Shelf B',pantry_id:'preview',sort_order:1,categories:[] }],
      pendingIntakes:0, syncError:null, boxTemplates:[], readyBoxes:[], boxFolders:[], members:[], currentScan:null, auditDraft:null,
      activities:[
        {id:'1',text:'Grocery rescue brought 60 lb of grains',icon:'scale-balance',time:new Date().toISOString()},
        {id:'2',text:'A neighbour donated 8 jars of peanut butter',icon:'hand-heart-outline',time:new Date().toISOString()},
      ],
    });
    setReady(true);
    return () => usePantryStore.setState({
      boxTemplates:previous.boxTemplates,readyBoxes:previous.readyBoxes,boxFolders:previous.boxFolders,members:previous.members,currentScan:previous.currentScan,auditDraft:previous.auditDraft,
      settings:previous.settings,inventory:previous.inventory,bulkLots:previous.bulkLots,
      locations:previous.locations,activities:previous.activities,pendingIntakes:previous.pendingIntakes,syncError:previous.syncError,
    });
  },[]);
  if (!__DEV__) return <View className="flex-1 items-center justify-center bg-canvas"><Text>This preview is available in local development.</Text></View>;
  const Current = screens[selected] ?? Dashboard;
  const parentScreen = selected === 'item-detail' ? 'inventory' : selected === 'packing-checklist' ? 'build' : 'index';
  const navigate = (href: Href | null) => {
    if (href === null) { setSelected(previousScreen === selected ? 'index' : previousScreen); return true; }
    const path = typeof href === 'string' ? href : href.pathname;
    const next = path.replace(/^\/\(tabs\)\/?/, '').replace(/^\//,'') || 'index';
    if (!screens[next]) return false;
    if (typeof href !== 'string' && href.params) router.setParams(href.params);
    setPreviousScreen(selected);
    setSelected(next);
    return true;
  };
  return (
    <NavigationOverride.Provider value={navigate}>
      <Stack.Screen options={{headerShown:false}} />
      <AppShell active={titles[selected] ? parentScreen : selected} onSelect={setSelected} preview>
        {titles[selected] && <View className="flex-row items-center gap-3 border-b border-hairline bg-card px-gutter py-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Back to workspace" onPress={() => setSelected(previousScreen === selected ? 'index' : previousScreen)} className="h-11 w-11 items-center justify-center rounded-md bg-subtle"><MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.primary} /></Pressable>
          <Text variant="label" className="font-semibold">{titles[selected]}</Text>
        </View>}
        {ready && <Current />}
      </AppShell>
    </NavigationOverride.Provider>
  );
}
