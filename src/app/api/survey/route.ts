import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { calculateKPIs, kpiSetToArray } from '@/lib/kpi-calculator'
import { parseBody, surveySubmitSchema } from '@/lib/validation'
import { rateLimit } from '@/lib/rate-limit'
import { resolveUser } from '@/lib/auth'
import type { SurveyAnswer } from '@/types'

export async function POST(req: NextRequest) {
  // Publik (token-baserad) inlämning – rate limit mot skräp-enkäter.
  const limited = rateLimit(req, 'survey', 10, 60_000)
  if (limited) return limited

  // Inloggad användare (om någon). Anonyma token-inlämningar tillåts fortfarande.
  const { userId, role } = await resolveUser(req)

  const parsed = parseBody(surveySubmitSchema, await req.json())
  if (!parsed.ok) return parsed.res
  const { answers, token, brf_name } = parsed.data

  // Enda KPI-sanningskällan: delade, testtäckta lib:en.
  // Mappas till routens etablerade svarsform {id,name,value,unit,light}
  // (oförändrat kontrakt för sessionStorage/results-sidan).
  const kpis = kpiSetToArray(calculateKPIs(answers as unknown as SurveyAnswer)).map(k => ({
    id: k.id,
    name: k.name_sv,
    value: k.value,
    unit: k.unit,
    light: k.traffic_light,
  }))

  let surveyId: string

  if (token) {
    // Använd befintlig enkät kopplad till token
    const { data: existing } = await supabaseAdmin
      .from('surveys')
      .select('id')
      .eq('token', token)
      .single()

    if (existing) {
      surveyId = existing.id
      const { error: updErr } = await supabaseAdmin
        .from('surveys')
        .update({ status: 'completed', survey_year: Number(answers.A1_year) || new Date().getFullYear() })
        .eq('id', surveyId)
      if (updErr) {
        console.error('Survey update error:', updErr)
        return NextResponse.json({ error: 'Kunde inte spara enkäten' }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'Ogiltig enkätlänk' }, { status: 400 })
    }
  } else {
    // Skapa ny enkät (direktflöde utan token)
    const surveyYear = Number(answers.A1_year) || new Date().getFullYear()
    const insertData: Record<string, unknown> = { survey_year: surveyYear, status: 'completed' }
    if (brf_name) insertData.brf_name = `${brf_name} ${surveyYear}`

    const { data: survey, error: surveyError } = await supabaseAdmin
      .from('surveys')
      .insert(insertData)
      .select()
      .single()

    if (surveyError || !survey) {
      console.error('Survey insert error:', surveyError)
      // Tidigare: returnerade fejkad random surveyId + 200 (falsk
      // success → trasig results-sida). Nu korrekt fel.
      return NextResponse.json({ error: 'Kunde inte skapa enkäten' }, { status: 500 })
    }
    surveyId = survey.id

    // Koppla BRF:en till den inloggade brf_admin så enkäten syns i
    // "Mina rapporter". Superadmin behöver ingen koppling (ser allt).
    // Idempotent: skapa bara om kopplingen saknas.
    if (userId && role === 'brf_admin' && brf_name) {
      const { data: existingLink } = await supabaseAdmin
        .from('brf_admin_brfs')
        .select('id')
        .eq('user_id', userId)
        .eq('brf_base_name', brf_name)
        .limit(1)

      if (!existingLink || existingLink.length === 0) {
        const { error: linkErr } = await supabaseAdmin
          .from('brf_admin_brfs')
          .insert({ user_id: userId, brf_base_name: brf_name })
        if (linkErr) console.error('BRF-länk error:', linkErr)
      }
    }
  }

  // Idempotent: rensa ev. tidigare svar/KPI för enkäten innan nya sparas.
  // Förhindrar dubbletter om samma tokenlänk lämnas in mer än en gång.
  // För en nyskapad enkät matchar detta 0 rader (no-op).
  const { error: delAErr } = await supabaseAdmin.from('answers').delete().eq('survey_id', surveyId)
  const { error: delKErr } = await supabaseAdmin.from('kpi_results').delete().eq('survey_id', surveyId)
  if (delAErr || delKErr) {
    console.error('Survey cleanup error:', delAErr || delKErr)
    return NextResponse.json({ error: 'Kunde inte spara enkäten' }, { status: 500 })
  }

  // Spara alla svar
  const answerRows = Object.entries(answers).map(([question_code, value]) => ({
    survey_id: surveyId,
    question_code,
    answer_numeric: typeof value === 'number' ? value : null,
    answer_text: typeof value === 'string' ? value : null,
    answer_choice: typeof value === 'boolean' ? String(value) : null,
  }))

  const { error: insAErr } = await supabaseAdmin.from('answers').insert(answerRows)
  if (insAErr) {
    console.error('Answers insert error:', insAErr)
    return NextResponse.json({ error: 'Kunde inte spara svaren' }, { status: 500 })
  }

  // Spara KPI-resultat
  const kpiRows = kpis.map(k => ({
    survey_id: surveyId,
    kpi_number: k.id,
    kpi_name: k.name,
    value: k.value,
    unit: k.unit,
    traffic_light: k.light,
  }))

  const { error: insKErr } = await supabaseAdmin.from('kpi_results').insert(kpiRows)
  if (insKErr) {
    console.error('KPI insert error:', insKErr)
    return NextResponse.json({ error: 'Kunde inte spara nyckeltalen' }, { status: 500 })
  }

  return NextResponse.json({ surveyId: surveyId, kpis, answers })
}
