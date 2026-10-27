import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { financeApi } from '../services/api';
import { parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import { DateField, PickerButton, formatDate, isDateText, today } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, Loading, Row, Sheet, Txt, errorText } from '../components/ui';
import { TenantPicker } from './PaymentsView';

// Cheques (الشيكات): post-dated cheques kept until their date, deposited (receipt issued), cleared or bounced.

const FILTERS = ['toDeposit', 'received', 'collecting', 'bounced', 'cleared', 'cancelled', 'all'];
export const CHEQUE_TONE = { RECEIVED: 'neutral', UNDER_COLLECTION: 'info', CLEARED: 'success', BOUNCED: 'danger', CANCELLED: 'neutral' };

const todayText = () => today();
const isDue = (c) => new Date(c.dueDate).toISOString().slice(0, 10) <= todayText();

// ================================================================ tab

export function ChequesTab({ editable, version, onChanged, onOpenReceipt, focusId }) {
  const { t, lang, row } = useI18n();
  const [filter, setFilter] = useState(focusId ? 'all' : 'toDeposit');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [action, setAction] = useState(null); // { kind: 'deposit'|'clear'|'bounce'|'cancel', cheque }

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, s] = await Promise.all([financeApi.cheques({ filter }), financeApi.chequeStats()]);
      setRows(list);
      setStats(s);
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load, version]);

  const visible = (rows ?? []).filter((c) => !text.trim() || matches([c.number, c.bankName, c.tenant.name, c.lease.number, c.drawer].filter(Boolean).join(' '), text));

  const done = () => {
    setAction(null);
    setAdding(false);
    setBulk(false);
    onChanged();
  };

  return (
    <View style={{ gap: SPACING.md }}>
      {stats ? (
        <View style={[styles.stats, { flexDirection: row }]}>
          <StatPill icon="calendar-alert" label={t('cheques.stats.toDeposit')} value={stats.toDeposit} tone={stats.toDeposit.count ? COLORS.warning : COLORS.textMuted} />
          <StatPill icon="tray-full" label={t('cheques.stats.held')} value={stats.held} />
          <StatPill icon="bank-transfer-in" label={t('cheques.stats.collecting')} value={stats.collecting} tone={COLORS.info} />
          <StatPill icon="alert-circle-outline" label={t('cheques.stats.bounced90')} value={stats.bounced90} tone={stats.bounced90.count ? COLORS.danger : COLORS.textMuted} />
        </View>
      ) : null}

      {editable ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small icon="checkbook" title={t('cheques.bulk')} onPress={() => setBulk(true)} />
          <Button small variant="secondary" icon="plus" title={t('cheques.add')} onPress={() => setAdding(true)} />
        </Row>
      ) : null}

      <ChipSelect value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: t(`cheques.filters.${f}`) }))} />
      <Field value={text} onChangeText={setText} placeholder={t('cheques.searchPlaceholder')} />
      <ErrorBox error={error} onRetry={load} />

      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="checkbook" body={t(`cheques.empty.${filter}`)} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((c, i) => (
            <View key={c.id} style={[styles.row, i > 0 && styles.divider, c.id === focusId && { backgroundColor: COLORS.primarySoft }]}>
              <Row gap={SPACING.md} style={{ alignItems: 'flex-start' }}>
                <View style={styles.icon}>
                  <MaterialCommunityIcons name="checkbook" size={20} color={COLORS.primaryDark} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{`${c.number} · ${c.bankName}`}</Txt>
                    <Badge label={t(`cheques.status.${c.status}`)} tone={CHEQUE_TONE[c.status]} />
                  </Row>
                  <Txt size="small">{c.tenant.name}</Txt>
                  <Txt muted size="small">{`${c.lease.number} · ${c.lease.property.name} · ${c.lease.unit.number}`}</Txt>
                  <Txt muted size="small">{t('cheques.dated', { date: formatDate(c.dueDate, lang) })}</Txt>
                  {c.status === 'BOUNCED' ? (
                    <Txt size="small" style={{ color: COLORS.danger }}>
                      {t('cheques.bouncedOn', { date: formatDate(c.bouncedAt, lang), reason: c.bounceReason })}
                    </Txt>
                  ) : null}
                  {c.status === 'CANCELLED' ? <Txt muted size="small">{c.cancelReason}</Txt> : null}
                  {c.payment ? (
                    <Pressable onPress={() => onOpenReceipt(c.payment.id)}>
                      <Txt size="small" style={{ color: COLORS.primaryDark }}>{t('cheques.receipt', { number: c.payment.number })}</Txt>
                    </Pressable>
                  ) : null}
                </View>
                <Money baisa={c.amount} weight="weightBold" />
              </Row>
              {editable ? <ChequeActions cheque={c} onAction={(kind) => setAction({ kind, cheque: c })} /> : null}
            </View>
          ))}
        </Card>
      )}

      <ChequeForm visible={adding} onClose={() => setAdding(false)} onSaved={done} />
      <BulkChequesForm visible={bulk} onClose={() => setBulk(false)} onSaved={done} />
      <ActionSheet action={action} onClose={() => setAction(null)} onDone={done} />
    </View>
  );
}

