import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseBody, moneyUnlockSchema } from '@/lib/validation'
import { rateLimit } from '@/lib/rate-limit'

// Lazy-init: skapas vid första request, inte vid build/import
function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

const REPORT_PRICE = 5995 // inkl. 25% svensk moms (tax-inclusive)

export async function POST(req: NextRequest) {
  // Skydd mot abuse/brute-force av voucher-vägen i checkout.
  const limited = rateLimit(req, 'create-checkout-session', 10, 60_000)
  if (limited) return limited

  const parsed = parseBody(moneyUnlockSchema, await req.json())
  if (!parsed.ok) return parsed.res
  const { user_id, survey_id, voucher_code } = parsed.data

  // Använd request-origin för redirect-URLs (fungerar både lokalt och i prod)
  const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Blockera betalning av arkiverad enkät
  const { data: surveyRow } = await supabaseAdmin
    .from('surveys')
    .select('deleted_at')
    .eq('id', survey_id)
    .single()

  if (!surveyRow || surveyRow.deleted_at) {
    return NextResponse.json({ error: 'Enkäten är inte tillgänglig' }, { status: 404 })
  }

  // Kolla om redan upplåst
  const { data: existingPayment } = await supabaseAdmin
    .from('payments')
    .select('id')
    .eq('user_id', user_id)
    .eq('survey_id', survey_id)
    .eq('status', 'completed')
    .limit(1)

  if (existingPayment && existingPayment.length > 0) {
    return NextResponse.json({ error: 'Rapporten är redan upplåst' }, { status: 400 })
  }

  let finalPrice = REPORT_PRICE
  let voucherId: string | null = null

  // Validera rabattkod om angiven
  if (voucher_code) {
    const { data: voucher } = await supabaseAdmin
      .from('vouchers')
      .select('*')
      .eq('code', voucher_code.toUpperCase())
      .single()

    if (!voucher) {
      return NextResponse.json({ error: 'Ogiltig rabattkod' }, { status: 400 })
    }

    if (voucher.valid_until && new Date(voucher.valid_until) < new Date()) {
      return NextResponse.json({ error: 'Rabattkoden har gått ut' }, { status: 400 })
    }

    if (voucher.max_uses && voucher.times_used >= voucher.max_uses) {
      return NextResponse.json({ error: 'Rabattkoden är förbrukad' }, { status: 400 })
    }

    finalPrice = Math.round(REPORT_PRICE * (1 - voucher.discount_percent / 100))
    voucherId = voucher.id

    if (finalPrice === 0) {
      return NextResponse.json({ error: 'Använd rabattkodsfältet för en 100%-rabatt' }, { status: 400 })
    }
  }

  // Hämta survey-namn för produktbeskrivning
  const { data: survey } = await supabaseAdmin
    .from('surveys')
    .select('brf_name, survey_year')
    .eq('id', survey_id)
    .single()

  const productName = survey?.brf_name
    ? `BRF Ekonomikollen – ${survey.brf_name} ${survey.survey_year ?? ''}`.trim()
    : 'BRF Ekonomikollen – Analysrapport'

  // Skapa Stripe Checkout-session
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    automatic_tax: { enabled: true }, // Stripe Tax är aktiverat – beräknar 25% SE moms automatiskt
    line_items: [
      {
        price_data: {
          currency: 'sek',
          product_data: { name: productName },
          unit_amount: finalPrice * 100, // Stripe räknar i öre
          tax_behavior: 'inclusive',     // 5 995 kr är inkl. 25% moms
        },
        quantity: 1,
      },
    ],
    metadata: {
      survey_id,
      user_id,
      voucher_id: voucherId ?? '',
    },
    success_url: `${origin}/payment-success?survey_id=${survey_id}`,
    cancel_url: `${origin}/results/${survey_id}`,
    locale: 'sv',
  })

  // Skapa/uppdatera pending betalning i databasen.
  // Måste lyckas – annars hittar webhooken ingen rad att markera
  // completed → kund betalar men rapporten förblir låst.
  const { error: upsertErr } = await supabaseAdmin.from('payments').upsert(
    {
      user_id,
      survey_id,
      amount_sek: finalPrice,
      status: 'pending',
      stripe_session_id: session.id,
      voucher_id: voucherId,
    },
    { onConflict: 'user_id,survey_id' }
  )
  if (upsertErr) {
    console.error('Pending-betalning kunde inte sparas:', upsertErr)
    return NextResponse.json({ error: 'Kunde inte starta betalningen' }, { status: 500 })
  }

  return NextResponse.json({ url: session.url })
}
