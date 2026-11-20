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
// Same content as the Liwan monthly report, in our corporate layout (المؤسسية): a title row with the period and
// the buttons, four white KPI cards, then the tables beside a side column (alerts, quick actions, owner account).
// Every number is computed by the server from the books; a part only arrives when the user may see its section.

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

/** `aside` = extra cards for the side column (the dashboard's quick actions). */
export default function MonthlyReport({ onNavigate, aside }) {
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

  const prevMonth = months[1];
  const otherMonth = month !== months[0] && month !== prevMonth;

  return (
    <View style={{ gap: SPACING.lg }}>
      {/* title row: which report · period · property · print / PDF */}
      <View style={[styles.head, { flexDirection: wide ? row : 'column' }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size="small" weight="weightMedium" style={{ color: COLORS.overline }}>{t('report.title')}</Txt>
          <Txt display weight="weightMedium" style={{ color: COLORS.textDark, fontSize: medium ? 26 : 20, lineHeight: medium ? 40 : 32 }}>
            {`${propertyName} — ${monthLabel(month, t)}`}
          </Txt>
          {data ? <Txt muted size="small">{bandLine(data, t)}</Txt> : null}
        </View>
        <View style={[styles.tools, { flexDirection: row }]}>
          <View style={[styles.segment, { flexDirection: row }]} accessibilityRole="radiogroup">
            {[
              { value: months[0], label: t('report.thisMonth') },
              { value: prevMonth, label: t('report.prevMonth') },
            ].map((o) => {
              const on = month === o.value;
              return (
                <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setMonth(o.value)} style={[styles.segmentItem, on && styles.segmentOn]}>
                  <Txt size="small" weight={on ? 'weightMedium' : undefined} style={{ color: on ? COLORS.textDark : COLORS.textMuted }}>{o.label}</Txt>
                </Pressable>
              );
            })}
          </View>
          <Button id="dashboard.pickMonth" variant="secondary" small icon="calendar-month-outline" title={otherMonth ? monthLabel(month, t) : t('report.otherMonth')} onPress={() => setPicking('month')} />
          <Button id="dashboard.pickProperty" variant="secondary" small icon="home-city-outline" title={propertyName} onPress={() => setPicking('property')} />
          <Button id="dashboard.printReport" variant="ghost" small icon="printer-outline" title={t('report.print')} loading={printing} disabled={!data} onPress={() => print(false)} />
          <Button id="dashboard.shareReport" variant="secondary" small icon="file-pdf-box" title={t('report.pdf')} disabled={!data || printing} onPress={() => print(true)} />
        </View>
      </View>

      {data ? <KpiCards k={data.kpis ?? {}} medium={medium} /> : !error ? <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: SPACING.xl }} /> : null}

      <ErrorBox error={error} onRetry={load} />
      {data ? <ReportBody data={data} wide={wide} medium={medium} onNavigate={onNavigate} aside={aside} /> : null}

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

function ReportBody({ data, wide, medium, onNavigate, aside }) {
  const { t, row } = useI18n();
  const info = data.info ?? {};
  const k = data.kpis ?? {};
  const hasAnything = k.occupancy || k.collectionRate || data.financial || data.workOrders;
  const name = info.name ?? t('report.allPropertiesCount', { count: info.count ?? 0 });
  const alerts = <Alerts alerts={data.alerts} onNavigate={onNavigate} />;
  const owner = data.ownerStatement ? <OwnerTable o={data.ownerStatement} /> : data.financial && info.ownership === 'OWNED' ? <OwnedNote /> : null;
  const money = data.financial || data.cashFlow ? (
    <Card style={styles.tableCard}>
      <View style={{ flexDirection: medium ? row : 'column', gap: medium ? SPACING.xxl : SPACING.xl }}>
        {data.financial ? <View style={{ flex: 1 }}><FinancialTable f={data.financial} /></View> : null}
        {data.cashFlow ? <View style={{ flex: 1 }}><CashFlowTable c={data.cashFlow} /></View> : null}
      </View>
    </Card>
  ) : null;
  const charts =
    data.receivables || data.aging || data.maintenance || data.workOrders ? (
      <Columns columns={wide ? 3 : medium ? 2 : 1}>
        {data.receivables ? <ReceivablesChart r={data.receivables} /> : null}
        {data.aging ? <AgingChart a={data.aging} /> : null}
        {data.maintenance || data.workOrders ? <MaintenanceChart m={data.maintenance} w={data.workOrders} /> : null}
      </Columns>
    ) : null;
  const note = <Txt muted size="small">{t(data.current ? 'report.compareLive' : 'report.compare')}</Txt>;

  if (!hasAnything) {
    return (
      <View style={{ gap: SPACING.lg }}>
        <Card>
          <EmptyState icon="chart-box-outline" body={t('report.nothingToShow')} />
        </Card>
        {aside}
      </View>
    );
  }

  // wide screens: the money tables (two thirds) beside a side column; narrower: one column, alerts first
  if (wide) {
    return (
      <View style={{ gap: SPACING.lg }}>
        <View style={{ flexDirection: row, gap: SPACING.lg, alignItems: 'flex-start' }}>
          <View style={{ flex: 2, gap: SPACING.lg }}>
            {money}
            <Overview data={data} name={name} />
          </View>
          <View style={{ flex: 1, gap: SPACING.lg }}>
            {alerts}
            {aside}
            {owner}
          </View>
        </View>
        {charts}
        {note}
      </View>
    );
  }
  return (
    <View style={{ gap: SPACING.lg }}>
      {alerts}
      {aside}
      {money}
      {owner}
      <Overview data={data} name={name} />
      {charts}
      {note}
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

function KpiCards({ k, medium }) {
  const { t, lang, row } = useI18n();
  const cards = [
    k.occupancy && { key: 'occ', label: t('report.kpi.occupancy'), value: pctText(k.occupancy.value), ratio: k.occupancy.value, change: k.occupancy.change, unit: 'pts' },
    k.collectionRate && { key: 'col', label: t('report.kpi.collection'), value: pctText(k.collectionRate.value), ratio: k.collectionRate.value, change: k.collectionRate.change, unit: 'pts' },
    k.noi && { key: 'noi', label: t('report.kpi.noi'), value: amount(k.noi.value, lang), change: k.noi.change, unit: 'money', color: k.noi.value < 0 ? COLORS.danger : COLORS.textDark },
    k.arrears && { key: 'arr', label: t('report.kpi.arrears'), value: amount(k.arrears.value, lang), change: k.arrears.change, unit: 'money', color: k.arrears.value > 0 ? COLORS.danger : COLORS.textDark, lowerIsBetter: true },
  ].filter(Boolean);
  if (!cards.length) return null;
  return (
    <View style={[styles.kpiGrid, { flexDirection: row }]}>
      {cards.map((c) => (
        <Card key={c.key} style={[styles.kpi, { flexBasis: medium ? 200 : '45%' }]}>
          <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm }}>
            <Txt size="small" muted style={{ flexShrink: 1 }} numberOfLines={1}>{c.label}</Txt>
            <ChangePill change={c.change} unit={c.unit} lowerIsBetter={c.lowerIsBetter} />
          </View>
          <Txt display weight="weightMedium" style={{ color: c.color ?? COLORS.textDark, fontSize: medium ? 30 : 22, lineHeight: medium ? 44 : 34 }} numberOfLines={1} adjustsFontSizeToFit>
            {c.value}
          </Txt>
          {/* percentages get a thin bar; amounts say what the pill compares with */}
          {c.ratio !== undefined && c.ratio !== null ? (
            <View style={[styles.kpiTrack, { flexDirection: row }]}>
              <View style={{ width: `${Math.max(0, Math.min(100, c.ratio))}%`, backgroundColor: c.ratio < 80 ? COLORS.accent : COLORS.primary }} />
            </View>
          ) : (
            <Txt size={11} muted>{t('report.vsLastMonth')}</Txt>
          )}
        </Card>
      ))}
    </View>
  );
}

/** The change since last month as a small colored pill: green when better, red when worse. */
function ChangePill({ change, unit, lowerIsBetter }) {
  const { lang } = useI18n();
  if (change === null || change === undefined) return null;
  const abs = Math.abs(change);
  const sign = change > 0 ? '↑ ' : change < 0 ? '↓ ' : '';
  const text = change === 0 ? '0' : `${sign}${unit === 'pts' ? abs : amount(abs, lang)}`;
  const good = lowerIsBetter ? change < 0 : change > 0;
  const [bg, fg] = change === 0 ? [COLORS.surfaceSoft, COLORS.textMuted] : good ? [COLORS.successSoft, COLORS.success] : [COLORS.dangerSoft, COLORS.danger];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Txt size={11} weight="weightMedium" style={{ color: fg }}>{text}</Txt>
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
    <Card style={{ gap: SPACING.md, padding: SPACING.lg + 4 }}>
      <View style={{ flexDirection: row, alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt display weight="weightMedium" size="medium">{t('report.alertsTitle')}</Txt>
        <View style={styles.count}>
          <Txt size={11} weight="weightBold" style={{ color: COLORS.onPrimary }}>{chips.length}</Txt>
        </View>
      </View>
      {chips.map((c) => (
        <Pressable key={c.key} onPress={c.go} accessibilityRole="link" style={({ hovered }) => [styles.alert, c.tone === 'warning' ? styles.alertWarn : styles.alertDanger, hovered && { opacity: 0.85 }]}>
          <Txt size="small" weight="weightMedium" style={{ color: c.tone === 'warning' ? COLORS.warning : COLORS.danger, lineHeight: 20 }}>{c.text}</Txt>
        </Pressable>
      ))}
    </Card>
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

/** `bare` = no card of its own (the financial summary and the cash flow share one card). */
function Table({ title, rows, bare }) {
  const { lang, row, align } = useI18n();
  const end = align === 'right' ? 'left' : 'right'; // amounts line up at the far edge
  const Box = bare ? View : Card;
  return (
    <Box style={bare ? { gap: 2 } : styles.tableCard}>
      <Txt display weight="weightMedium" size="medium" style={{ color: COLORS.primary, marginBottom: SPACING.xs }}>{title}</Txt>
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
    </Box>
  );
}

function FinancialTable({ f }) {
  const { t } = useI18n();
  return (
    <Table
      bare
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
      bare
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
        <Txt display weight="weightMedium" size="medium" style={{ color: COLORS.primary }}>{t('report.ownerTitle')}</Txt>
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
      <Txt display weight="weightMedium" size="medium" style={{ color: COLORS.primary }}>{t('report.ownerTitle')}</Txt>
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
          <Txt display weight="weightMedium" size="medium" style={{ color: COLORS.primary }}>{title}</Txt>
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
  // title row
  head: { gap: SPACING.lg, alignItems: 'stretch' },
  tools: { flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center' },
  segment: { backgroundColor: '#EDE7DA', borderRadius: RADIUS.md, padding: 3 },
  segmentItem: { minHeight: 38, paddingHorizontal: SPACING.md + 2, borderRadius: RADIUS.sm - 1, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: COLORS.surface, boxShadow: '0px 1px 2px rgba(28, 36, 33, 0.08)' },
  // KPI cards
  kpiGrid: { flexWrap: 'wrap', gap: SPACING.md },
  kpi: { flexGrow: 1, gap: SPACING.sm, padding: SPACING.lg + 2 },
  kpiTrack: { height: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.hairline, overflow: 'hidden', marginTop: 2 },
  pill: { borderRadius: RADIUS.pill, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  // alerts
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
  alert: { paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.md, borderRadius: RADIUS.md },
  alertWarn: { backgroundColor: COLORS.warningSoft },
  alertDanger: { backgroundColor: COLORS.dangerSoft },
  // tables
  tableCard: { gap: 2, padding: SPACING.xl },
  tr: { paddingVertical: SPACING.md - 1, alignItems: 'center', gap: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.hairline },
  totalRow: { marginTop: SPACING.sm, paddingVertical: SPACING.md, paddingHorizontal: SPACING.md + 2, alignItems: 'center', gap: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft },
  amountCol: { minWidth: 96, fontVariant: ['tabular-nums'] },
});
