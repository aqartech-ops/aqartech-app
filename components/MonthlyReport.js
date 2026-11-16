import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { dashboardApi } from '../services/api';
import { formatOMR } from '../services/money';
import { AGING_COLORS, monthlyReportHtml, monthLabel, overviewText, pctText, recentMonths } from '../services/monthlyReport';
import { useSession } from '../services/session';
import { printHtml, shareHtml } from '../services/receipt';
import { BarChart, Donut, Legend } from './Charts';
import { Money } from './Rial';
import { Badge, Button, Card, EmptyState, ErrorBox, Row, Sheet, Txt, errorText } from './ui';

// Monthly property report on the dashboard (التقرير الشهري للعقار): one building or all, one month.
// Same content and order as the Liwan monthly report, in our design. Every number is computed by the server
// from the books; a part only arrives when the user may see its section.

const GROUP_COLORS = ['#0F4D3F', '#A9864A', '#24609B', '#6B7A8F', '#8A6416'];

const amount = (baisa, lang) => formatOMR(baisa, lang, { withCurrency: false });

function useWide() {
  const { width } = useWindowDimensions();
  return { wide: width >= BREAKPOINTS.desktop, medium: width >= BREAKPOINTS.tablet };
}

function OptionSheet({ visible, title, options, value, onSelect, onClose }) {
  const { forwardIcon } = useI18n();
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={styles.list}>
        {options.map((o, i) => (
          <Pressable key={o.value || 'all'} onPress={() => onSelect(o.value)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
            <Row style={[styles.option, i > 0 && styles.divider]}>
              <Txt style={{ flex: 1 }} weight={o.value === value ? 'weightBold' : undefined}>{o.label}</Txt>
              {o.value === value ? <MaterialCommunityIcons name="check" size={18} color={COLORS.primaryDark} /> : <MaterialCommunityIcons name={forwardIcon} size={18} color={COLORS.textMuted} />}
            </Row>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export default function MonthlyReport({ onNavigate }) {
  const { t, lang, row } = useI18n();
  const { me } = useSession();
  const { wide, medium } = useWide();
  const months = useMemo(() => recentMonths(24), []);
  const [propertyId, setPropertyId] = useState('');
  const [month, setMonth] = useState(months[0]);
  const [data, setData] = useState(null);
  const [properties, setProperties] = useState([]); // kept while the next month / building loads
  const [error, setError] = useState(null);
  const [picking, setPicking] = useState(null); // 'property' | 'month'
  const [printing, setPrinting] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    dashboardApi
      .report({ propertyId: propertyId || undefined, month })
      .then((r) => {
        setData(r);
        setProperties(r.properties ?? []);
      })
      .catch(setError);
  }, [propertyId, month]);
  useEffect(load, [load]);

  const propertyName = propertyId ? (properties.find((p) => p.id === propertyId)?.name ?? '') : t('report.allProperties');

  const print = async (share) => {
    setPrinting(true);
    setError(null);
    try {
      // a building = its page; all buildings = one page each
      const pages = propertyId ? [data] : await dashboardApi.reportAll(month);
      const names = new Map(properties.map((p) => [p.id, p.name]));
      const html = monthlyReportHtml(pages.map((p) => ({ ...p, info: { ...p.info, name: p.info?.name ?? names.get(p.propertyId) } })), t, lang, me?.company?.name);
      await (share ? shareHtml(html, t('report.title')) : printHtml(html));
    } catch (e) {
      setError(e);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      {/* the emerald band: which report, the buttons, the four KPIs (Ivory & Emerald) */}
      <View style={styles.band}>
        <View style={[styles.bandHead, { flexDirection: medium ? row : 'column' }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt size="small" style={{ color: COLORS.bandMuted }}>{t('report.title')}</Txt>
            <Txt display weight="weightBold" style={{ color: COLORS.bandText, fontSize: medium ? 30 : 22, lineHeight: medium ? 44 : 34 }}>
              {`${propertyName} — ${monthLabel(month, t)}`}
            </Txt>
            {data ? <Txt size="small" style={{ color: COLORS.bandMuted }}>{bandLine(data, t)}</Txt> : null}
          </View>
          <Row style={{ flexWrap: 'wrap', alignSelf: medium ? 'flex-end' : 'stretch' }}>
            <Button id="dashboard.pickProperty" variant="onBand" small={!medium} icon="home-city-outline" title={propertyName} onPress={() => setPicking('property')} />
            <Button id="dashboard.pickMonth" variant="onBand" small={!medium} icon="calendar-month-outline" title={monthLabel(month, t) + (month === months[0] ? ` · ${t('report.live')}` : '')} onPress={() => setPicking('month')} />
            <Button id="dashboard.printReport" variant="onBand" small={!medium} icon="printer-outline" title={t('report.print')} loading={printing} disabled={!data} onPress={() => print(false)} />
            <Button id="dashboard.shareReport" variant="accent" small={!medium} icon="file-pdf-box" title={t('report.pdf')} disabled={!data || printing} onPress={() => print(true)} />
          </Row>
        </View>
        {data ? <BandKpis k={data.kpis ?? {}} medium={medium} /> : !error ? <ActivityIndicator color={COLORS.accentSoft} style={{ paddingVertical: SPACING.xl }} /> : null}
      </View>

      <ErrorBox error={error} onRetry={load} />
      {data ? <ReportBody data={data} wide={wide} medium={medium} onNavigate={onNavigate} /> : null}

      <OptionSheet
        visible={picking === 'property'}
        title={t('report.property')}
        value={propertyId}
        options={[{ value: '', label: t('report.allProperties') }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
        onSelect={(v) => {
          setPicking(null);
          setPropertyId(v);
        }}
        onClose={() => setPicking(null)}
      />
      <OptionSheet
        visible={picking === 'month'}
        title={t('report.month')}
        value={month}
        options={months.map((m, i) => ({ value: m, label: monthLabel(m, t) + (i === 0 ? ` · ${t('report.live')}` : '') }))}
        onSelect={(v) => {
          setPicking(null);
          setMonth(v);
        }}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------- the report

function ReportBody({ data, wide, medium, onNavigate }) {
  const { t, lang, row } = useI18n();
  const info = data.info ?? {};
  const k = data.kpis ?? {};
  const hasAnything = k.occupancy || k.collectionRate || data.financial || data.workOrders;
  void wide;
  if (!hasAnything) {
    return (
      <Card>
        <EmptyState icon="chart-box-outline" body={t('report.nothingToShow')} />
      </Card>
    );
  }
  const columns = wide ? 3 : medium ? 2 : 1;
  const name = info.name ?? t('report.allPropertiesCount', { count: info.count ?? 0 });

  return (
    <View style={{ gap: SPACING.md }}>
      <Alerts alerts={data.alerts} onNavigate={onNavigate} />

      <Txt muted size="small">{t(data.current ? 'report.compareLive' : 'report.compare')}</Txt>

      <Overview data={data} name={name} />

      {/* three tables */}
      {data.financial || data.cashFlow || data.ownerStatement ? (
        <Columns columns={columns}>
          {data.financial ? <FinancialTable f={data.financial} /> : null}
          {data.cashFlow ? <CashFlowTable c={data.cashFlow} /> : null}
          {data.ownerStatement ? <OwnerTable o={data.ownerStatement} /> : data.financial && info.ownership === 'OWNED' ? <OwnedNote /> : null}
        </Columns>
      ) : null}

      {/* three charts */}
      {data.receivables || data.aging || data.maintenance || data.workOrders ? (
        <Columns columns={columns}>
          {data.receivables ? <ReceivablesChart r={data.receivables} /> : null}
          {data.aging ? <AgingChart a={data.aging} /> : null}
          {data.maintenance || data.workOrders ? <MaintenanceChart m={data.maintenance} w={data.workOrders} /> : null}
        </Columns>
      ) : null}
    </View>
  );
}

function Columns({ columns, children }) {
  const { row } = useI18n();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', marginHorizontal: -SPACING.sm }}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / Math.min(columns, Math.max(1, items.length))}%`, padding: SPACING.sm }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** The line under the band's title: owner · address · floors and units. */
function bandLine(data, t) {
  const info = data.info ?? {};
  return [
    info.owners?.length ? `${t('report.ownerLabel')} ${info.owners.join('، ')}` : null,
    info.address,
    info.floors ? `${t('report.floorsLabel')} ${info.floors}` : null,
    t('report.unitsCount', { count: info.units?.total ?? 0 }),
    t(data.current ? 'report.liveNote' : 'report.closedNote'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function BandKpis({ k, medium }) {
  const { t, lang, row } = useI18n();
  const cards = [
    k.occupancy && { key: 'occ', label: t('report.kpi.occupancy'), value: pctText(k.occupancy.value), change: k.occupancy.change, unit: 'pts', color: COLORS.bandText },
    k.collectionRate && { key: 'col', label: t('report.kpi.collection'), value: pctText(k.collectionRate.value), change: k.collectionRate.change, unit: 'pts', color: COLORS.bandText },
    k.noi && { key: 'noi', label: t('report.kpi.noi'), value: amount(k.noi.value, lang), change: k.noi.change, unit: 'money', color: k.noi.value < 0 ? BAND_BAD : COLORS.accentSoft },
    k.arrears && { key: 'arr', label: t('report.kpi.arrears'), value: amount(k.arrears.value, lang), change: k.arrears.change, unit: 'money', color: BAND_BAD, lowerIsBetter: true },
  ].filter(Boolean);
  if (!cards.length) return null;
  return (
    <View style={[styles.kpiGrid, { flexDirection: row }]}>
      {cards.map((c) => (
        <View key={c.key} style={[styles.kpi, { flexBasis: medium ? 200 : '45%' }]}>
          <Txt size="small" style={{ color: COLORS.bandMuted }}>{c.label}</Txt>
          <Txt display weight="weightBold" style={{ color: c.color, fontSize: medium ? 32 : 22, lineHeight: medium ? 46 : 34 }} numberOfLines={1} adjustsFontSizeToFit>
            {c.value}
          </Txt>
          <Change change={c.change} unit={c.unit} lowerIsBetter={c.lowerIsBetter} />
        </View>
      ))}
    </View>
  );
}

const BAND_GOOD = '#B9E2C8';
const BAND_BAD = '#F2B8AE';

function Change({ change, unit, lowerIsBetter }) {
  const { t, lang, row } = useI18n();
  if (change === null || change === undefined) return <Txt size="small" style={{ color: COLORS.bandMuted }}> </Txt>;
  const abs = Math.abs(change);
  const sign = change > 0 ? '+' : change < 0 ? '−' : '';
  const text = change === 0 ? t('report.noChange') : t(unit === 'pts' ? 'report.changePts' : 'report.changeMoney', { value: `${sign}${unit === 'pts' ? abs : amount(abs, lang)}` });
  const good = lowerIsBetter ? change < 0 : change > 0;
  const tone = change === 0 ? COLORS.bandMuted : good ? BAND_GOOD : BAND_BAD;
  return (
    <View style={{ flexDirection: row, alignItems: 'center', gap: 4 }}>
      {change !== 0 ? <MaterialCommunityIcons name={change > 0 ? 'arrow-up' : 'arrow-down'} size={13} color={tone} /> : null}
      <Txt size="small" style={{ color: tone }}>{text}</Txt>
    </View>
  );
}

function Alerts({ alerts, onNavigate }) {
  const { t, lang, row } = useI18n();
  if (!alerts) return null;
  const chips = [];
  for (const l of alerts.leaseExpiry ?? []) {
    chips.push({ key: `l${l.leaseId}`, tone: 'warning', text: t('report.alerts.lease', { unit: l.unit, days: l.daysLeft }), go: () => onNavigate?.('tenants', { leaseId: l.leaseId }) });
  }
  for (const a of alerts.arrears90 ?? []) {
    chips.push({ key: `a${a.tenantId}`, tone: 'danger', text: t('report.alerts.arrears', { name: a.name, amount: amount(a.amount, lang) }), go: () => onNavigate?.('tenants', { tenantId: a.tenantId }) });
  }
  for (const c of alerts.cheques ?? []) {
    chips.push({
      key: `c${c.chequeId}`,
      tone: 'danger',
      text: t(c.days < 0 ? 'report.alerts.chequeLate' : 'report.alerts.cheque', { unit: c.unit, number: c.number, days: Math.abs(c.days), amount: amount(c.amount, lang), bank: c.bank }),
      go: () => onNavigate?.('financials', { chequeId: c.chequeId }),
    });
  }
  if (!chips.length) return null;
  return (
    <View style={[styles.chips, { flexDirection: row }]}>
      {chips.map((c) => (
        <Pressable key={c.key} onPress={c.go} accessibilityRole="link" style={({ hovered }) => [styles.chip, c.tone === 'warning' ? styles.chipWarn : styles.chipDanger, hovered && { opacity: 0.85 }]}>
          <Txt size="small" weight="weightMedium" style={{ color: c.tone === 'warning' ? COLORS.warning : COLORS.danger }}>{c.text}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

function Overview({ data, name }) {
  const { t, lang } = useI18n();
  const text = overviewText(data, name, t, lang);
  if (!text) return null;
  return (
    <Card style={{ gap: SPACING.sm, padding: SPACING.xl }}>
      <Txt display weight="weightBold" size="medium" style={{ color: COLORS.primary }}>{t('report.overviewTitle', { name })}</Txt>
      <Txt style={{ lineHeight: 26 }}>{text}</Txt>
    </Card>
  );
}

// ---------------------------------------------------------------- tables

function Table({ title, rows }) {
  const { lang, row, align } = useI18n();
  const end = align === 'right' ? 'left' : 'right'; // amounts line up at the far edge
  return (
    <Card style={styles.tableCard}>
      <Txt display weight="weightBold" size={18} style={{ color: COLORS.primary, marginBottom: SPACING.xs }}>{title}</Txt>
      {rows.filter(Boolean).map((r) => (
        <View key={r.label} style={[r.total ? styles.totalRow : styles.tr, { flexDirection: row }]}>
          <View style={{ flex: 1 }}>
            <Txt weight={r.total ? 'weightBold' : undefined} style={r.total ? { color: COLORS.primary } : r.value < 0 ? { color: COLORS.danger } : null}>{r.label}</Txt>
            {r.hint ? <Txt muted size="small">{r.hint}</Txt> : null}
          </View>
          <Txt weight={r.total ? 'weightBold' : 'weightMedium'} style={[styles.amountCol, { textAlign: end, color: r.total ? COLORS.primary : r.value < 0 ? COLORS.danger : COLORS.textDark }]}>
            {r.value === null || r.value === undefined ? '—' : amount(r.value, lang)}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

function FinancialTable({ f }) {
  const { t } = useI18n();
  return (
    <Table
      title={t('report.financialTitle')}
      rows={[
        { label: t('report.fin.rent'), value: f.rentIncome },
        { label: t('report.fin.other'), value: f.otherIncome },
        { label: t('report.fin.totalIncome'), value: f.totalIncome },
        { label: t('report.fin.maintenanceUtilities'), value: f.groups.maintenanceUtilities },
        { label: t('report.fin.staff'), value: f.groups.staff },
        { label: t('report.fin.administration'), value: f.groups.administration },
        { label: t('report.fin.noi'), value: f.noi, total: true },
      ]}
    />
  );
}

function CashFlowTable({ c }) {
  const { t } = useI18n();
  return (
    <Table
      title={t('report.cashTitle')}
      rows={[
        { label: t('report.cash.opening'), value: c.opening },
        { label: t('report.cash.cashRent'), value: c.cashRent },
        { label: t('report.cash.cheques'), value: c.chequesDeposited },
        { label: t('report.cash.other'), value: c.otherIn },
        { label: t('report.cash.payments'), value: -c.paymentsMade },
        { label: t('report.cash.remitted'), value: -c.remitted },
        { label: t('report.cash.closing'), value: c.closing, total: true },
        { label: t('report.cash.totalRent'), value: c.totalRentCollected },
      ]}
    />
  );
}

function OwnerTable({ o }) {
  const { t } = useI18n();
  if (!o.available) {
    return (
      <Card style={styles.tableCard}>
        <Txt display weight="weightBold" size={18} style={{ color: COLORS.primary }}>{t('report.ownerTitle')}</Txt>
        <Txt muted>{errorText(t, { code: o.reason })}</Txt>
      </Card>
    );
  }
  return (
    <Table
      title={t('report.ownerTitle')}
      rows={[
        { label: t('report.owner.collected'), value: o.rentCollected, hint: t('report.owner.collectedHint') },
        { label: t('report.owner.expenses'), value: -o.ownerExpenses },
        { label: t('report.owner.fee'), value: -o.managementFee },
        { label: t('report.owner.net'), value: o.net, total: true },
        { label: t('report.owner.remitted'), value: -o.remitted, hint: o.statement ? t('report.owner.statement', { number: o.statement.number }) : null },
        { label: t('report.owner.balance'), value: o.balance, total: true },
      ]}
    />
  );
}

function OwnedNote() {
  const { t } = useI18n();
  return (
    <Card style={styles.tableCard}>
      <Txt display weight="weightBold" size={18} style={{ color: COLORS.primary }}>{t('report.ownerTitle')}</Txt>
      <Txt muted>{t('report.ownedNote')}</Txt>
    </Card>
  );
}

// ---------------------------------------------------------------- charts

function ChartCard({ icon, title, total, children }) {
  const { lang } = useI18n();
  return (
    <Card style={[styles.tableCard, { gap: SPACING.md, minHeight: 320 }]}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Row>
          <MaterialCommunityIcons name={icon} size={20} color={COLORS.accent} />
          <Txt display weight="weightBold" size={18} style={{ color: COLORS.primary }}>{title}</Txt>
        </Row>
        {total !== undefined ? <Badge label={`${amount(total, lang)}`} tone="neutral" /> : null}
      </Row>
      {children}
    </Card>
  );
}

function ReceivablesChart({ r }) {
  const { t, lang } = useI18n();
  return (
    <ChartCard icon="file-document-outline" title={t('report.receivablesTitle')} total={r.total}>
      <BarChart
        format={(v) => amount(v, lang)}
        bars={[
          { key: 'collected', label: t('report.collectedMonth'), value: r.collected, color: COLORS.primary },
          { key: 'arrears', label: t('report.arrearsTotal'), value: r.arrears, color: COLORS.accent },
        ]}
      />
    </ChartCard>
  );
}

function AgingChart({ a }) {
  const { t, lang } = useI18n();
  const items = ['0_30', '31_60', '61_90', '90_plus'].map((b) => ({ key: b, label: t(`report.aging.${b}`), value: a.buckets[b] ?? 0, color: AGING_COLORS[b] }));
  return (
    <ChartCard icon="calendar-clock" title={t('report.agingTitle')} total={a.total}>
      <Donut slices={items} center={<Money baisa={a.total} size={FONT.small} weight="weightBold" />} />
      <Legend items={items} format={(v) => amount(v, lang)} />
    </ChartCard>
  );
}

function MaintenanceChart({ m, w }) {
  const { t, lang } = useI18n();
  const bars = (m?.byCategory ?? []).slice(0, 5).map((c, i) => ({ key: c.categoryId, label: lang === 'ar' ? c.nameAr : c.nameEn, value: c.amount, color: GROUP_COLORS[i % GROUP_COLORS.length] }));
  return (
    <ChartCard icon="cog-outline" title={t('report.maintenanceTitle')} total={m ? m.total : undefined}>
      {m ? bars.length ? <BarChart bars={bars} format={(v) => amount(v, lang)} /> : <EmptyState icon="wrench-outline" body={t('report.noMaintenance')} /> : null}
      {w ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge label={t('report.wo.opened', { count: w.opened })} />
          <Badge label={t('report.wo.done', { count: w.done })} tone="success" />
          <Badge label={t('report.wo.open', { count: w.open })} tone={w.open ? 'warning' : 'neutral'} />
        </Row>
      ) : null}
    </ChartCard>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  option: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  // the emerald band
  band: { backgroundColor: COLORS.band, borderRadius: RADIUS.lg, padding: SPACING.xl, gap: SPACING.xl },
  bandHead: { gap: SPACING.lg, alignItems: 'stretch' },
  kpiGrid: { flexWrap: 'wrap', gap: SPACING.md },
  kpi: { flexGrow: 1, gap: 6, padding: SPACING.lg + 2, borderRadius: RADIUS.lg, backgroundColor: COLORS.bandCard, borderWidth: 1, borderColor: COLORS.bandBorder },
  // alerts
  chips: { flexWrap: 'wrap', gap: SPACING.sm },
  chip: { paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm, borderRadius: RADIUS.pill },
  chipWarn: { backgroundColor: COLORS.warningSoft },
  chipDanger: { backgroundColor: COLORS.dangerSoft },
  // tables
  tableCard: { gap: 2, padding: SPACING.xl },
  tr: { paddingVertical: SPACING.md - 1, alignItems: 'center', gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, borderStyle: 'dashed' },
  totalRow: { marginTop: SPACING.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md + 2, alignItems: 'center', gap: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft },
  amountCol: { minWidth: 96, fontVariant: ['tabular-nums'] },
});
