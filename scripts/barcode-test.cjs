const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');

require.extensions['.ts'] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename,
  );
const {
  normaliseBarcode,
  sameBarcode,
  barcodeVariants,
  expandUpce,
} = require('../supabase/functions/_shared/gtin.ts');
const { decodeCameraBarcode, createBarcodeGate } = require('../lib/barcode-scanner.ts');
const { resolveBarcodes, mapCategory } = require('../supabase/functions/_shared/barcode.ts');
test('barcode Edge Functions typecheck with their Deno environment', () => {
  const options = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, noEmit: true,
    allowImportingTsExtensions: true, strict: true, skipLibCheck: true,
    types: [], lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  };
  const virtual = path.resolve('scripts/barcode-deno-env.d.ts');
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, ...args) => path.normalize(filename) === virtual
    ? ts.createSourceFile(virtual, 'declare const Deno: { env: { get(key: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };', options.target)
    : getSourceFile(filename, ...args);
  const program = ts.createProgram([
    'supabase/functions/_shared/gtin.ts', 'supabase/functions/_shared/barcode.ts',
    'supabase/functions/lookup-barcode/index.ts', virtual,
  ], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});
const UPC = '036000291452';
const EAN = '0036000291452';
const OTHER = '012345000058';
const originalFetch = global.fetch;
const originalDeno = global.Deno;
const env = {};
global.Deno = { env: { get: (key) => env[key] } };
let cache = [],
  foods = [],
  calls = [],
  writes = [],
  off;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
const product = (code = UPC, overrides = {}) => ({
  status: 1,
  code,
  product: {
    code,
    product_name: 'Green beans',
    brands: 'Test brand',
    quantity: '400 g',
    categories_tags: ['en:canned-vegetables'],
    ...overrides,
  },
});
beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  cache = [];
  foods = [];
  calls = [];
  writes = [];
  off = () => reply(product());
  global.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('/rest/v1/barcode_cache')) {
      if (options.method === 'POST') {
        writes.push(...JSON.parse(options.body));
        return reply({});
      }
      return reply(cache);
    }
    if (String(url).includes('api.nal.usda.gov')) return reply({ foods });
    return off(String(url), options);
  };
});
after(() => {
  global.fetch = originalFetch;
  global.Deno = originalDeno;
});

for (const barcode of [UPC, EAN, '96385074', '00036000291452'])
  test(`valid GTIN ${barcode} keeps its check digit and leading zeros`, () =>
    assert.equal(normaliseBarcode(barcode), barcode));
