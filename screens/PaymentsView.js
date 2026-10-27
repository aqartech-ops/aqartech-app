import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi, tenantsApi } from '../services/api';
import { formatOMR, parseOMR } from '../services/money';
import { matches } from '../services/text';
import { printReceipt, shareReceipt } from '../services/receipt';
import { Money, MoneyField } from '../components/Rial';
import { DateField, PickerButton, formatDate, isDateText, today } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, Loading, Row, Sheet, Txt, errorText } from '../components/ui';

// Collections & receipts (التحصيل وإيصالات القبض).

export const METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'];
const METHOD_ICON = { CASH: 'cash', BANK_TRANSFER: 'bank-transfer', CHEQUE: 'checkbook', CARD: 'credit-card-outline', ONLINE: 'cellphone-nfc' };
const moneyText = (baisa) => (baisa > 0 ? formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, '') : '');

// ================================================================ list

export function PaymentsList({ onOpen, version }) {
  const { t, lang, forwardIcon } = useI18n();
  const [method, setMethod] = useState('all');
  const [text, setText] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (page = 1) => {
      setBusy(true);
      setError(null);
      try {
        const res = await financeApi.payments({ page, ...(method !== 'all' ? { method } : {}) });
        setData((prev) => (page === 1 ? res : { ...res, payments: [...(prev?.payments ?? []), ...res.payments] }));
      } catch (e) {
        setError(e);
        setData((prev) => prev ?? { payments: [], page: 1, pages: 1 });
      } finally {
        setBusy(false);
      }
    },
    [method],
  );

  useEffect(() => {
    setData(null);
    load(1);
  }, [load, version]);

  const visible = (data?.payments ?? []).filter(
    (p) => !text.trim() || matches([p.number, p.tenant.name, p.chequeNo, p.reference, p.lease.number, p.lease.unit.number].filter(Boolean).join(' '), text),
  );

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect
        value={method}
        onChange={setMethod}
        options={[{ value: 'all', label: t('payments.allMethods') }, ...METHODS.map((m) => ({ value: m, label: t(`payments.methods.${m}`) }))]}
      />
      <Field value={text} onChangeText={setText} placeholder={t('payments.searchPlaceholder')} />
      <ErrorBox error={error} onRetry={() => load(1)} />
      {data === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="receipt" body={t('payments.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((p, i) => (
            <Pressable key={p.id} onPress={() => onOpen(p.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={styles.icon}>
                  <MaterialCommunityIcons name={METHOD_ICON[p.method]} size={20} color={COLORS.primaryDark} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{p.tenant.name}</Txt>
                    {p.status === 'VOIDED' ? <Badge label={t('payments.voided')} tone="danger" /> : null}
                  </Row>
                  <Txt muted size="small">{[p.number, formatDate(p.date, lang), t(`payments.methods.${p.method}`), p.lease.number].join(' · ')}</Txt>
                </View>
                <Money
                  baisa={p.amount}
                  weight="weightBold"
                  color={p.status === 'VOIDED' ? COLORS.textMuted : COLORS.success}
                  style={p.status === 'VOIDED' ? { opacity: 0.6 } : null}
                />
                <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
      {data && data.page < data.pages ? <Button variant="secondary" title={t('finance.loadMore')} loading={busy} onPress={() => load(data.page + 1)} /> : null}
    </View>
  );
}

// ================================================================ form

/**
 * Record a payment. `preset` = {} | { tenantId, tenantName, leaseId }.
 * The lease decides which property/owner the money belongs to; the amount defaults to what is owed on it.
 */
export function PaymentForm({ preset, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const [tenant, setTenant] = useState(null); // { id, name }
  const [leases, setLeases] = useState(null);
  const [form, setForm] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!preset) return;
    setTenant(preset.tenantId ? { id: preset.tenantId, name: preset.tenantName ?? '' } : null);
    setLeases(null);
    setForm({ leaseId: preset.leaseId ?? null, amount: '', date: today(), method: 'CASH', reference: '', bankName: '', chequeNo: '', chequeDate: '', notes: '' });
    setError(null);
    setBusy(false);
  }, [preset]);

  // Tenant chosen → their leases with balances; pick the one that owes the most (or the preset one).
  useEffect(() => {
    if (!tenant?.id) return;
    let alive = true;
    financeApi
      .tenantLeases(tenant.id)
      .then((list) => {
        if (!alive) return;
        setLeases(list);
        setForm((f) => {
          const chosen = list.find((l) => l.id === f.leaseId) ?? [...list].sort((a, b) => b.overdue - a.overdue || b.balance - a.balance)[0];
          return chosen ? { ...f, leaseId: chosen.id, amount: f.amount || moneyText(chosen.balance) } : { ...f, leaseId: null };
        });
      })
      .catch((e) => alive && (setError(e), setLeases([])));
    return () => {
      alive = false;
    };
  }, [tenant?.id]);

  if (!preset || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const lease = leases?.find((l) => l.id === form.leaseId);
  const amount = String(form.amount).trim() ? parseOMR(form.amount) : null;
  const after = lease && amount ? lease.balance - amount : null;

  const save = async () => {
    if (!tenant) return setError({ code: 'validation.required', field: 'tenant' });
    if (!lease) return setError({ code: 'payment.leaseNotFound', field: 'leaseId' });
    if (!amount || amount <= 0) return setError({ code: 'validation.required', field: 'amount' });
    if (!isDateText(form.date)) return setError({ code: 'validation.date', field: 'date' });
    if (form.method === 'CHEQUE') {
      if (!form.chequeNo.trim()) return setError({ code: 'validation.required', field: 'chequeNo' });
      if (!form.bankName.trim()) return setError({ code: 'validation.required', field: 'bankName' });
      if (form.chequeDate && !isDateText(form.chequeDate)) return setError({ code: 'validation.date', field: 'chequeDate' });
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await financeApi.createPayment({
        tenantId: tenant.id,
        leaseId: lease.id,
        amount,
        date: form.date,
        method: form.method,
        reference: ['BANK_TRANSFER', 'CARD', 'ONLINE'].includes(form.method) ? form.reference : undefined,
        bankName: ['CHEQUE', 'BANK_TRANSFER'].includes(form.method) ? form.bankName : undefined,
        chequeNo: form.method === 'CHEQUE' ? form.chequeNo : undefined,
        chequeDate: form.method === 'CHEQUE' && form.chequeDate ? form.chequeDate : undefined,
        notes: form.notes,
      });
      onSaved(saved);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('payments.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button icon="check" title={t('payments.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <PickerButton label={t('payments.tenant')} value={tenant?.name} placeholder={t('leases.pickTenant')} onPress={() => setPicking(true)} error={fieldError('tenant')} />

      {tenant ? (
        leases === null ? (
          <Loading />
        ) : leases.length === 0 ? (
          <Txt muted>{t('payments.noLeases')}</Txt>
        ) : (
          <View style={{ gap: SPACING.sm }}>
            <Txt weight="weightMedium" size="small">{t('payments.lease')}</Txt>
            {leases.map((l) => {
              const selected = l.id === form.leaseId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => setForm((f) => ({ ...f, leaseId: l.id, amount: moneyText(l.balance) || f.amount }))}
                  style={[styles.lease, selected && styles.leaseSelected]}
                >
                  <Row>
                    <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={20} color={selected ? COLORS.primary : COLORS.textMuted} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt weight="weightMedium">{`${l.number} · ${l.property.name} · ${l.unit.number}`}</Txt>
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        <Txt muted size="small">{t('payments.leaseBalance')}</Txt>
                        <Money baisa={l.balance} size={FONT.small} weight="weightMedium" color={l.overdue ? COLORS.danger : COLORS.textDark} />
                        {l.overdue ? <Badge label={t('finance.overdue')} tone="danger" /> : null}
                      </Row>
                    </View>
                  </Row>
                </Pressable>
              );
            })}
            {fieldError('leaseId') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('leaseId')}</Txt> : null}
          </View>
        )
      ) : null}

      <FieldRow>
        <MoneyField label={t('payments.amount')} value={form.amount} onChangeText={set('amount')} error={fieldError('amount')} />
        <DateField label={t('payments.date')} value={form.date} onChangeText={set('date')} error={fieldError('date')} />
      </FieldRow>
      {after !== null ? (
        <View style={[styles.after, after < 0 && { backgroundColor: COLORS.infoSoft }]}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Txt size="small">{after < 0 ? t('payments.creditAfter') : t('payments.balanceAfter')}</Txt>
            <Money baisa={Math.abs(after)} size={FONT.small} weight="weightBold" />
          </Row>
        </View>
      ) : null}

      <Txt weight="weightMedium" size="small">{t('payments.method')}</Txt>
      <ChipSelect value={form.method} onChange={set('method')} options={METHODS.map((m) => ({ value: m, label: t(`payments.methods.${m}`) }))} />
      {form.method === 'CHEQUE' ? (
        <>
          <FieldRow>
            <Field label={t('payments.chequeNo')} value={form.chequeNo} onChangeText={set('chequeNo')} error={fieldError('chequeNo')} />
            <Field label={t('payments.bankName')} value={form.bankName} onChangeText={set('bankName')} error={fieldError('bankName')} />
          </FieldRow>
          <DateField label={t('payments.chequeDate')} value={form.chequeDate} onChangeText={set('chequeDate')} error={fieldError('chequeDate')} hint={t('payments.chequeDateHint')} />
        </>
      ) : null}
      {form.method === 'BANK_TRANSFER' ? (
        <FieldRow>
          <Field label={t('payments.reference')} value={form.reference} onChangeText={set('reference')} />
          <Field label={t('payments.bankName')} value={form.bankName} onChangeText={set('bankName')} />
        </FieldRow>
      ) : null}
      {['CARD', 'ONLINE'].includes(form.method) ? <Field label={t('payments.reference')} value={form.reference} onChangeText={set('reference')} /> : null}
      <Field label={t('payments.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />

      <TenantPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(x) => {
          setPicking(false);
          if (x.id !== tenant?.id) {
            setLeases(null);
            setForm((f) => ({ ...f, leaseId: null, amount: '' }));
          }
          setTenant({ id: x.id, name: x.name });
        }}
      />
    </Sheet>
  );
}

function TenantPicker({ visible, onClose, onSelect }) {
  const { t } = useI18n();
  const [tenants, setTenants] = useState(null);
  const [balances, setBalances] = useState({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFilter('');
    tenantsApi.list().then(setTenants).catch(() => setTenants([]));
    financeApi
      .balances()
      .then((rows) => setBalances(Object.fromEntries(rows.map((r) => [r.id, r]))))
      .catch(() => setBalances({}));
  }, [visible]);

  const list = useMemo(
    () =>
      (tenants ?? [])
        .filter((x) => !filter.trim() || matches([x.name, x.phone, x.civilId].filter(Boolean).join(' '), filter))
        .sort((a, b) => (balances[b.id]?.receivable ?? 0) - (balances[a.id]?.receivable ?? 0)),
    [tenants, filter, balances],
  );

  return (
    <Sheet visible={visible} title={t('leases.pickTenant')} onClose={onClose}>
      <Field value={filter} onChangeText={setFilter} placeholder={t('tenants.filterPlaceholder')} />
      {tenants === null ? (
        <Loading />
      ) : (
        <View style={styles.list}>
          {list.map((x, i) => (
            <Pressable key={x.id} onPress={() => onSelect(x)}>
              <Row style={[styles.row, i > 0 && styles.divider]}>
                <View style={{ flex: 1 }}>
                  <Txt weight="weightMedium">{x.name}</Txt>
                  <Txt muted size="small">{[x.phone, x.civilId].filter(Boolean).join(' · ')}</Txt>
                </View>
                {balances[x.id]?.receivable ? <Money baisa={balances[x.id].receivable} size={13} color={balances[x.id].overdue ? COLORS.danger : COLORS.textDark} /> : null}
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

// ================================================================ receipt

export function ReceiptSheet({ paymentId, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!paymentId) return;
    setPayment(null);
    setError(null);
    setVoiding(false);
    setReason('');
    financeApi.payment(paymentId).then(setPayment).catch(setError);
  }, [paymentId]);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    }
  };

  const doVoid = () =>
    run(async () => {
      if (!reason.trim()) throw { code: 'validation.required' };
      setBusy(true);
      try {
        setPayment(await financeApi.voidPayment(paymentId, reason.trim()));
        setVoiding(false);
        onChanged?.();
      } finally {
        setBusy(false);
      }
    });

  const p = payment;
  const info = p
    ? [
        [t('receipt.receivedFrom'), p.tenant.name],
        [t('receipt.forLease'), `${p.lease.number} · ${p.lease.property.name} · ${p.lease.unit.number}`],
        [t('payments.date'), formatDate(p.date, lang)],
        [t('receipt.method'), t(`payments.methods.${p.method}`)],
        p.chequeNo ? [t('payments.chequeNo'), [p.chequeNo, p.bankName, p.chequeDate ? formatDate(p.chequeDate, lang) : null].filter(Boolean).join(' · ')] : null,
        p.reference ? [t('payments.reference'), p.reference] : null,
        p.notes ? [t('payments.notes'), p.notes] : null,
      ].filter(Boolean)
    : [];

  return (
    <Sheet
      visible={!!paymentId}
      title={p ? `${t('receipt.title')} ${p.number}` : t('receipt.title')}
      onClose={onClose}
      footer={
        p ? (
          <>
            <Button variant="secondary" icon="printer-outline" title={t('receipt.print')} onPress={() => run(() => printReceipt(p, t, lang))} />
            <Button icon="share-variant-outline" title={t('receipt.share')} onPress={() => run(() => shareReceipt(p, t, lang))} />
          </>
        ) : null
      }
    >
      <ErrorBox error={error} />
      {!p && !error ? <Loading /> : null}
      {p ? (
        <>
          <View style={[styles.amountBox, p.status === 'VOIDED' && { backgroundColor: COLORS.dangerSoft }]}>
            <Money baisa={p.amount} size={28} weight="weightBold" color={p.status === 'VOIDED' ? COLORS.danger : COLORS.textDark} />
            {p.status === 'VOIDED' ? <Badge label={t('payments.voided')} tone="danger" /> : null}
          </View>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('receipt.leaseBalance')}</Txt>
            <Money baisa={p.leaseBalance} weight="weightBold" color={p.leaseBalance > 0 ? COLORS.danger : COLORS.success} />
          </Row>
          {p.status === 'VOIDED' ? (
            <Txt style={{ color: COLORS.danger }}>{t('payments.voidedOn', { date: formatDate(p.voidedAt, lang), reason: p.voidReason })}</Txt>
          ) : canEdit('financials') ? (
            voiding ? (
              <View style={styles.voidBox}>
                <Txt size="small" style={{ color: COLORS.danger }}>{t('payments.voidHint')}</Txt>
                <Field label={t('payments.voidReason')} value={reason} onChangeText={setReason} multiline inputStyle={{ minHeight: 50 }} />
                <Row style={{ justifyContent: 'flex-end' }}>
                  <Button small variant="secondary" title={t('common.cancel')} onPress={() => setVoiding(false)} />
                  <Button small variant="danger" icon="cancel" title={t('payments.void')} loading={busy} disabled={!reason.trim()} onPress={doVoid} />
                </Row>
              </View>
            ) : (
              <Button small variant="danger" icon="cancel" title={t('payments.void')} onPress={() => setVoiding(true)} style={{ alignSelf: 'flex-start' }} />
            )
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  lease: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md },
  leaseSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  after: { backgroundColor: COLORS.surfaceSoft, borderRadius: RADIUS.md, padding: SPACING.md },
  amountBox: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.lg, padding: SPACING.lg, alignItems: 'center', gap: SPACING.sm },
  voidBox: { borderWidth: 1, borderColor: COLORS.dangerSoft, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
