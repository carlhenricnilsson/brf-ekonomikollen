import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { resolveUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const { userId, role } = await resolveUser(req)
  if (!userId) {
    return NextResponse.json({ surveys: [], payments: [] })
  }

  let surveys: unknown[] = []

  if (role === 'superadmin') {
    // Superadmin ser alla enkäter
    const { data } = await supabaseAdmin
      .from('surveys')
      .select('id, brf_name, survey_year, created_at, status')
      .is('deleted_at', null)
      .order('brf_name', { ascending: true })
    surveys = data ?? []
  } else {
    // BRF-admin: enkäter kopplade via brf_admin_brfs
    const { data: brfLinks } = await supabaseAdmin
      .from('brf_admin_brfs')
      .select('brf_base_name')
      .eq('user_id', userId)

    const brfNames = (brfLinks ?? []).map((b: { brf_base_name: string }) => b.brf_base_name)

    const { data: allSurveys } = await supabaseAdmin
      .from('surveys')
      .select('id, brf_name, survey_year, created_at, status')
      .eq('status', 'completed')
      .is('deleted_at', null)

    surveys = (allSurveys ?? []).filter((s: { brf_name: string | null }) => {
      if (!s.brf_name) return false
      const baseName = s.brf_name.replace(/\s+\d{4}$/, '').trim()
      return brfNames.includes(baseName)
    })

    surveys.sort((a: unknown, b: unknown) => {
      const sa = a as { brf_name: string | null; survey_year: number }
      const sb = b as { brf_name: string | null; survey_year: number }
      const nameA = (sa.brf_name ?? '').toLowerCase()
      const nameB = (sb.brf_name ?? '').toLowerCase()
      if (nameA < nameB) return -1
      if (nameA > nameB) return 1
      return sb.survey_year - sa.survey_year
    })
  }

  // Betalningar för denna användare
  const { data: payments } = await supabaseAdmin
    .from('payments')
    .select('survey_id, status')
    .eq('user_id', userId)
    .eq('status', 'completed')

  return NextResponse.json({ surveys, payments: payments ?? [], role })
}
