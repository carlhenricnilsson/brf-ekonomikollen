import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type KPI = { id: number; name: string; value: number; unit: string; light: string }

function formatKPI(kpi: KPI) {
  const unit = kpi.unit === '%' ? `${kpi.value.toFixed(1)}%` : `${Math.round(kpi.value).toLocaleString('sv-SE')} ${kpi.unit}`
  const status = kpi.light === 'red' ? '🔴 VARNING' : kpi.light === 'yellow' ? '🟡 BEVAKA' : kpi.light === 'green' ? '🟢 BRA' : '🔵 INFO'
  return `${kpi.id}. ${kpi.name}: ${unit} [${status}]`
}

export async function POST(req: NextRequest) {
  const { kpis, answers, surveyId } = await req.json()

  const redKPIs = kpis.filter((k: KPI) => k.light === 'red')
  const yellowKPIs = kpis.filter((k: KPI) => k.light === 'yellow')

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

  const prompt = `Du är en erfaren ekonomisk analytiker specialiserad på svenska bostadsrättsföreningar (BRF:er).
Du har fått in svar på Ekonomikollen – en enkät baserad på BFNAR 2023:1.

NYCKELTAL FÖR VERKSAMHETSÅRET ${surveyYear}:
${kpis.map(formatKPI).join('\n')}

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
Analysera de nyckeltal som är röda eller gula. Förklara vad värdet betyder i praktiken för föreningen och dess medlemmar. För nyckeltal utan trafikljus – ge en kort kommentar om vad värdet indikerar jämfört med typiska BRF:er.

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

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Spara till databasen om surveyId finns
    if (surveyId) {
      await supabaseAdmin.from('ai_analyses').insert({
        survey_id: surveyId,
        analysis_text: text,
        model: 'claude-opus-4-6',
      })
    }

    return NextResponse.json({ analysis: text })
  } catch (error) {
    console.error('Claude API error:', error)
    return NextResponse.json({ error: 'Kunde inte generera analys' }, { status: 500 })
  }
}
