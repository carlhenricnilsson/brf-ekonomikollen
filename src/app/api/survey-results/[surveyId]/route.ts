import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ surveyId: string }> }
) {
  const { surveyId } = await params

  // Hämta inloggad användare via Authorization-header
  let userId: string | null = null
  let userRole: 'superadmin' | 'brf_admin' | 'anonymous' = 'anonymous'

  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (user) {
      userId = user.id
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      userRole = (profile?.role ?? 'brf_admin') as 'superadmin' | 'brf_admin'
    }
  }

  // Kolla betalning / full access
  let reportUnlocked = userRole === 'superadmin'
  if (!reportUnlocked && userId) {
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('user_id', userId)
      .eq('survey_id', surveyId)
      .eq('status', 'completed')
      .limit(1)
    reportUnlocked = (payment && payment.length > 0) || false
  }

  // Hämta survey-metadata
  const { data: surveyRow } = await supabaseAdmin
    .from('surveys')
    .select('brf_name, survey_year, version')
    .eq('id', surveyId)
    .single()

  // Hämta KPI-resultat
  const { data: kpiRows } = await supabaseAdmin
    .from('kpi_results')
    .select('*')
    .eq('survey_id', surveyId)
    .order('kpi_number')

  // Hämta svar
  const { data: answerRows } = await supabaseAdmin
    .from('answers')
    .select('*')
    .eq('survey_id', surveyId)

  // Hämta sparad AI-analys
  const { data: aiRows } = await supabaseAdmin
    .from('ai_analyses')
    .select('analysis_text, created_at')
    .eq('survey_id', surveyId)
    .order('created_at', { ascending: false })
    .limit(1)

  // Hämta historiska enkäter för samma BRF
  let historicalKpis: unknown[] = []
  if (surveyRow?.brf_name) {
    const baseName = surveyRow.brf_name.replace(/\s+\d{4}$/, '').trim()
    const { data: allSurveys } = await supabaseAdmin
      .from('surveys')
      .select('id, survey_year, brf_name, kpi_results(*)')
      .eq('status', 'completed')
    historicalKpis = (allSurveys ?? [])
      .filter((s: { id: string; brf_name: string | null }) =>
        s.id !== surveyId && s.brf_name &&
        s.brf_name.replace(/\s+\d{4}$/, '').trim() === baseName
      )
      .map((s: { survey_year: number; kpi_results: unknown }) => ({
        year: s.survey_year,
        kpis: s.kpi_results,
      }))
  }

  return NextResponse.json({
    userRole,
    userId,
    reportUnlocked,
    surveyMeta: surveyRow ?? null,
    kpis: kpiRows ?? [],
    answers: answerRows ?? [],
    aiAnalysis: aiRows?.[0]?.analysis_text ?? null,
    aiSavedAt: aiRows?.[0]?.created_at ?? null,
    historicalKpis,
  })
}
