const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const Module = require("node:module");
const assert = require("node:assert/strict");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
global.__DEV__ = false;
const memory = new Map();
const storage = {
  getItem: async (k) => memory.get(k) ?? null,
  setItem: async (k, v) => {
    memory.set(k, v);
  },
};
let response = { data: { id: "saved" }, error: null },
  rpcError = null,
  calls = 0,
  uuid = 0;
const chain = () => {
  const query = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "insert",
    "update",
    "delete",
    "order",
    "limit",
  ])
    query[method] = () => query;
  query.single = query.maybeSingle = async () => response;
  query.then = (resolve, reject) =>
    Promise.resolve(response).then(resolve, reject);
  return query;
};
const supabase = {
  from: chain,
  channel: () => ({}),
  rpc: async () => {
    calls++;
    return { error: rpcError };
  },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@react-native-async-storage/async-storage")
    return { __esModule: true, default: storage };
  if (request === "expo-crypto") return { randomUUID: () => `job-${++uuid}` };
  return load.call(this, request, parent, isMain);
};
require.cache[path.resolve("lib/supabase.ts")] = { exports: { supabase } };
require.cache[path.resolve("lib/log.ts")] = {
  exports: { log: { debug() {}, warn() {}, error() {} } },
};
const { usePantryStore: store } = require("../lib/store.ts");
const initial = store.getState();
let passed = 0;
const test = async (name, run) => {
  memory.clear();
  rpcError = null;
  calls = 0;
  response = { data: { id: "saved" }, error: null };
  store.setState({
    ...initial,
    session: { user: { id: "user-a" } },
    settings: { ...initial.settings, pantryId: "pantry-a", userRole: "admin" },
  });
  await run();
  passed++;
  console.log(`PASS ${name}`);
};
(async () => {
  await test("rejected pantry rules roll back and throw to the UI", async () => {
    const previous = store.getState().boxRules;
    response = {
      data: null,
      error: { code: "42501", message: "Permission denied" },
    };
    await assert.rejects(
      store.getState().updateBoxRules({ grain: 8 }),
      (e) => e.message === "Permission denied",
    );
    assert.deepEqual(store.getState().boxRules, previous);
  });
  await test("rejected thresholds and weight estimates never remain on screen", async () => {
    const previous = store.getState();
    response = { data: null, error: new Error("Rejected") };
    await assert.rejects(store.getState().updateThresholds({ grain: 99 }));
    assert.deepEqual(store.getState().thresholds, previous.thresholds);
    await assert.rejects(store.getState().updateLbsPerUnit({ grain: 10 }));
    assert.deepEqual(store.getState().lbsPerUnit, previous.lbsPerUnit);
  });
  await test("volunteers cannot make pantry-wide changes", async () => {
    store.setState({
      settings: { ...store.getState().settings, userRole: "volunteer" },
    });
    await assert.rejects(
      store.getState().updateSettings({ pantryName: "Changed" }),
      /Only a pantry admin/,
    );
    assert.equal(
      store.getState().settings.pantryName,
      initial.settings.pantryName,
    );
  });
  await test("network failures persist verified intake before returning queued", async () => {
    rpcError = { message: "TypeError: Failed to fetch", code: "" };
    const result = await store
      .getState()
      .addItems([{ name: "Beans", category: "protein", count: 4 }]);
    assert.equal(result, "queued");
    assert.equal(store.getState().pendingIntakes, 1);
    const jobs = JSON.parse(memory.get("pantrylens.intake-outbox.v1"));
    assert.equal(jobs[0].items[0].count, 4);
    assert.equal(jobs[0].userId, "user-a");
  });
  await test("permission failures are surfaced and never called offline", async () => {
    rpcError = { code: "42501", message: "Permission denied" };
    await assert.rejects(
      store.getState().addItems([{ name: "Beans", count: 1 }]),
      (e) => e.message === "Permission denied",
    );
    assert.deepEqual(JSON.parse(memory.get("pantrylens.intake-outbox.v1")), []);
  });
  await test("another account cannot sync a previous user’s pending intake", async () => {
    rpcError = { message: "Failed to fetch" };
    await store.getState().addItems([{ name: "Beans", count: 1 }]);
    store.setState({ session: { user: { id: "user-b" } } });
    calls = 0;
    await store.getState().flushIntakes();
    assert.equal(calls, 0);
    assert.equal(
      JSON.parse(memory.get("pantrylens.intake-outbox.v1")).length,
      1,
    );
  });
  await test("failed replay retains the intake and explains why sync failed", async () => {
    rpcError = { message: "Failed to fetch" };
    await store.getState().addItems([{ name: "Beans", count: 1 }]);
    rpcError = { code: "42501", message: "Membership changed" };
    await store.getState().flushIntakes();
    assert.equal(store.getState().pendingIntakes, 1);
    assert.match(store.getState().syncError, /Membership changed/);
  });
  await test("invalid quantities and audits without a shelf do not enter the queue", async () => {
    await assert.rejects(
      store.getState().addItems([{ name: "Beans", count: 1.5 }]),
      /whole number/,
    );
    await assert.rejects(
      store.getState().addItems([{ name: "Beans", count: 1 }], "shelf_audit"),
      /Choose the shelf/,
    );
    assert.equal(memory.size, 0);
  });
  await test("failed packing throws before success can be shown", async () => {
    rpcError = new Error("Stock changed");
    await assert.rejects(
      store.getState().deductItems([{ id: "bean", count: 4 }], "packing-id"),
      /Stock changed/,
    );
  });
  console.log(`\n${passed}/${passed} store failure and offline tests passed`);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
