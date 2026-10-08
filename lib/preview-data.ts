import type { InventoryItem, Settings, BulkLot } from "./store";
export const previewSettings: Settings = {
  pantryId: null,
  pantryName: "Community Pantry",
  expirationWarningDays: 30,
  defaultFamilySize: 4,
  userRole: "volunteer",
  boxTarget: 12,
  inviteCode: "",
  dropoffLocation: "123 Maple Street",
  dropoffHours: "Tuesdays and Thursdays, 10am–2pm",
  dropOffDetails: "123 Maple Street · Tuesdays and Thursdays, 10am–2pm",
};
const date = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
export const previewInventory: InventoryItem[] = [
  { name: "Jasmine rice", category: "grain", count: 48, expiration: date(365) },
  {
    name: "Whole wheat pasta",
    category: "grain",
    count: 32,
    expiration: date(200),
  },
  {
    name: "Canned sweet corn",
    category: "vegetable",
    count: 42,
    expiration: date(200),
  },
  {
    name: "Green beans",
    category: "vegetable",
    count: 36,
    expiration: date(150),
  },
  {
    name: "Peanut butter",
    category: "protein",
    count: 8,
    expiration: date(14),
  },
  { name: "Canned tuna", category: "protein", count: 6, expiration: date(300) },
  {
    name: "Rolled oats",
    category: "breakfast",
    count: 28,
    expiration: date(180),
  },
  { name: "Granola bars", category: "snack", count: 38, expiration: date(21) },
  { name: "Hand soap", category: "hygiene", count: 24, expiration: null },
  { name: "Baby food", category: "baby", count: 3, expiration: date(120) },
].map((item, i) => ({
  ...item,
  category: item.category as InventoryItem["category"],
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  date_added: date(-i),
  source: "donation",
  condition: "ok",
  location_id: i < 6 ? "preview-shelf-a" : "preview-shelf-b",
}));
export const previewBulk: BulkLot[] = [
  {
    id: "00000000-0000-4000-8000-000000000099",
    category: "grain",
    weight_lbs: 60,
    est_units: 50,
    expiration: date(200),
    date_added: date(-1),
    source_org: "grocery",
  },
];

