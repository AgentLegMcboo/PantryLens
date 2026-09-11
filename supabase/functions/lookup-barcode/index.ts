/**
 * One barcode, deliberately scanned.
 *
 * The other half of the story in analyze-donation: there, barcodes are a bonus
 * the vision model picks up for free while reading a pile. Here a volunteer has
 * pointed the camera at one specific package because the scanner got that row
 * wrong, which means this is the highest-intent lookup in the app and it should
 * answer plainly — resolved, or honestly not found.
 *
 * Shares _shared/barcode.ts with the scanner, so the checksum rule, the provider
 * order and the cache are identical either way in.
 */

import { normaliseBarcode, resolveBarcodes } from '../_shared/barcode.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const barcode = normaliseBarcode(body?.barcode)

    // Failing the checksum is not a server error — it is a misread, and the app
    // should say so rather than reporting that the lookup broke.
    if (!barcode) {
      return json(
        { found: false, reason: 'INVALID', error: "That code didn't scan cleanly. Try again." },
        200,
      )
    }

    const resolved = await resolveBarcodes([barcode])
    const hit = resolved.get(barcode)

    if (!hit || !hit.name) {
      return json({
        found: false,
        reason: 'UNKNOWN',
        barcode,
        error: 'No product database knows that barcode. Type the name in by hand.',
      })
    }

    return json({
      found: true,
      barcode,
      name: hit.name,
      brand: hit.brand,
      category: hit.category,
      imageUrl: hit.imageUrl,
      source: hit.source,
    })
  } catch (error) {
    console.error('lookup-barcode crashed:', error)
    return json({ found: false, reason: 'ERROR', error: 'The lookup failed. Please try again.' }, 500)
  }
})
