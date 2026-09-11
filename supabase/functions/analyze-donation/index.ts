/**
 * Turns photos of a donation into draft inventory rows.
 *
 * Runs with verify_jwt = true, so only a signed-in volunteer reaches it. That is
 * not a formality: this endpoint spends Gemini quota on every call, and it was
 * previously open to anyone who knew the URL.
 *
 * The response is pinned with a responseSchema rather than asked for in prose.
 * Gemini then cannot answer with prose, a markdown fence, or a category the
 * database would reject — which is where the old free-text version broke.
 *
 * ONE REQUEST PER PHOTO, fanned out concurrently.
 *
 * This used to send every photo in a single call. Vision input prefills in
 * parallel and is cheap; the answer does not — sixty products at roughly sixty
 * output tokens each is decoded strictly serially, so a six-photo pile paid the
 * SUM of all six. Fanning out means the volunteer waits for the slowest single
 * photo instead, which is most of where the minute went.
 *
 * It also let two hard instructions be deleted rather than merely reworded:
 * reporting a product seen in several frames exactly once, and tagging every
 * item with the index of the photo it came from. Cross-frame identity matching
 * while enumerating sixty products is genuinely difficult, it was consuming a
 * large share of the thinking budget, and it was being done unreliably. Each
 * call now sees exactly one photo, so the index is the request number — correct
 * by construction — and de-duplication is done in code by mergeDuplicates() in
 * lib/scan-normalize.ts, which was already written for precisely this and was
 * previously sitting almost idle.
 */

import { normaliseBarcode, resolveBarcodes } from '../_shared/barcode.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CATEGORIES = ['grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown']
const CONDITIONS = ['ok', 'dented', 'rusted', 'seal_broken', 'expired']

// Flash rather than Pro: a volunteer is standing over a crate waiting for this,
// and the accuracy difference on packaged-goods labels does not pay for the wait.
const MODEL = 'gemini-2.5-flash'

/** Guards against a caller pushing a huge payload and stalling the function. */
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 6 * 1024 * 1024

/**
 * How many photos are in flight at once.
 *
 * Not MAX_IMAGES, because the per-minute request limit is now the thing most
 * likely to break a scan: six simultaneous calls will trip a free-tier RPM
 * ceiling that one call never could. Four covers the common one-to-three photo
 * scan with full parallelism and turns a six-photo pile into two waves, which is
 * still far better than the single serial answer it replaced.
 */
const MAX_CONCURRENT = 4

/**
 * Bounded reasoning, rather than the dynamic default.
 *
 * Switching thinking off entirely was tried and was a disaster: a crowded pile
 * went from 45s to 29s and the model fell into a repetition loop, emitting
 * "Canned green beans" forty-six times with recycled boxes. But off-versus-on
 * was never the only choice. Enumerating one photo's worth of products is a much
 * smaller bookkeeping job than enumerating six photos' worth, so a small budget
 * holds where zero did not.
 *
 * That repetition loop is the canary. If duplicate names with recycled boxes
 * ever come back, this number is what to raise.
 */
const THINKING_BUDGET = 1024

/**
 * Per-photo ceiling, covering that photo's one retry.
 *
 * Six photos run as two waves of MAX_CONCURRENT, so the worst case the platform
 * can be asked to hold open is two of these back to back — 90s, comfortably
 * inside Supabase's request ceiling. The old single call needed 120s all to
 * itself and still timed out on a crowded pile.
 */
const REQUEST_TIMEOUT_MS = 45_000

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          count: { type: 'integer' },
          expiration: { type: 'string', nullable: true },
          condition: { type: 'string', enum: CONDITIONS },
          confidence: { type: 'number' },
          // The printed barcode digits, when they are legible. Cheap to ask for
          // (a handful of output tokens) and worth a great deal when it lands:
          // a valid GTIN replaces a guess at a label with the manufacturer's own
          // name for the product. A misread is caught by the check digit rather
          // than believed.
          barcode: { type: 'string', nullable: true },
          // Where in this photo. Drives the tap-to-verify overlay: without a box
          // there is nothing to point at. `image_index` is deliberately NOT in
          // this schema any more — the server knows which photo it sent.
          box_2d: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 4,
            maxItems: 4,
          },
        },
        required: ['name', 'category', 'count', 'condition', 'confidence', 'box_2d'],
      },
    },
  },
  required: ['items'],
}

