import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { financeApi } from '../services/api';
import { useSession } from '../services/session';
import { PaymentForm, PaymentsList, ReceiptSheet } from './PaymentsView';
import { ChequesTab } from './ChequesView';
import { matches } from '../services/text';
import { Money, SectionIcon } from '../components/Rial';
import { formatDate } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, Loading, Row, Screen, Segmented, Sheet, Txt } from '../components/ui';

// Financials (المالية) — batch 1: the ledger and what tenants owe.
// Every number here is computed by the server from journal entries; nothing is typed in.

const BUCKETS = ['0_30', '31_60', '61_90', '90_plus'];
const BUCKET_COLOR = { '0_30': COLORS.warning, '31_60': '#C2410C', '61_90': COLORS.danger, '90_plus': '#7F1D1D' };

export default function FinancialsScreen({ params }) {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('financials');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(params?.paymentId ? 'payments' : params?.chequeId ? 'cheques' : 'receivables');
  const [statementOf, setStatementOf] = useState(params?.tenantId ?? null);
  const [paying, setPaying] = useState(null); // PaymentForm preset
  const [receiptId, setReceiptId] = useState(params?.paymentId ?? null);
  const [version, setVersion] = useState(0); // bumped after a payment / void so every list reloads

  const collect = (preset) => {
    setStatementOf(null);
    setPaying(preset);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await financeApi.summary());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  return (
    <Screen
      title={t('sections.financials')}
      subtitle={summary ? t('finance.asOf', { date: formatDate(summary.asOf, lang) }) : null}
      actions={editable ? <Button icon="cash-plus" title={t('payments.add')} onPress={() => collect({})} /> : null}
    >
      <View style={{ gap: SPACING.lg }}>
        <ErrorBox error={error} onRetry={load} />
        {!summary && !error ? <Loading /> : null}
        {summary ? <SummaryCards summary={summary} /> : null}
        {summary ? <AgingCard overdue={summary.overdue} /> : null}

        <ChipSelect
          value={tab}
          onChange={setTab}
          options={['receivables', 'payments', 'cheques', 'balances', 'journal'].map((v) => ({ value: v, label: t(`finance.tabs.${v}`) }))}
        />
        {tab === 'receivables' ? <Receivables key={version} onOpenTenant={setStatementOf} onCollect={editable ? collect : null} /> : null}
        {tab === 'payments' ? <PaymentsList version={version} onOpen={setReceiptId} /> : null}
        {tab === 'cheques' ? (
          <ChequesTab
            editable={editable}
            version={version}
            focusId={params?.chequeId}
            onChanged={() => setVersion((v) => v + 1)}
            onOpenReceipt={setReceiptId}
          />
        ) : null}
        {tab === 'balances' ? <Balances key={version} onOpenTenant={setStatementOf} /> : null}
        {tab === 'journal' ? <Journal key={version} /> : null}
      </View>
      <StatementSheet
        key={`s${version}`}
        tenantId={statementOf}
        onClose={() => setStatementOf(null)}
        onCollect={editable ? (tenant) => collect({ tenantId: tenant.id, tenantName: tenant.name }) : null}
      />
      <PaymentForm
        preset={paying}
        onClose={() => setPaying(null)}
        onSaved={(saved) => {
          setPaying(null);
          setReceiptId(saved.id);
          setVersion((v) => v + 1);
        }}
      />
      <ReceiptSheet paymentId={receiptId} onClose={() => setReceiptId(null)} onChanged={() => setVersion((v) => v + 1)} />
    </Screen>
  );
}

// ---------------------------------------------------------------- summary

function useColumns() {
  const { width } = useWindowDimensions();
  if (width >= 1100) return 4;
  if (width >= 700) return 3;
  return 2;
}

function Stat({ icon, label, baisa, hint, tone = COLORS.primary, color }) {
  return (
    <Card style={{ gap: SPACING.sm, flexGrow: 1 }}>
      <Row>
        <View style={styles.statIcon}>
          <SectionIcon name={icon} size={18} color={tone} />
        </View>
        <Txt muted size="small" style={{ flex: 1 }}>{label}</Txt>
      </Row>
      <Money baisa={baisa} size={FONT.medium + 2} weight="weightBold" color={color} />
      {hint ? <Txt muted size="small">{hint}</Txt> : null}
    </Card>
  );
}

