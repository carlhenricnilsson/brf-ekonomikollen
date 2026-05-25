// ============================================================
// Centraliserad input-validering (zod) för API-routes.
// Scheman speglar varje routes nuvarande accept-/avvisningslogik
// (beteendebevarande) men ger konsekvent typkoll + tidig 400 på
// trasiga/oväntade payloads innan känslig logik körs.
// ============================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'

// Parsar body mot ett schema. Vid fel: färdig 400-NextResponse
// att early-returna. Vid OK: typad data.
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { ok: true; data: z.infer<T> } | { ok: false; res: NextResponse } {
  const r = schema.safeParse(data)
  if (r.success) return { ok: true, data: r.data }
  const msg = r.error.issues[0]?.message || 'Ogiltig indata'
  return { ok: false, res: NextResponse.json({ error: msg }, { status: 400 }) }
}

// --- Pengaroutes: create-checkout-session, unlock-report ---
// Nuvarande: 400 om !user_id || !survey_id; voucher_code valfri.
export const moneyUnlockSchema = z.object({
  user_id: z.string({ message: 'user_id och survey_id krävs' }).min(1, 'user_id och survey_id krävs'),
  survey_id: z.string({ message: 'user_id och survey_id krävs' }).min(1, 'user_id och survey_id krävs'),
  voucher_code: z.string().nullish(),
})

// --- validate-voucher ---
// Nuvarande: 400 'Kod krävs' om !code.
export const validateVoucherSchema = z.object({
  code: z.string({ message: 'Kod krävs' }).min(1, 'Kod krävs'),
})

// --- vouchers POST (superadmin) ---
// Nuvarande: 400 'Kod krävs' om !code; övriga har defaults i routen.
export const voucherCreateSchema = z.object({
  code: z.string({ message: 'Kod krävs' }).min(1, 'Kod krävs'),
  discount_percent: z.number().int().min(0).max(100).optional(),
  max_uses: z.number().int().positive().nullish(),
  valid_until: z.string().nullish(),
})

// --- create-survey-link (superadmin) ---
// Nuvarande: ingen obligatorisk – brf_name normaliseras, år härleds.
export const createSurveyLinkSchema = z.object({
  brf_name: z.string().nullish(),
  survey_year: z.number().int().nullish(),
})

// --- invite (superadmin) ---
// Nuvarande: 400 'E-post krävs' om !email. Hårdning: kräv giltig e-post.
export const inviteSchema = z.object({
  email: z.string({ message: 'E-post krävs' }).min(1, 'E-post krävs').email('Ogiltig e-postadress'),
  brf_base_name: z.string().nullish(),
})

// --- manage-survey (superadmin, destruktiv) ---
// Endast topp-skala/typer valideras här; djupare per-scope-regler
// (survey_id krävs vid scope=survey, bekräftelsenamn osv.) ligger
// kvar oförändrade i routen.
export const manageSurveySchema = z.object({
  action: z.enum(['archive', 'restore', 'hard_delete'], { message: 'Ogiltig action' }),
  scope: z.enum(['survey', 'brf'], { message: 'Ogiltig scope' }),
  survey_id: z.string().optional(),
  brf_base_name: z.string().optional(),
  confirm_name: z.string().optional(),
  force: z.boolean().optional(),
})

// --- survey (enkätinlämning) ---
// Lätt, beteendebevarande: answers måste vara ett icke-tomt objekt
// (annars skapas en fantom-enkät med 0-KPI:er). Fältnivå-coercion
// hanteras robust i kpi-calculator (num()). token/brf_name valfria
// och får vara null (klienten skickar `searchParams.get('token')`
// som blir null för inloggat brf_admin-flöde utan ?token=).
export const surveySubmitSchema = z.object({
  answers: z
    .record(z.string(), z.unknown())
    .refine(o => Object.keys(o).length > 0, { message: 'Inga svar angivna' }),
  token: z.string().nullish(),
  brf_name: z.string().nullish(),
})
