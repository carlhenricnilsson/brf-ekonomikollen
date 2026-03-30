import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

function calculateKPIs(a: Record<string, number | string | boolean>) {
  const get = (k: string) => Number(a[k] ?? 0)

  const A3 = get('A3_brf_area_sqm')
  const A4 = get('A4_total_area_sqm')
  const B1 = get('B1_annual_fees')
  const C1 = get('C1_total_debt')
  const D1 = get('D1_energy_costs')
  const E4 = get('E4_depreciation')
  const E5 = get('E5_planned_maintenance_costs')
  const F1 = get('F1_net_result')

  const kpi1 = A3 > 0 ? B1 / A3 : 0
  const kpi2 = A4 > 0 ? C1 / A4 : 0
  const kpi3 = B1 > 0 ? ((C1 * 0.01) / B1) * 100 : 0
  const kpi4 = A4 > 0 ? (F1 + E4 + E5) / A4 : 0
  const kpi5 = A4 > 0 ? D1 / A4 : 0
  const kpi6 = A4 > 0 ? B1 / A4 : 0
  const kpi7 = A3 > 0 ? C1 / A3 : 0

  function light(kpiId: number, value: number) {
    if (kpiId === 2) return value > 15000 ? 'red' : value >= 8000 ? 'yellow' : 'green'
    if (kpiId === 3) return value > 25 ? 'red' : value >= 15 ? 'yellow' : 'green'
    if (kpiId === 4) return value < 100 ? 'red' : value <= 200 ? 'yellow' : 'green'
    return 'neutral'
  }

  return [
    { id: 1, name: 'Årsavgift per kvm bostadsrätt', value: kpi1, unit: 'kr/kvm', light: light(1, kpi1) },
    { id: 2, name: 'Skuldsättning per kvm totalyta', value: kpi2, unit: 'kr/kvm', light: light(2, kpi2) },
    { id: 3, name: 'Räntekänslighet', value: kpi3, unit: '%', light: light(3, kpi3) },
    { id: 4, name: 'Sparande per kvm', value: kpi4, unit: 'kr/kvm', light: light(4, kpi4) },
    { id: 5, name: 'Energikostnad per kvm', value: kpi5, unit: 'kr/kvm', light: light(5, kpi5) },
    { id: 6, name: 'Årsavgift per kvm totalyta', value: kpi6, unit: 'kr/kvm', light: light(6, kpi6) },
    { id: 7, name: 'Belåning per kvm bostadsrätt', value: kpi7, unit: 'kr/kvm', light: light(7, kpi7) },
  ]
}

export async function POST(req: NextRequest) {
  const { answers, token } = await req.json()
  const kpis = calculateKPIs(answers)

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
      await supabaseAdmin
        .from('surveys')
        .update({ status: 'completed', survey_year: Number(answers.A1_year) || new Date().getFullYear() })
        .eq('id', surveyId)
    } else {
      return NextResponse.json({ error: 'Ogiltig enkätlänk' }, { status: 400 })
    }
  } else {
    // Skapa ny enkät (direktflöde utan token)
    const { data: survey, error: surveyError } = await supabaseAdmin
      .from('surveys')
      .insert({ survey_year: Number(answers.A1_year) || new Date().getFullYear(), status: 'completed' })
      .select()
      .single()

    if (surveyError || !survey) {
      console.error('Survey insert error:', surveyError)
      return NextResponse.json({ surveyId: crypto.randomUUID(), kpis, answers })
    }
    surveyId = survey.id
  }

  // Spara alla svar
  const answerRows = Object.entries(answers).map(([question_code, value]) => ({
    survey_id: surveyId_final,
    question_code,
    answer_numeric: typeof value === 'number' ? value : null,
    answer_text: typeof value === 'string' ? value : null,
    answer_choice: typeof value === 'boolean' ? String(value) : null,
  }))

  await supabaseAdmin.from('answers').insert(answerRows)

  // Spara KPI-resultat
  const kpiRows = kpis.map(k => ({
    survey_id: surveyId_final,
    kpi_number: k.id,
    kpi_name: k.name,
    value: k.value,
    unit: k.unit,
    traffic_light: k.light,
  }))

  await supabaseAdmin.from('kpi_results').insert(kpiRows)

  return NextResponse.json({ surveyId: surveyId_final, kpis, answers })
}