function SummaryCards({ summary: s }) {
  const { t, row } = useI18n();
  const columns = useColumns();
  const items = [
    { id: 'income', icon: 'rial', label: t('finance.rentIncomeMonth'), baisa: s.rentIncome.month, extra: s.rentIncome.year },
    {
      id: 'collected',
      icon: 'cash-check',
      label: t('finance.collectedMonth'),
      baisa: s.collected.month,
      hint: s.collectionRate === null ? t('finance.collectionRateNone') : t('finance.collectionRate', { rate: s.collectionRate }),
      tone: COLORS.success,
    },
    { id: 'receivable', icon: 'cash-clock', label: t('finance.receivable'), baisa: s.receivable, hint: t('finance.receivableHint') },
    {
      id: 'overdue',
      icon: 'alert-octagon-outline',
      label: t('finance.overdue'),
      baisa: s.overdue.total,
      hint: t('finance.overdueCount', { count: s.overdue.count }),
      tone: COLORS.danger,
      color: s.overdue.total ? COLORS.danger : undefined,
    },
    { id: 'upcoming', icon: 'calendar-clock', label: t('finance.upcoming', { days: s.upcoming.days }), baisa: s.upcoming.total, hint: t('finance.upcomingCount', { count: s.upcoming.count }) },
    { id: 'deposits', icon: 'safe', label: t('finance.depositsHeld'), baisa: s.depositsHeld, hint: t('finance.depositsHint') },
    { id: 'cash', icon: 'cash', label: t('finance.accounts.CASH'), baisa: s.cash },
    { id: 'bank', icon: 'bank-outline', label: t('finance.accounts.BANK'), baisa: s.bank },
    { id: 'cheques', icon: 'checkbook', label: t('finance.accounts.CHEQUES_ON_HAND'), baisa: s.chequesOnHand, hint: t('finance.chequesHint') },
  ];
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', marginHorizontal: -SPACING.xs }}>
      {items.map((it) => (
        <View key={it.id} style={{ width: `${100 / columns}%`, padding: SPACING.xs }}>
          {it.id === 'income' ? (
            <Card style={{ gap: SPACING.sm, flexGrow: 1 }}>
              <Row>
                <View style={styles.statIcon}>
                  <SectionIcon name="rial" size={18} color={COLORS.primary} />
                </View>
                <Txt muted size="small" style={{ flex: 1 }}>{it.label}</Txt>
              </Row>
              <Money baisa={it.baisa} size={FONT.medium + 2} weight="weightBold" />
              <Row gap={4} style={{ flexWrap: 'wrap' }}>
                <Txt muted size="small">{t('finance.yearToDate')}</Txt>
                <Money baisa={it.extra} size={FONT.small} color={COLORS.textMuted} />
              </Row>
            </Card>
          ) : (
            <Stat {...it} />
          )}
        </View>
      ))}
    </View>
  );
}

function AgingCard({ overdue }) {
  const { t, row } = useI18n();
  const total = overdue.total || 0;
  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight="weightBold">{t('finance.aging')}</Txt>
        <Money baisa={total} weight="weightBold" color={total ? COLORS.danger : COLORS.textDark} />
      </Row>
      <View style={[styles.agingBar, { flexDirection: row }]}>
        {total ? (
          BUCKETS.filter((b) => overdue.buckets[b] > 0).map((b) => (
            <View key={b} style={{ flex: overdue.buckets[b], backgroundColor: BUCKET_COLOR[b] }} />
          ))
        ) : (
          <View style={{ flex: 1, backgroundColor: COLORS.successSoft }} />
        )}
      </View>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: SPACING.md }}>
        {BUCKETS.map((b) => (
          <Row key={b} gap={6}>
            <View style={[styles.dot, { backgroundColor: BUCKET_COLOR[b] }]} />
            <Txt muted size="small">{t(`finance.buckets.${b}`)}</Txt>
            <Money baisa={overdue.buckets[b]} size={FONT.small} weight="weightMedium" />
          </Row>
        ))}
      </View>
      {!total ? <Txt size="small" style={{ color: COLORS.success }}>{t('finance.noOverdue')}</Txt> : null}
    </Card>
  );
}

// ---------------------------------------------------------------- receivables

function chargeLabel(t, lang, c) {
  if (c.kind === 'DEPOSIT') return t('finance.depositCharge');
  if (c.kind === 'FEE') return t('finance.feeCharge');
  const period = c.periodStart ? `${formatDate(c.periodStart, lang)} → ${formatDate(c.periodEnd, lang)}` : '';
  return `${t('leases.installment', { index: c.index })} · ${period}`;
}

