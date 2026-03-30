import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { survey_year, brf_name } = await req.json()

  const token = crypto.randomUUID()
  const year = survey_year || new Date().getFullYear()

  // Räkna befintliga enkäter för samma BRF + år → auto-version
  let version = 1
  if (brf_name) {
    const { count } = await supabaseAdmin
      .from('surveys')
      .select('id', { count: 'exact', head: true })
      .ilike('brf_name', brf_name.trim())
      .eq('survey_year', year)

    version = (count ?? 0) + 1
  }

  const { data, error } = await supabaseAdmin
    .from('surveys')
    .insert({
      survey_year: year,
      status: 'open',
      token,
      brf_name: brf_name || null,
      version,
    })
    .select()
    .single()

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Kunde inte skapa länk' }, { status: 500 })
  }

  return NextResponse.json({ token, surveyId: data.id, version })
}