function StatPill({ icon, label, value, tone = COLORS.primaryDark }) {
  return (
    <Card style={styles.pill}>
      <Row gap={6}>
        <MaterialCommunityIcons name={icon} size={18} color={tone} />
        <Txt muted size="small" style={{ flex: 1 }}>{label}</Txt>
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Txt weight="weightBold" style={{ color: tone }}>{value.count}</Txt>
        <Money baisa={value.total} size={FONT.small} color={COLORS.textMuted} />
      </Row>
    </Card>
  );
}

function ChequeActions({ cheque: c, onAction }) {
  const { t, lang } = useI18n();
  if (c.status === 'RECEIVED') {
    const due = isDue(c);
    return (
      <Row style={styles.actions}>
        {due ? (
          <Button small icon="bank-transfer-in" title={t('cheques.deposit')} onPress={() => onAction('deposit')} />
        ) : (
          <Txt muted size="small">{t('cheques.depositOn', { date: formatDate(c.dueDate, lang) })}</Txt>
        )}
        <Button small variant="ghost" icon="undo-variant" title={t('cheques.cancel')} onPress={() => onAction('cancel')} />
      </Row>
    );
  }
  if (c.status === 'UNDER_COLLECTION') {
    return (
      <Row style={styles.actions}>
        <Button small icon="check-circle-outline" title={t('cheques.clear')} onPress={() => onAction('clear')} />
        <Button small variant="danger" icon="alert-circle-outline" title={t('cheques.bounce')} onPress={() => onAction('bounce')} />
      </Row>
    );
  }
  return null;
}

// ================================================================ actions

function ActionSheet({ action, onClose, onDone }) {
  const { t, lang } = useI18n();
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!action) return;
    setDate(today());
    setReason('');
    setFee('');
    setBusy(false);
    setError(null);
  }, [action]);

  if (!action) return null;
  const { kind, cheque: c } = action;
  const needsReason = kind === 'bounce' || kind === 'cancel';
  const needsDate = kind !== 'cancel';

  const submit = async () => {
    if (needsDate && !isDateText(date)) return setError({ code: 'validation.date' });
    if (needsReason && !reason.trim()) return setError({ code: 'validation.required' });
    const feeBaisa = String(fee).trim() ? parseOMR(fee) : 0;
    if (feeBaisa === null) return setError({ code: 'validation.invalid' });
    setBusy(true);
    setError(null);
    try {
      if (kind === 'deposit') await financeApi.depositCheque(c.id, date);
      if (kind === 'clear') await financeApi.clearCheque(c.id, date);
      if (kind === 'bounce') await financeApi.bounceCheque(c.id, { date, reason: reason.trim(), fee: feeBaisa || undefined });
      if (kind === 'cancel') await financeApi.cancelCheque(c.id, reason.trim());
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t(`cheques.actionTitles.${kind}`, { number: c.number })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button variant={kind === 'bounce' ? 'danger' : 'primary'} title={t(`cheques.${kind}`)} onPress={submit} loading={busy} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt>{`${c.tenant.name} · ${formatDate(c.dueDate, lang)}`}</Txt>
        <Money baisa={c.amount} weight="weightBold" />
      </Row>
      <Txt muted size="small">{t(`cheques.actionHints.${kind}`)}</Txt>
      {needsDate ? <DateField label={t(`cheques.actionDates.${kind}`)} value={date} onChangeText={setDate} /> : null}
      {needsReason ? <Field label={t(kind === 'bounce' ? 'cheques.bounceReason' : 'cheques.cancelReason')} value={reason} onChangeText={setReason} /> : null}
      {kind === 'bounce' ? <MoneyField label={t('cheques.bounceFee')} value={fee} onChangeText={setFee} hint={t('cheques.bounceFeeHint')} /> : null}
    </Sheet>
  );
}

