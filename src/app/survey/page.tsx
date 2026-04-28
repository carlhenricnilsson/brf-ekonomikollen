'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'

type Answers = Record<string, string | number | boolean>

type Question = {
  id: string
  label: string
  type: string
  unit?: string
  hint?: string
  min?: number
  max?: number
  required?: boolean
  options?: string[]
  labelMin?: string
  labelMax?: string
  dependsOn?: { field: string; value: string }
}

type Section = {
  id: string
  title: string
  subtitle: string
  questions: Question[]
}

const SECTIONS: Section[] = [
  {
    id: 'A', title: 'Grunduppgifter', subtitle: 'Hämtas från er årsredovisning',
    questions: [
      { id: 'A1_year', label: 'Vilket år avser årsredovisningen?', type: 'number', unit: 'år', hint: 'T.ex. 2024', min: 2000, max: 2030 },
      { id: 'A2_apartments', label: 'Antal lägenheter i föreningen?', type: 'number', unit: 'st', min: 1 },
      { id: 'A3_brf_area_sqm', label: 'Total bostadsrättsyta?', type: 'number', unit: 'kvm', hint: 'Finns i förvaltningsberättelsen' },
      { id: 'A4_total_area_sqm', label: 'Total yta inkl. lokaler och garage?', type: 'number', unit: 'kvm' },
      { id: 'A5_has_rentals', label: 'Har föreningen uthyrda lokaler (butiker/kontor)?', type: 'select', options: ['Ja', 'Nej'] },
      { id: 'A5b_rental_area_sqm', label: 'Hur stor är uthyrd lokalyta?', type: 'number', unit: 'kvm', hint: 'Ange 0 om ej aktuellt', dependsOn: { field: 'A5_has_rentals', value: 'Ja' } },
      { id: 'A6_land_ownership', label: 'Äger föreningen marken eller gäller tomträtt?', type: 'select', options: ['Äger marken', 'Tomträtt', 'Vet ej'] },
    ]
  },
  {
    id: 'B', title: 'Intäkter', subtitle: 'Från resultaträkningen',
    questions: [
      { id: 'B1_annual_fees', label: 'Totala årsavgifter från medlemmar under året?', type: 'number', unit: 'kr', hint: 'Summan av alla avgifter' },
      { id: 'B2_rental_income', label: 'Intäkter från uthyrning av lokaler, garage, antenner m.m.?', type: 'number', unit: 'kr', hint: 'Ange 0 om ej aktuellt' },
    ]
  },
  {
    id: 'C', title: 'Lån och räntor', subtitle: 'Från balansräkningens skuldsida',
    questions: [
      { id: 'C1_total_debt', label: 'Föreningens totala räntebärande låneskuld?', type: 'number', unit: 'kr' },
      { id: 'C2_interest_costs', label: 'Totala räntekostnader under året?', type: 'number', unit: 'kr' },
    ]
  },
  {
    id: 'D', title: 'Energi och drift', subtitle: 'Från kostnadsspecifikationen',
    questions: [
      { id: 'D1_energy_costs', label: 'Totala kostnader för värme, el och vatten under året?', type: 'number', unit: 'kr' },
    ]
  },
  {
    id: 'E', title: 'Underhåll och sparande', subtitle: 'Från resultaträkningens noter',
    questions: [
      { id: 'E1_has_maintenance_plan', label: 'Har föreningen en godkänd underhållsplan?', type: 'select', options: ['Ja', 'Nej'] },
      { id: 'E2_maintenance_plan_year', label: 'Vilket år upprättades eller uppdaterades underhållsplanen senast?', type: 'number', unit: 'år', hint: 'Hoppa över om nej ovan', required: false },
      { id: 'E3_fund_allocation', label: 'Årets avsättning till underhållsfond?', type: 'number', unit: 'kr', hint: 'Ange 0 om ingen avsättning' },
      { id: 'E4_depreciation', label: 'Årets avskrivningar?', type: 'number', unit: 'kr' },
      { id: 'E5_planned_maintenance_costs', label: 'Årets kostnadsförda planerade underhåll?', type: 'number', unit: 'kr', hint: 'Ange 0 om inget' },
    ]
  },
  {
    id: 'F', title: 'Resultat och kassaflöde', subtitle: 'Från resultaträkning och kassaflödesanalys',
    questions: [
      { id: 'F1_net_result', label: 'Årets resultat?', type: 'number', unit: 'kr', hint: 'Negativt värde tillåtet' },
      { id: 'F2_cashflow', label: 'Var kassaflödet för verksamhetsåret positivt eller negativt?', type: 'select', options: ['Positivt', 'Negativt', 'Vet ej'] },
      { id: 'F3_cashflow_plan', label: 'Om negativt – finns en plan för att åtgärda detta?', type: 'textarea', hint: 'Max 3 meningar', required: false },
    ]
  },
  {
    id: 'G', title: 'Styrelsens bedömning', subtitle: 'Egna bedömningar och framtidsplaner',
    questions: [
      { id: 'G1_financial_assessment', label: 'Hur bedömer du föreningens ekonomiska situation just nu?', type: 'scale', min: 1, max: 5, labelMin: 'Mycket ansträngd', labelMax: 'Mycket god' },
      { id: 'G2_fee_increase', label: 'Är en avgiftshöjning planerad eller diskuterad inom 2 år?', type: 'select', options: ['Ja, planerad', 'Diskuteras', 'Nej'] },
      { id: 'G3_investments', label: 'Har föreningen genomfört eller planerat några stora investeringar de närmaste 5 åren?', type: 'textarea', hint: 'Beskriv kort, eller ange "Nej"', required: false },
    ]
  },
]

