import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64 } = await req.json()
    
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Please set it in the Supabase Dashboard.")
    }

    const promptText = `
You are an expert food pantry inventory assistant. Analyze the provided image of donated food items.
Extract the following information for each item you identify:
- name: The full name of the item including brand and size if visible (e.g., "Skippy Creamy Peanut Butter 16oz").
- category: MUST be one of these exact strings: 'grain', 'vegetable', 'protein', 'breakfast', 'snack', 'hygiene', 'baby', 'unknown'.
- count: The number of this specific item shown (integer).
- expiration: The expiration date if visible in YYYY-MM-DD format, or null if not visible.
- confidence: Your confidence score between 0.0 and 1.0 that this item was identified correctly.

Return ONLY a JSON array of objects. Do not wrap it in markdown block quotes. Just the raw JSON array.
Example output:
[
  { "name": "Skippy Creamy Peanut Butter 16oz", "category": "protein", "count": 2, "expiration": "2026-05-10", "confidence": 0.95 }
]
    `

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        }
      })
    })

    const geminiData = await response.json()
    
    if (geminiData.error) {
      console.error("Gemini API Error:", geminiData.error)
      throw new Error(geminiData.error.message || "Error calling Gemini API")
    }

    const textOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    
    if (!textOutput) {
      throw new Error("No text returned from Gemini API")
    }
    
    let parsedItems = []
    try {
      parsedItems = JSON.parse(textOutput)
    } catch (parseError) {
      console.error("Failed to parse Gemini output:", textOutput)
      throw new Error("Failed to parse the JSON response from the AI.")
    }

    return new Response(JSON.stringify({ items: parsedItems }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