// ================================================================ lease chooser (tenant → lease)

function LeaseChooser({ value, onChange, error }) {
  const { t } = useI18n();
  const [tenant, setTenant] = useState(null);
  const [leases, setLeases] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    setLeases(null);
    financeApi
      .tenantLeases(tenant.id)
      .then((list) => {
        setLeases(list);
        const active = list.find((l) => l.status === 'ACTIVE') ?? list[0];
        if (active) onChange(active);
      })
      .catch(() => setLeases([]));
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ gap: SPACING.sm }}>
      <PickerButton label={t('payments.tenant')} value={tenant?.name} placeholder={t('leases.pickTenant')} onPress={() => setPicking(true)} />
      {tenant ? (
        leases === null ? (
          <Loading />
        ) : leases.length === 0 ? (
          <Txt muted>{t('payments.noLeases')}</Txt>
        ) : (
          <ChipSelect
            value={value?.id}
            onChange={(id) => onChange(leases.find((l) => l.id === id))}
            options={leases.map((l) => ({ value: l.id, label: `${l.number} · ${l.unit.number}` }))}
          />
        )
      ) : null}
      {error ? <Txt size="small" style={{ color: COLORS.danger }}>{error}</Txt> : null}
      <TenantPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(x) => {
          setPicking(false);
          onChange(null);
          setTenant({ id: x.id, name: x.name });
        }}
      />
    </View>
  );
}

// ================================================================ single cheque

