import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Alla fält vi behöver extrahera från årsredovisningen
const EXTRACTION_PROMPT = `Du är en expert på svenska bostadsrättsföreningars årsredovisningar.
Analysera denna PDF-årsredovisning och extrahera följande värden. Svara ENBART med JSON — inga kommentarer.

Fält att extrahera:
- A1_year: Vilket år avser årsredovisningen? (heltal, t.ex. 2024)
- A2_apartments: Antal lägenheter/bostadsrätter (heltal)
- A3_brf_area_sqm: Total bostadsrättsyta i kvm (heltal)
- A4_total_area_sqm: Total yta inkl. lokaler och garage i kvm (heltal)
- A5_has_rentals: Har föreningen uthyrda lokaler? (true/false)
- A5b_rental_area_sqm: Uthyrd lokalyta i kvm (heltal, 0 om ej aktuellt)
- A6_land_ownership: "owns" (äger marken), "leasehold" (tomträtt), eller "unknown"
- B1_annual_fees: Totala årsavgifter från medlemmar (heltal i kr)
- B2_rental_income: Hyresintäkter från lokaler/garage/antenner (heltal i kr, 0 om ej aktuellt)
- C1_total_debt: Total räntebärande låneskuld (heltal i kr)
- C2_interest_costs: Totala räntekostnader under året (heltal i kr)
- D1_energy_costs: Totala kostnader för värme, el och vatten (heltal i kr)
- E1_has_maintenance_plan: Har föreningen underhållsplan? (true/false)
- E2_maintenance_plan_year: År underhållsplanen uppdaterades (heltal, null om okänt)
- E3_fund_allocation: Årets avsättning till underhållsfond (heltal i kr)
- E4_depreciation: Årets avskrivningar (heltal i kr)
- E5_planned_maintenance_costs: Årets kostnadsförda planerade underhåll (heltal i kr, 0 om ej separat redovisat)
- F1_net_result: Årets resultat (heltal i kr, kan vara negativt)
- F2_cashflow: "positive", "negative", eller "unknown" (baserat på kassaflödesanalys)
- brf_name: Föreningens namn (sträng)

Svara med exakt denna JSON-struktur:
{
  "extracted": { ...alla fält ovan... },
  "confidence": { ...samma fältnamn, varje med "high", "medium" eller "low"... },
  "notes": "Kort sammanfattning av vad du hittade och eventuella osäkerheter"
}

VIKTIGT:
- Alla belopp i hela kronor (ej tusental om inte tydligt angivet)
- Om ett värde anges i tusental (tkr) i PDFen, multiplicera med 1000
- Om du inte kan hitta ett värde, ange null
- Var extra noga med att skilja på bostadsrättsyta (A3) och totalyta (A4)
- Årsavgifter (B1) = intäkter från medlemsavgifter, inte hyror
- Kontrollera att låneskuld (C1) stämmer med balansräkningens skuldsida`

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'API-nyckel saknas' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null

    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Ingen giltig PDF-fil' }, { status: 400 })
    }

    // Konvertera PDF till base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parsa JSON från svaret (hantera eventuell markdown-inramning)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Kunde inte tolka PDF-innehållet', raw: text }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      extracted: parsed.extracted,
      confidence: parsed.confidence,
      notes: parsed.notes,
    })
  } catch (error) {
    console.error('PDF extraction error:', error)
    return NextResponse.json(
      { error: 'Kunde inte bearbeta PDF-filen' },
      { status: 500 }
    )
  }
}