function Receivables({ onOpenTenant, onCollect }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('overdue');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await financeApi.receivables({ filter }));
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const visible = (rows ?? []).filter(
    (c) => !text.trim() || matches([c.tenant.name, c.tenant.phone, c.unit.number, c.property.name, c.lease.number].filter(Boolean).join(' '), text),
  );

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect
        value={filter}
        onChange={setFilter}
        options={['overdue', 'open', 'upcoming'].map((f) => ({ value: f, label: t(`finance.filters.${f}`) }))}
      />
      <Field value={text} onChangeText={setText} placeholder={t('finance.searchPlaceholder')} />
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="check-circle-outline" body={t(`finance.empty.${filter}`)} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((c, i) => (
            <Pressable key={c.id} onPress={() => onOpenTenant(c.tenant.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{c.tenant.name}</Txt>
                    {c.daysOverdue > 0 ? (
                      <Badge label={t('finance.daysOverdue', { count: c.daysOverdue })} tone={c.daysOverdue > 60 ? 'danger' : 'warning'} />
                    ) : filter === 'upcoming' ? (
                      <Badge label={formatDate(c.dueDate, lang)} tone="info" />
                    ) : (
                      <Badge label={t('finance.dueToday')} tone="info" />
                    )}
                  </Row>
                  <Txt muted size="small">{`${c.property.name} · ${c.unit.number} · ${c.lease.number}`}</Txt>
                  <Txt muted size="small">{chargeLabel(t, lang, c)}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Money baisa={c.outstanding} weight="weightBold" color={c.daysOverdue > 0 ? COLORS.danger : COLORS.textDark} />
                  {c.outstanding !== c.amount ? (
                    <Row gap={4}>
                      <Txt muted size="small">{t('finance.ofAmount')}</Txt>
                      <Money baisa={c.amount} size={FONT.small} color={COLORS.textMuted} />
                    </Row>
                  ) : null}
                  {onCollect && filter !== 'upcoming' ? (
                    <Button
                      small
                      variant="secondary"
                      icon="cash-plus"
                      title={t('payments.collect')}
                      onPress={() => onCollect({ tenantId: c.tenant.id, tenantName: c.tenant.name, leaseId: c.lease.id })}
                    />
                  ) : null}
                </View>
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- balances

function Balances({ onOpenTenant }) {
  const { t, forwardIcon } = useI18n();
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await financeApi.balances());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = (rows ?? []).filter((r) => !text.trim() || matches([r.name, r.phone].filter(Boolean).join(' '), text));

  return (
    <View style={{ gap: SPACING.md }}>
      <Field value={text} onChangeText={setText} placeholder={t('tenants.filterPlaceholder')} />
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="account-cash-outline" body={t('finance.noBalances')} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((r, i) => (
            <Pressable key={r.id} onPress={() => onOpenTenant(r.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{r.name}</Txt>
                    {r.overdue ? <Badge label={t('finance.overdue')} tone="danger" /> : null}
                  </Row>
                  {r.deposit ? (
                    <Row gap={4}>
                      <Txt muted size="small">{t('finance.depositHeld')}</Txt>
                      <Money baisa={r.deposit} size={FONT.small} color={COLORS.textMuted} />
                    </Row>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Money baisa={r.receivable} weight="weightBold" color={r.overdue ? COLORS.danger : COLORS.textDark} />
                  {r.overdue ? (
                    <Row gap={4}>
                      <Txt size="small" style={{ color: COLORS.danger }}>{t('finance.overdue')}</Txt>
                      <Money baisa={r.overdue} size={FONT.small} color={COLORS.danger} />
                    </Row>
                  ) : null}
                </View>
                <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- statement

function StatementSheet({ tenantId, onClose, onCollect }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tenantId) return;
    setData(null);
    setError(null);
    financeApi.statement(tenantId).then(setData).catch(setError);
  }, [tenantId]);

  return (
    <Sheet
      visible={!!tenantId}
      title={data ? t('finance.statementOf', { name: data.tenant.name }) : t('finance.statement')}
      onClose={onClose}
      footer={data && onCollect ? <Button icon="cash-plus" title={t('payments.add')} onPress={() => onCollect(data.tenant)} /> : null}
    >
      <ErrorBox error={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('finance.balanceDue')}</Txt>
            <Money baisa={data.balance} weight="weightBold" size={FONT.medium} color={data.balance > 0 ? COLORS.danger : COLORS.success} />
          </Row>
          {data.depositHeld ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('finance.depositHeld')}</Txt>
              <Money baisa={data.depositHeld} />
            </Row>
          ) : null}
          {data.rows.length === 0 ? (
            <EmptyState icon="file-document-outline" body={t('finance.noMovements')} />
          ) : (
            <View style={styles.table}>
              {data.rows.map((r, i) => (
                <Row key={r.id} style={[styles.tableRow, i > 0 && styles.divider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size="small" weight="weightMedium">{t(`finance.entryTypes.${r.type}`)}</Txt>
                    <Txt muted size="small">{[formatDate(r.date, lang), r.number, r.memo].filter(Boolean).join(' · ')}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Money baisa={r.amount} size={13} color={r.amount < 0 ? COLORS.success : COLORS.textDark} />
                    <Txt muted size="small">{t('finance.runningBalance')}</Txt>
                    <Money baisa={r.balance} size={12} color={COLORS.textMuted} />
                  </View>
                </Row>
              ))}
            </View>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- journal & trial balance

function Journal() {
  const { t, lang } = useI18n();
  const [trial, setTrial] = useState(null);
  const [entries, setEntries] = useState(null);
  const [page, setPage] = useState({ page: 1, pages: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const loadPage = useCallback(async (n) => {
    setBusy(true);
    try {
      const res = await financeApi.journal(n);
      setEntries((prev) => (n === 1 ? res.entries : [...(prev ?? []), ...res.entries]));
      setPage({ page: res.page, pages: res.pages });
    } catch (e) {
      setError(e);
      setEntries((prev) => prev ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    financeApi.trialBalance().then(setTrial).catch(setError);
    loadPage(1);
  }, [loadPage]);

  return (
    <View style={{ gap: SPACING.md }}>
      <ErrorBox error={error} />
      {trial ? (
        <Card style={{ gap: SPACING.sm }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt weight="weightBold">{t('finance.trialBalance')}</Txt>
            <Badge label={trial.balanced ? t('finance.balanced') : t('finance.unbalanced')} tone={trial.balanced ? 'success' : 'danger'} />
          </Row>
          <Row>
            <Txt muted size="small" style={{ flex: 1 }}>{t('finance.account')}</Txt>
            <Txt muted size="small" style={styles.amountCol}>{t('finance.debit')}</Txt>
            <Txt muted size="small" style={styles.amountCol}>{t('finance.credit')}</Txt>
          </Row>
          {trial.accounts
            .filter((a) => a.debit || a.credit)
            .map((a) => (
              <Row key={a.account}>
                <Txt size="small" style={{ flex: 1 }}>{t(`finance.accounts.${a.account}`)}</Txt>
                <View style={styles.amountCol}>{a.debit ? <Money baisa={a.debit} size={12} /> : <Txt muted size="small">—</Txt>}</View>
                <View style={styles.amountCol}>{a.credit ? <Money baisa={a.credit} size={12} /> : <Txt muted size="small">—</Txt>}</View>
              </Row>
            ))}
          <Row style={styles.totalRow}>
            <Txt size="small" weight="weightBold" style={{ flex: 1 }}>{t('finance.total')}</Txt>
            <View style={styles.amountCol}>
              <Money baisa={trial.debit} size={12} weight="weightBold" />
            </View>
            <View style={styles.amountCol}>
              <Money baisa={trial.credit} size={12} weight="weightBold" />
            </View>
          </Row>
        </Card>
      ) : null}

      <Txt weight="weightBold">{t('finance.journal')}</Txt>
      <Txt muted size="small">{t('finance.journalHint')}</Txt>
      {entries === null ? (
        <Loading />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon="book-open-variant" body={t('finance.noEntries')} />
        </Card>
      ) : (
        <Card padded={false}>
          {entries.map((e, i) => (
            <View key={e.id} style={[styles.row, { gap: SPACING.xs }, i > 0 && styles.divider]}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                  <Txt weight="weightMedium">{e.number}</Txt>
                  <Badge label={t(`finance.entryTypes.${e.type}`)} tone={e.type === 'REVERSAL' ? 'danger' : 'neutral'} />
                  {e.reversedBy ? <Badge label={t('finance.reversedBy', { number: e.reversedBy.number })} tone="warning" /> : null}
                </Row>
                <Txt muted size="small">{formatDate(e.date, lang)}</Txt>
              </Row>
              {e.memo ? <Txt muted size="small">{e.memo}</Txt> : null}
              {e.reverses ? <Txt muted size="small">{t('finance.reverses', { number: e.reverses.number })}</Txt> : null}
              {e.lines.map((l) => (
                <Row key={l.id}>
                  <Txt size="small" style={{ flex: 1 }}>{t(`finance.accounts.${l.account}`)}</Txt>
                  <View style={styles.amountCol}>{l.amount > 0 ? <Money baisa={l.amount} size={12} /> : null}</View>
                  <View style={styles.amountCol}>{l.amount < 0 ? <Money baisa={-l.amount} size={12} /> : null}</View>
                </Row>
              ))}
            </View>
          ))}
        </Card>
      )}
      {page.page < page.pages ? (
        <Button variant="secondary" title={t('finance.loadMore')} loading={busy} onPress={() => loadPage(page.page + 1)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statIcon: { width: 32, height: 32, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  agingBar: { height: 12, borderRadius: RADIUS.pill, overflow: 'hidden', backgroundColor: COLORS.surfaceSoft },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  tableRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'flex-start' },
  amountCol: { width: 104, alignItems: 'flex-end' },
  totalRow: { borderTopWidth: 1, borderTopColor: COLORS.borderStrong, paddingTop: SPACING.sm },
});