function ChequeForm({ visible, onClose, onSaved }) {
  const { t } = useI18n();
  const [lease, setLease] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!visible) return;
    setLease(null);
    setForm({ number: '', bankName: '', amount: '', dueDate: '', drawer: '', notes: '' });
    setBusy(false);
    setError(null);
  }, [visible]);

  if (!visible) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!lease) return setError({ code: 'payment.leaseNotFound', field: 'leaseId' });
    const amount = parseOMR(form.amount);
    if (!amount || amount <= 0) return setError({ code: 'validation.required', field: 'amount' });
    if (!form.number.trim()) return setError({ code: 'validation.required', field: 'number' });
    if (!form.bankName.trim()) return setError({ code: 'validation.required', field: 'bankName' });
    if (!isDateText(form.dueDate)) return setError({ code: 'validation.date', field: 'dueDate' });
    setBusy(true);
    setError(null);
    try {
      await financeApi.createCheque({ leaseId: lease.id, ...form, amount });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('cheques.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <LeaseChooser value={lease} onChange={setLease} error={fieldError('leaseId')} />
      <FieldRow>
        <Field label={t('payments.chequeNo')} value={form.number} onChangeText={set('number')} error={fieldError('number')} />
        <Field label={t('payments.bankName')} value={form.bankName} onChangeText={set('bankName')} error={fieldError('bankName')} />
      </FieldRow>
      <FieldRow>
        <MoneyField label={t('payments.amount')} value={form.amount} onChangeText={set('amount')} error={fieldError('amount')} />
        <DateField label={t('payments.chequeDate')} value={form.dueDate} onChangeText={set('dueDate')} error={fieldError('dueDate')} />
      </FieldRow>
      <Field label={t('cheques.drawer')} value={form.drawer} onChangeText={set('drawer')} hint={t('cheques.drawerHint')} />
      <Field label={t('payments.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 50 }} />
      <Txt muted size="small">{t('cheques.addHint')}</Txt>
    </Sheet>
  );
}

// ================================================================ cheques for a whole lease

function nthNumber(first, offset) {
  const m = /^(.*?)(\d+)$/.exec(String(first).trim());
  if (!m) return offset === 0 ? String(first).trim() : `${String(first).trim()}-${offset + 1}`;
  return `${m[1]}${String(Number(m[2]) + offset).padStart(m[2].length, '0')}`;
}

function BulkChequesForm({ visible, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const [lease, setLease] = useState(null);
  const [plan, setPlan] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ bankName: '', firstNumber: '', drawer: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!visible) return;
    setLease(null);
    setPlan(null);
    setForm({ bankName: '', firstNumber: '', drawer: '' });
    setBusy(false);
    setError(null);
  }, [visible]);

  useEffect(() => {
    if (!lease) return;
    setPlan(null);
    financeApi
      .chequePlan(lease.id)
      .then((p) => {
        setPlan(p);
        setSelected(new Set(p.installments.map((x) => x.id)));
      })
      .catch((e) => (setError(e), setPlan({ installments: [] })));
  }, [lease]);

  if (!visible) return null;
  const chosen = (plan?.installments ?? []).filter((x) => selected.has(x.id));
  const total = chosen.reduce((s, x) => s + x.amount, 0);
  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!lease) return setError({ code: 'payment.leaseNotFound', field: 'leaseId' });
    if (!form.bankName.trim()) return setError({ code: 'validation.required', field: 'bankName' });
    if (!form.firstNumber.trim()) return setError({ code: 'validation.required', field: 'firstNumber' });
    if (!chosen.length) return setError({ code: 'cheque.noInstallments' });
    setBusy(true);
    setError(null);
    try {
      await financeApi.bulkCheques({ leaseId: lease.id, ...form, chargeIds: chosen.map((x) => x.id) });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('cheques.bulk')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('cheques.bulkSave', { count: chosen.length })} onPress={save} loading={busy} disabled={!chosen.length} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Txt muted size="small">{t('cheques.bulkHint')}</Txt>
      <LeaseChooser value={lease} onChange={setLease} error={fieldError('leaseId')} />
      <FieldRow>
        <Field label={t('payments.bankName')} value={form.bankName} onChangeText={(v) => setForm((f) => ({ ...f, bankName: v }))} error={fieldError('bankName')} />
        <Field
          label={t('cheques.firstNumber')}
          value={form.firstNumber}
          onChangeText={(v) => setForm((f) => ({ ...f, firstNumber: v }))}
          error={fieldError('firstNumber')}
          hint={t('cheques.firstNumberHint')}
        />
      </FieldRow>
      <Field label={t('cheques.drawer')} value={form.drawer} onChangeText={(v) => setForm((f) => ({ ...f, drawer: v }))} hint={t('cheques.drawerHint')} />

      {lease && plan === null ? <Loading /> : null}
      {plan ? (
        plan.installments.length === 0 ? (
          <Txt muted>{t('cheques.nothingToCover')}</Txt>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt weight="weightBold">{t('cheques.installments', { count: chosen.length })}</Txt>
              <Money baisa={total} weight="weightBold" />
            </Row>
            <View style={styles.list}>
              {plan.installments.map((x, i) => {
                const on = selected.has(x.id);
                const position = chosen.findIndex((c) => c.id === x.id);
                return (
                  <Pressable key={x.id} onPress={() => toggle(x.id)}>
                    <Row style={[styles.planRow, i > 0 && styles.divider]}>
                      <MaterialCommunityIcons name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={on ? COLORS.primary : COLORS.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Txt size="small" weight="weightMedium">{`${t('leases.installment', { index: x.index })} · ${formatDate(x.dueDate, lang)}`}</Txt>
                        {on && form.firstNumber.trim() ? <Txt muted size="small">{t('cheques.numberPreview', { number: nthNumber(form.firstNumber, position) })}</Txt> : null}
                      </View>
                      <Money baisa={x.amount} size={13} />
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          </>
        )
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stats: { flexWrap: 'wrap', gap: SPACING.sm },
  pill: { flexGrow: 1, flexBasis: 150, padding: SPACING.md, gap: 4 },
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  actions: { flexWrap: 'wrap', justifyContent: 'flex-end' },
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  planRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
});
