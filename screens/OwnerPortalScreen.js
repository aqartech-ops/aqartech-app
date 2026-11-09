import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { portalApi } from '../services/api';
import { ownerStatementHtml } from '../services/ownerStatement';
import { printHtml, shareHtml } from '../services/receipt';
import { formatDate } from '../components/Fields';
import { Money } from '../components/Rial';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Loading, Row, Screen, Segmented, Txt } from '../components/ui';

// Owner portal (بوابة المالك): a property owner linked to a company sees — read-only — only their properties:
// how they perform this year, what the company owes them, their statements and account. Same books as the company.

const pct = (r) => (r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`);

function Kpi({ icon, label, children, tone = COLORS.primaryDark }) {
  return (
    <Card style={styles.kpi}>
      <Row gap={SPACING.sm}>
        <View style={[styles.kpiIcon, { backgroundColor: COLORS.primarySoft }]}>
          <MaterialCommunityIcons name={icon} size={18} color={tone} />
        </View>
        <Txt muted size="small" style={{ flex: 1 }}>{label}</Txt>
      </Row>
      {children}
    </Card>
  );
}

export default function OwnerPortalScreen() {
  const { t } = useI18n();
  const { me } = useSession();
  const [tab, setTab] = useState('overview');
  return (
    <Screen title={t('portal.hello', { name: me.user.name })} subtitle={t('portal.subtitle')}>
      <View style={{ gap: SPACING.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: t('portal.tabs.overview') },
            { value: 'statements', label: t('portal.tabs.statements') },
            { value: 'account', label: t('portal.tabs.account') },
          ]}
        />
        {tab === 'overview' ? <Overview /> : tab === 'statements' ? <Statements /> : <Account />}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------- overview

function Overview() {
  const { t, lang, row } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.tablet;
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    portalApi.overview(year).then(setData).catch(setError);
  }, [year]);
  useEffect(load, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const totals = data.totals;

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect value={year} onChange={setYear} options={[thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: y, label: String(y) }))} />
      {data.partialYear ? <Txt muted size="small">{t('portal.partialYear')}</Txt> : null}

      <View style={[styles.grid, wide && { flexDirection: row }]}>
        <Kpi icon="cash-check" label={data.balance >= 0 ? t('portal.owedToYou') : t('portal.youOwe')}>
          <Money baisa={Math.abs(data.balance)} size={FONT.title} weight="weightBold" color={data.balance < 0 ? COLORS.danger : COLORS.textDark} />
          <Txt muted size="small">{data.lastPayout ? t('portal.lastPayout', { date: formatDate(data.lastPayout.date, lang) }) : t('portal.noPayout')}</Txt>
        </Kpi>
        <Kpi icon="home-city-outline" label={t('portal.rentCollected', { year: data.year })}>
          <Money baisa={totals?.rentIncome ?? 0} size={FONT.title} weight="weightBold" />
        </Kpi>
        <Kpi icon="cash-minus" label={t('portal.expenses')}>
          <Money baisa={totals?.expenses ?? 0} size={FONT.title} weight="weightBold" />
        </Kpi>
        <Kpi icon="chart-line" label={t('portal.net')}>
          <Money baisa={totals?.noi ?? 0} size={FONT.title} weight="weightBold" color={(totals?.noi ?? 0) < 0 ? COLORS.danger : COLORS.success} />
        </Kpi>
      </View>

      <Txt size="medium" weight="weightBold">{t('portal.yourProperties')}</Txt>
      {data.properties.length === 0 ? (
        <Card>
          <EmptyState icon="home-city-outline" body={t('portal.noProperties')} />
        </Card>
      ) : (
        data.properties.map((p) => (
          <Card key={p.id} style={{ gap: SPACING.md }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Txt weight="weightBold">{p.name}</Txt>
              <Badge label={t('portal.units', { count: p.units })} />
            </Row>
            <View style={styles.occBar}>
              <View style={[styles.occFill, { width: `${Math.round((p.occupancy ?? 0) * 100)}%` }]} />
            </View>
            <View style={[styles.facts, { flexDirection: row }]}>
              <Fact label={t('portal.occupancy')} value={pct(p.occupancy)} />
              <Fact label={t('portal.collectionRate')} value={pct(p.collectionRate)} />
              <Fact label={t('portal.rent')} money={p.rentIncome} />
              <Fact label={t('portal.expenses')} money={p.expenses} />
              <Fact label={t('portal.net')} money={p.noi} />
              <Fact label={t('portal.openRequests')} value={String(p.openWorkOrders)} />
            </View>
          </Card>
        ))
      )}

      <Card style={{ gap: SPACING.xs }}>
        <Txt weight="weightBold">{t('portal.managedBy', { name: data.company.name })}</Txt>
        <Txt muted size="small">{t('portal.questions')}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {data.company.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${data.company.phone}`).catch(() => {})}>
              <Txt style={{ color: COLORS.primaryDark }}>{data.company.phone}</Txt>
            </Pressable>
          ) : null}
          {data.company.email ? (
            <Pressable onPress={() => Linking.openURL(`mailto:${data.company.email}`).catch(() => {})}>
              <Txt style={{ color: COLORS.primaryDark }}>{data.company.email}</Txt>
            </Pressable>
          ) : null}
        </Row>
      </Card>
    </View>
  );
}

