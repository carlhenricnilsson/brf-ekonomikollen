import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireSuperadmin } from '@/lib/auth'
import { parseBody, inviteSchema } from '@/lib/validation'

// Lazy-init: skapas vid första request (samma mönster som Stripe).
function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperadmin(req)
  if ('error' in auth) return auth.error

  const parsed = parseBody(inviteSchema, await req.json())
  if (!parsed.ok) return parsed.res
  const { email, brf_base_name } = parsed.data
  const invited_by = auth.userId // verifierad superadmin, inte klient-data

  const { data, error } = await supabaseAdmin
    .from('invitations')
    .insert({
      email: email.toLowerCase(),
      brf_base_name: brf_base_name || null,
      invited_by,
    })
    .select()
    .single()

  if (error) {
    console.error('Invitation error:', error)
    return NextResponse.json({ error: 'Kunde inte skapa inbjudan' }, { status: 500 })
  }

  // Om användaren redan har ett konto, koppla BRF direkt.
  // listUsers() saknar e-postfilter → paginera (annars missas
  // användare bortom första sidan ~50 och kopplingen sker tyst aldrig).
  if (brf_base_name) {
    let existingUserId: string | null = null
    let page = 1
    const perPage = 1000
    while (true) {
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
      if (listErr || !list) break
      const match = list.users.find(u => (u.email ?? '').toLowerCase() === email.toLowerCase())
      if (match) { existingUserId = match.id; break }
      if (list.users.length < perPage) break
      page++
    }

    if (existingUserId) {
      await supabaseAdmin.from('brf_admin_brfs').upsert({
        user_id: existingUserId,
        brf_base_name,
      }, { onConflict: 'user_id,brf_base_name' })

      await supabaseAdmin.from('invitations').update({ accepted: true }).eq('id', data.id)
    }
  }

  // Skicka välkomstmail via Resend. Misslyckande loggas men routen
  // returnerar fortfarande success – inbjudan finns i DB och register-
  // flödet kopplar BRF automatiskt vid signup oavsett mail-status.
  let email_sent = false
  let email_error: string | null = null
  if (!process.env.RESEND_API_KEY) {
    console.warn('[invite] RESEND_API_KEY saknas – mail skickas ej')
    email_error = 'RESEND_API_KEY saknas'
  } else {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://brf-ekonomikollen.vercel.app'
      // Inbjudningslänk: öppnar /login direkt i registreringsläge med
      // förifylld e-post (så BRF-kopplingen matchar rätt adress).
      const registerUrl = `${siteUrl}/login?register=true&email=${encodeURIComponent(email)}`
      const safeRegisterUrl = escapeHtml(registerUrl)
      const safeEmail = escapeHtml(email)
      const brfLine = brf_base_name
        ? `<p style="font-size:16px;line-height:1.5;margin:0 0 16px;">BRF: <strong>${escapeHtml(brf_base_name)}</strong></p>`
        : ''
      const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
        <h1 style="font-size:22px;margin:0 0 16px;">Inbjudan till BRF-Ekonomikollen</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Hej!</p>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px;">Du har bjudits in som BRF-administratör till <strong>BRF-Ekonomikollen</strong> — ett verktyg som ger din bostadsrättsförening en samlad bild av den ekonomiska hälsan baserat på BFNAR 2023:1.</p>
        ${brfLine}
        <p style="font-size:16px;line-height:1.5;margin:0 0 24px;">Registrera ditt konto med denna e-postadress (<strong>${safeEmail}</strong>) så kopplas du automatiskt till din BRF:</p>
        <p style="margin:0 0 32px;"><a href="${safeRegisterUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Skapa konto</a></p>
        <p style="font-size:14px;line-height:1.5;color:#666;margin:0;">Eller kopiera länken: <span style="color:#2563eb;">${safeRegisterUrl}</span></p>
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0;">
        <p style="font-size:13px;line-height:1.5;color:#888;margin:0;">Skickad via BRF-Ekonomikollen. Om du inte väntat dig denna inbjudan, ignorera mailet.</p>
      </div>`
      const text = `Inbjudan till BRF-Ekonomikollen

Hej!

Du har bjudits in som BRF-administratör till BRF-Ekonomikollen.${brf_base_name ? `\nBRF: ${brf_base_name}` : ''}

Registrera ditt konto med denna e-postadress (${email}) här:
${registerUrl}

Om du inte väntat dig denna inbjudan, ignorera mailet.`

      const resend = getResend()
      const sendRes = await resend.emails.send({
        from: 'BRF-Ekonomikollen <noreply@send.kunskapspartner.se>',
        to: email,
        subject: 'Inbjudan till BRF-Ekonomikollen',
        html,
        text,
      })
      if (sendRes.error) {
        email_error = sendRes.error.message || 'okänt mailfel'
        console.error('[invite] Resend send error:', sendRes.error)
      } else {
        email_sent = true
      }
    } catch (e) {
      email_error = e instanceof Error ? e.message : String(e)
      console.error('[invite] Resend exception:', e)
    }
  }

  return NextResponse.json({ success: true, invitation: data, email_sent, email_error })
}
