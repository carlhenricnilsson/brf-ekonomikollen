import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', async () => {
  const h = await import('@/test/route-helpers')
  return { supabaseAdmin: h.supabaseAdmin }
})

import { POST } from './route'
import { setSpec, makeReq, QState } from '@/test/route-helpers'
import { __resetRateLimit } from '@/lib/rate-limit'

const answers = {
  A1_year: 2024, A3_brf_area_sqm: 1000, A4_total_area_sqm: 1200,
  B1_annual_fees: 800000, C1_total_debt: 6000000, D1_energy_costs: 210000,
  E4_depreciation: 150000, E5_planned_maintenance_costs: 50000, F1_net_result: 100000,
}
const okWrites = {
  answers: () => ({}), kpi_results: () => ({}),
}

beforeEach(() => __resetRateLimit())

describe('POST /api/survey', () => {
  it('happy path (utan token) → 200, surveyId + 7 KPI i rätt form', async () => {
    setSpec({
      surveys: (s: QState) => (s.op === 'insert' ? { data: { id: 's1' } } : {}),
      ...okWrites,
    })
    const res = await POST(makeReq({ body: { answers, brf_name: 'BRF Test' } }))
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.surveyId).toBe('s1')
    expect(j.kpis).toHaveLength(7)
    expect(j.kpis[0]).toEqual(expect.objectContaining({ id: 1, name: expect.any(String), value: expect.any(Number), unit: expect.any(String), light: expect.any(String) }))
  })

  it('#4: tom answers → 400 (ingen fantom-enkät skapas)', async () => {
    setSpec({})
    expect((await POST(makeReq({ body: { answers: {} } }))).status).toBe(400)
  })

  it('#4: saknad answers → 400', async () => {
    setSpec({})
    expect((await POST(makeReq({ body: { token: 'tok' } }))).status).toBe(400)
  })

  it('ogiltig token → 400', async () => {
    setSpec({ surveys: () => ({ data: null }) })
    const res = await POST(makeReq({ body: { answers, token: 'bad' } }))
    expect(res.status).toBe(400)
  })

  it('giltig token → 200 (uppdaterar befintlig)', async () => {
    setSpec({
      surveys: (s: QState) => (s.op === 'select' ? { data: { id: 's9' } } : {}),
      ...okWrites,
    })
    const res = await POST(makeReq({ body: { answers, token: 'tok' } }))
    expect(res.status).toBe(200)
    expect((await res.json()).surveyId).toBe('s9')
  })

  it('token: null (brf_admin-flöde utan ?token=) → 200, skapar ny enkät', async () => {
    // Klienten skickar `searchParams.get('token')` rakt av, vilket
    // blir null när URL:en saknar ?token=. Tidigare avvisade schemat
    // detta som "Expected string, received null" → 400 (systembug
    // som blockerade alla inlämningar från inloggade brf_admins).
    setSpec({
      surveys: (s: QState) => (s.op === 'insert' ? { data: { id: 's2' } } : {}),
      ...okWrites,
    })
    const res = await POST(makeReq({ body: { answers, token: null, brf_name: 'BRF Test' } }))
    expect(res.status).toBe(200)
    expect((await res.json()).surveyId).toBe('s2')
  })

  it('#3: survey-insert-fel → 500 (INTE fejkad surveyId + 200)', async () => {
    setSpec({ surveys: (s: QState) => (s.op === 'insert' ? { error: { message: 'db' } } : {}) })
    const res = await POST(makeReq({ body: { answers } }))
    expect(res.status).toBe(500)
    const j = await res.json()
    expect(j.surveyId).toBeUndefined() // ingen falsk success
    expect(j.error).toBeTruthy()
  })

  it('#3: token-update-fel → 500', async () => {
    setSpec({ surveys: (s: QState) => (s.op === 'select' ? { data: { id: 's1' } } : s.op === 'update' ? { error: { message: 'db' } } : {}) })
    const res = await POST(makeReq({ body: { answers, token: 'tok' } }))
    expect(res.status).toBe(500)
  })

  it('#3: cleanup-delete-fel → 500', async () => {
    setSpec({
      surveys: (s: QState) => (s.op === 'insert' ? { data: { id: 's1' } } : {}),
      answers: (s: QState) => (s.op === 'delete' ? { error: { message: 'db' } } : {}),
      kpi_results: () => ({}),
    })
    expect((await POST(makeReq({ body: { answers } }))).status).toBe(500)
  })

  it('#3: answers-insert-fel → 500 "Kunde inte spara svaren"', async () => {
    setSpec({
      surveys: (s: QState) => (s.op === 'insert' ? { data: { id: 's1' } } : {}),
      answers: (s: QState) => (s.op === 'insert' ? { error: { message: 'db' } } : {}),
      kpi_results: () => ({}),
    })
    const res = await POST(makeReq({ body: { answers } }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Kunde inte spara svaren')
  })

  it('#3: kpi_results-insert-fel → 500 "Kunde inte spara nyckeltalen"', async () => {
    setSpec({
      surveys: (s: QState) => (s.op === 'insert' ? { data: { id: 's1' } } : {}),
      answers: () => ({}),
      kpi_results: (s: QState) => (s.op === 'insert' ? { error: { message: 'db' } } : {}),
    })
    const res = await POST(makeReq({ body: { answers } }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Kunde inte spara nyckeltalen')
  })
})
