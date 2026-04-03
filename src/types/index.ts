// ============================================================
// EKONOMIKOLLEN – Typdefinitioner
// ============================================================

export type UserRole = 'superadmin' | 'brf_admin' | 'respondent'

export interface User {
  id: string
  email: string
  role: UserRole
  brf_id?: string
  organization_id?: string
  created_at: string
}

// ── BRF & Organisation ──────────────────────────────────────

export interface Organization {
  id: string
  name: string           // t.ex. "HSB Stockholm"
  type: 'umbrella' | 'standalone'
  created_at: string
}

export interface BRF {
  id: string
  organization_id?: string
  name: string           // t.ex. "BRF Solgläntan"
  org_number: string     // Organisationsnummer
  created_at: string
}

// ── Survey & Svar ───────────────────────────────────────────

export interface SurveyAnswer {
  // Sektion A – Grunduppgifter
  A1_year: number                          // Vilket år avser årsredovisningen?
  A2_apartments: number                    // Antal lägenheter
  A3_brf_area_sqm: number                  // Total bostadsrättsyta (kvm)
  A4_total_area_sqm: number                // Total yta inkl. lokaler (kvm)
  A5_has_rentals: boolean                  // Uthyrda lokaler?
  A5b_rental_area_sqm: number              // Uthyrd lokalyta (kvm)
  A6_land_ownership: 'owns' | 'leasehold' | 'unknown'

  // Sektion B – Intäkter
  B1_annual_fees: number                   // Totala årsavgifter (kr)
  B2_rental_income: number                 // Intäkter från uthyrning (kr)

  // Sektion C – Lån och räntor
  C1_total_debt: number                    // Total räntebärande låneskuld (kr)
  C2_interest_costs: number                // Totala räntekostnader (kr)

  // Sektion D – Energi och drift
  D1_energy_costs: number                  // Kostnader för värme, el, vatten (kr)

  // Sektion E – Underhåll och sparande
  E1_has_maintenance_plan: boolean         // Godkänd underhållsplan?
  E2_maintenance_plan_year?: number        // År för senaste underhållsplan
  E3_fund_allocation: number               // Årets avsättning till underhållsfond (kr)
  E4_depreciation: number                  // Årets avskrivningar (kr)
  E5_planned_maintenance_costs: number     // Årets kostnadsförda planerade underhåll (kr)

  // Sektion F – Resultat och kassaflöde
  F1_net_result: number                    // Årets resultat (kr, kan vara negativt)
  F2_cashflow: 'positive' | 'negative' | 'unknown'
  F3_cashflow_plan?: string                // Fritext: plan för negativt kassaflöde

  // Sektion G – Styrelsens bedömning
  G1_financial_assessment: 1 | 2 | 3 | 4 | 5  // 1=Mycket ansträngd, 5=Mycket god
  G2_fee_increase: 'planned' | 'discussed' | 'no'
  G3_investments?: string                  // Fritext: planerade investeringar
}

// ── KPI-resultat ────────────────────────────────────────────

export type TrafficLight = 'red' | 'yellow' | 'green' | 'neutral'

export interface KPIResult {
  id: number
  name_sv: string
  name_en: string
  value: number
  unit: string
  traffic_light: TrafficLight
  percentile?: number           // Var hamnar BRF:en vs alla andra (0–100)
  benchmark_median?: number
  benchmark_p25?: number
  benchmark_p75?: number
  formula_description: string
}

export interface KPISet {
  kpi1_annual_fee_per_sqm: KPIResult        // Årsavgift/kvm bostadsrätt
  kpi2_debt_per_sqm_total: KPIResult        // Skuldsättning/kvm totalyta
  kpi3_interest_sensitivity: KPIResult      // Räntekänslighet (%)
  kpi4_savings_per_sqm: KPIResult           // Sparande/kvm
  kpi5_energy_per_sqm: KPIResult            // Energikostnad/kvm
  kpi6_annual_fee_per_sqm_total: KPIResult  // Årsavgift/kvm totalyta
  kpi7_debt_per_sqm_brf: KPIResult          // Belåning/kvm bostadsrätt
  composite_score: number                   // Vägt aggregat 0–100
  composite_light: TrafficLight
}

// ── Survey-session ───────────────────────────────────────────

export interface Survey {
  id: string
  brf_id: string
  respondent_id: string
  status: 'draft' | 'submitted' | 'analysed'
  answers?: SurveyAnswer
  kpi_results?: KPISet
  ai_analysis?: AIAnalysis
  language: 'sv' | 'en'
  created_at: string
  submitted_at?: string
  survey_year: number
}

// ── AI-analys ────────────────────────────────────────────────

export interface AIAnalysis {
  id: string
  survey_id: string
  summary_sv: string            // Sammanfattning på svenska
  summary_en: string            // Summary in English
  strengths: string[]           // Styrkor
  weaknesses: string[]          // Svagheter / risker
  recommendations: string[]     // Rekommendationer
  short_term_outlook: string    // Status idag
  medium_term_outlook: string   // 5–10 års sikt
  long_term_outlook: string     // 30–50 års sikt
  board_consensus?: string      // Styrelsens enighet (om flera respondenter)
  longitudinal_notes?: string   // Trendutveckling (om flera år)
  created_at: string
}

// ── Formulär-steg ────────────────────────────────────────────

export type SurveySection = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export interface SurveySectionMeta {
  id: SurveySection
  title_sv: string
  title_en: string
  description_sv: string
  description_en: string
  questions: SurveyQuestion[]
}

export type QuestionType = 'number' | 'boolean' | 'select' | 'text' | 'scale'

export interface SurveyQuestion {
  id: keyof SurveyAnswer
  type: QuestionType
  label_sv: string
  label_en: string
  hint_sv?: string
  hint_en?: string
  unit?: string
  required: boolean
  options?: { value: string; label_sv: string; label_en: string }[]
  min?: number
  max?: number
  depends_on?: { field: keyof SurveyAnswer; value: unknown }
}
