// Compile just the tested TypeScript modules in memory; no extra test dependency.
const ts = require("typescript");
const fs = require("node:fs");
const assert = require("node:assert/strict");
require.extensions[".ts"] = (module, path) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    path,
  );
const { createOutbox, isNetworkError } = require("../lib/outbox.ts");
const { stockTotals, donationMessage } = require("../lib/stock.ts");
const { computeAllocation } = require("../lib/allocation.ts");
const {
  normaliseBarcode,
  mapCategory,
  resolveBarcodes,
} = require("../supabase/functions/_shared/barcode.ts");
const tests = [];
const test = (name, run) => tests.push({ name, run });
const item = (id, category, count, extra = {}) => ({
  id,
  name: id,
  category,
  count,
  expiration: null,
  date_added: "2026-10-01",
  source: "donation",
  ...extra,
});
const rules = {
  grain: 2,
  vegetable: 2,
  protein: 2,
  breakfast: 1,
  snack: 1,
  hygiene: 0,
  baby: 0,
};
test("bulk donations contribute to shortages; inspection holds do not", () => {
  const totals = stockTotals(
    [
      item("bad", "protein", 100, { condition: "dented" }),
      item("good", "protein", 2),
    ],
    [{ category: "protein", est_units: 20 }],
  );
  assert.equal(totals.protein, 22);
});
test("box capacity includes bulk and excludes damaged stock", () => {
  const plan = computeAllocation(
    [
      item("g", "grain", 20),
      item("v", "vegetable", 20),
      item("b", "breakfast", 10),
      item("s", "snack", 10),
      item("p", "protein", 100, { condition: "rusted" }),
    ],
    rules,
    12,
    4,
    [
      {
        id: "bulk",
        category: "protein",
        est_units: 12,
        weight_lbs: 12,
        date_added: "2026-10-01",
        expiration: null,
      },
    ],
  );
  assert.equal(plan.achievableBoxes, 6);
  assert.equal(plan.limitingCategory, "protein");
  assert.equal(
    plan.allocatedItems.find((a) => a.item.id === "bulk").countToGrab,
    12,
  );
});
test("small families still require at least one of each required category", () => {
  const plan = computeAllocation([], rules, 12, 1);
  assert.equal(plan.perBoxNeeds.breakfast, 1);
  assert.equal(plan.achievableBoxes, 0);
});
test("past-date stock is excluded consistently from capacity and shortage totals", () => {
  const stock = [item("past", "protein", 100, { expiration: "2000-01-01" }), item("good", "protein", 4)];
  const bulk = [{ id: "expired-bulk", category: "protein", est_units: 100, weight_lbs: 100, expiration: "2000-01-01" }];
  assert.equal(stockTotals(stock, bulk).protein, 4);
  const plan = computeAllocation(stock, { ...rules, grain: 0, vegetable: 0, breakfast: 0, snack: 0 }, 12, 4, bulk);
  assert.equal(plan.achievableBoxes, 2);
  assert.equal(plan.allocatedItems.length, 1);
});
test("soonest expiration is packed first", () => {
  const plan = computeAllocation(
    [
      item("late", "protein", 4, { expiration: "2030-01-01" }),
      item("early", "protein", 4, { expiration: "2027-01-01" }),
    ],
    {
      grain: 0,
      vegetable: 0,
      protein: 2,
      breakfast: 0,
      snack: 0,
      hygiene: 0,
      baby: 0,
    },
    1,
  );
  assert.equal(plan.allocatedItems[0].item.id, "early");
  assert.equal(plan.allocatedItems[0].countToGrab, 2);
});
test("donation requests contain configured drop-off details", () => {
  assert.match(
    donationMessage(
      "Test Pantry",
      [{ category: "protein", deficit: 5 }],
      { protein: "Beans" },
      "Front desk, Saturday 10am",
    ),
    /Drop-off: Front desk, Saturday 10am/,
  );
});
test("missing drop-off configuration never invents an address", () => {
  assert.doesNotMatch(
    donationMessage("Test Pantry", [], {}, ""),
    /Drop-off|rear entrance/,
  );
});
test("valid UPC, EAN and GTIN-14 check digits are accepted", () => {
  for (const code of [
    "012345000058",
    "4006381333931",
    "96385074",
    "00012345000058",
  ])
    assert.equal(normaliseBarcode(code), code);
});
test("misread checksums and noisy input are rejected", () => {
  for (const code of ["012345000059", "abcdef012345000058", "123", null])
    assert.equal(normaliseBarcode(code), null);
  assert.equal(normaliseBarcode("012345 000058"), "012345000058");
});
test("green beans are vegetables; peanut butter is protein", () => {
  assert.equal(mapCategory("Canned green beans"), "vegetable");
  assert.equal(mapCategory("Peanut butter"), "protein");
});
test("peaches do not match peanut butter; bars do not match breakfast", () => {
  assert.equal(mapCategory("Canned peaches fruit"), "vegetable");
  assert.equal(mapCategory("Peanut butter granola bars"), "snack");
  assert.equal(mapCategory("Pearled rice"), "grain");
  assert.equal(mapCategory("Infant formula"), "baby");
});
test("concurrent queued intakes survive a restart without lost jobs", async () => {
  const values = new Map();
  const storage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
  };
  const queue = createOutbox(storage, "q");
  await Promise.all(
    ["a", "b", "c"].map((id) =>
      queue.add({
        id,
        userId: "u",
        pantryId: "p",
        source: "donation",
        items: [],
        photos: [],
      }),
    ),
  );
  assert.deepEqual(
    (await createOutbox(storage, "q").list()).map((j) => j.id),
    ["a", "b", "c"],
  );
});
test("queue deduplicates job ids and removes only acknowledged jobs", async () => {
  let value = null;
  const queue = createOutbox(
    {
      getItem: async () => value,
      setItem: async (_, v) => {
        value = v;
      },
    },
    "q",
  );
  await queue.add({ id: "a" });
  await queue.add({ id: "a" });
  await queue.add({ id: "b" });
  await queue.remove("a");
  assert.deepEqual(
    (await queue.list()).map((j) => j.id),
    ["b"],
  );
});
test("device storage failures reject saving; corrupt queues are preserved", async () => {
  const queue = createOutbox(
    {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("Storage full");
      },
    },
    "q",
  );
  await assert.rejects(queue.add({ id: "a" }), /Storage full/);
  await assert.rejects(
    createOutbox(
      { getItem: async () => "{broken", setItem: async () => {} },
      "q",
    ).list(),
  );
});
test("network errors may queue; policy and server errors do not", () => {
  assert.equal(
    isNetworkError({ message: "TypeError: Failed to fetch", code: "" }),
    true,
  );
  assert.equal(
    isNetworkError({ code: "42501", message: "Permission denied" }),
    false,
  );
  assert.equal(
    isNetworkError({ code: "PGRST301", message: "Network policy denied" }),
    false,
  );
  assert.equal(
    isNetworkError({ status: 500, message: "Timeout in database" }),
    false,
  );
});
test("provider mismatches cannot replace a package with a different product", async () => {
  global.Deno = { env: { get: () => "" } };
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 1,
      product: { code: "4006381333931", product_name: "Wrong package" },
    }),
  });
  try {
    const result = await resolveBarcodes(["012345000058"]);
    assert.equal(result.get("012345000058").source, "miss");
  } finally {
    global.fetch = original;
  }
});
test("database product names are composed without repeating the brand", async () => {
  global.Deno = { env: { get: () => "" } };
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 1,
      product: {
        code: "012345000058",
        brands: "Example",
        product_name: "Example green beans",
        categories_tags: ["en:vegetables"],
      },
    }),
  });
  try {
    const result = await resolveBarcodes(["012345000058"]);
    assert.equal(result.get("012345000058").name, "Example green beans");
    assert.equal(result.get("012345000058").category, "vegetable");
  } finally {
    global.fetch = original;
  }
});
(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`PASS ${t.name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${t.name}\n${e.stack}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
  process.exitCode = failed ? 1 : 0;
})();
