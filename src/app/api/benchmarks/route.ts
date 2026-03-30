import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

// Nationella referensvärden (HSB/Riksbyggen/Nabo/Finansinspektionen 2024)
const NATIONAL_REF = {
  1: { p25: 620, median: 784, p75: 950,  unit: 'kr/kvm' },
  2: { p25: 3200, median: 6135, p75: 11000, unit: 'kr/kvm' },
  3: { p25: 3,    median: 6,    p75: 12,  unit: '%' },
  4: { p25: 80,   median: 124,  p75: 220, unit: 'kr/kvm' },
  5: { p25: 155,  median: 203,  p75: 270, unit: 'kr/kvm' },
  6: { p25: 480,  median: 650,  p75: 820, unit: 'kr/kvm' },
  7: { p25: 3500, median: 6957, p75: 12500, unit: 'kr/kvm' },
}

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

export async function GET() {
  // Hämta alla KPI-resultat från databasen
  const { data: kpiRows } = await supabaseAdmin
    .from('kpi_results')
    .select('kpi_number, value')

  // Gruppera per KPI-nummer
  const grouped: Record<number, number[]> = {}
  for (let i = 1; i <= 7; i++) grouped[i] = []
  kpiRows?.forEach(row => {
    const n = row.kpi_number
    if (n >= 1 && n <= 7) grouped[n].push(Number(row.value))
  })

  // Bygg benchmarks – använd egna data om >5 BRF:er, annars nationella ref
  const benchmarks: Record<number, { p25: number; median: number; p75: number; unit: string; source: string; count: number }> = {}

  for (let i = 1; i <= 7; i++) {
    const vals = grouped[i].filter(v => v > 0)
    const ref = NATIONAL_REF[i as keyof typeof NATIONAL_REF]

    if (vals.length >= 5) {
      benchmarks[i] = {
        p25: percentile(vals, 25),
        median: percentile(vals, 50),
        p75: percentile(vals, 75),
        unit: ref.unit,
        source: `Ekonomikollen (${vals.length} BRF:er)`,
        count: vals.length,
      }
    } else {
      benchmarks[i] = {
        ...ref,
        source: 'Nationellt (HSB/Riksbyggen/Nabo 2024)',
        count: vals.length,
      }
    }
  }

  return NextResponse.json({ benchmarks })
}
