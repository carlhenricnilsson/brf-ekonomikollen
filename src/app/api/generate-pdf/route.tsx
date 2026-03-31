import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { buildReportName } from '@/lib/report-name'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const TC = { green: '#22c55e', yellow: '#eab308', red: '#ef4444', neutral: '#60a5fa' }

const s = StyleSheet.create({
  page:         { backgroundColor: '#0f172a', padding: '28 32 44 32', fontFamily: 'Helvetica', color: '#ffffff' },
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1 solid #1e293b' },
  logo:         { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  logoBlue:     { color: '#60a5fa' },
  headerRight:  { fontSize: 9, color: '#64748b' },
  // Title block
  titleBlock:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  brfLabel:     { fontSize: 9, color: '#60a5fa', fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  brfTitle:     { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 2 },
  brfSub:       { fontSize: 9, color: '#94a3b8' },
  badge:        { backgroundColor: '#1e3a5f', padding: '4 10', borderRadius: 6 },
  badgeText:    { fontSize: 8, color: '#93c5fd' },
  // Summary boxes
  summaryRow:   { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sumBox:       { flex: 1, borderRadius: 6, padding: '8 0', alignItems: 'center' },
  sumNum:       { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sumLabel:     { fontSize: 8 },
  // Section title
  secTitle:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 8, paddingBottom: 5, borderBottom: '1 solid #1e293b' },
  // KPI rows
  kpiRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 6, padding: '7 10', marginBottom: 5 },
  kpiBadge:     { width: 22, height: 22, borderRadius: 4, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  kpiBadgeTxt:  { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  kpiName:      { fontSize: 10, color: '#e2e8f0', flex: 1 },
  kpiVal:       { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginRight: 6, textAlign: 'right', minWidth: 70 },
  kpiStatus:    { fontSize: 8, minWidth: 42, textAlign: 'center', padding: '2 5', borderRadius: 4 },
  // Benchmark strip
  benchStrip:   { flexDirection: 'row', marginTop: 4, paddingTop: 4, borderTop: '1 solid #334155' },
  benchItem:    { flex: 1, alignItems: 'center' },
  benchLbl:     { fontSize: 7, color: '#64748b', marginBottom: 1 },
  benchVal:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#94a3b8' },
  // Footer
  footer:       { position: 'absolute', bottom: 18, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #1e293b', paddingTop: 8 },
  footerTxt:    { fontSize: 7, color: '#475569' },
  // AI page
  aiPage:       { backgroundColor: '#0f172a', padding: '28 32 44 32', fontFamily: 'Helvetica', color: '#ffffff' },
  aiSec:        { backgroundColor: '#1e293b', borderRadius: 8, padding: 16, marginTop: 4 },
  aiHead:       { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1 solid #334155' },
  aiBadge:      { backgroundColor: '#1e3a5f', padding: '3 8', borderRadius: 5, marginRight: 10 },
  aiBadgeTxt:   { fontSize: 9, color: '#93c5fd', fontFamily: 'Helvetica-Bold' },
  aiTitle:      { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  aiSub:        { fontSize: 8, color: '#64748b' },
  aiH2:         { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 10, marginBottom: 4 },
  aiBody:       { fontSize: 9, color: '#cbd5e1', lineHeight: 1.7 },
})

const BENCH: Record<number, { p25: number; median: number; p75: number }> = {
  1: { p25: 620,  median: 784,  p75: 950   },
  2: { p25: 3200, median: 6135, p75: 11000 },
  3: { p25: 3,    median: 6,    p75: 12    },
  4: { p25: 80,   median: 124,  p75: 220   },
  5: { p25: 155,  median: 203,  p75: 270   },
  6: { p25: 480,  median: 650,  p75: 820   },
  7: { p25: 3500, median: 6957, p75: 12500 },
}

function fmtVal(value: number, unit: string) {
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function getLabel(light: string) {
  if (light === 'green')  return 'Bra'
  if (light === 'yellow') return 'Bevaka'
  if (light === 'red')    return 'Varning'
  return 'Info'
}

function renderAIText(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <Text key={i} style={s.aiH2}>{line.replace('## ', '')}</Text>
    if (line.trim() === '')     return <Text key={i} style={{ fontSize: 3 }}> </Text>
    return <Text key={i} style={s.aiBody}>{line.replace(/\*\*/g, '')}</Text>
  })
}

export async function GET(req: NextRequest) {
  const surveyId = req.nextUrl.searchParams.get('surveyId')
  if (!surveyId) return NextResponse.json({ error: 'Missing surveyId' }, { status: 400 })

  const [{ data: survey }, { data: kpis }, , { data: aiData }] = await Promise.all([
    supabaseAdmin.from('surveys').select('*').eq('id', surveyId).single(),
    supabaseAdmin.from('kpi_results').select('*').eq('survey_id', surveyId).order('kpi_number'),
    supabaseAdmin.from('answers').select('*').eq('survey_id', surveyId),
    supabaseAdmin.from('ai_analyses').select('*').eq('survey_id', surveyId).order('created_at', { ascending: false }).limit(1),
  ])

  if (!survey || !kpis) return NextResponse.json({ error: 'Enkät hittades inte' }, { status: 404 })

  const reportName  = buildReportName(survey.brf_name || 'Okänd BRF', survey.survey_year, survey.version || 1)
  const aiAnalysis  = aiData?.[0]?.analysis_text || ''
  const today       = new Date().toLocaleDateString('sv-SE')
  const redCount    = kpis.filter(k => k.traffic_light === 'red').length
  const yellowCount = kpis.filter(k => k.traffic_light === 'yellow').length
  const greenCount  = kpis.filter(k => k.traffic_light === 'green').length

  const doc = (
    <Document title={reportName} author="BRF-Ekonomikollen">

      {/* ── SIDA 1: Header + sammanfattning + alla 7 KPI:er ── */}
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.logo}>BRF-Ekonomi<Text style={s.logoBlue}>kollen</Text></Text>
          <Text style={s.headerRight}>{reportName} · Baserat på BFNAR 2023:1</Text>
        </View>

        {/* Titel + datum */}
        <View style={s.titleBlock}>
          <View>
            <Text style={s.brfLabel}>BRF-EKONOMIKOLLEN</Text>
            <Text style={s.brfTitle}>{reportName}</Text>
            <Text style={s.brfSub}>Ekonomisk hälsoanalys · Baserat på BFNAR 2023:1</Text>
          </View>
          <View style={s.badge}>
            <Text style={s.badgeText}>Genererad {today}</Text>
          </View>
        </View>

        {/* Sammanfattning – 3 boxar */}
        <View style={s.summaryRow}>
          <View style={[s.sumBox, { backgroundColor: '#14532d' }]}>
            <Text style={[s.sumNum, { color: '#4ade80' }]}>{greenCount}</Text>
            <Text style={[s.sumLabel, { color: '#86efac' }]}>Bra</Text>
          </View>
          <View style={[s.sumBox, { backgroundColor: '#713f12' }]}>
            <Text style={[s.sumNum, { color: '#fbbf24' }]}>{yellowCount}</Text>
            <Text style={[s.sumLabel, { color: '#fde68a' }]}>Bevaka</Text>
          </View>
          <View style={[s.sumBox, { backgroundColor: '#7f1d1d' }]}>
            <Text style={[s.sumNum, { color: '#f87171' }]}>{redCount}</Text>
            <Text style={[s.sumLabel, { color: '#fca5a5' }]}>Varning</Text>
          </View>
        </View>

        {/* KPI-rubrik */}
        <Text style={s.secTitle}>De 7 obligatoriska nyckeltalen</Text>

        {/* KPI-rader */}
        {kpis.map(kpi => {
          const color = TC[kpi.traffic_light as keyof typeof TC] || TC.neutral
          const bench = BENCH[kpi.kpi_number]
          return (
            <View key={kpi.kpi_number} style={s.kpiRow}>
              {/* Nummer-badge */}
              <View style={[s.kpiBadge, { backgroundColor: color + '33', borderWidth: 1, borderColor: color + '55' }]}>
                <Text style={[s.kpiBadgeTxt, { color }]}>{kpi.kpi_number}</Text>
              </View>
              {/* Namn + benchmark */}
              <View style={{ flex: 1 }}>
                <Text style={s.kpiName}>{kpi.kpi_name}</Text>
                {bench && (
                  <View style={s.benchStrip}>
                    <View style={s.benchItem}>
                      <Text style={s.benchLbl}>P25</Text>
                      <Text style={s.benchVal}>{fmtVal(bench.p25, kpi.unit)}</Text>
                    </View>
                    <View style={s.benchItem}>
                      <Text style={s.benchLbl}>Median</Text>
                      <Text style={[s.benchVal, { color: '#e2e8f0' }]}>{fmtVal(bench.median, kpi.unit)}</Text>
                    </View>
                    <View style={s.benchItem}>
                      <Text style={s.benchLbl}>P75</Text>
                      <Text style={s.benchVal}>{fmtVal(bench.p75, kpi.unit)}</Text>
                    </View>
                  </View>
                )}
              </View>
              {/* Värde + status */}
              <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                <Text style={[s.kpiVal, { color }]}>{fmtVal(Number(kpi.value), kpi.unit)}</Text>
                <View style={[s.kpiStatus, { backgroundColor: color + '22' }]}>
                  <Text style={{ fontSize: 8, color, fontFamily: 'Helvetica-Bold' }}>{getLabel(kpi.traffic_light)}</Text>
                </View>
              </View>
            </View>
          )
        })}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>BRF-Ekonomikollen · Governance at Work AB · governanceatwork.io</Text>
          <Text style={s.footerTxt}>Källa: HSB, Riksbyggen, Nabo, FI 2024 · {today}</Text>
        </View>
      </Page>

      {/* ── SIDA 2+: AI-analys ── */}
      {aiAnalysis ? (
        <Page size="A4" style={s.aiPage}>
          <View style={s.header}>
            <Text style={s.logo}>BRF-Ekonomi<Text style={s.logoBlue}>kollen</Text></Text>
            <Text style={s.headerRight}>{reportName}</Text>
          </View>
          <Text style={[s.secTitle, { fontSize: 13, marginBottom: 10 }]}>AI-analys och rekommendationer</Text>
          <View style={s.aiSec}>
            <View style={s.aiHead}>
              <View style={s.aiBadge}><Text style={s.aiBadgeTxt}>AI</Text></View>
              <View>
                <Text style={s.aiTitle}>Analys</Text>
                <Text style={s.aiSub}>Genererad av Claude · Baserad på era enkätsvar</Text>
              </View>
            </View>
            {renderAIText(aiAnalysis)}
          </View>
          <View style={s.footer}>
            <Text style={s.footerTxt}>AI-analysen är ett beslutsstöd och ersätter inte professionell ekonomisk rådgivning.</Text>
            <Text style={s.footerTxt}>{today}</Text>
          </View>
        </Page>
      ) : null}

    </Document>
  )

  const buffer   = await renderToBuffer(doc)
  const filename = `${reportName.replace(/\s+/g, '_')}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
