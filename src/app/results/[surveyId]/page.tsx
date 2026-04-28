'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'

type TrafficLight = 'red' | 'yellow' | 'green' | 'neutral'
type KPI = { id: number; name: string; value: number; unit: string; light: TrafficLight }

const LIGHT_COLORS = {
  green:   { bg: 'bg-green-500/20',  border: 'border-green-500/40',  dot: 'bg-green-400',  text: 'text-green-400',  label: 'Bra' },
  yellow:  { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', dot: 'bg-yellow-400', text: 'text-yellow-400', label: 'Bevaka' },
  red:     { bg: 'bg-red-500/20',    border: 'border-red-500/40',    dot: 'bg-red-400',    text: 'text-red-400',    label: 'Varning' },
  neutral: { bg: 'bg-white/5',       border: 'border-white/20',      dot: 'bg-blue-400',   text: 'text-blue-400',   label: 'Info' },
}

const KPI_INFO: Record<number, { desc: string }> = {
  1: { desc: 'Visar avgiftsnivån per kvm bostadsrättsyta. Nationellt snitt 2024: 784 kr/kvm.' },
  2: { desc: 'Föreningens räntebärande lån per kvm totalyta. Hög skuldsättning ökar räntekänsligheten.' },
  3: { desc: 'Hur stor del av årsavgifterna som behöver höjas vid 1% ränteökning. Viktigaste riskindikator.' },
  4: { desc: 'Justerat resultat per kvm – föreningens förmåga att spara för framtida underhåll. Nationellt snitt 2024: 124 kr/kvm.' },
  5: { desc: 'Värme, el och vatten per kvm. Påverkas av byggnadsålder, geografiskt läge och uppvärmningsform.' },
  6: { desc: 'Som KPI 1 men räknat på hela ytan inkl. lokaler och garage. Ger rättvisare bild vid uthyrda lokaler.' },
  7: { desc: 'Föreningens lån per kvm bostadsrätt – påverkar direkt era månadsavgifter. Nationellt snitt 2024: 7 191 kr/kvm.' },
}

// Normaliserad skala: grön tröskel ALLTID vid position 20, röd tröskel ALLTID vid position 80.
// Vänster = bra (grönt), höger = dåligt (rött).
// green = värdet vid pos 20 (bättre tröskel), red = värdet vid pos 80 (sämre tröskel).
// Lägre=bättre: green < red (KPI 1,2,3,5,6,7). Högre=bättre: green > red (KPI 4).
type Thresh = { green: number; red: number }
const KPI_THRESH: Record<number, Thresh> = {
  1: { green: 800,  red: 1000  },
  2: { green: 5000, red: 15000 },
  3: { green: 5,    red: 10    },
  4: { green: 250,  red: 130   }, // högre = bättre → green > red
  5: { green: 175,  red: 250   },
  6: { green: 700,  red: 1000  },
  7: { green: 5000, red: 15000 },
}

// Råposition (kan vara utanför 0-100)
function rawP(value: number, t: Thresh): number {
  return 20 + (value - t.green) / (t.red - t.green) * 60
}

// Markörsposition: klampas enligt spec
//   p < 0    → 3  (långt utanför god sida)
//   0 ≤ p < 10 → 7  (i streckad zon, nära)
//   10 ≤ p ≤ 90 → p  (på den linjära skalan)
//   90 < p ≤ 100 → 93 (i streckad zon, nära)
//   p > 100  → 97 (långt utanför dålig sida)
function clampP(p: number): number {
  if (p < 0)   return 3
  if (p < 10)  return 7
  if (p > 100) return 97
  if (p > 90)  return 93
  return p
}

// Värdet vid skalans ytterkanter (pos 0 och 100)
function edgeVal(pos: 0 | 100, t: Thresh): number {
  return t.green + (pos - 20) * (t.red - t.green) / 60
}

function fmtScaleLabel(v: number, unit: string): string {
  if (unit === '%') return `${Math.round(v)}%`
  const r = Math.round(v)
  if (Math.abs(r) >= 10000) return `${Math.round(r / 1000)}k`
  if (Math.abs(r) >= 1000)  return r.toLocaleString('sv-SE')
  return `${r}`
}

// Streckad bakgrund via CSS gradient
const DASH_GREEN = 'repeating-linear-gradient(90deg, rgba(74,222,128,0.45) 0,rgba(74,222,128,0.45) 4px,transparent 4px,transparent 8px)'
const DASH_RED   = 'repeating-linear-gradient(90deg, rgba(248,113,113,0.45) 0,rgba(248,113,113,0.45) 4px,transparent 4px,transparent 8px)'

function KpiScale({ kpi, thresh }: { kpi: KPI; thresh: Thresh }) {
  const mp = clampP(rawP(kpi.value, thresh))
  const v0   = edgeVal(0,   thresh)
  const v100 = edgeVal(100, thresh)
  const dotColor = kpi.light === 'green' ? '#4ade80'
                 : kpi.light === 'yellow' ? '#facc15'
                 : kpi.light === 'red'    ? '#f87171'
                 : '#60a5fa'

  return (
    <div className="mt-3 select-none">
      {/* Stapeln */}
      <div className="relative h-3 overflow-visible">
        {/* 0–10 %: streckad grön */}
        <div className="absolute inset-y-0 flex items-center" style={{ left: '0%', width: '10%' }}>
          <div className="w-full h-[3px] rounded-l-full" style={{ background: DASH_GREEN }} />
        </div>
        {/* 10–20 %: solid grön */}
        <div className="absolute inset-y-0 bg-green-500/40" style={{ left: '10%', width: '10%' }} />
        {/* 20–80 %: solid gul */}
        <div className="absolute inset-y-0 bg-yellow-500/40" style={{ left: '20%', width: '60%' }} />
        {/* 80–90 %: solid röd */}
        <div className="absolute inset-y-0 bg-red-500/40" style={{ left: '80%', width: '10%' }} />
        {/* 90–100 %: streckad röd */}
        <div className="absolute inset-y-0 flex items-center" style={{ left: '90%', width: '10%' }}>
          <div className="w-full h-[3px] rounded-r-full" style={{ background: DASH_RED }} />
        </div>
        {/* Vertikala gränssträck vid pos 20 och 80 */}
        <div className="absolute inset-y-0 w-px bg-white/20" style={{ left: '20%' }} />
        <div className="absolute inset-y-0 w-px bg-white/20" style={{ left: '80%' }} />
        {/* Markörpunkt */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-slate-900 shadow-lg z-10"
          style={{ left: `${mp}%`, backgroundColor: dotColor }}
        />
      </div>
      {/* Etiketter: pos 0, 20, 80, 100 */}
      <div className="relative h-4 mt-0.5">
        <span className="absolute left-0  text-[10px] text-white/30">{fmtScaleLabel(v0, kpi.unit)}</span>
        <span className="absolute text-[10px] text-green-400/70 font-medium -translate-x-1/2" style={{ left: '20%' }}>{fmtScaleLabel(thresh.green, kpi.unit)}</span>
        <span className="absolute text-[10px] text-red-400/70   font-medium -translate-x-1/2" style={{ left: '80%' }}>{fmtScaleLabel(thresh.red, kpi.unit)}</span>
        <span className="absolute right-0 text-[10px] text-white/30 translate-x-0">{fmtScaleLabel(v100, kpi.unit)}</span>
      </div>
    </div>
  )
}

// Trendpil: jämför med föregående års värde
// KPI 4: högre = bättre, alla andra: lägre = bättre
function TrendArrow({ kpiId, current, previous }: { kpiId: number; current: number; previous: number }) {
  const diff = current - previous
  if (Math.abs(diff) < 0.5) return <span className="text-white/30 text-xs ml-1">→</span>
  const higherIsBetter = kpiId === 4
  const improved = higherIsBetter ? diff > 0 : diff < 0
  const pct = previous !== 0 ? Math.abs(diff / previous * 100) : 0
  return (
    <span className={`text-xs ml-1.5 font-medium ${improved ? 'text-green-400' : 'text-red-400'}`} title={`Förändring: ${diff > 0 ? '+' : ''}${diff.toFixed(1)} (${pct.toFixed(0)}%)`}>
      {improved ? '↑' : '↓'} {pct >= 1 ? `${pct.toFixed(0)}%` : ''}
    </span>
  )
}

function fmt(value: number, unit: string) {
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1.5 text-white/80 leading-snug">
      {lines.map((line, i) => {
        if (/^[-*]{3,}$/.test(line.trim())) return null
        if (line.trim().startsWith('|')) return null
        if (line.trim() === '') return <div key={i} className="h-1" />
        if (line.startsWith('### ')) return <h3 key={i} className="text-white font-bold text-base mt-4 mb-1">{line.replace(/^###\s+/, '')}</h3>
        if (line.startsWith('## ')) return <h2 key={i} className="text-white font-bold text-lg mt-5 mb-1">{line.replace(/^##\s+/, '')}</h2>
        if (line.startsWith('# ')) return <h1 key={i} className="text-white font-bold text-xl mt-5 mb-1">{line.replace(/^#\s+/, '')}</h1>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="list-disc list-inside text-white/70 ml-2">{line.replace(/^[-*]\s+/, '')}</li>
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i} className="text-white/80">
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**')
                ? <strong key={j} className="text-white font-semibold">{part.replace(/\*\*/g, '')}</strong>
                : part
            )}
          </p>
        )
      })}
    </div>
  )
}

type Benchmark = { p25: number; median: number; p75: number; unit: string; source: string; count: number }

function BenchmarkBar({ kpi, benchmark }: { kpi: KPI; benchmark: Benchmark }) {
  const fmt2 = (v: number) => kpi.unit === '%' ? `${v.toFixed(1)}%` : `${Math.round(v).toLocaleString('sv-SE')}`
  const c = LIGHT_COLORS[kpi.light]

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="grid grid-cols-4 text-center gap-2">
        <div>
          <div className="text-white/40 text-xs mb-0.5">25:e percentil</div>
          <div className="text-white/70 text-sm font-semibold">{fmt2(benchmark.p25)}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs mb-0.5">Median</div>
          <div className="text-white font-bold text-sm">{fmt2(benchmark.median)}</div>
        </div>
        <div>
          <div className="text-white/40 text-xs mb-0.5">75:e percentil</div>
          <div className="text-white/70 text-sm font-semibold">{fmt2(benchmark.p75)}</div>
        </div>
        <div>
          <div className={`${c.text} text-xs font-bold mb-0.5`}>Er BRF</div>
          <div className={`${c.text} text-sm font-bold`}>{fmt2(kpi.value)}</div>
        </div>
      </div>
      <div className="text-xs text-white/25 mt-1 text-right">{benchmark.source}</div>
    </div>
  )
}

export default function ResultsPage() {
  const params = useParams()
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
  const [reportUnlocked, setReportUnlocked] = useState(false)
  const [voucherCode, setVoucherCode] = useState('')
  const [voucherError, setVoucherError] = useState('')
  const [voucherLoading, setVoucherLoading] = useState(false)
  const [showPaywall, setShowPaywall] = useState(false)

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

  async function downloadPdf(include: 'kpi' | 'all') {
    setPdfLoading(include)
    try {
      const res = await fetch(`/api/generate-pdf?surveyId=${surveyId}&include=${include}`)
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
    setShowRegenConfirm(false)
    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpis,
          answers,
          surveyId,
          historical: historicalKpis.map(h => ({ year: h.year, kpis: h.kpis })),
        }),
      })
      const data = await res.json()
      if (data.error) {
        setAiError(data.error)
      } else {
        setAiAnalysis(data.analysis)
        setAiSavedAt(new Date().toISOString())
        setTimeout(() => document.getElementById('ai-section')?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
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
      setVoucherError(data.message || `Pris: ${data.final_price} kr. Stripe-betalning aktiveras snart.`)
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
          {/* PDF-knappar – bara med full tillgång */}
          {hasFullAccess && (
            <>
              <button
                onClick={() => downloadPdf('kpi')}
                disabled={pdfLoading !== null}
                className="flex items-center gap-1.5 text-sm bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors font-medium"
                title="Ladda ner KPI-rapporten utan AI-analys"
              >
                {pdfLoading === 'kpi' ? <Spinner /> : <DownloadIcon />}
                Nyckeltal
              </button>
              <button
                onClick={() => downloadPdf('all')}
                disabled={pdfLoading !== null || !aiAnalysis}
                className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors font-medium"
                title={!aiAnalysis ? 'Generera AI-analys först' : 'Ladda ner komplett rapport med AI-analys'}
              >
                {pdfLoading === 'all' ? <Spinner /> : <DownloadIcon />}
                Fullrapport
              </button>
            </>
          )}
          <Link href="/survey" className="text-sm text-white/50 hover:text-white transition-colors">Ny enkät</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">{reportName || 'Ert resultat'}</h1>
        <p className="text-white/50 mb-10">Baserat på BFNAR 2023:1 – de 7 obligatoriska nyckeltalen</p>

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
                      onClick={() => {
                        // Stripe checkout - förberett
                        setVoucherError('Stripe-betalning aktiveras snart. Kontakta support för tillgång.')
                      }}
                      className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-colors mb-2"
                    >
                      Betala 5 995 kr
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

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
