// ============================================================
// EKONOMIKOLLEN – KPI-kalkylator (BFNAR 2023:1)
// ============================================================

import { SurveyAnswer, KPIResult, KPISet, TrafficLight } from '@/types'

// ── Trafikljus-gränser per KPI ───────────────────────────────

// Samma trösklar som i api/survey/route.ts – enda källa till sanning
function getTrafficLight(kpiId: number, value: number): TrafficLight {
  switch (kpiId) {
    case 1: return value > 1000 ? 'red' : value >= 800  ? 'yellow' : 'green'
    case 2: return value > 15000 ? 'red' : value >= 5000 ? 'yellow' : 'green'
    case 3: return value > 10   ? 'red' : value >= 5    ? 'yellow' : 'green'
    case 4: return value < 130  ? 'red' : value <= 250  ? 'yellow' : 'green'
    case 5: return value > 250  ? 'red' : value >= 175  ? 'yellow' : 'green'
    case 6: return value > 1000 ? 'red' : value >= 700  ? 'yellow' : 'green'
    case 7: return value > 15000 ? 'red' : value >= 5000 ? 'yellow' : 'green'
    default: return 'neutral'
  }
}

// ── Huvud-funktion: Beräkna alla 7 KPI:er ───────────────────

export function calculateKPIs(answers: SurveyAnswer): KPISet {

  // Mellanberäkning för KPI 4
  const adjusted_result = answers.F1_net_result + answers.E4_depreciation + answers.E5_planned_maintenance_costs

  const A3 = answers.A3_brf_area_sqm || 0
  const A4 = answers.A4_total_area_sqm || 0
  const B1 = answers.B1_annual_fees || 0

  // KPI 1 – Årsavgift per kvm bostadsrätt
  const kpi1_value = A3 > 0 ? B1 / A3 : 0
  const kpi1: KPIResult = {
    id: 1,
    name_sv: 'Årsavgift per kvm bostadsrätt',
    name_en: 'Annual fee per sqm (residential)',
    value: Math.round(kpi1_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(1, kpi1_value),
    formula_description: 'Totala årsavgifter ÷ Total bostadsrättsyta',
  }

  // KPI 2 – Skuldsättning per kvm totalyta
  const kpi2_value = A4 > 0 ? answers.C1_total_debt / A4 : 0
  const kpi2: KPIResult = {
    id: 2,
    name_sv: 'Skuldsättning per kvm totalyta',
    name_en: 'Debt per sqm (total area)',
    value: Math.round(kpi2_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(2, kpi2_value),
    formula_description: 'Total låneskuld ÷ Total yta (inkl. lokaler)',
  }

  // KPI 3 – Räntekänslighet
  const kpi3_value = B1 > 0 ? ((answers.C1_total_debt * 0.01) / B1) * 100 : 0
  const kpi3: KPIResult = {
    id: 3,
    name_sv: 'Räntekänslighet',
    name_en: 'Interest rate sensitivity',
    value: Math.round(kpi3_value * 10) / 10,
    unit: '%',
    traffic_light: getTrafficLight(3, kpi3_value),
    formula_description: '(Total skuld × 1%) ÷ Årsavgifter × 100',
  }

  // KPI 4 – Sparande per kvm (justerat resultat)
  const kpi4_value = A4 > 0 ? adjusted_result / A4 : 0
  const kpi4: KPIResult = {
    id: 4,
    name_sv: 'Sparande per kvm',
    name_en: 'Savings per sqm',
    value: Math.round(kpi4_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(4, kpi4_value),
    formula_description: '(Årets resultat + Avskrivningar + Planerat underhåll) ÷ Totalyta',
  }

  // KPI 5 – Energikostnad per kvm
  const kpi5_value = A4 > 0 ? answers.D1_energy_costs / A4 : 0
  const kpi5: KPIResult = {
    id: 5,
    name_sv: 'Energikostnad per kvm',
    name_en: 'Energy cost per sqm',
    value: Math.round(kpi5_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(5, kpi5_value),
    formula_description: 'Totala energikostnader ÷ Total yta',
  }

  // KPI 6 – Årsavgift per kvm totalyta
  const kpi6_value = A4 > 0 ? B1 / A4 : 0
  const kpi6: KPIResult = {
    id: 6,
    name_sv: 'Årsavgift per kvm totalyta',
    name_en: 'Annual fee per sqm (total area)',
    value: Math.round(kpi6_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(6, kpi6_value),
    formula_description: 'Totala årsavgifter ÷ Total yta (inkl. lokaler)',
  }

  // KPI 7 – Belåning per kvm bostadsrätt
  const kpi7_value = A3 > 0 ? answers.C1_total_debt / A3 : 0
  const kpi7: KPIResult = {
    id: 7,
    name_sv: 'Belåning per kvm bostadsrätt',
    name_en: 'Debt per sqm (residential)',
    value: Math.round(kpi7_value),
    unit: 'kr/kvm',
    traffic_light: getTrafficLight(7, kpi7_value),
    formula_description: 'Total låneskuld ÷ Total bostadsrättsyta',
  }

  // ── Aggregat-poäng (viktat genomsnitt, 0–100) ──────────────
  // Vikter baserade på relevans för ekonomisk hälsa
  const weights = {
    kpi2: 0.25,  // Skuldsättning – hög vikt
    kpi3: 0.25,  // Räntekänslighet – hög vikt
    kpi4: 0.20,  // Sparande – viktig
    kpi7: 0.15,  // Belåning/kvm bostadsrätt
    kpi1: 0.05,  // Årsavgift (kontext)
    kpi5: 0.05,  // Energi (kontext)
    kpi6: 0.05,  // Årsavgift totalyta (kontext)
  }

  function lightToScore(light: TrafficLight): number {
    if (light === 'green') return 100
    if (light === 'yellow') return 50
    if (light === 'red') return 0
    return 50 // neutral
  }

  const composite_score = Math.round(
    lightToScore(kpi1.traffic_light) * weights.kpi1 +
    lightToScore(kpi2.traffic_light) * weights.kpi2 +
    lightToScore(kpi3.traffic_light) * weights.kpi3 +
    lightToScore(kpi4.traffic_light) * weights.kpi4 +
    lightToScore(kpi5.traffic_light) * weights.kpi5 +
    lightToScore(kpi6.traffic_light) * weights.kpi6 +
    lightToScore(kpi7.traffic_light) * weights.kpi7
  )

  const composite_light: TrafficLight =
    composite_score >= 75 ? 'green' :
    composite_score >= 40 ? 'yellow' : 'red'

  return {
    kpi1_annual_fee_per_sqm: kpi1,
    kpi2_debt_per_sqm_total: kpi2,
    kpi3_interest_sensitivity: kpi3,
    kpi4_savings_per_sqm: kpi4,
    kpi5_energy_per_sqm: kpi5,
    kpi6_annual_fee_per_sqm_total: kpi6,
    kpi7_debt_per_sqm_brf: kpi7,
    composite_score,
    composite_light,
  }
}

// ── Hjälpfunktion: KPI-lista som array ──────────────────────

export function kpiSetToArray(kpis: KPISet): KPIResult[] {
  return [
    kpis.kpi1_annual_fee_per_sqm,
    kpis.kpi2_debt_per_sqm_total,
    kpis.kpi3_interest_sensitivity,
    kpis.kpi4_savings_per_sqm,
    kpis.kpi5_energy_per_sqm,
    kpis.kpi6_annual_fee_per_sqm_total,
    kpis.kpi7_debt_per_sqm_brf,
  ]
}
