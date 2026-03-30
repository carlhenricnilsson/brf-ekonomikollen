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

const KPI_INFO: Record<number, { desc: string; thresholds: string }> = {
  1: { desc: 'Visar avgiftsnivån per kvm bostadsrättsyta. Nationellt snitt 2024: 784 kr/kvm.', thresholds: '🟢 <800  ·  🟡 800–1 000  ·  🔴 >1 000 kr/kvm' },
  2: { desc: 'Föreningens räntebärande lån per kvm totalyta. Hög skuldsättning ökar känsligheten för räntehöjningar.', thresholds: '🟢 <5 000  ·  🟡 5 000–15 000  ·  🔴 >15 000 kr/kvm' },
  3: { desc: 'Hur stor del av årsavgifterna som behöver höjas vid 1% ränteökning. Viktigaste riskindikator.', thresholds: '🟢 <5%  ·  🟡 5–10%  ·  🔴 >10%' },
  4: { desc: 'Justerat resultat per kvm – föreningens förmåga att spara för framtida underhåll. Nationellt snitt 2024: 124 kr/kvm.', thresholds: '🟢 >250  ·  🟡 130–250  ·  🔴 <130 kr/kvm' },
  5: { desc: 'Värme, el och vatten per kvm. Påverkas av byggnadsålder, geografiskt läge och uppvärmningsform.', thresholds: '🟢 <175  ·  🟡 175–250  ·  🔴 >250 kr/kvm' },
  6: { desc: 'Som KPI 1 men räknat på hela ytan inkl. lokaler och garage. Ger rättvisare bild vid uthyrda lokaler.', thresholds: '🟢 <700  ·  🟡 700–1 000  ·  🔴 >1 000 kr/kvm' },
  7: { desc: 'Föreningens lån per kvm bostadsrätt – den siffra som direkt påverkar era månadsavgifter. Nationellt snitt 2024: 7 191 kr/kvm.', thresholds: '🟢 <5 000  ·  🟡 5 000–15 000  ·  🔴 >15 000 kr/kvm' },
}

