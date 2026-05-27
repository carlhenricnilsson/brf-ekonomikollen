'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { KPI_THRESH, rawP } from '@/lib/kpi-scale'
import {
  LIGHT_COLORS, KPI_INFO, KpiScale, TrendArrow, MarkdownText,
  Spinner, DownloadIcon, fmt,
  type KPI, type Benchmark, type TrafficLight,
} from './_components'

export default function ResultsPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = params.surveyId as string

  const [kpis, setKpis] = useState<KPI[]>([])
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiSavedAt, setAiSavedAt] = useState<string | null>(null)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [hoveredKpi, setHoveredKpi] = useState<number | null>(null)
  const [benchmarks, setBenchmarks] = useState<Record<number, Benchmark>>({})
  const [surveyMeta, setSurveyMeta] = useState<{ brf_name: string | null; survey_year: number; version: number } | null>(null)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null) // 'kpi' | 'all' | null
  const [historicalKpis, setHistoricalKpis] = useState<{ year: number; surveyId: string; kpis: KPI[] }[]>([])
  const [showTrend, setShowTrend] = useState(false)
  // Paywall-state
  const [userRole, setUserRole] = useState<'superadmin' | 'brf_admin' | 'anonymous'>('anonymous')
  const [userId, setUserId] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [reportUnlocked, setReportUnlocked] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherError, setVoucherError] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)

  useEffect(() => {
    fetch('/api/benchmarks')
      .then(r => r.json())
      .then(d => setBenchmarks(d.benchmarks ?? {}))
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function loadResults() {
      // Hämta session-token för server-side API-anrop
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      setHasSession(!!session)

      // Försök sessionStorage först (direkt efter enkät)
      const stored = sessionStorage.getItem('ekk_results')
      const sessionData = stored ? JSON.parse(stored) : null
      const hasSessionData = sessionData?.surveyId === surveyId

      // Hämta all data från server-side endpoint (kringgår RLS)
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(`/api/survey-results/${surveyId}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setUserRole(data.userRole)
        if (data.userId) setUserId(data.userId)
        setReportUnlocked(data.reportUnlocked)
        if (data.surveyMeta) setSurveyMeta(data.surveyMeta)
        if (data.aiAnalysis) {
          setAiAnalysis(data.aiAnalysis)
          setAiSavedAt(data.aiSavedAt)
        }

        // Historiska KPI:er
        if (data.historicalKpis?.length > 0) {
          setHistoricalKpis(data.historicalKpis.map((h: { year: number; kpis: { kpi_number: number; kpi_name: string; value: number; unit: string; traffic_light: string }[] }) => ({
            year: h.year,
            kpis: h.kpis.map((k) => ({
              id: k.kpi_number,
              name: k.kpi_name,
              value: Number(k.value),
              unit: k.unit,
              light: k.traffic_light as TrafficLight,
            })),
          })))
        }

        // Använd sessionStorage-data om tillgänglig, annars API-data
        if (hasSessionData) {
          setKpis(sessionData.kpis)
          setAnswers(sessionData.answers)
        } else if (data.kpis?.length > 0) {
          setKpis(data.kpis.map((k: { kpi_number: number; kpi_name: string; value: number; unit: string; traffic_light: string }) => ({
            id: k.kpi_number,
            name: k.kpi_name,
            value: Number(k.value),
            unit: k.unit,
            light: k.traffic_light as TrafficLight,
          })))
        }

        if (!hasSessionData && data.answers?.length > 0) {
          const ans: Record<string, unknown> = {}
          data.answers.forEach((r: { question_code: string; answer_numeric: number | null; answer_text: string | null; answer_choice: string | null }) => {
            ans[r.question_code] = r.answer_numeric ?? r.answer_text ?? r.answer_choice
          })
          setAnswers(ans)
        }
      }

      setLoading(false)
    }
    loadResults()
  }, [surveyId])

  const redCount    = kpis.filter(k => k.light === 'red').length
  const yellowCount = kpis.filter(k => k.light === 'yellow').length
  const greenCount  = kpis.filter(k => k.light === 'green').length

  function getReportName() {
    if (!surveyMeta) return null
    const name = surveyMeta.brf_name || 'Enkät'
    const base = `${name} ${surveyMeta.survey_year}`
    return (surveyMeta.version ?? 1) > 1 ? `${base} ver.${surveyMeta.version}` : base
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function downloadPdf(include: 'kpi' | 'all') {
    setPdfLoading(include)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/generate-pdf?surveyId=${surveyId}&include=${include}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const reportName = getReportName() || 'rapport'
      const suffix = include === 'kpi' ? '_KPI' : '_fullrapport'
      a.download = `${reportName.replace(/\s+/g, '_')}${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setPdfLoading(null)
    }
  }

  async function generateAnalysis() {
    setAiLoading(true)
    setAiError('')
    setAiAnalysis('')
    setShowRegenConfirm(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          kpis,
          answers,
          surveyId,
          historical: historicalKpis.map(h => ({ year: h.year, kpis: h.kpis })),
        }),
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        setAiError(text || 'Något gick fel vid AI-analysen.')
        return
      }

      // Streama in svaret tecken för tecken
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      // Scrolla till AI-sektionen så användaren ser texten skrivas
      setTimeout(() => document.getElementById('ai-section')?.scrollIntoView({ behavior: 'smooth' }), 50)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setAiAnalysis(acc)
      }
      acc += decoder.decode()
      setAiAnalysis(acc)
      setAiSavedAt(new Date().toISOString())
    } catch {
      setAiError('Något gick fel – kontrollera din API-nyckel.')
    } finally {
      setAiLoading(false)
    }
  }

  // Hitta det bästa KPI:et (grönt med lägst rawP = mest grönt)
  const bestKpi = kpis.length > 0
    ? kpis.reduce((best, kpi) => {
        if (kpi.light === 'green' && best.light !== 'green') return kpi
        if (kpi.light === 'green' && best.light === 'green') {
          const t1 = KPI_THRESH[kpi.id]
          const t2 = KPI_THRESH[best.id]
          if (t1 && t2) return rawP(kpi.value, t1) < rawP(best.value, t2) ? kpi : best
        }
        return best
      }, kpis[0])
    : null

  // Fullständig tillgång: superadmin, betald, eller anonym (från enkätlänk)
  const hasFullAccess = reportUnlocked || userRole === 'superadmin' || userRole === 'anonymous'
  // PDF är en betald deliverabel: speglar serverns generate-pdf-grind
  // (superadmin ELLER betald). Anonym ser rapporten på webben men
  // inte PDF-knappen (hade annars gett tyst 403).
  const canDownloadPdf = reportUnlocked || userRole === 'superadmin'

  async function payWithStripe(voucher?: string) {
    if (!userId) return
    setPaymentLoading(true)
    setVoucherError('')
    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, survey_id: surveyId, voucher_code: voucher }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setVoucherError(data.error || 'Fel vid betalning. Försök igen.')
      setPaymentLoading(false)
    }
  }

  async function redeemVoucher() {
    if (!userId) return
    setVoucherLoading(true)
    setVoucherError('')
    const res = await fetch('/api/unlock-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, survey_id: surveyId, voucher_code: voucherCode }),
    })
    const data = await res.json()
    if (data.unlocked) {
      setReportUnlocked(true)
      setShowPaywall(false)
    } else if (data.error) {
      setVoucherError(data.error)
    } else if (data.requires_payment) {
      // Partiell rabatt – skicka vidare till Stripe med samma kod
      setVoucherLoading(false)
      await payWithStripe(voucherCode)
      return
    }
    setVoucherLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-white/40">Laddar resultat...</div>
    </div>
  )

  const reportName = getReportName()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold">BRF-Ekonomi<span className="text-blue-400">kollen</span></span>
        <div className="flex items-center gap-3">
          {/* Primär nedladdning sker via Rapportportal-rutan i body –
              håller headern ren och säkerställer att Logga ut alltid syns. */}
          <Link href="/survey" className="text-sm text-white/50 hover:text-white transition-colors">Ny enkät</Link>
          {/* Visa Logga ut om klienten har en supabase-session ELLER om
              servern resolvat användaren – så knappen aldrig "försvinner"
              om någondera signalen är trög. */}
          {(hasSession || userRole !== 'anonymous') && (
            <button
              onClick={handleLogout}
              className="text-sm bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors font-medium"
            >
              Logga ut
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">{reportName || 'Ert resultat'}</h1>
        <p className="text-white/50 mb-10">Baserat på BFNAR 2023:1 – de 7 obligatoriska nyckeltalen</p>

        {/* Rapportportal – tydlig nedladdningsruta så användare hittar PDF:erna.
            Visas endast när rapporten är upplåst (annars är knapparna disabled
            i headern och paywallen längre ned är primär CTA). */}
        {canDownloadPdf && (
          <div className="mb-10 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-blue-500/[0.03] p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <DownloadIcon />
                  <h2 className="text-xl font-bold">Rapportportal</h2>
                </div>
                <p className="text-white/60 text-sm">Ladda ner rapporten som PDF – välj nyckeltal eller fullrapport med AI-analys.</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => downloadPdf('kpi')}
                  disabled={pdfLoading !== null}
                  className="flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl transition-colors font-semibold"
                  title="Ladda ner KPI-rapporten utan AI-analys"
                >
                  {pdfLoading === 'kpi' ? <Spinner /> : <DownloadIcon />}
                  Nyckeltal (PDF)
                </button>
                <button
                  onClick={() => downloadPdf('all')}
                  disabled={pdfLoading !== null || !aiAnalysis}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl transition-colors font-semibold"
                  title={!aiAnalysis ? 'Generera AI-analys först' : 'Ladda ner komplett rapport med AI-analys'}
                >
                  {pdfLoading === 'all' ? <Spinner /> : <DownloadIcon />}
                  Fullrapport (PDF)
                </button>
              </div>
            </div>
            {!aiAnalysis && (
              <p className="text-xs text-white/40 mt-3">Tips: Fullrapporten med AI-analys aktiveras när du genererat analysen längre ned.</p>
            )}
          </div>
        )}

        {/* Sammanfattning */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-green-400">{greenCount}</div>
            <div className="text-sm text-white/50 mt-1">Bra</div>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-yellow-400">{yellowCount}</div>
            <div className="text-sm text-white/50 mt-1">Bevaka</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <div className="text-3xl font-bold text-red-400">{redCount}</div>
            <div className="text-sm text-white/50 mt-1">Varning</div>
          </div>
        </div>

        {/* KPI-kort med visuell skala */}
        <div className="space-y-3 mb-12">
          {kpis.map(kpi => {
            const c      = LIGHT_COLORS[kpi.light]
            const info   = KPI_INFO[kpi.id]
            const thresh = KPI_THRESH[kpi.id]
            // Förhandsgranska: visa bara bästa KPI:et om ej upplåst
            const isPreviewKpi = bestKpi && kpi.id === bestKpi.id
            const isLocked = !hasFullAccess && !isPreviewKpi

            if (isLocked) {
              return (
                <div key={kpi.id} className="bg-white/[0.03] border border-white/10 rounded-xl px-5 pt-4 pb-3 relative overflow-hidden">
                  <div className="flex items-center gap-3 opacity-40 blur-[2px] select-none">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-white/50">{kpi.id}</span>
                    </div>
                    <div className="flex-1"><p className="font-semibold text-white text-sm">{kpi.name}</p></div>
                    <p className="text-white/50 text-xl font-bold">••••</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={kpi.id}
                className={`${c.bg} border ${c.border} rounded-xl px-5 pt-4 pb-3 cursor-pointer transition-all duration-200 hover:brightness-110`}
                onMouseEnter={() => setHoveredKpi(kpi.id)}
                onMouseLeave={() => setHoveredKpi(null)}
              >
                {/* Topprad: nr + namn + status + värde */}
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center shrink-0`}>
                    <span className={`text-sm font-bold ${c.text}`}>{kpi.id}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm leading-tight">{kpi.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                      <p className={`text-xs font-semibold ${c.text}`}>{c.label}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right flex items-center">
                    <p className={`text-xl font-bold ${c.text}`}>{fmt(kpi.value, kpi.unit)}</p>
                    {(() => {
                      if (historicalKpis.length === 0) return null
                      const prevYear = historicalKpis[historicalKpis.length - 1]
                      const prevKpi = prevYear.kpis.find(k => k.id === kpi.id)
                      if (!prevKpi) return null
                      return <TrendArrow kpiId={kpi.id} current={kpi.value} previous={prevKpi.value} />
                    })()}
                  </div>
                </div>

                {/* Visuell skala */}
                {thresh && <KpiScale kpi={kpi} thresh={thresh} />}

                {/* Hover: beskrivning */}
                {hoveredKpi === kpi.id && info && (
                  <p className="text-white/50 text-xs mt-2 pt-2 border-t border-white/10">{info.desc}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Paywall-sektion */}
        {!hasFullAccess && (
          <div className="bg-gradient-to-b from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-8 mb-12">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">Lås upp hela rapporten</h2>
              <p className="text-white/50 text-sm mb-6 max-w-md mx-auto">
                Få tillgång till alla 7 nyckeltal, trendanalys, fullständig AI-analys med rekommendationer,
                framtidsutsikter och styrelsemötespunkter.
              </p>
              <p className="text-2xl font-bold text-white mb-6">5 995 kr</p>

              {!showPaywall ? (
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={() => setShowPaywall(true)}
                    className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
                  >
                    Lås upp rapport
                  </button>
                  <p className="text-white/30 text-xs">Engångskostnad. Rapporten blir permanent tillgänglig.</p>
                </div>
              ) : (
                <div className="max-w-sm mx-auto">
                  <div className="mb-4">
                    <label className="block text-sm text-white/60 mb-1.5 text-left">Har du en rabattkod?</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={voucherCode}
                        onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                        placeholder="RABATTKOD"
                        className="flex-1 bg-white/5 border border-white/20 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-400 font-mono"
                      />
                      <button
                        onClick={redeemVoucher}
                        disabled={!voucherCode || voucherLoading}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
                      >
                        {voucherLoading ? 'Kollar...' : 'Använd'}
                      </button>
                    </div>
                    {voucherError && <p className="text-red-400 text-xs mt-2 text-left">{voucherError}</p>}
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <button
                      onClick={() => payWithStripe()}
                      disabled={paymentLoading}
                      className="w-full bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors mb-2"
                    >
                      {paymentLoading ? 'Skickar till betalning...' : 'Betala 5 995 kr'}
                    </button>
                    <p className="text-white/30 text-xs">Säker betalning via Stripe</p>
                  </div>

                  <button
                    onClick={() => setShowPaywall(false)}
                    className="text-white/40 hover:text-white text-sm mt-4 transition-colors"
                  >
                    Avbryt
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Trend-jämförelse (bara med full tillgång) */}
        {hasFullAccess && historicalKpis.length > 0 && (
          <div className="mb-12">
            <button
              onClick={() => setShowTrend(!showTrend)}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-4"
            >
              <svg className={`w-4 h-4 transition-transform ${showTrend ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Jämför med tidigare år ({historicalKpis.length} {historicalKpis.length === 1 ? 'år' : 'år'})
            </button>
            {showTrend && (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-white/50 font-medium px-4 py-3">Nyckeltal</th>
                        {historicalKpis.map(h => (
                          <th key={h.year} className="text-right text-white/50 font-medium px-4 py-3">{h.year}</th>
                        ))}
                        <th className="text-right text-blue-400 font-bold px-4 py-3">{surveyMeta?.survey_year ?? 'Nu'}</th>
                        <th className="text-right text-white/50 font-medium px-4 py-3">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.map(kpi => {
                        const allYears = [...historicalKpis.map(h => {
                          const k = h.kpis.find(k => k.id === kpi.id)
                          return k ? k.value : null
                        }), kpi.value]
                        const prev = historicalKpis.length > 0
                          ? historicalKpis[historicalKpis.length - 1].kpis.find(k => k.id === kpi.id)
                          : null

                        return (
                          <tr key={kpi.id} className="border-b border-white/5">
                            <td className="px-4 py-2.5 text-white/70">
                              <span className="text-white/40 text-xs mr-1.5">{kpi.id}.</span>
                              {kpi.name}
                            </td>
                            {historicalKpis.map(h => {
                              const k = h.kpis.find(k => k.id === kpi.id)
                              return (
                                <td key={h.year} className="text-right px-4 py-2.5 text-white/50 font-mono text-xs">
                                  {k ? fmt(k.value, kpi.unit) : '–'}
                                </td>
                              )
                            })}
                            <td className={`text-right px-4 py-2.5 font-mono text-xs font-bold ${LIGHT_COLORS[kpi.light].text}`}>
                              {fmt(kpi.value, kpi.unit)}
                            </td>
                            <td className="text-right px-4 py-2.5">
                              {prev && <TrendArrow kpiId={kpi.id} current={kpi.value} previous={prev.value} />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI-analys – generera eller visa */}
        {!hasFullAccess && aiAnalysis ? (
          /* Begränsad AI-förhandsgranskning */
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-12 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold shrink-0">AI</div>
              <h2 className="font-bold text-white">AI-analys (förhandsgranskning)</h2>
            </div>
            {/* Visa bara sammanfattningen */}
            <div className="mb-4">
              <MarkdownText text={aiAnalysis.split('\n## ').slice(0, 2).join('\n## ')} />
            </div>
            <div className="relative">
              <div className="h-32 bg-gradient-to-b from-transparent to-slate-950 absolute inset-x-0 bottom-0 z-10" />
              <div className="opacity-30 blur-[3px] select-none max-h-24 overflow-hidden">
                <MarkdownText text={aiAnalysis.split('\n## ').slice(2, 3).join('\n## ')} />
              </div>
            </div>
            <div className="text-center mt-4 relative z-20">
              <p className="text-white/50 text-sm mb-3">Lås upp för att se hela analysen med rekommendationer, framtidsutsikter och styrelsemötespunkter.</p>
              <button
                onClick={() => setShowPaywall(true)}
                className="bg-blue-500 hover:bg-blue-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
              >
                Lås upp hela rapporten – 5 995 kr
              </button>
            </div>
          </div>
        ) : !aiAnalysis ? (
          <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-8 text-center mb-12">
            <h2 className="text-xl font-bold mb-2">Vill ni ha en djupare analys?</h2>
            <p className="text-white/50 text-sm mb-6">
              AI-genererad rapport på svenska med rekommendationer, riskbedömning och framtidsutsikter på 5–50 år.
              Analysen sparas och kan laddas ner som PDF.
            </p>
            {aiError && <p className="text-red-400 text-sm mb-4">{aiError}</p>}
            <button
              onClick={generateAnalysis}
              disabled={aiLoading}
              className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 mx-auto"
            >
              {aiLoading ? (
                <><Spinner /> Genererar analys... (ca 1–2 min)</>
              ) : 'Generera AI-analys →'}
            </button>
          </div>
        ) : (
          <div id="ai-section" className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-12">
            {/* Rubrik + metadata */}
            <div className="flex items-start justify-between gap-4 mb-6 pb-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold shrink-0">AI</div>
                <div>
                  <h2 className="font-bold text-white">AI-analys</h2>
                  <p className="text-xs text-white/40">
                    Genererad av Claude · Baserad på era svar
                    {aiSavedAt && ` · Sparad ${new Date(aiSavedAt).toLocaleDateString('sv-SE')}`}
                  </p>
                </div>
              </div>
              {/* Regenerera-knapp */}
              <div className="shrink-0">
                {!showRegenConfirm ? (
                  <button
                    onClick={() => setShowRegenConfirm(true)}
                    className="text-xs text-white/40 hover:text-white/70 border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Regenerera
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50">Ny analys skriver över befintlig.</span>
                    <button
                      onClick={generateAnalysis}
                      disabled={aiLoading}
                      className="text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {aiLoading ? 'Genererar...' : 'Bekräfta'}
                    </button>
                    <button
                      onClick={() => setShowRegenConfirm(false)}
                      className="text-xs text-white/40 hover:text-white/60 px-2 py-1.5 rounded-lg transition-colors"
                    >
                      Avbryt
                    </button>
                  </div>
                )}
              </div>
            </div>
            <MarkdownText text={aiAnalysis} />
            {aiError && <p className="text-red-400 text-sm mt-4">{aiError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