const PROMPT = `You are helping a food pantry volunteer log a donation. The photo shows donated food and household items, often several of the same product together.

For every DISTINCT product you can see in this photo, report:
- name: brand and size as printed, e.g. "Skippy Creamy Peanut Butter 16 oz". If the brand is unreadable, describe the product plainly, e.g. "Canned black beans 15 oz".
- category: exactly one of grain, vegetable, protein, breakfast, snack, hygiene, baby, unknown.
  Canned or dried beans, nut butters, canned meat and fish are protein. Canned and fresh produce is vegetable. Cereal, oats and pancake mix are breakfast. Soap, toothpaste, diapers and paper goods are hygiene. Formula and baby food are baby.
- count: how many units of THAT product are visible in this photo. Count what you can actually see; do not guess at what might be hidden behind.
- expiration: printed best-before date as YYYY-MM-DD, or YYYY-MM if only a month is shown. Use null when no date is legible. Never invent one.
- condition: ok unless the packaging is visibly dented, rusted, or the seal is broken — then dented, rusted or seal_broken.
- confidence: 0.0-1.0, how sure you are of name AND count together. Be honest. Use below 0.7 when the label is blurred, partly hidden, or you are inferring the product from its shape.
- barcode: the digits printed under the barcode, if you can read them clearly. Use null unless you are reading actual digits off the package — never guess, never infer them from the product. Most items will be null and that is fine.
- box_2d: where it is in this photo, as [ymin, xmin, ymax, xmax], each value 0-1000 normalised to the image height and width. Draw the box around the whole product package. Where several identical units sit together, box the group.

Rules that matter:
- Every item MUST have a box_2d. A volunteer taps the box to confirm the item, so a wrong or missing box makes the item unusable.
- Report only what is in THIS photo. Other photos of the same donation are handled separately; you do not need to think about them.
- Never guess an expiration date from the product type.

What NOT to do, because these waste a volunteer's time:
- Do not pad the list. Placeholder names like "Canned product", "Canned goods" or "Unknown item" are never acceptable. If you cannot tell what something is, leave it out entirely.
- Do not box empty floor, shelving, bags, boxes or background. Every box must contain an identifiable product.
- Do not emit one box per unit for a stack of identical products. Box the group once and set count.
- Twenty items you are sure of beat sixty you are guessing at. A short, correct list is the goal.`

/**
 * [ymin, xmin, ymax, xmax] on a 0-1000 scale, or null if the model gave
 * something unusable. Returning null is deliberate: the overlay can show an
 * item as "somewhere in this photo" and still let it be verified, whereas a
 * garbage box would draw a rectangle over the wrong product.
 */
function normaliseBox(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null

  const nums = raw.map((v) => Math.round(Number(v)))
  if (nums.some((n) => !Number.isFinite(n))) return null

  let [ymin, xmin, ymax, xmax] = nums.map((n) => Math.min(1000, Math.max(0, n)))
  // Models occasionally emit the corners the other way round.
  if (ymin > ymax) [ymin, ymax] = [ymax, ymin]
  if (xmin > xmax) [xmin, xmax] = [xmax, xmin]

  // A zero-area box points at nothing.
  if (ymax - ymin < 5 || xmax - xmin < 5) return null

  return [ymin, xmin, ymax, xmax]
}

/** What the volunteer should be told, per Gemini status. */
const ADVICE: Record<string, string> = {
  RESOURCE_EXHAUSTED:
    'The scanner has hit its usage limit for now. Wait a minute and try again, or add these items by hand.',
  UNAVAILABLE: 'The scanner is busy. Give it a few seconds and try again.',
  DEADLINE_EXCEEDED: 'The scanner timed out. Try a tighter shot of part of the pile.',
  INVALID_ARGUMENT: 'The scanner rejected that photo. Try retaking it.',
  PERMISSION_DENIED: 'The scanner is not configured correctly. Ask an admin to check the API key.',
  NOT_FOUND: 'The scanner is misconfigured — its model is unavailable. Ask an admin to check.',
  TIMEOUT: 'That took too long to read. Try a tighter shot of part of the pile.',
}

/** Carries the machine-readable status up so one failed photo can be reported precisely. */
class GeminiError extends Error {
  constructor(readonly status: string) {
    super(ADVICE[status] ?? 'The scanner could not read that photo. Please try again.')
  }
}

interface PhotoResult {
  items: any[]
  /** Rolled up across photos so a slow scan can be diagnosed from the logs. */
  usage: { prompt: number; thoughts: number; output: number }
}

