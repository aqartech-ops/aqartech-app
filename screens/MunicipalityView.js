import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { financeApi } from '../services/api';
import { parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import { DateField, dateText, formatDate, isDateText, today } from '../components/Fields';
import ExportButton from '../components/ExportButton';
import { day, omr } from '../services/exportCsv';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, Loading, Row, Sheet, Txt, errorText } from '../components/ui';
import { BEARERS, PAID_FROM } from './ExpensesView';

// Municipality registration of leases (عقود البلدية): who still needs registering, renewals, and the fee as an expense.

const STATE_TONE = { UNREGISTERED: 'danger', EXPIRING: 'warning', REGISTERED: 'success' };

export function MunicipalityTab({ editable, version, onChanged }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('unregistered');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [registering, setRegistering] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await financeApi.municipality(filter));
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load, version]);

  const visible = (rows ?? []).filter(
    (r) => !text.trim() || matches([r.tenant.name, r.lease.number, r.unit.number, r.property.name, r.last?.registrationNo].filter(Boolean).join(' '), text),
  );

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect value={filter} onChange={setFilter} options={['unregistered', 'expiring', 'all'].map((f) => ({ value: f, label: t(`municipality.filters.${f}`) }))} />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Field value={text} onChangeText={setText} placeholder={t('municipality.searchPlaceholder')} />
        </View>
        <ExportButton
          filename={`municipality-${filter}`}
          build={() => [
            [t('payments.lease'), t('payments.tenant'), t('expenses.property'), t('expenses.unit'), t('finance.status'), t('municipality.registrationNo'), t('municipality.registeredAt'), t('municipality.expiresAt'), t('municipality.fee')],
            ...visible.map((r) => [r.lease.number, r.tenant.name, r.property.name, r.unit.number, t(`municipality.states.${r.state}`), r.last?.registrationNo, day(r.last?.registeredAt), day(r.last?.expiresAt), omr(r.last?.fee)]),
          ]}
        />
      </Row>
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="file-certificate-outline" body={t(`municipality.empty.${filter}`)} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((r, i) => (
            <Row key={r.lease.id} style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                  <Txt weight="weightMedium">{r.tenant.name}</Txt>
                  <Badge label={t(`municipality.states.${r.state}`)} tone={STATE_TONE[r.state]} />
                </Row>
                <Txt muted size="small">{`${r.lease.number} · ${r.property.name} · ${r.unit.number}`}</Txt>
                {r.last ? (
                  <Txt muted size="small">
                    {[r.last.registrationNo, formatDate(r.last.registeredAt, lang), r.last.expiresAt ? t('municipality.until', { date: formatDate(r.last.expiresAt, lang) }) : null].filter(Boolean).join(' · ')}
                  </Txt>
                ) : null}
              </View>
              {editable ? (
                <Button id="municipality.register" small variant={r.state === 'REGISTERED' ? 'secondary' : 'primary'} icon="file-certificate-outline" title={r.last ? t('municipality.renew') : t('municipality.register')} onPress={() => setRegistering(r)} />
              ) : null}
            </Row>
          ))}
        </Card>
      )}
      <RegisterSheet
        row={registering}
        onClose={() => setRegistering(null)}
        onSaved={() => {
          setRegistering(null);
          onChanged();
        }}
      />
    </View>
  );
}

/** row = { lease: {id, number, endDate, startDate}, tenant, last } */
export function RegisterSheet({ row, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!row) return;
    setForm({ registrationNo: '', registeredAt: today(), expiresAt: dateText(row.lease.endDate), fee: '', bearer: 'TENANT', paidFrom: 'CASH', notes: '' });
    setBusy(false);
    setError(null);
  }, [row]);

  if (!row || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    if (!form.registrationNo.trim()) return setError({ code: 'validation.required', field: 'registrationNo' });
    if (!isDateText(form.registeredAt)) return setError({ code: 'validation.date', field: 'registeredAt' });
    if (form.expiresAt && !isDateText(form.expiresAt)) return setError({ code: 'validation.date', field: 'expiresAt' });
    const fee = String(form.fee).trim() ? parseOMR(form.fee) : 0;
    if (fee === null) return setError({ code: 'validation.invalid', field: 'fee' });
    setBusy(true);
    setError(null);
    try {
      await financeApi.registerMunicipality({ leaseId: row.lease.id, ...form, fee, expiresAt: form.expiresAt || undefined });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={`${row.last ? t('municipality.renew') : t('municipality.register')} · ${row.lease.number}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Txt muted>{row.tenant?.name}</Txt>
      <Field label={t('municipality.registrationNo')} value={form.registrationNo} onChangeText={set('registrationNo')} error={fieldError('registrationNo')} />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('municipality.registeredAt')} value={form.registeredAt} onChangeText={set('registeredAt')} error={fieldError('registeredAt')} hint=" " />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('municipality.expiresAt')} value={form.expiresAt} onChangeText={set('expiresAt')} error={fieldError('expiresAt')} hint=" " />
        </View>
      </Row>
      <MoneyField label={t('municipality.fee')} value={form.fee} onChangeText={set('fee')} error={fieldError('fee')} hint={t('municipality.feeHint')} />
      {String(form.fee).trim() ? (
        <>
          <Txt weight="weightMedium" size="small">{t('expenses.bearer')}</Txt>
          <ChipSelect value={form.bearer} onChange={set('bearer')} options={BEARERS.map((b) => ({ value: b, label: t(`expenses.bearers.${b}`) }))} />
          <Txt muted size="small">{t(`expenses.bearerHints.${form.bearer}`)}</Txt>
          {fieldError('bearer') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('bearer')}</Txt> : null}
          <Txt weight="weightMedium" size="small">{t('expenses.paidFrom')}</Txt>
          <ChipSelect value={form.paidFrom} onChange={set('paidFrom')} options={PAID_FROM.map((p) => ({ value: p, label: t(`finance.accounts.${p}`) }))} />
        </>
      ) : null}
      <Field label={t('payments.notes')} value={form.notes} onChangeText={set('notes')} />
    </Sheet>
  );
}

/** Registrations of one lease (inside the lease page). */
export function LeaseMunicipalityCard({ lease, editable, onChanged }) {
  const { t, lang } = useI18n();
  const [registering, setRegistering] = useState(false);
  const records = lease.municipality ?? [];
  if (lease.status === 'DRAFT') return null;
  const last = records[0] ?? null;
  return (
    <Card style={{ gap: SPACING.sm }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{t('municipality.title')}</Txt>
        {editable ? (
          <Button id="municipality.register" small variant={last ? 'secondary' : 'primary'} icon="file-certificate-outline" title={last ? t('municipality.renew') : t('municipality.register')} onPress={() => setRegistering(true)} />
        ) : null}
      </Row>
      {records.length === 0 ? (
        <Txt style={{ color: COLORS.danger }}>{t('municipality.states.UNREGISTERED')}</Txt>
      ) : (
        records.map((r) => (
          <Row key={r.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt size="small" weight="weightMedium">{r.registrationNo}</Txt>
              <Txt muted size="small">{[formatDate(r.registeredAt, lang), r.expiresAt ? t('municipality.until', { date: formatDate(r.expiresAt, lang) }) : null].filter(Boolean).join(' · ')}</Txt>
            </View>
            {r.fee ? <Money baisa={r.fee} size={13} /> : null}
          </Row>
        ))
      )}
      {registering ? (
        <RegisterSheet
          row={{ lease, tenant: lease.tenant, last }}
          onClose={() => setRegistering(false)}
          onSaved={() => {
            setRegistering(false);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