test('letters, URLs, missing digits, wrong checksums and all-zero placeholders are rejected', () => {
  for (const raw of [
    'UPC: ' + UPC,
    'https://example.com/' + UPC,
    UPC.slice(1),
    '036000291453',
    '000000000000',
    null,
    36000291452,
  ])
    assert.equal(normaliseBarcode(raw), null);
  assert.equal(normaliseBarcode('0 36000-29145 2'), UPC);
});
test('UPC and zero-padded EAN/GTIN are equivalent without conflating case packs', () => {
  assert.equal(sameBarcode(UPC, EAN), true);
  assert.equal(sameBarcode(UPC, '00036000291452'), true);
  assert.equal(normaliseBarcode('10012345000055'), '10012345000055');
  assert.equal(sameBarcode(OTHER, '10012345000055'), false);
  assert.ok(barcodeVariants(UPC).includes(EAN));
  assert.deepEqual(barcodeVariants('10012345000055'), ['10012345000055']);
});
test('UPC-E expands to UPC-A only when its format and expanded checksum agree', () => {
  assert.equal(expandUpce('01234558'), OTHER);
  assert.equal(decodeCameraBarcode('01234558', 'upc_e'), OTHER);
  assert.equal(expandUpce('01234559'), null);
  assert.equal(expandUpce('21234558'), null);
  assert.equal(expandUpce('123455'), null);
  // These same digits also pass EAN-8, but denote a different item. The camera
  // format, rather than a guess based on length, must decide which one to use.
  assert.equal(decodeCameraBarcode('01234558', 'ean8'), '01234558');
});
test('one frame, duplicate callbacks, invalid readings and unknown formats cannot start a lookup', () => {
  const gate = createBarcodeGate();
  assert.equal(gate.read(UPC, 'upc_a', 0), null);
  assert.equal(gate.read(UPC, 'upc_a', 30), null);
  assert.equal(gate.read(UPC, 'upc_a', 500), UPC);
  gate.reset();
  assert.equal(gate.read(UPC, 'qr', 0), null);
  assert.equal(gate.read(UPC, 'upc_a', 500), null);
  assert.equal(gate.read('036000291453', 'upc_a', 650), null);
  assert.equal(gate.read(UPC, 'upc_a', 900), null);
});
test('alternating packages and expired frame agreement never combine into a valid scan', () => {
  const gate = createBarcodeGate();
  assert.equal(gate.read(UPC, 'upc_a', 0), null);
  assert.equal(gate.read(OTHER, 'upc_a', 500), null);
  assert.equal(gate.read(UPC, 'upc_a', 1000), null);
  assert.equal(gate.read(UPC, 'upc_a', 2300), null);
  assert.equal(gate.read(EAN, 'ean13', 2800), EAN);
});
test('category rules distinguish beans, peanut butter, peaches and cereal bars', () => {
  for (const [name, category] of [
    ['Canned green beans', 'vegetable'],
    ['String beans', 'vegetable'],
    ['Peanut butter', 'protein'],
    ['Chickpeas', 'protein'],
    ['Peaches', 'vegetable'],
    ['Granola bars', 'snack'],
    ['Rice', 'grain'],
    ['Rolled oats', 'breakfast'],
    ['Bar soap', 'hygiene'],
    ['Baby food', 'baby'],
  ])
    assert.equal(mapCategory(name), category, name);
});
test('Open Food Facts must identify the requested code, not merely return a plausible name', async () => {
  off = () => reply(product(OTHER));
  assert.equal((await resolveBarcodes([UPC])).get(UPC).name, null);
});
test('conflicting product and envelope codes are rejected', async () => {
  off = () => reply({ ...product(), code: OTHER });
  assert.equal((await resolveBarcodes([UPC])).get(UPC).name, null);
});
test('USDA fuzzy search results and malformed GTINs cannot replace the exact product', async () => {
  env.FDC_API_KEY = 'test-key';
  foods = [
    { gtinUpc: OTHER, description: 'Wrong food' },
    { gtinUpc: 'UPC:' + UPC, description: 'Also wrong' },
  ];
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.equal(hit.source, 'openfoodfacts');
  assert.match(hit.name, /Green beans/);
});
test('exact USDA match retains Open Food Facts photo and allergen data', async () => {
  env.FDC_API_KEY = 'test-key';
  foods = [{ gtinUpc: EAN, description: 'GREEN BEANS', brandName: 'Test brand' }];
  off = () =>
    reply(
      product(UPC, {
        image_front_small_url: 'https://example.org/beans.jpg',
        allergens_tags: ['en:soybeans'],
      }),
    );
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.equal(hit.source, 'usda');
  assert.equal(hit.category, 'vegetable');
  assert.equal(hit.imageUrl, 'https://example.org/beans.jpg');
  assert.deepEqual(hit.dietTags, ['contains-soy']);
});
test('UPC-A retries its equivalent EAN instead of inventing a new checksum', async () => {
  off = (url) => (url.includes('/' + EAN + '.json') ? reply(product(EAN)) : reply({ status: 0 }));
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.match(hit.name, /Green beans/);
  assert.equal(hit.barcode, UPC);
  assert.equal(calls.filter((url) => url.includes('openfoodfacts')).length, 2);
});
test('old misses and expired positive cache rows are rechecked; fresh writes refresh their timestamp', async () => {
  env.SUPABASE_URL = 'https://test.supabase.co';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  cache = [
    { barcode: UPC, name: null, source: 'miss', fetched_at: new Date().toISOString() },
    { barcode: EAN, name: 'Stale food', source: 'usda', fetched_at: '2020-01-01' },
  ];
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.match(hit.name, /Green beans/);
  assert.equal(writes.length, 1);
  assert.ok(Date.now() - new Date(writes[0].fetched_at).getTime() < 2000);
});
test('fresh equivalent cache rows avoid providers and correct old category mistakes', async () => {
  env.SUPABASE_URL = 'https://test.supabase.co';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  cache = [
    {
      barcode: EAN,
      name: 'Green beans',
      category: 'protein',
      source: 'usda',
      fetched_at: new Date().toISOString(),
    },
  ];
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.equal(hit.barcode, UPC);
  assert.equal(hit.category, 'vegetable');
  assert.equal(hit.source, 'cache');
  assert.equal(calls.length, 1);
  assert.equal(writes.length, 0);
});
test('provider outages remain retryable and are never written as unknown products', async () => {
  env.SUPABASE_URL = 'https://test.supabase.co';
  env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  off = () => reply({}, 503);
  const hit = (await resolveBarcodes([UPC])).get(UPC);
  assert.equal(hit.unavailable, true);
  assert.equal(writes.length, 0);
  off = () => reply(product());
  assert.match((await resolveBarcodes([UPC])).get(UPC).name, /Green beans/);
});
test('invalid inputs make no requests and duplicate codes share one lookup', async () => {
  assert.equal((await resolveBarcodes(['bad', '036000291453'])).size, 0);
  assert.equal(calls.length, 0);
  const hits = await resolveBarcodes([UPC, UPC]);
  assert.equal(hits.size, 1);
  assert.equal(calls.length, 1);
});

// Exercise the real client transport with only its device dependencies stubbed.
let invocation = { data: null, error: null },
  invokes = 0;
for (const [file, exports] of Object.entries({
  'lib/supabase.ts': {
    supabase: {
      functions: {
        invoke: async () => {
          invokes++;
          return invocation;
        },
      },
    },
  },
  'lib/store.ts': { usePantryStore: {} },
  'lib/catalogue.ts': {},
  'lib/photo.ts': {},
  'lib/log.ts': { log: { debug() {}, error() {}, warn() {} } },
}))
  require.cache[path.resolve(file)] = { exports };
const { lookupBarcode } = require('../lib/ai_vision.ts');
test('client rejects invalid digits before network lookup and rejects mismatched or empty responses', async () => {
  invokes = 0;
  assert.equal((await lookupBarcode('bad')).reason, 'INVALID');
  assert.equal(invokes, 0);
  invocation = { data: { found: true, barcode: OTHER, name: 'Wrong product' }, error: null };
  assert.equal((await lookupBarcode(UPC)).found, false);
  invocation = { data: null, error: null };
  assert.equal((await lookupBarcode(UPC)).found, false);
  invocation = {
    data: { found: true, barcode: EAN, name: 'Beans', category: 'typo' },
    error: null,
  };
  const hit = await lookupBarcode(UPC);
  assert.equal(hit.found, true);
  assert.equal(hit.barcode, UPC);
  assert.equal(hit.category, null);
});