function fmt(value: number, unit: string) {
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-3 text-white/80 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-white font-bold text-lg mt-6 mb-2 first:mt-0">{line.replace('## ', '')}</h2>
        if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="text-white font-semibold">{line.replace(/\*\*/g, '')}</p>
        if (line.startsWith('- ')) return <li key={i} className="list-disc list-inside text-white/70 ml-2">{line.replace('- ', '')}</li>
        if (line.trim() === '') return <div key={i} className="h-1" />
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i}>
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

  // Beräkna position på skalan (0-100%)
  const allVals = [benchmark.p25 * 0.5, benchmark.p75 * 1.8, kpi.value]
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  const range = max - min || 1

  const pos  = (v: number) => Math.min(98, Math.max(2, ((v - min) / range) * 100))
  const myPos  = pos(kpi.value)
  const p25Pos = pos(benchmark.p25)
  const medPos = pos(benchmark.median)
  const p75Pos = pos(benchmark.p75)
  const barLeft = Math.min(p25Pos, p75Pos)
  const barWidth = Math.abs(p75Pos - p25Pos)

  const c = LIGHT_COLORS[kpi.light]

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="flex items-center justify-between mb-3 text-xs text-white/40">
        <span>Jämförelse: <span className="text-white/60">{benchmark.source}</span></span>
        <span>{benchmark.count > 0 ? `${benchmark.count} BRF:er i databasen` : ''}</span>
      </div>

      {/* Stapeldiagram */}
      <div className="relative h-8 mb-3">
        {/* Bakgrund */}
        <div className="absolute inset-0 bg-white/5 rounded-lg" />
        {/* P25–P75 intervall */}
        <div
          className="absolute top-0 bottom-0 bg-white/10 rounded"
          style={{ left: `${barLeft}%`, width: `${barWidth}%` }}
        />
        {/* Median-linje */}
        <div
          className="absolute top-1 bottom-1 w-0.5 bg-white/50 rounded"
          style={{ left: `${medPos}%` }}
        />
        {/* Din BRF */}
        <div
          className={`absolute top-0.5 bottom-0.5 w-1.5 rounded-full ${c.dot} shadow-lg`}
          style={{ left: `${myPos}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Etiketter */}
      <div className="grid grid-cols-4 text-center gap-2 mt-1">
        <div>
          <div className="text-white/50 text-xs mb-0.5">25:e percentil</div>
          <div className="text-white/80 text-sm font-semibold">{fmt2(benchmark.p25)}</div>
        </div>
        <div>
          <div className="text-white/50 text-xs mb-0.5">Median</div>
          <div className="text-white font-bold text-sm">{fmt2(benchmark.median)}</div>
        </div>
        <div>
          <div className="text-white/50 text-xs mb-0.5">75:e percentil</div>
          <div className="text-white/80 text-sm font-semibold">{fmt2(benchmark.p75)}</div>
        </div>
        <div>
          <div className={`${c.text} text-xs font-bold mb-0.5`}>Er BRF</div>
          <div className={`${c.text} text-sm font-bold`}>{fmt2(kpi.value)}</div>
        </div>
      </div>
    </div>
  )
}

export default function ResultsPage() {
  const params = useParams()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [hoveredKpi, setHoveredKpi] = useState<number | null>(null)
  const [benchmarks, setBenchmarks] = useState<Record<number, Benchmark>>({})

  useEffect(() => {
    // Ladda benchmarks parallellt
    fetch('/api/benchmarks')
      .then(r => r.json())
      .then(d => setBenchmarks(d.benchmarks ?? {}))
      .catch(() => {})
  }, [])

  useEffect(() => {
    async function loadResults() {
      const surveyId = params.surveyId as string

      // Försök sessionStorage först (direkt efter enkät)
      const stored = sessionStorage.getItem('ekk_results')
      if (stored) {
        const data = JSON.parse(stored)
        if (data.surveyId === surveyId) {
          setKpis(data.kpis)
          setAnswers(data.answers)
          setLoading(false)
          return
        }
      }

      // Annars hämta från Supabase (admin-vy)
      const { data: kpiRows } = await supabase
        .from('kpi_results')
        .select('*')
        .eq('survey_id', surveyId)
        .order('kpi_number')

      const { data: answerRows } = await supabase
        .from('answers')
        .select('*')
        .eq('survey_id', surveyId)

      if (kpiRows) {
        const kpis = kpiRows.map(k => ({
          id: k.kpi_number,
          name: k.kpi_name,
          value: Number(k.value),
          unit: k.unit,
          light: k.traffic_light as TrafficLight,
        }))
        setKpis(kpis)
      }

      if (answerRows) {
        const ans: Record<string, unknown> = {}
        answerRows.forEach(r => {
          ans[r.question_code] = r.answer_numeric ?? r.answer_text ?? r.answer_choice
        })
        setAnswers(ans)
      }

      setLoading(false)
    }
    loadResults()
  }, [params.surveyId])

  const redCount = kpis.filter(k => k.light === 'red').length
  const yellowCount = kpis.filter(k => k.light === 'yellow').length
  const greenCount = kpis.filter(k => k.light === 'green').length

  async function generateAnalysis() {
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kpis, answers }),
      })
      const data = await res.json()
      if (data.error) {
        setAiError(data.error)
      } else {
        setAiAnalysis(data.analysis)
        setTimeout(() => document.getElementById('ai-section')?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } catch {
      setAiError('Något gick fel – kontrollera din API-nyckel.')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="text-white/40">Laddar resultat...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold">BRF-Ekonomi<span className="text-blue-400">kollen</span></span>
        <Link href="/survey" className="text-sm text-white/50 hover:text-white transition-colors">Ny enkät</Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Ert resultat</h1>
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

        {/* KPI-kort */}
        <div className="space-y-4 mb-12">
          {kpis.map(kpi => {
            const c = LIGHT_COLORS[kpi.light]
            const info = KPI_INFO[kpi.id]
            return (
              <div
                key={kpi.id}
                className={`${c.bg} border ${c.border} rounded-xl p-5 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg`}
                onMouseEnter={() => setHoveredKpi(kpi.id)}
                onMouseLeave={() => setHoveredKpi(null)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl ${c.bg} border-2 ${c.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-xl font-bold ${c.text}`}>{kpi.id}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-white text-base">{kpi.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                        <p className={`text-sm font-semibold ${c.text}`}>{c.label}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-2xl font-bold text-white">{fmt(kpi.value, kpi.unit)}</p>
                  </div>
                </div>
                {/* Benchmark alltid synlig */}
                {benchmarks[kpi.id] && (
                  <BenchmarkBar kpi={kpi} benchmark={benchmarks[kpi.id]} />
                )}

                {/* Tooltip-info vid hover */}
                {hoveredKpi === kpi.id && info && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-white/70 text-sm mb-1">{info.desc}</p>
                    <p className="text-white/40 text-xs font-mono">{info.thresholds}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* CTA AI-analys */}
        {!aiAnalysis && (
          <div className="bg-blue-500/10 border border-blue-400/20 rounded-2xl p-8 text-center mb-12">
            <h2 className="text-xl font-bold mb-2">Vill ni ha en djupare analys?</h2>
            <p className="text-white/50 text-sm mb-6">
              AI-genererad rapport på svenska med rekommendationer, riskbedömning och framtidsutsikter på 5–50 år.
            </p>
            {aiError && <p className="text-red-400 text-sm mb-4">{aiError}</p>}
            <button
              onClick={generateAnalysis}
              disabled={aiLoading}
              className="bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2 mx-auto"
            >
              {aiLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Genererar analys... (ca 1–2 min)
                </>
              ) : 'Generera AI-analys →'}
            </button>
          </div>
        )}

        {/* AI-analys */}
        {aiAnalysis && (
          <div id="ai-section" className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-12">
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-white/10">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">AI</div>
              <div>
                <h2 className="font-bold text-white">AI-analys</h2>
                <p className="text-xs text-white/40">Genererad av Claude · Baserad på era svar</p>
              </div>
            </div>
            <MarkdownText text={aiAnalysis} />
          </div>
        )}
      </div>
    </div>
  )
}
