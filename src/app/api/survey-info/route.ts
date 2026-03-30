import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({})

  const { data } = await supabaseAdmin
    .from('surveys')
    .select('brf_name, status')
    .eq('token', token)
    .single()

  return NextResponse.json(data ?? {})
}
