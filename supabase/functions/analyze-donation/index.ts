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
 */

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
          // Which photo this was seen in, and where. Drives the tap-to-verify
          // overlay: without a box there is nothing to point at.
          image_index: { type: 'integer' },
          box_2d: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 4,
            maxItems: 4,
          },
        },
        required: ['name', 'category', 'count', 'condition', 'confidence', 'image_index', 'box_2d'],
      },
    },
  },
  required: ['items'],
}

const PROMPT = `You are helping a food pantry volunteer log a donation. The photos show donated food and household items, often several of the same product together, sometimes shot from more than one angle.

For every DISTINCT product you can see, report:
- name: brand and size as printed, e.g. "Skippy Creamy Peanut Butter 16 oz". If the brand is unreadable, describe the product plainly, e.g. "Canned black beans 15 oz".
- category: exactly one of grain, vegetable, protein, breakfast, snack, hygiene, baby, unknown.
  Canned or dried beans, nut butters, canned meat and fish are protein. Canned and fresh produce is vegetable. Cereal, oats and pancake mix are breakfast. Soap, toothpaste, diapers and paper goods are hygiene. Formula and baby food are baby.
- count: how many units of THAT product are visible. Count what you can actually see; do not guess at what might be hidden behind.
- expiration: printed best-before date as YYYY-MM-DD, or YYYY-MM if only a month is shown. Use null when no date is legible. Never invent one.
- condition: ok unless the packaging is visibly dented, rusted, or the seal is broken — then dented, rusted or seal_broken.
- confidence: 0.0-1.0, how sure you are of name AND count together. Be honest. Use below 0.7 when the label is blurred, partly hidden, or you are inferring the product from its shape.
- image_index: which photo this item was seen in, counting from 0 in the order the photos were given.
- box_2d: where it is in THAT photo, as [ymin, xmin, ymax, xmax], each value 0-1000 normalised to the image height and width. Draw the box around the whole product package. Where several identical units sit together, box the group.

Rules that matter:
- Every item MUST have an image_index and a box_2d. A volunteer taps the box to confirm the item, so a wrong or missing box makes the item unusable.
- If the same product appears in several photos, report it ONCE, using the photo where it is clearest, with the highest count you see in any single photo.
- Never guess an expiration date from the product type.

What NOT to do, because these waste a volunteer's time:
- Do not pad the list. Placeholder names like "Canned product", "Canned goods" or "Unknown item" are never acceptable. If you cannot tell what something is, leave it out entirely.
- Do not box empty floor, shelving, bags, boxes or background. Every box must contain an identifiable product.
- Do not emit one box per unit for a stack of identical products. Box the group once and set count.
- Twenty items you are sure of beat sixty you are guessing at. A short, correct list is the goal.`

/** An index pointing at a photo that wasn't sent is worse than none — pin it. */
function clampIndex(raw: unknown, imageCount: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n) || n < 0 || n >= imageCount) return 0
  return n
}

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

    const parts = [
      { text: PROMPT },
      ...images.map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })),
    ]

    // A real donation pile holds sixty-odd products, and listing them all with
    // boxes genuinely takes a while — 45s timed out on the first real photo
    // tried. This sits under Supabase's own request ceiling while leaving room
    // for the largest pile a volunteer is likely to photograph.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    /**
     * One retry on a transient upstream failure.
     *
     * Gemini answers 503 UNAVAILABLE when it is momentarily overloaded, and that
     * is indistinguishable from a real fault to the volunteer holding the phone —
     * they just see the scan fail. One quiet retry turns most of those into a
     * slightly slower success. Quota exhaustion is deliberately NOT retried:
     * hammering a limit you have already hit only deepens it.
     */
    const isRetryable = (res: Response, body: any) =>
      res.status === 503 || body?.error?.status === 'UNAVAILABLE'

    const callGemini = () =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
              // Thinking stays ON. Switching it off cut a crowded pile from 45s
              // to 29s and destroyed the answer: the model fell into a repetition
              // loop, emitting "Canned green beans" forty-six times with recycled
              // boxes. Enumerating sixty distinct products is exactly the kind of
              // bookkeeping the reasoning pass is holding together.
            },
          }),
          signal: controller.signal,
        },
      )

    let response: Response
    let geminiData: any
    try {
      response = await callGemini()
      geminiData = await response.json()

      if (isRetryable(response, geminiData)) {
        console.warn('Gemini unavailable, retrying once')
        await new Promise((r) => setTimeout(r, 2_000))
        response = await callGemini()
        geminiData = await response.json()
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return json({ error: 'That took too long to read. Try one photo at a time, or a tighter shot of part of the pile.' }, 504)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok || geminiData.error) {
      // Google's prose can name the key or the project, so that never ships. The
      // machine-readable status is safe and is the difference between "wait a
      // minute" and "this will never work" — collapsing every upstream failure
      // into one opaque sentence left no way to tell those apart from the app.
      const status: string = geminiData.error?.status ?? `HTTP_${response.status}`
      console.error('Gemini API error:', JSON.stringify(geminiData.error ?? geminiData))

      const advice: Record<string, string> = {
        RESOURCE_EXHAUSTED:
          'The scanner has hit its usage limit for now. Wait a minute and try again, or add these items by hand.',
        UNAVAILABLE: 'The scanner is busy. Give it a few seconds and try again.',
        DEADLINE_EXCEEDED: 'The scanner timed out. Try a tighter shot of part of the pile.',
        INVALID_ARGUMENT: 'The scanner rejected that photo. Try retaking it.',
        PERMISSION_DENIED: 'The scanner is not configured correctly. Ask an admin to check the API key.',
        NOT_FOUND: 'The scanner is misconfigured — its model is unavailable. Ask an admin to check.',
      }

      return json(
        {
          error: advice[status] ?? 'The scanner could not read those photos. Please try again.',
          // Surfaced so a failure is diagnosable from the device log without
          // needing dashboard access.
          reason: status,
        },
        status === 'RESOURCE_EXHAUSTED' ? 429 : 502,
      )
    }

    const candidate = geminiData.candidates?.[0]

    // A safety block or a truncated answer is not a parse failure and should not
    // be reported as one.
    if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
      console.error('Gemini stopped early:', candidate.finishReason)
      return json({ error: 'The scanner could not process those photos. Try a different angle.' }, 422)
    }

    const textOutput = candidate?.content?.parts?.[0]?.text
    if (!textOutput) return json({ items: [] })

    let parsed: unknown
    try {
      parsed = JSON.parse(textOutput)
    } catch {
      console.error('Unparseable model output:', String(textOutput).slice(0, 500))
      return json({ error: 'The scanner returned something unreadable. Please try again.' }, 502)
    }

    // The schema makes this shape overwhelmingly likely, not certain — and the
    // client normalises again anyway. Belt and braces on the way to a database
    // with CHECK constraints on both of these columns.
    const rawItems = Array.isArray((parsed as any)?.items)
      ? (parsed as any).items
      : Array.isArray(parsed) ? parsed : []

    const items = rawItems
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
        image_index: clampIndex(item.image_index, images.length),
        box_2d: normaliseBox(item.box_2d),
      }))

    return json({ items })
  } catch (error) {
    console.error('analyze-donation crashed:', error)
    return json({ error: 'Something went wrong while scanning. Please try again.' }, 500)
  }
})