// Fält som INTE ska formateras med tusentalsavgränsare
const NO_FORMAT_UNITS = ['år', '%']

function formatWithSpaces(value: string): string {
  if (!value && value !== '0') return ''
  const isNegative = value.startsWith('-')
  const digits = value.replace(/\D/g, '')
  const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return isNegative ? '-' + formatted : formatted
}

function FormattedNumberInput({
  id, value, unit, min, onChange
}: {
  id: string
  value: string | number | boolean
  unit?: string
  min?: number
  onChange: (val: number | string) => void
}) {
  const shouldFormat = !NO_FORMAT_UNITS.includes(unit ?? '')
  const raw = value === '' || value === undefined ? '' : String(value)
  const displayed = shouldFormat ? formatWithSpaces(raw) : raw

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target.value
    if (shouldFormat) {
      // Tillåt minus i början, annars bara siffror
      const isNegative = input.startsWith('-')
      const digits = input.replace(/\D/g, '')
      const numeric = isNegative ? '-' + digits : digits
      if (numeric === '' || numeric === '-') {
        onChange('')
      } else {
        onChange(Number(numeric))
      }
    } else {
      onChange(input === '' ? '' : Number(input))
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode={min !== undefined && min < 0 ? 'text' : 'numeric'}
        value={displayed}
        onChange={handleChange}
        className="bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white w-full focus:outline-none focus:border-blue-400 focus:bg-white/10 transition-colors tabular-nums"
        placeholder={shouldFormat ? '0' : '0'}
      />
      {unit && <span className="text-white/40 text-sm shrink-0 w-12">{unit}</span>}
    </div>
  )
}

function SurveyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [loading, setLoading] = useState(false)
  const [brfName, setBrfName] = useState('')
  const token = searchParams.get('token')

  useEffect(() => {
    async function fetchSurveyInfo() {
      if (token) {
        // Hämta BRF-namn via token
        const res = await fetch(`/api/survey-info?token=${token}`)
        const data = await res.json()
        if (data.brf_name) setBrfName(data.brf_name)
      } else {
        // Hämta BRF-namn från inloggad BRF-admins profil
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: brf } = await supabase
            .from('brf_admin_brfs')
            .select('brf_base_name')
            .eq('user_id', user.id)
            .single()
          if (brf?.brf_base_name) setBrfName(brf.brf_base_name)
        }
      }
    }
    fetchSurveyInfo()
  }, [token])

  const section = SECTIONS[step]

  function setValue(id: string, value: string | number | boolean) {
    setAnswers(prev => ({ ...prev, [id]: value }))
  }

  function isVisible(q: { dependsOn?: { field: string; value: string } }) {
    if (!q.dependsOn) return true
    return answers[q.dependsOn.field] === q.dependsOn.value
  }

  // Beräkna total progress baserat på ifyllda fält
  const allRequiredQuestions = SECTIONS.flatMap(s =>
    s.questions.filter(q => q.required !== false && isVisible(q))
  )
  const answeredCount = allRequiredQuestions.filter(q => {
    const val = answers[q.id]
    return val !== undefined && val !== '' && val !== null
  }).length
  const totalRequired = allRequiredQuestions.length
  const progress = totalRequired > 0 ? Math.round((answeredCount / totalRequired) * 100) : 0

  function canProceed() {
    return section.questions.every(q => {
      if (q.required === false) return true
      if (!isVisible(q)) return true
      const val = answers[q.id]
      return val !== undefined && val !== '' && val !== null
    })
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, token, brf_name: brfName || undefined }),
      })
      const data = await res.json()
      if (data.surveyId) {
        sessionStorage.setItem('ekk_results', JSON.stringify(data))
        router.push(`/results/${data.surveyId}`)
      }
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold">BRF-Ekonomi<span className="text-blue-400">kollen</span></span>
        <span className="text-sm text-white/40">Sektion {step + 1} av {SECTIONS.length}</span>
      </div>

      {/* Progress bar */}
      <div className="px-6 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={`text-xs font-medium tabular-nums ${progress === 100 ? 'text-green-400' : 'text-white/40'}`}>
            {progress}%
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Section header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-blue-500 text-white text-sm font-bold w-8 h-8 rounded-lg flex items-center justify-center">{section.id}</span>
            <h1 className="text-2xl font-bold">{section.title}</h1>
          </div>
          <p className="text-white/50 ml-11">{section.subtitle}</p>
        </div>

        {/* Questions */}
        <div className="space-y-8">
          {section.questions.map(q => {
            if (!isVisible(q)) return null
            return (
              <div key={q.id}>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  {q.label}
                  {q.required === false && <span className="text-white/30 font-normal ml-2">(valfri)</span>}
                </label>
                {'hint' in q && q.hint && <p className="text-xs text-white/40 mb-2">{q.hint}</p>}

                {q.type === 'number' && (
                  <FormattedNumberInput
                    id={q.id}
                    value={answers[q.id] ?? ''}
                    unit={q.unit}
                    min={q.min}
                    onChange={val => setValue(q.id, val)}
                  />
                )}

                {q.type === 'select' && 'options' in q && (
                  <div className="flex flex-wrap gap-2">
                    {q.options!.map((opt: string) => (
                      <button
                        key={opt}
                        onClick={() => setValue(q.id, opt)}
                        className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                          answers[q.id] === opt
                            ? 'bg-blue-500 border-blue-500 text-white'
                            : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/30'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.type === 'scale' && (
                  <div>
                    <div className="flex gap-3 mb-2">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          onClick={() => setValue(q.id, n)}
                          className={`flex-1 py-3 rounded-lg border text-sm font-bold transition-colors ${
                            answers[q.id] === n
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'bg-white/5 border-white/20 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-white/30">
                      <span>{'labelMin' in q ? q.labelMin : ''}</span>
                      <span>{'labelMax' in q ? q.labelMax : ''}</span>
                    </div>
                  </div>
                )}

                {q.type === 'textarea' && (
                  <textarea
                    value={answers[q.id] as string ?? ''}
                    onChange={e => setValue(q.id, e.target.value)}
                    className="bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white w-full focus:outline-none focus:border-blue-400 focus:bg-white/10 transition-colors resize-none"
                    rows={3}
                    placeholder="Beskriv kort..."
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-12 pt-8 border-t border-white/10">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="px-6 py-3 rounded-lg border border-white/20 text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Föregående
          </button>

          {step < SECTIONS.length - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="px-8 py-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Nästa →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || loading}
              className="px-8 py-3 rounded-lg bg-green-500 hover:bg-green-400 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Beräknar...' : 'Skicka in & se resultat →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SurveyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-white/40">Laddar enkät...</div>
      </div>
    }>
      <SurveyContent />
    </Suspense>
  )
}
