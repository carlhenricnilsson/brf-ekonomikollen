import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { buildReportName } from '@/lib/report-name'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const TRAFFIC_COLORS = { green: '#22c55e', yellow: '#eab308', red: '#ef4444', neutral: '#60a5fa' }

const styles = StyleSheet.create({
  page: { backgroundColor: '#0f172a', padding: 48, fontFamily: 'Helvetica', color: '#ffffff' },
  coverPage: { backgroundColor: '#0f172a', padding: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 16, borderBottom: '1 solid #1e293b' },
  logo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  logoBlue: { color: '#60a5fa' },
  coverTitle: { fontSize: 32, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 8 },
  coverSubtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 4 },
  coverBadge: { marginTop: 24, backgroundColor: '#1e3a5f', padding: '8 16', borderRadius: 8, alignSelf: 'flex-start' },
  coverBadgeText: { fontSize: 11, color: '#93c5fd' },
  sectionTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 16, marginTop: 24 },
  kpiCard: { backgroundColor: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 10 },
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  kpiNumBadge: { width: 28, height: 28, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  kpiNumText: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  kpiName: { fontSize: 13, color: '#e2e8f0', flex: 1, marginLeft: 12 },
  kpiValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  kpiStatus: { fontSize: 10, marginTop: 2 },
  benchmarkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1 solid #334155' },
  benchmarkItem: { alignItems: 'center', flex: 1 },
  benchmarkLabel: { fontSize: 8, color: '#64748b', marginBottom: 2 },
  benchmarkValue: { fontSize: 10, color: '#94a3b8', fontFamily: 'Helvetica-Bold' },
  aiSection: { backgroundColor: '#1e293b', borderRadius: 8, padding: 20, marginTop: 8 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1 solid #334155' },
  aiBadge: { backgroundColor: '#1e3a5f', padding: '4 10', borderRadius: 6, marginRight: 12 },
  aiBadgeText: { fontSize: 10, color: '#93c5fd', fontFamily: 'Helvetica-Bold' },
  aiTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  aiBody: { fontSize: 10, color: '#cbd5e1', lineHeight: 1.8 },
  aiH2: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginTop: 14, marginBottom: 6 },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', borderTop: '1 solid #1e293b', paddingTop: 12 },
  footerText: { fontSize: 9, color: '#475569' },
})

function fmtVal(value: number, unit: string) {
  if (unit === '%') return `${value.toFixed(1)}%`
  return `${Math.round(value).toLocaleString('sv-SE')} ${unit}`
}

function getLabel(light: string) {
  if (light === 'green') return 'Bra'
  if (light === 'yellow') return 'Bevaka'
  if (light === 'red') return 'Varning'
  return 'Info'
}