/**
 * One photo, one call.
 *
 * Retries once on a transient upstream failure. Gemini answers 503 UNAVAILABLE
 * when it is momentarily overloaded, and that is indistinguishable from a real
 * fault to the volunteer holding the phone — they just see the scan fail. One
 * quiet retry turns most of those into a slightly slower success. Quota
 * exhaustion is deliberately NOT retried: hammering a limit you have already hit
 * only deepens it.
 */
async function analyseOnePhoto(image: string, apiKey: string): Promise<PhotoResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const call = () =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: PROMPT }, { inline_data: { mime_type: 'image/jpeg', data: image } }] },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingBudget: THINKING_BUDGET },
          },
        }),
        signal: controller.signal,
      },
    )

  try {
    let response = await call()
    let data = await response.json()

    if (response.status === 503 || data?.error?.status === 'UNAVAILABLE') {
      console.warn('Gemini unavailable, retrying once')
      await new Promise((r) => setTimeout(r, 2_000))
      response = await call()
      data = await response.json()
    }

    if (!response.ok || data.error) {
      // Google's prose can name the key or the project, so that never ships. The
      // machine-readable status is safe and is the difference between "wait a
      // minute" and "this will never work".
      const status: string = data.error?.status ?? `HTTP_${response.status}`
      console.error('Gemini API error:', JSON.stringify(data.error ?? data))
      throw new GeminiError(status)
    }

    const usageRaw = data.usageMetadata ?? {}
    const usage = {
      prompt: Number(usageRaw.promptTokenCount) || 0,
      thoughts: Number(usageRaw.thoughtsTokenCount) || 0,
      output: Number(usageRaw.candidatesTokenCount) || 0,
    }

    const candidate = data.candidates?.[0]

    // A safety block or a truncated answer is not a parse failure and should not
    // be reported as one.
    if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
      console.error('Gemini stopped early:', candidate.finishReason)
      throw new GeminiError('BLOCKED')
    }

    const textOutput = candidate?.content?.parts?.[0]?.text
    if (!textOutput) return { items: [], usage }

    let parsed: unknown
    try {
      parsed = JSON.parse(textOutput)
    } catch {
      console.error('Unparseable model output:', String(textOutput).slice(0, 500))
      throw new GeminiError('UNPARSEABLE')
    }

    // The schema makes this shape overwhelmingly likely, not certain — and the
    // client normalises again anyway. Belt and braces on the way to a database
    // with CHECK constraints on both of these columns.
    const rawItems = Array.isArray((parsed as any)?.items)
      ? (parsed as any).items
      : Array.isArray(parsed)
        ? parsed
        : []

    return { items: rawItems, usage }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new GeminiError('TIMEOUT')
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Runs `worker` over every input, at most `limit` at a time.
 *
 * Never rejects: a scan of six photos where one comes back blocked is still five
 * photos' worth of work the volunteer does not have to redo by hand.
 */
