import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi, propertiesApi } from '../services/api';
import { printHtml, shareHtml } from '../services/receipt';
import { incomeReportHtml, propertiesReportHtml } from '../services/reportsHtml';
import { Money } from '../components/Rial';
import { DateField, formatDate, isDateText, today } from '../components/Fields';
import { Button, Card, ChipSelect, EmptyState, ErrorBox, Loading, Row, Segmented, Txt } from '../components/ui';
import ExportButton from '../components/ExportButton';
import { day, omr } from '../services/exportCsv';

// Reports (التقارير): income statement and property comparison — computed by the server from the ledger.

const iso = (d) => d.toISOString().slice(0, 10);
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`);

function periods() {
  const now = new Date(`${today()}T00:00:00Z`);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    thisMonth: { from: iso(new Date(Date.UTC(y, m, 1))), to: today() },
    lastMonth: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    ytd: { from: `${y}-01-01`, to: today() },
    lastYear: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  };
}

export function ReportsTab() {
  const { t } = useI18n();
  const [view, setView] = useState('income');
  return (
    <View style={{ gap: SPACING.md }}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'income', label: t('reports.tabs.income') },
          { value: 'properties', label: t('reports.tabs.properties') },
        ]}
      />
      {view === 'income' ? <IncomeReport /> : <PropertiesReport />}
    </View>
  );
}

// ================================================================ income statement

function IncomeReport() {
  const { t, lang } = useI18n();
  const { me } = useSession();
  const quick = periods();
  const [range, setRange] = useState(quick.ytd);
  const [propertyId, setPropertyId] = useState('');
  const [properties, setProperties] = useState([]);
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    propertiesApi.list().then((list) => setProperties(list.map((p) => ({ id: p.id, name: p.name })))).catch(() => setProperties([]));
  }, []);

  useEffect(() => {
    if (!isDateText(range.from) || !isDateText(range.to)) return undefined;
    let alive = true;
    setR(null);
    setError(null);
    const timer = setTimeout(() => {
      financeApi
        .incomeReport({ ...range, ...(propertyId ? { propertyId } : {}) })
        .then((x) => alive && setR(x))
        .catch((e) => alive && setError(e));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [range.from, range.to, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const propertyName = properties.find((p) => p.id === propertyId)?.name;
  const html = () => incomeReportHtml(r, t, lang, { company: me?.company?.name, propertyName });
  const run = (fn) => fn().catch(setError);

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect
        value={Object.keys(quick).find((k) => quick[k].from === range.from && quick[k].to === range.to) ?? null}
        onChange={(k) => setRange(quick[k])}
        options={Object.keys(quick).map((k) => ({ value: k, label: t(`reports.periods.${k}`) }))}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('ownerStatements.from')} value={range.from} onChangeText={(v) => setRange((x) => ({ ...x, from: v }))} hint=" " />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('ownerStatements.to')} value={range.to} onChangeText={(v) => setRange((x) => ({ ...x, to: v }))} hint=" " />
        </View>
      </Row>
      {properties.length > 1 ? (
        <ChipSelect
          value={propertyId}
          onChange={setPropertyId}
          options={[{ value: '', label: t('reports.allProperties') }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
        />
      ) : null}
      <ErrorBox error={error} />
      {!r && !error ? <Loading /> : null}
      {r ? (
        <>
          <Card style={{ gap: SPACING.sm }}>
            <Txt weight="weightBold">{t('reports.incomeTitle')}</Txt>
            <Txt muted size="small">{`${formatDate(r.from, lang)} → ${formatDate(r.to, lang)} · ${propertyName ?? t('reports.allProperties')}`}</Txt>
            <Line label={t('reports.rentIncome')} amount={r.rentIncome} />
            <Line label={t('reports.otherIncome')} amount={r.otherIncome} />
            <Line label={t('reports.operatingIncome')} amount={r.operatingIncome} strong />
            <Line label={`− ${t('reports.expenses')}`} amount={r.expenses} />
            <Line label={`${t('reports.noi')} · ${pctText(r.noiMargin)}`} amount={r.noi} strong color={r.noi < 0 ? COLORS.danger : COLORS.success} />
            {r.managementFees || r.ownerShare ? (
              <>
                <Line label={t('reports.managementFees')} amount={r.managementFees} />
                <Line label={`− ${t('reports.ownerShare')}`} amount={r.ownerShare} />
                <Line label={t('reports.companyProfit')} amount={r.companyProfit} strong />
                <Txt muted size="small">{t('reports.ownerShareHint')}</Txt>
              </>
            ) : null}
          </Card>

          <MonthlyChart months={r.monthly} />

          <Card style={{ gap: SPACING.sm }}>
            <Txt weight="weightBold">{t('reports.expensesByCategory')}</Txt>
            {r.expensesByCategory.length === 0 ? (
              <Txt muted>{t('reports.noExpenses')}</Txt>
            ) : (
              r.expensesByCategory.map((c, i) => (
                <Line key={c.category?.id ?? i} label={c.category ? (lang === 'ar' ? c.category.nameAr : c.category.nameEn) : '—'} amount={c.amount} share={r.expenses ? c.amount / r.expenses : 0} />
              ))
            )}
          </Card>

          <Row style={{ flexWrap: 'wrap' }}>
            <ExportButton
              small={false}
              filename="income-statement"
              build={() => [
                [t('reports.incomeTitle'), `${day(r.from)} → ${day(r.to)}`],
                [t('reports.rentIncome'), omr(r.rentIncome)],
                [t('reports.otherIncome'), omr(r.otherIncome)],
                [t('reports.operatingIncome'), omr(r.operatingIncome)],
                [t('reports.expenses'), omr(r.expenses)],
                [t('reports.noi'), omr(r.noi)],
                [t('reports.managementFees'), omr(r.managementFees)],
                [t('reports.ownerShare'), omr(r.ownerShare)],
                [t('reports.companyProfit'), omr(r.companyProfit)],
                [],
                [t('reports.month'), t('reports.operatingIncome'), t('reports.expenses'), t('reports.noi')],
                ...r.monthly.map((m) => [m.month, omr(m.income), omr(m.expenses), omr(m.noi)]),
                [],
                [t('reports.expensesByCategory')],
                ...r.expensesByCategory.map((c) => [c.category ? (lang === 'ar' ? c.category.nameAr : c.category.nameEn) : '', omr(c.amount)]),
              ]}
            />
            <Button variant="secondary" icon="printer-outline" title={t('receipt.print')} onPress={() => run(() => printHtml(html()))} />
            <Button icon="share-variant-outline" title={t('receipt.share')} onPress={() => run(() => shareHtml(html(), t('reports.incomeTitle')))} />
          </Row>
        </>
      ) : null}
    </View>
  );
}

function Line({ label, amount, strong, color, share }) {
  return (
    <View style={[strong && styles.strong]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight={strong ? 'weightBold' : undefined} muted={!strong} style={{ flex: 1 }}>{label}</Txt>
        <Money baisa={amount} weight={strong ? 'weightBold' : 'weightMedium'} size={strong ? FONT.medium : FONT.body} color={color} />
      </Row>
      {share ? (
        <View style={styles.shareTrack}>
          <View style={[styles.shareBar, { width: `${Math.max(2, Math.round(share * 100))}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

