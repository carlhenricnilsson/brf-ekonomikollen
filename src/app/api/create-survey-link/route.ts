import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { survey_year, brf_name } = await req.json()

  const token = crypto.randomUUID()

  const { data, error } = await supabaseAdmin
    .from('surveys')
    .insert({
      survey_year: survey_year || new Date().getFullYear(),
      status: 'open',
      token,
      brf_name: brf_name || null,
    })
    .select()
    .single()

  if (error) {
    console.error(error)
    return NextResponse.json({ error: 'Kunde inte skapa länk' }, { status: 500 })
  }

  return NextResponse.json({ token, surveyId: data.id })
}