function Fact({ label, value, money }) {
  return (
    <View style={styles.fact}>
      <Txt muted size="small">{label}</Txt>
      {money !== undefined ? <Money baisa={money} size={FONT.body} weight="weightMedium" color={money < 0 ? COLORS.danger : COLORS.textDark} /> : <Txt weight="weightMedium">{value}</Txt>}
    </View>
  );
}

// ---------------------------------------------------------------- statements

function Statements() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setError(null);
    portalApi.statements().then(setRows).catch((e) => {
      setError(e);
      setRows([]);
    });
  }, []);
  useEffect(load, [load]);

  const open = async (s, share) => {
    setBusy(s.id);
    setError(null);
    try {
      const st = await portalApi.statement(s.id);
      const html = ownerStatementHtml(st, t, lang);
      await (share ? shareHtml(html, st.number) : printHtml(html));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  if (rows === null) return <Loading />;
  return (
    <View style={{ gap: SPACING.md }}>
      <ErrorBox error={error} onRetry={load} />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="file-document-outline" body={t('portal.noStatements')} />
        </Card>
      ) : (
        <Card padded={false}>
          {rows.map((s, i) => (
            <Row key={s.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 2, minWidth: 180 }}>
                <Txt weight="weightMedium">{`${s.number} · ${s.property.name}`}</Txt>
                <Txt muted size="small">{`${formatDate(s.periodStart, lang)} → ${formatDate(s.periodEnd, lang)}`}</Txt>
              </View>
              <Money baisa={s.net} weight="weightBold" color={s.net < 0 ? COLORS.danger : COLORS.textDark} />
              <Button id="print.print" small variant="secondary" icon="printer-outline" title={t('receipt.print')} loading={busy === s.id} onPress={() => open(s, false)} />
              <Button id="print.share" small variant="ghost" icon="share-variant-outline" title={t('receipt.share')} onPress={() => open(s, true)} />
            </Row>
          ))}
        </Card>
      )}
      <Txt muted size="small">{t('portal.statementsHint')}</Txt>
    </View>
  );
}

// ---------------------------------------------------------------- account

function Account() {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    portalApi.account().then(setData).catch(setError);
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  return (
    <View style={{ gap: SPACING.md }}>
      <Card style={{ gap: SPACING.xs }}>
        <Txt muted>{data.balance >= 0 ? t('portal.owedToYou') : t('portal.youOwe')}</Txt>
        <Money baisa={Math.abs(data.balance)} size={FONT.title} weight="weightBold" color={data.balance < 0 ? COLORS.danger : COLORS.textDark} />
        {data.owner.accountNumber ? <Txt muted size="small">{t('portal.paidTo', { account: [data.owner.bankName, data.owner.accountNumber].filter(Boolean).join(' · ') })}</Txt> : null}
      </Card>
      {data.rows.length === 0 ? (
        <Card>
          <EmptyState icon="file-document-outline" body={t('finance.noMovements')} />
        </Card>
      ) : (
        <Card padded={false}>
          {[...data.rows].reverse().map((r, i) => (
            <Row key={r.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt>{r.memo || r.number}</Txt>
                <Txt muted size="small">{`${formatDate(r.date, lang)} · ${r.number}`}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Money baisa={r.amount} weight="weightMedium" color={r.amount < 0 ? COLORS.danger : COLORS.success} />
                <Txt muted size="small">{t('portal.balanceAfter')}</Txt>
                <Money baisa={r.balance} size={12} color={COLORS.textMuted} />
              </View>
            </Row>
          ))}
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: SPACING.md, flexWrap: 'wrap' },
  kpi: { flexGrow: 1, flexBasis: 220, gap: SPACING.sm },
  kpiIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  facts: { flexWrap: 'wrap', gap: SPACING.sm },
  fact: { minWidth: 130, flexGrow: 1, gap: 2, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft },
  occBar: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, overflow: 'hidden' },
  occFill: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  row: { padding: SPACING.md, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
