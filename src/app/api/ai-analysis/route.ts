import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-server'
import { resolveUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Streaming håller connection vid liv. Opus levererar ~140 char/s,
// så en 8000-token-analys (~30 000 chars) tar ~3-4 minuter.
// 300s = Vercel Pro-plan max.
export const maxDuration = 300

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type KPI = { id: number; name: string; value: number; unit: string; light: string }

function formatKPI(kpi: KPI) {
  const unit = kpi.unit === '%' ? `${kpi.value.toFixed(1)}%` : `${Math.round(kpi.value).toLocaleString('sv-SE')} ${kpi.unit}`
  const status = kpi.light === 'red' ? '🔴 VARNING' : kpi.light === 'yellow' ? '🟡 BEVAKA' : kpi.light === 'green' ? '🟢 BRA' : '🔵 INFO'
  return `${kpi.id}. ${kpi.name}: ${unit} [${status}]`
}

export async function POST(req: NextRequest) {
  // Rate limit: 5/min per IP – generöst för säljtratten (genereras
  // i praktiken en gång), hårt mot scriptad budget-abuse.
  const limited = rateLimit(req, 'ai-analysis', 5, 60_000)
  if (limited) return limited

  const { kpis, answers, surveyId, historical } = await req.json()
  const histData = (historical ?? []) as { year: number; kpis: KPI[] }[]

  // --- Skydd mot API-budgetabuse (kostnadsbärande Anthropic-anrop) ---
  // 1. surveyId måste referera en verklig, ej arkiverad enkät (billig
  //    avvisning innan det dyra anropet – stoppar scriptad massabuse).
  if (!surveyId) {
    return NextResponse.json({ error: 'surveyId krävs' }, { status: 400 })
  }
  const { data: survey } = await supabaseAdmin
    .from('surveys')
    .select('id, deleted_at')
    .eq('id', surveyId)
    .single()
  if (!survey || survey.deleted_at) {
    return NextResponse.json({ error: 'Enkäten är inte tillgänglig' }, { status: 404 })
  }

  // 2. Åtkomstgrind: AI-analysen är en BETALD deliverabel. Endast superadmin
  //    eller den som betalat för enkäten får generera. Stoppar obetalda/
  //    anonyma från att trigga det kostnadsbärande anropet OCH läcka innehåll.
  const { userId, role } = await resolveUser(req)
  let hasAccess = role === 'superadmin'
  if (!hasAccess && userId) {
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('user_id', userId)
      .eq('survey_id', surveyId)
      .eq('status', 'completed')
      .limit(1)
    hasAccess = !!(payment && payment.length > 0)
  }
  if (!hasAccess) {
    return NextResponse.json({ error: 'Kräver betald rapport' }, { status: 403 })
  }

  // 3. Finns redan en analys? Tillåt om-generering endast för superadmin
  //    (förhindrar upprepad budget-bränning; säljtratten genererar bara
  //    en gång eftersom UI:t döljer knappen när analys finns).
  const { data: existingAnalysis } = await supabaseAdmin
    .from('ai_analyses')
    .select('id')
    .eq('survey_id', surveyId)
    .limit(1)
  if (existingAnalysis && existingAnalysis.length > 0 && role !== 'superadmin') {
    return NextResponse.json(
      { error: 'Analys finns redan för denna enkät' },
      { status: 409 }
    )
  }

  // Hämta fritextsvar
  const freeTexts = [
    answers.F3_cashflow_plan ? `Kassaflödesplan: "${answers.F3_cashflow_plan}"` : null,
    answers.G3_investments ? `Investeringsplaner: "${answers.G3_investments}"` : null,
  ].filter(Boolean).join('\n')

  const hasMaintPlan = answers.E1_has_maintenance_plan === 'Ja'
  const maintPlanYear = answers.E2_maintenance_plan_year
  const cashflow = answers.F2_cashflow
  const assessment = answers.G1_financial_assessment
  const feeIncrease = answers.G2_fee_increase
  const surveyYear = answers.A1_year

  const histSection = histData.length > 0 ? `

HISTORISKA NYCKELTAL (tidigare år för samma BRF):
${histData.map(h => `Verksamhetsår ${h.year}:\n${h.kpis.map(formatKPI).join('\n')}`).join('\n\n')}
` : ''

  const prompt = `Du är en erfaren ekonomisk analytiker specialiserad på svenska bostadsrättsföreningar (BRF:er).
Du har fått in svar på Ekonomikollen – en enkät baserad på BFNAR 2023:1.

NYCKELTAL FÖR VERKSAMHETSÅRET ${surveyYear}:
${kpis.map(formatKPI).join('\n')}${histSection}

KOMPLETTERANDE INFORMATION:
- Underhållsplan: ${hasMaintPlan ? `Ja, senast uppdaterad ${maintPlanYear || 'okänt år'}` : 'Saknas'}
- Kassaflöde: ${cashflow || 'Ej angivet'}
- Styrelsens bedömning av ekonomin: ${assessment}/5
- Avgiftshöjning diskuteras: ${feeIncrease || 'Ej angivet'}
${freeTexts ? `\nSTYRELSENS EGNA KOMMENTARER:\n${freeTexts}` : ''}

Skriv en professionell analys på svenska med följande struktur:

## Sammanfattning
En kort (3–4 meningar) övergripande bedömning av föreningens ekonomiska hälsa. Var tydlig och direkt.

## Analys per nyckeltal
Analysera de nyckeltal som är röda eller gula. Förklara vad värdet betyder i praktiken för föreningen och dess medlemmar. För nyckeltal utan trafikljus – ge en kort kommentar om vad värdet indikerar jämfört med typiska BRF:er.${histData.length > 0 ? `

## Trendutveckling
Jämför årets nyckeltal med tidigare år. Beskriv vilka nyckeltal som förbättrats, försämrats eller är stabila. Lyft fram oroande trender och positiva utvecklingar. Var konkret med siffror.` : ''}

## Styrkor
Lista 2–3 positiva aspekter av föreningens ekonomi.

## Risker och rekommendationer
För varje rött eller gult nyckeltal: ge en konkret, handlingsorienterad rekommendation. Vad bör styrelsen göra inom 1 år? Inom 3 år?

## Framtidsutsikter
**På 5–10 års sikt:** Beskriv den sannolika ekonomiska utvecklingen om inga åtgärder vidtas, kontra om rekommendationerna följs.

**På 30–50 års sikt:** Gör en bedömning av föreningens långsiktiga hållbarhet med fokus på underhållsbehov, lånesituation och avgiftsutveckling. Var ärlig om osäkerheten i en sådan prognos.

## Slutord till styrelsen
En uppmuntrande men ärlig avslutning riktad till styrelsen.

## Förslag till punkter på nästa styrelsemöte
Baserat på analysen ovan, lista de viktigaste åtgärderna som styrelsen bör ta upp på sitt nästa möte. Presentera varje punkt som en tydlig dagordningspunkt med:
- Rubrik för punkten
- Kort motivering (varför detta bör prioriteras)
- Förslag till beslutsformulering (skriv som ett färdigt "Styrelsen beslutar att...")

Använd ett professionellt men tillgängligt språk. Undvik onödig jargong. Skriv som om du presenterar för en styrelse som inte är ekonomer.

VIKTIGA FORMATERINGSREGLER:
- Använd ENDAST ## för rubriker (inte ### eller #)
- Använd INTE horisontella linjer (---)
- Använd INTE tabeller (|kolumn|kolumn|)
- Använd enkel punktlista (- punkt) om du listar saker`

  const encoder = new TextEncoder()
  let fullText = ''

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
        })

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const chunk = event.delta.text
            fullText += chunk
            controller.enqueue(encoder.encode(chunk))
          }
        }

        // Spara till databasen om surveyId finns
        if (surveyId && fullText) {
          const { error: dbError } = await supabaseAdmin.from('ai_analyses').insert({
            survey_id: surveyId,
            analysis_text: fullText,
          })
          if (dbError) {
            console.error('[ai-analysis] DB insert failed:', dbError)
          } else {
            console.log(`[ai-analysis] Saved ${fullText.length} chars for survey ${surveyId}`)
          }
        }

        controller.close()
      } catch (error) {
        console.error('Claude API stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