async function mapWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  worker: (input: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(inputs.length)
  let next = 0

  const runner = async () => {
    while (true) {
      const index = next++
      if (index >= inputs.length) return
      try {
        results[index] = { status: 'fulfilled', value: await worker(inputs[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, runner))
  return results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  try {
    const body = await req.json().catch(() => null)
    if (!body) return json({ error: 'Expected a JSON body.' }, 400)

    // `images` is the current shape; `imageBase64` is the single-photo form the
    // first version of the app sent, kept working so an older build still scans.
    const rawImages: unknown = body.images ?? body.imageBase64
    const images: string[] = (Array.isArray(rawImages) ? rawImages : [rawImages])
      .filter((i): i is string => typeof i === 'string' && i.length > 0)
      // Data URLs arrive from some pickers; Gemini wants the payload alone.
      .map((i) => (i.startsWith('data:') && i.includes(',') ? i.slice(i.indexOf(',') + 1) : i))

    if (images.length === 0) {
      return json({ error: 'No photos were included in the request.' }, 400)
    }
    if (images.length > MAX_IMAGES) {
      return json({ error: `Please send at most ${MAX_IMAGES} photos at a time.` }, 400)
    }
    for (const image of images) {
      // base64 inflates by 4/3; compare against the decoded size.
      if (image.length * 0.75 > MAX_IMAGE_BYTES) {
        return json({ error: 'One of those photos is too large. Try again at a lower quality.' }, 413)
      }
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set on this project.')
      return json({ error: 'The scanner is not configured yet. Ask an admin to set the API key.' }, 500)
    }

    const startedAt = Date.now()
    const settled = await mapWithConcurrency(images, MAX_CONCURRENT, (image) =>
      analyseOnePhoto(image, GEMINI_API_KEY),
    )

    const succeeded = settled.filter(
      (r): r is PromiseFulfilledResult<PhotoResult> => r.status === 'fulfilled',
    )

    // Every photo failed. Report the first status rather than a generic message —
    // "wait a minute" and "this will never work" need to read differently.
    if (succeeded.length === 0) {
      const first = (settled[0] as PromiseRejectedResult | undefined)?.reason
      const status = first instanceof GeminiError ? first.status : 'UNKNOWN'
      const message =
        first instanceof GeminiError
          ? first.message
          : 'The scanner could not read those photos. Please try again.'
      return json({ error: message, reason: status }, status === 'RESOURCE_EXHAUSTED' ? 429 : 502)
    }

    // Which photo an item came from is the request index, so it cannot be wrong.
    // Cross-photo duplicates are merged by the client's mergeDuplicates().
    const items = settled.flatMap((result, imageIndex) => {
      if (result.status !== 'fulfilled') return []
      return result.value.items
        .filter((item: any) => typeof item?.name === 'string' && item.name.trim().length > 0)
        .map((item: any) => ({
          name: String(item.name).trim().slice(0, 120),
          category: CATEGORIES.includes(item.category) ? item.category : 'unknown',
          count: Math.min(99, Math.max(1, Math.floor(Number(item.count)) || 1)),
          expiration:
            typeof item.expiration === 'string' && item.expiration.trim()
              ? item.expiration.trim()
              : null,
          condition: CONDITIONS.includes(item.condition) ? item.condition : 'ok',
          confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0.5)),
          // Null unless the digits both read and checksum. See _shared/barcode.ts.
          barcode: normaliseBarcode(item.barcode),
          // Filled in below when a provider recognises the barcode, so the app
          // can say WHY a row is trustworthy rather than just showing a number.
          resolved_by: null as string | null,
          // The manufacturer's pack shot, when a barcode found one.
          image_url: null as string | null,
          image_index: imageIndex,
          box_2d: normaliseBox(item.box_2d),
        }))
    })

    /**
     * Barcodes outrank the model.
     *
     * Where a GTIN validated AND a provider knows it, the manufacturer's own name
     * for the product replaces whatever was read off the label, and confidence
     * goes to 1 — this is not a guess any more, and the volunteer should not be
     * asked to check it as though it were. A barcode nobody recognises leaves the
     * row exactly as the model saw it.
     *
     * Never allowed to fail the scan: a lookup outage costs the pantry nothing
     * more than the reading it would have had anyway.
     */
    try {
      const codes = items.map((i: any) => i.barcode).filter((b: string | null): b is string => !!b)
      if (codes.length > 0) {
        const resolved = await resolveBarcodes(codes)
        for (const item of items) {
          const hit = item.barcode ? resolved.get(item.barcode) : undefined
          if (!hit || !hit.name) continue
          item.name = hit.name
          if (hit.category) item.category = hit.category
          item.confidence = 1
          item.resolved_by = 'barcode'
          item.image_url = hit.imageUrl ?? null
        }
      }
    } catch (err) {
      console.warn('barcode resolution failed (scan continues):', err)
    }

    // The one line that says where a slow scan actually went. Thinking tokens and
    // output tokens are the two candidates and they call for opposite fixes.
    const usage = succeeded.reduce(
      (sum, r) => ({
        prompt: sum.prompt + r.value.usage.prompt,
        thoughts: sum.thoughts + r.value.usage.thoughts,
        output: sum.output + r.value.usage.output,
      }),
      { prompt: 0, thoughts: 0, output: 0 },
    )
    console.log(
      `scan: ${succeeded.length}/${images.length} photos in ${Date.now() - startedAt}ms · ` +
        `${items.length} items · tokens in=${usage.prompt} thinking=${usage.thoughts} out=${usage.output}`,
    )

    return json({
      items,
      // So the app can say "5 of 6 photos read" rather than quietly dropping one.
      photosRead: succeeded.length,
      photosSent: images.length,
    })
  } catch (error) {
    console.error('analyze-donation crashed:', error)
    return json({ error: 'Something went wrong while scanning. Please try again.' }, 500)
  }
})