/** Income vs expenses per month — two bars per month, scaled to the largest value. */
function MonthlyChart({ months }) {
  const { t, row } = useI18n();
  if (!months.length) return null;
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expenses)));
  return (
    <Card style={{ gap: SPACING.sm }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{t('reports.monthly')}</Txt>
        <Row gap={SPACING.md}>
          <Row gap={4}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <Txt muted size="small">{t('reports.operatingIncome')}</Txt>
          </Row>
          <Row gap={4}>
            <View style={[styles.dot, { backgroundColor: COLORS.danger }]} />
            <Txt muted size="small">{t('reports.expenses')}</Txt>
          </Row>
        </Row>
      </Row>
      <View style={[styles.chart, { flexDirection: row }]}>
        {months.map((m) => (
          <View key={m.month} style={styles.monthCol}>
            <View style={styles.bars}>
              <View style={[styles.bar, { height: `${(m.income / max) * 100}%`, backgroundColor: COLORS.success }]} />
              <View style={[styles.bar, { height: `${(m.expenses / max) * 100}%`, backgroundColor: COLORS.danger }]} />
            </View>
            <Txt muted size="small" style={{ textAlign: 'center', fontSize: 10 }}>{m.month.slice(5)}</Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ================================================================ property comparison

function PropertiesReport() {
  const { t, lang, row } = useI18n();
  const { me } = useSession();
  const thisYear = new Date(`${today()}T00:00:00Z`).getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setR(null);
    setError(null);
    financeApi.propertiesReport(year).then(setR).catch(setError);
  }, [year]);

  const html = () => propertiesReportHtml(r, t, lang, { company: me?.company?.name });
  const run = (fn) => fn().catch(setError);

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect value={year} onChange={setYear} options={[thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: y, label: String(y) }))} />
      <ErrorBox error={error} />
      {!r && !error ? <Loading /> : null}
      {r ? (
        r.properties.length === 0 ? (
          <Card>
            <EmptyState icon="office-building-outline" body={t('properties.empty')} />
          </Card>
        ) : (
          <>
            {r.partialYear ? <Txt muted size="small">{t('reports.partialYear', { date: formatDate(r.to, lang) })}</Txt> : null}
            <Card style={{ gap: SPACING.xs }}>
              <Txt weight="weightBold">{t('finance.total')}</Txt>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt muted>{t('reports.operatingIncome')}</Txt>
                <Money baisa={r.totals.rentIncome + r.totals.otherIncome} weight="weightMedium" />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt muted>{t('reports.expenses')}</Txt>
                <Money baisa={r.totals.expenses} weight="weightMedium" />
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt weight="weightBold">{`${t('reports.noi')} · ${pctText(r.totals.noiMargin)}`}</Txt>
                <Money baisa={r.totals.noi} weight="weightBold" color={r.totals.noi < 0 ? COLORS.danger : COLORS.success} />
              </Row>
            </Card>
            {r.properties.map((p) => (
              <Card key={p.id} style={{ gap: SPACING.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="weightBold">{p.name}</Txt>
                    <Txt muted size="small">{`${t(`properties.ownershipValues.${p.ownership}`)} · ${t('reports.unitsCount', { count: p.units })}`}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt muted size="small">{t('reports.noi')}</Txt>
                    <Money baisa={p.noi} weight="weightBold" color={p.noi < 0 ? COLORS.danger : COLORS.success} />
                  </View>
                </Row>
                <View style={[styles.kpis, { flexDirection: row }]}>
                  <Kpi label={t('reports.operatingIncome')} money={p.rentIncome + p.otherIncome} />
                  <Kpi label={t('reports.expenses')} money={p.expenses} />
                  <Kpi label={t('reports.noiMargin')} value={pctText(p.noiMargin)} />
                  <Kpi label={t('reports.capRate')} value={pctText(p.capRate)} />
                  <Kpi label={t('reports.roi')} value={pctText(p.roi)} />
                  <Kpi label={t('reports.occupancy')} value={pctText(p.occupancy)} />
                  <Kpi label={t('reports.collectionRate')} value={pctText(p.collectionRate)} />
                  <Kpi label={t('reports.avgVacantDays')} value={p.avgVacantDays === null ? '—' : String(p.avgVacantDays)} />
                  <Kpi label={t('reports.renewalRate')} value={p.leasesEnded ? `${pctText(p.renewalRate)} (${p.leasesEnded})` : '—'} />
                  <Kpi label={t('reports.maintenancePerUnit')} money={p.maintenancePerUnit} />
                  <Kpi label={t('reports.openWorkOrders')} value={String(p.openWorkOrders)} />
                </View>
                {p.capRate === null || p.roi === null ? <Txt muted size="small">{t('reports.missingValue')}</Txt> : null}
              </Card>
            ))}
            <Txt muted size="small">{t('reports.formulas')}</Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              <ExportButton
                small={false}
                filename={`property-comparison-${r.year}`}
                build={() => [
                  [t('reports.property'), t('reports.units'), t('reports.rentIncome'), t('reports.otherIncome'), t('reports.expenses'), t('reports.noi'), t('reports.noiMargin'), t('reports.capRate'), t('reports.roi'), t('reports.occupancy'), t('reports.collectionRate'), t('reports.avgVacantDays'), t('reports.renewalRate'), t('reports.maintenancePerUnit'), t('reports.openWorkOrders')],
                  ...r.properties.map((p) => [p.name, p.units, omr(p.rentIncome), omr(p.otherIncome), omr(p.expenses), omr(p.noi), p.noiMargin, p.capRate, p.roi, p.occupancy, p.collectionRate, p.avgVacantDays, p.renewalRate, omr(p.maintenancePerUnit), p.openWorkOrders]),
                ]}
              />
              <Button variant="secondary" icon="printer-outline" title={t('receipt.print')} onPress={() => run(() => printHtml(html()))} />
              <Button icon="share-variant-outline" title={t('receipt.share')} onPress={() => run(() => shareHtml(html(), t('reports.propertiesTitle')))} />
            </Row>
          </>
        )
      ) : null}
    </View>
  );
}

function Kpi({ label, value, money }) {
  return (
    <View style={styles.kpi}>
      <Txt muted size="small">{label}</Txt>
      {money !== undefined ? money === null ? <Txt weight="weightBold">—</Txt> : <Money baisa={money} size={13} weight="weightBold" /> : <Txt weight="weightBold">{value}</Txt>}
    </View>
  );
}

const styles = StyleSheet.create({
  strong: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.xs },
  shareTrack: { height: 4, backgroundColor: COLORS.surfaceSoft, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  shareBar: { height: 4, backgroundColor: COLORS.primary, borderRadius: 2 },
  chart: { height: 140, alignItems: 'flex-end', gap: 4 },
  monthCol: { flex: 1, height: '100%', justifyContent: 'flex-end', gap: 4 },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  bar: { width: '40%', maxWidth: 14, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  kpis: { flexWrap: 'wrap', gap: SPACING.sm },
  kpi: { flexGrow: 1, flexBasis: 130, backgroundColor: COLORS.surfaceSoft, borderRadius: RADIUS.md, padding: SPACING.sm, gap: 2 },
});
