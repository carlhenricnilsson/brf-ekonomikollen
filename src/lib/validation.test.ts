import { describe, it, expect } from 'vitest'
import {
  parseBody,
  moneyUnlockSchema,
  validateVoucherSchema,
  voucherCreateSchema,
  inviteSchema,
  manageSurveySchema,
  surveySubmitSchema,
} from './validation'

describe('parseBody', () => {
  it('OK → { ok:true, data }', () => {
    const r = parseBody(validateVoucherSchema, { code: 'ABC' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.code).toBe('ABC')
  })
  it('fel → { ok:false, res } 400 med felmeddelande', async () => {
    const r = parseBody(validateVoucherSchema, {})
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.res.status).toBe(400)
      expect((await r.res.json()).error).toBe('Kod krävs')
    }
  })
})

describe('moneyUnlockSchema', () => {
  it('saknad user_id/survey_id → fel "user_id och survey_id krävs"', () => {
    const r = parseBody(moneyUnlockSchema, { user_id: 'u1' })
    expect(r.ok).toBe(false)
  })
  it('tom sträng avvisas', () => {
    expect(parseBody(moneyUnlockSchema, { user_id: '', survey_id: 's1' }).ok).toBe(false)
  })
  it('fel typ (number) avvisas', () => {
    expect(parseBody(moneyUnlockSchema, { user_id: 123, survey_id: 's1' }).ok).toBe(false)
  })
  it('giltig + voucher_code valfri (string/undefined/null)', () => {
    expect(parseBody(moneyUnlockSchema, { user_id: 'u', survey_id: 's' }).ok).toBe(true)
    expect(parseBody(moneyUnlockSchema, { user_id: 'u', survey_id: 's', voucher_code: 'V' }).ok).toBe(true)
    expect(parseBody(moneyUnlockSchema, { user_id: 'u', survey_id: 's', voucher_code: null }).ok).toBe(true)
  })
})

describe('voucherCreateSchema', () => {
  it('saknad kod avvisas', () => {
    expect(parseBody(voucherCreateSchema, {}).ok).toBe(false)
  })
  it('discount_percent > 100 avvisas', () => {
    expect(parseBody(voucherCreateSchema, { code: 'X', discount_percent: 150 }).ok).toBe(false)
  })
  it('icke-heltal discount avvisas', () => {
    expect(parseBody(voucherCreateSchema, { code: 'X', discount_percent: 12.5 }).ok).toBe(false)
  })
  it('giltig (kod + valfria fält)', () => {
    expect(parseBody(voucherCreateSchema, { code: 'X', discount_percent: 100, max_uses: 5 }).ok).toBe(true)
    expect(parseBody(voucherCreateSchema, { code: 'X' }).ok).toBe(true)
  })
})

describe('inviteSchema (hårdning: e-postformat)', () => {
  it('saknad e-post → "E-post krävs"', () => {
    const r = parseBody(inviteSchema, {})
    expect(r.ok).toBe(false)
  })
  it('ogiltig e-post avvisas', () => {
    expect(parseBody(inviteSchema, { email: 'inte-en-epost' }).ok).toBe(false)
  })
  it('giltig e-post OK', () => {
    expect(parseBody(inviteSchema, { email: 'a@b.se' }).ok).toBe(true)
  })
})

describe('manageSurveySchema', () => {
  it('ogiltig action avvisas', () => {
    expect(parseBody(manageSurveySchema, { action: 'nuke', scope: 'survey' }).ok).toBe(false)
  })
  it('ogiltig scope avvisas', () => {
    expect(parseBody(manageSurveySchema, { action: 'archive', scope: 'galaxy' }).ok).toBe(false)
  })
  it('force måste vara boolean om angiven', () => {
    expect(parseBody(manageSurveySchema, { action: 'archive', scope: 'survey', force: 'true' }).ok).toBe(false)
  })
  it('giltig minimal', () => {
    expect(parseBody(manageSurveySchema, { action: 'archive', scope: 'survey' }).ok).toBe(true)
  })
})

describe('surveySubmitSchema', () => {
  it('saknad answers avvisas', () => {
    expect(parseBody(surveySubmitSchema, { token: 't' }).ok).toBe(false)
  })
  it('tom answers avvisas', () => {
    expect(parseBody(surveySubmitSchema, { answers: {} }).ok).toBe(false)
  })
  it('answers fel typ avvisas', () => {
    expect(parseBody(surveySubmitSchema, { answers: 'inte-objekt' }).ok).toBe(false)
  })
  it('icke-tom answers OK (token/brf_name valfria)', () => {
    expect(parseBody(surveySubmitSchema, { answers: { A1_year: 2024 } }).ok).toBe(true)
    expect(parseBody(surveySubmitSchema, { answers: { A1_year: 2024 }, token: 't', brf_name: 'X' }).ok).toBe(true)
  })
  it('token/brf_name får vara null (klienten skickar searchParams.get som null)', () => {
    // Regression: schemat avvisade tidigare null ("Expected string, received null")
    // → systembug som blockerade alla inlämningar från inloggade brf_admins.
    expect(parseBody(surveySubmitSchema, { answers: { A1_year: 2024 }, token: null }).ok).toBe(true)
    expect(parseBody(surveySubmitSchema, { answers: { A1_year: 2024 }, token: null, brf_name: null }).ok).toBe(true)
  })
})