function renderAIText(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <Text key={i} style={styles.aiH2}>{line.replace('## ', '')}</Text>
    if (line.trim() === '') return <Text key={i} style={{ fontSize: 4 }}> </Text>
    const clean = line.replace(/\*\*/g, '')
    return <Text key={i} style={styles.aiBody}>{clean}</Text>
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

  const reportName = buildReportName(survey.brf_name || 'Okänd BRF', survey.survey_year, survey.version || 1)
  const aiAnalysis = aiData?.[0]?.analysis_text || ''
  const today = new Date().toLocaleDateString('sv-SE')

  const redCount = kpis.filter(k => k.traffic_light === 'red').length
  const yellowCount = kpis.filter(k => k.traffic_light === 'yellow').length
  const greenCount = kpis.filter(k => k.traffic_light === 'green').length

  const BENCH: Record<number, { p25: number; median: number; p75: number }> = {
    1: { p25: 620, median: 784, p75: 950 },
    2: { p25: 3200, median: 6135, p75: 11000 },
    3: { p25: 3, median: 6, p75: 12 },
    4: { p25: 80, median: 124, p75: 220 },
    5: { p25: 155, median: 203, p75: 270 },
    6: { p25: 480, median: 650, p75: 820 },
    7: { p25: 3500, median: 6957, p75: 12500 },
  }

  const doc = (
    <Document title={reportName} author="BRF-Ekonomikollen">
      {/* SIDA 1: Försättsblad */}
      <Page size="A4" style={styles.coverPage}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, color: '#60a5fa', marginBottom: 16, fontFamily: 'Helvetica-Bold' }}>BRF-EKONOMIKOLLEN</Text>
          <Text style={styles.coverTitle}>{reportName}</Text>
          <Text style={styles.coverSubtitle}>Ekonomisk hälsoanalys</Text>
          <Text style={styles.coverSubtitle}>Baserat på BFNAR 2023:1</Text>
          <View style={styles.coverBadge}>
            <Text style={styles.coverBadgeText}>Genererad {today}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: '#14532d', borderRadius: 8, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#4ade80' }}>{greenCount}</Text>
            <Text style={{ fontSize: 11, color: '#86efac' }}>Bra</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#713f12', borderRadius: 8, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#fbbf24' }}>{yellowCount}</Text>
            <Text style={{ fontSize: 11, color: '#fde68a' }}>Bevaka</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: '#7f1d1d', borderRadius: 8, padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: '#f87171' }}>{redCount}</Text>
            <Text style={{ fontSize: 11, color: '#fca5a5' }}>Varning</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>BRF-Ekonomikollen · Governance at Work AB</Text>
          <Text style={styles.footerText}>governanceatwork.io</Text>
        </View>
      </Page>

      {/* SIDA 2: KPI-detaljer */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>BRF-Ekonomi<Text style={styles.logoBlue}>kollen</Text></Text>
          <Text style={{ fontSize: 11, color: '#64748b' }}>{reportName}</Text>
        </View>
        <Text style={styles.sectionTitle}>De 7 obligatoriska nyckeltalen</Text>
        {kpis.map(kpi => {
          const color = TRAFFIC_COLORS[kpi.traffic_light as keyof typeof TRAFFIC_COLORS] || TRAFFIC_COLORS.neutral
          const bench = BENCH[kpi.kpi_number]
          return (
            <View key={kpi.kpi_number} style={styles.kpiCard}>
              <View style={styles.kpiRow}>
                <View style={[styles.kpiNumBadge, { backgroundColor: color + '33', borderWidth: 1, borderColor: color + '66' }]}>
                  <Text style={[styles.kpiNumText, { color }]}>{kpi.kpi_number}</Text>
                </View>
                <Text style={styles.kpiName}>{kpi.kpi_name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.kpiValue}>{fmtVal(Number(kpi.value), kpi.unit)}</Text>
                  <Text style={[styles.kpiStatus, { color }]}>{getLabel(kpi.traffic_light)}</Text>
                </View>
              </View>
              {bench && (
                <View style={styles.benchmarkRow}>
                  <View style={styles.benchmarkItem}>
                    <Text style={styles.benchmarkLabel}>25:e percentil</Text>
                    <Text style={styles.benchmarkValue}>{fmtVal(bench.p25, kpi.unit)}</Text>
                  </View>
                  <View style={styles.benchmarkItem}>
                    <Text style={styles.benchmarkLabel}>Median</Text>
                    <Text style={[styles.benchmarkValue, { color: '#e2e8f0' }]}>{fmtVal(bench.median, kpi.unit)}</Text>
                  </View>
                  <View style={styles.benchmarkItem}>
                    <Text style={styles.benchmarkLabel}>75:e percentil</Text>
                    <Text style={styles.benchmarkValue}>{fmtVal(bench.p75, kpi.unit)}</Text>
                  </View>
                  <View style={styles.benchmarkItem}>
                    <Text style={[styles.benchmarkLabel, { color }]}>Er BRF</Text>
                    <Text style={[styles.benchmarkValue, { color }]}>{fmtVal(Number(kpi.value), kpi.unit)}</Text>
                  </View>
                </View>
              )}
            </View>
          )
        })}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Källa: HSB, Riksbyggen, Nabo, Finansinspektionen 2024</Text>
          <Text style={styles.footerText}>{today}</Text>
        </View>
      </Page>

      {/* SIDA 3+: AI-analys */}
      {aiAnalysis ? (
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.logo}>BRF-Ekonomi<Text style={styles.logoBlue}>kollen</Text></Text>
            <Text style={{ fontSize: 11, color: '#64748b' }}>{reportName}</Text>
          </View>
          <Text style={styles.sectionTitle}>AI-analys och rekommendationer</Text>
          <View style={styles.aiSection}>
            <View style={styles.aiHeader}>
              <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>
              <View>
                <Text style={styles.aiTitle}>Analys</Text>
                <Text style={{ fontSize: 9, color: '#64748b' }}>Genererad av Claude · Baserad på era enkätsvar</Text>
              </View>
            </View>
            {renderAIText(aiAnalysis)}
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>AI-analysen är ett beslutsstöd och ersätter inte professionell ekonomisk rådgivning.</Text>
            <Text style={styles.footerText}>{today}</Text>
          </View>
        </Page>
      ) : null}
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  const filename = `${reportName.replace(/\s+/g, '_')}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
