import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

// Normaliserar BRF-namn: "brf-spettet7" → "BRF Spettet7"
function normalizeBrfBaseName(raw: string): string {
  let s = raw.trim()
  // Ta bort eventuellt år
  s = s.replace(/\b(19|20)\d{2}\b/, '').trim()
  // Ta bort "BRF" prefix med eventuellt bindestreck
  s = s.replace(/^brf[-\s]*/i, '').trim()
  // Kapitalisera varje ord
  const words = s.split(/\s+/).filter(Boolean).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1)
  )
  return ('BRF ' + words.join(' ')).replace(/\s+/g, ' ').trim()
}

export async function POST(req: NextRequest) {
  const { user_id, email, brf_name, phone } = await req.json()

  if (!user_id || !email) {
    return NextResponse.json({ error: 'Saknar data' }, { status: 400 })
  }

  // Skapa user_profile som brf_admin
  await supabaseAdmin.from('user_profiles').upsert({
    id: user_id,
    role: 'brf_admin',
    phone: phone || null,
  }, { onConflict: 'id' })

  // Koppla BRF-namn om det angavs vid registrering
  if (brf_name) {
    const baseName = normalizeBrfBaseName(brf_name)
    await supabaseAdmin.from('brf_admin_brfs').upsert({
      user_id,
      brf_base_name: baseName,
    }, { onConflict: 'user_id,brf_base_name' })
  }

  // Kolla om det finns inbjudningar för denna e-post
  const { data: invitations } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('accepted', false)

  if (invitations && invitations.length > 0) {
    for (const inv of invitations) {
      if (inv.brf_base_name) {
        await supabaseAdmin.from('brf_admin_brfs').upsert({
          user_id,
          brf_base_name: inv.brf_base_name,
        }, { onConflict: 'user_id,brf_base_name' })
      }
      await supabaseAdmin.from('invitations').update({ accepted: true }).eq('id', inv.id)
    }
  }

  return NextResponse.json({ success: true })
}
