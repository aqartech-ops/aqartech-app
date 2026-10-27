import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { leasesApi, propertiesApi, tenantsApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatOMR, parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import { DateField, PickerButton, dateText, formatDate, isDateText, today } from '../components/Fields';
import {
  Badge,
  BackButton,
  Button,
  Card,
  ChipSelect,
  EmptyState,
  ErrorBox,
  Field,
  FieldRow,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  Txt,
  errorText,
  toLatinDigits,
} from '../components/ui';

// Leases (العقود): list, details with schedule, form, renew / terminate. Part of the tenants section.

export const LEASE_TONE = { DRAFT: 'neutral', ACTIVE: 'success', ENDED: 'neutral', TERMINATED: 'danger', RENEWED: 'info' };
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'];
const RENEWAL = ['PENDING', 'RENEW', 'NOT_RENEW', 'NEGOTIATING'];
const DAY = 86_400_000;
const CHARGE_TONE = { SCHEDULED: 'neutral', POSTED: 'info', CANCELLED: 'danger' };

const money = (baisa) => (baisa ? formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, '') : '');
const moneyOrNull = (text) => (String(text ?? '').trim() ? parseOMR(text) ?? NaN : null);
const daysLeft = (endDate) => Math.ceil((new Date(endDate).getTime() - Date.now()) / DAY);

/** start + n months − 1 day, as YYYY-MM-DD */
function endAfterMonths(start, months) {
  if (!isDateText(start)) return '';
  const d = new Date(`${start}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()) - DAY);
  return end.toISOString().slice(0, 10);
}

// =================================================================== list

export function LeasesTab({ onOpen, onNew, editable }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('active');
  const [text, setText] = useState('');
  const [leases, setLeases] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLeases(await leasesApi.list({ filter }));
    } catch (e) {
      setError(e);
      setLeases([]);
    }
  }, [filter]);

  useEffect(() => {
    setLeases(null);
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      (leases ?? []).filter(
        (l) => !text.trim() || matches([l.number, l.tenant.name, l.unit.number, l.property.name, l.municipalityNo].filter(Boolean).join(' '), text),
      ),
    [leases, text],
  );

  return (
    <View style={{ gap: SPACING.md }}>
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Field value={text} onChangeText={setText} placeholder={t('search.placeholder')} />
        </View>
        {editable ? <Button icon="file-sign" title={t('leases.add')} onPress={onNew} /> : null}
      </Row>
      <ChipSelect
        value={filter}
        onChange={setFilter}
        options={['active', 'expiring', 'draft', 'ended', 'all'].map((f) => ({ value: f, label: t(`leases.filters.${f}`) }))}
      />
      <ErrorBox error={error} onRetry={load} />
      {leases === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="file-sign" body={t('leases.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((l, i) => (
            <LeaseRow key={l.id} lease={l} first={i === 0} onPress={() => onOpen(l.id)} />
          ))}
        </Card>
      )}
    </View>
  );
}

function LeaseRow({ lease: l, first, onPress, hideTenant }) {
  const { t, lang, forwardIcon } = useI18n();
  const left = daysLeft(l.endDate);
  const soon = l.status === 'ACTIVE' && left <= 90;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
      <Row style={[styles.row, !first && styles.divider]} gap={SPACING.md}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
            <Txt weight="weightMedium">{hideTenant ? l.number : l.tenant.name}</Txt>
            <Badge label={t(`leases.statusValues.${l.status}`)} tone={LEASE_TONE[l.status]} />
            {soon ? <Badge label={t('leases.daysLeft', { count: Math.max(left, 0) })} tone={left <= 30 ? 'danger' : 'warning'} /> : null}
          </Row>
          <Txt muted size="small">
            {[hideTenant ? null : l.number, `${l.property.name} · ${l.unit.number}`, `${formatDate(l.startDate, lang)} → ${formatDate(l.endDate, lang)}`]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
        </View>
        <Money baisa={l.monthlyRent} size={14} weight="weightMedium" />
        <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
      </Row>
    </Pressable>
  );
}

/** Leases of one tenant (inside the tenant's page). */
export function TenantLeases({ tenantId, onOpen, onNew, editable }) {
  const { t } = useI18n();
  const [leases, setLeases] = useState(null);
  useEffect(() => {
    leasesApi.list({ tenantId, filter: 'all' }).then(setLeases).catch(() => setLeases([]));
  }, [tenantId]);
  return (
    <View style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt size="medium" weight="weightBold">{t('leases.tenantLeases')}</Txt>
        {editable ? <Button small icon="file-sign" title={t('leases.add')} onPress={onNew} /> : null}
      </Row>
      {leases === null ? (
        <Loading />
      ) : leases.length === 0 ? (
        <Card>
          <EmptyState icon="file-sign" body={t('leases.noLeases')} />
        </Card>
      ) : (
        <Card padded={false}>
          {leases.map((l, i) => (
            <LeaseRow key={l.id} lease={l} first={i === 0} hideTenant onPress={() => onOpen(l.id)} />
          ))}
        </Card>
      )}
    </View>
  );
}

// =================================================================== detail

export function LeaseDetail({ id, onBack, onOpen, onOpenTenant, backLabel }) {
  const { t, lang, isRTL, start } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('tenants');
  const [lease, setLease] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [terminating, setTerminating] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLease(await leasesApi.get(id));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    }
  };

  const activate = () =>
    run(async () => {
      const ok = await confirm({ title: t('leases.activate'), message: t('leases.activateConfirm', { number: lease.number }), confirmText: t('common.confirm'), cancelText: t('common.cancel') });
      if (ok) setLease(await leasesApi.activate(id));
    });

  const remove = () =>
    run(async () => {
      const ok = await confirm({ title: t('common.delete'), message: t('leases.deleteConfirm', { number: lease.number }), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true });
      if (ok) {
        await leasesApi.remove(id);
        onBack();
      }
    });

  const setRenewal = (value) => run(async () => {
    await leasesApi.update(id, { renewalStatus: value });
    load();
  });

  const back = <BackButton onPress={onBack} label={backLabel} />;
  if (!lease) {
    return (
      <Screen back={back}>
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  const left = daysLeft(lease.endDate);
  const info = [
    [t('leases.unit'), `${lease.property.name} · ${lease.unit.number}`],
    [t('leases.startDate'), formatDate(lease.startDate, lang)],
    [t('leases.endDate'), formatDate(lease.endDate, lang)],
    [t('leases.frequency'), t(`leases.frequencyValues.${lease.paymentFrequency}`)],
    [t('leases.dueDay'), String(lease.dueDay)],
    [t('leases.municipalityNo'), lease.municipalityNo],
  ].filter(([, v]) => v);

  return (
    <Screen back={back} title={lease.number} subtitle={lease.tenant.name}>
      <View style={{ gap: SPACING.lg }}>
        <ErrorBox error={error} />

        <Row style={{ flexWrap: 'wrap' }}>
          <Badge label={t(`leases.statusValues.${lease.status}`)} tone={LEASE_TONE[lease.status]} />
          {lease.status === 'ACTIVE' ? (
            <Badge label={left >= 0 ? t('leases.daysLeft', { count: left }) : t('leases.endedAgo')} tone={left <= 30 ? 'danger' : left <= 90 ? 'warning' : 'neutral'} />
          ) : null}
        </Row>

        {editable ? (
          <Row style={{ flexWrap: 'wrap' }}>
            {lease.status === 'DRAFT' ? <Button small icon="check-decagram-outline" title={t('leases.activate')} onPress={activate} /> : null}
            {['DRAFT', 'ACTIVE'].includes(lease.status) ? (
              <Button small variant="secondary" icon="pencil-outline" title={t('common.edit')} onPress={() => setEditing(lease)} />
            ) : null}
            {['ACTIVE', 'ENDED'].includes(lease.status) ? (
              <Button small variant="secondary" icon="autorenew" title={t('leases.renew')} onPress={() => setRenewing(true)} />
            ) : null}
            {lease.status === 'ACTIVE' ? <Button small variant="danger" icon="file-cancel-outline" title={t('leases.terminate')} onPress={() => setTerminating(true)} /> : null}
            {lease.status === 'DRAFT' ? <Button small variant="danger" icon="delete-outline" title={t('common.delete')} onPress={remove} /> : null}
          </Row>
        ) : null}

        <Card style={{ gap: SPACING.sm }}>
          <Pressable onPress={() => onOpenTenant?.(lease.tenant.id)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('leases.tenant')}</Txt>
              <Txt weight="weightMedium" style={{ color: COLORS.primaryDark }}>{lease.tenant.name}</Txt>
            </Row>
          </Pressable>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('leases.monthlyRent')}</Txt>
            <Money baisa={lease.monthlyRent} weight="weightBold" />
          </Row>
          {lease.discount ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('leases.discount')}</Txt>
              <Money baisa={lease.discount} />
            </Row>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('leases.deposit')}</Txt>
            <Money baisa={lease.deposit} />
          </Row>
          {lease.municipalityFee ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('leases.municipalityFee')}</Txt>
              <Money baisa={lease.municipalityFee} />
            </Row>
          ) : null}
          {lease.terminatedAt ? (
            <Txt style={{ color: COLORS.danger }}>
              {t('leases.terminate')}: {formatDate(lease.terminatedAt, lang)} {lease.terminationReason ? `· ${lease.terminationReason}` : ''}
            </Txt>
          ) : null}
          {lease.notes ? <Txt muted>{lease.notes}</Txt> : null}
        </Card>

        {lease.status === 'ACTIVE' && editable ? (
          <Card style={{ gap: SPACING.sm }}>
            <Txt weight="weightBold">{t('leases.renewalStatus')}</Txt>
            <ChipSelect value={lease.renewalStatus} onChange={setRenewal} options={RENEWAL.map((r) => ({ value: r, label: t(`leases.renewalValues.${r}`) }))} />
          </Card>
        ) : null}

        <ScheduleCard schedule={lease.schedule} total={lease.total} deposit={lease.depositCharge} />
      </View>

      <LeaseForm
        lease={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <TerminateSheet
        visible={terminating}
        onClose={() => setTerminating(false)}
        onConfirm={(data) =>
          run(async () => {
            setLease(await leasesApi.terminate(id, data));
            setTerminating(false);
          })
        }
      />
      <RenewSheet
        visible={renewing}
        currentRent={lease.monthlyRent}
        onClose={() => setRenewing(false)}
        onConfirm={(data) =>
          run(async () => {
            const created = await leasesApi.renew(id, data);
            setRenewing(false);
            onOpen?.(created.id);
          })
        }
      />
    </Screen>
  );
}

/** Draft: the computed schedule. Active and later: the saved charges with their status in the ledger. */
function ScheduleCard({ schedule, total, deposit }) {
  const { t, lang } = useI18n();
  if (!schedule) return null;
  const live = schedule.filter((x) => x.status !== 'CANCELLED');
  return (
    <Card style={{ gap: SPACING.sm }}>
      <Txt weight="weightBold">{t('leases.schedule')}</Txt>
      <Row>
        <Txt muted>{t('leases.scheduleSummary', { count: live.length })}</Txt>
        <Money baisa={total} weight="weightBold" />
      </Row>
      {deposit ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={SPACING.sm}>
            <Txt muted size="small">{t('finance.depositCharge')}</Txt>
            <Badge label={t(`finance.chargeStatus.${deposit.status}`)} tone={CHARGE_TONE[deposit.status]} />
          </Row>
          <Money baisa={deposit.amount} size={13} />
        </Row>
      ) : null}
      <View style={styles.table}>
        {schedule.map((x, i) => (
          <Row key={x.index} style={[styles.scheduleRow, i > 0 && styles.divider]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                <Txt size="small" weight="weightMedium" style={x.status === 'CANCELLED' ? { textDecorationLine: 'line-through' } : null}>
                  {t('leases.installment', { index: x.index })} {x.partial ? `· ${t('leases.prorated')}` : ''}
                </Txt>
                {x.status ? <Badge label={t(`finance.chargeStatus.${x.status}`)} tone={CHARGE_TONE[x.status]} /> : null}
              </Row>
              <Txt muted size="small">
                {formatDate(x.periodStart, lang)} → {formatDate(x.periodEnd, lang)}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Money baisa={x.amount} size={13} />
              <Txt muted size="small">{formatDate(x.dueDate, lang)}</Txt>
            </View>
          </Row>
        ))}
      </View>
    </Card>
  );
}

function TerminateSheet({ visible, onClose, onConfirm }) {
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) {
      setDate(today());
      setReason('');
    }
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      title={t('leases.terminate')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button variant="danger" title={t('leases.terminate')} onPress={() => onConfirm({ date, reason })} disabled={!isDateText(date)} />
        </>
      }
    >
      <Txt muted>{t('leases.terminateConfirm')}</Txt>
      <Txt muted size="small">{t('leases.terminateFinanceHint')}</Txt>
      <DateField label={t('leases.terminateDate')} value={date} onChangeText={setDate} />
      <Field label={t('leases.terminateReason')} value={reason} onChangeText={setReason} multiline inputStyle={{ minHeight: 60 }} />
    </Sheet>
  );
}

function RenewSheet({ visible, currentRent, onClose, onConfirm }) {
  const { t } = useI18n();
  const [months, setMonths] = useState(12);
  const [rent, setRent] = useState('');
  useEffect(() => {
    if (visible) {
      setMonths(12);
      setRent(money(currentRent));
    }
  }, [visible, currentRent]);
  const value = moneyOrNull(rent);
  return (
    <Sheet
      visible={visible}
      title={t('leases.renewTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('leases.renew')} onPress={() => onConfirm({ months, monthlyRent: value })} disabled={!value || Number.isNaN(value)} />
        </>
      }
    >
      <Txt muted>{t('leases.renewHint')}</Txt>
      <Txt weight="weightMedium" size="small">{t('leases.duration')}</Txt>
      <ChipSelect value={months} onChange={setMonths} options={[6, 12, 24].map((m) => ({ value: m, label: t('leases.months', { count: m }) }))} />
      <MoneyField label={t('leases.newRent')} value={rent} onChangeText={setRent} />
    </Sheet>
  );
}

// =================================================================== form

/**
 * New lease or edit. `lease` = existing lease | {} (new) | { unitId, unit, property, tenantId, tenant } (prefilled).
 * Active leases only allow terms (renewal status, municipality, notes).
 */
export function LeaseForm({ lease, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = lease && !lease.id;
  const locked = lease?.status === 'ACTIVE';
  const [form, setForm] = useState({});
  const [unitPicker, setUnitPicker] = useState(false);
  const [tenantPicker, setTenantPicker] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!lease) return;
    const start = dateText(lease.startDate) || today();
    setForm({
      unitId: lease.unitId ?? lease.unit?.id ?? '',
      unitLabel: lease.unit ? `${lease.property?.name ?? ''} · ${lease.unit.number}` : '',
      tenantId: lease.tenantId ?? lease.tenant?.id ?? '',
      tenantName: lease.tenant?.name ?? '',
      startDate: start,
      endDate: dateText(lease.endDate) || endAfterMonths(start, 12),
      monthlyRent: money(lease.monthlyRent ?? lease.unit?.askingRent),
      discount: money(lease.discount),
      deposit: money(lease.deposit ?? lease.unit?.askingRent),
      paymentFrequency: lease.paymentFrequency ?? 'MONTHLY',
      dueDay: String(lease.dueDay ?? 1),
      municipalityNo: lease.municipalityNo ?? '',
      municipalityFee: money(lease.municipalityFee),
      notes: lease.notes ?? '',
    });
    setPreview(null);
    setError(null);
    setBusy(false);
  }, [lease]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  // Live schedule preview
  useEffect(() => {
    if (!lease || locked) return undefined;
    const rent = moneyOrNull(form.monthlyRent);
    if (!isDateText(form.startDate) || !isDateText(form.endDate) || !rent || Number.isNaN(rent)) {
      setPreview(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      leasesApi
        .preview({
          startDate: form.startDate,
          endDate: form.endDate,
          monthlyRent: rent,
          discount: moneyOrNull(form.discount) || 0,
          paymentFrequency: form.paymentFrequency,
          dueDay: Number(form.dueDay) || 1,
        })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [lease, locked, form.startDate, form.endDate, form.monthlyRent, form.discount, form.paymentFrequency, form.dueDay]);

  const save = async (activate) => {
    const values = {
      monthlyRent: moneyOrNull(form.monthlyRent),
      discount: moneyOrNull(form.discount) ?? 0,
      deposit: moneyOrNull(form.deposit) ?? 0,
      municipalityFee: moneyOrNull(form.municipalityFee),
    };
    for (const [k, val] of Object.entries(values)) if (Number.isNaN(val)) return setError({ code: 'validation.invalid', field: k });
    if (!locked) {
      if (!form.unitId) return setError({ code: 'lease.unitNotFound', field: 'unitId' });
      if (!form.tenantId) return setError({ code: 'lease.tenantNotFound', field: 'tenantId' });
      if (!isDateText(form.startDate)) return setError({ code: 'validation.date', field: 'startDate' });
      if (!isDateText(form.endDate)) return setError({ code: 'validation.date', field: 'endDate' });
      if (!values.monthlyRent) return setError({ code: 'validation.required', field: 'monthlyRent' });
    }
    const payload = locked
      ? { municipalityNo: form.municipalityNo, municipalityFee: values.municipalityFee, notes: form.notes }
      : {
          unitId: form.unitId,
          tenantId: form.tenantId,
          startDate: form.startDate,
          endDate: form.endDate,
          ...values,
          paymentFrequency: form.paymentFrequency,
          dueDay: Number(form.dueDay) || 1,
          municipalityNo: form.municipalityNo,
          notes: form.notes,
          activate: isNew ? activate : undefined,
        };
    setBusy(true);
    setError(null);
    try {
      const saved = isNew ? await leasesApi.create(payload) : await leasesApi.update(lease.id, payload);
      if (!isNew && activate && lease.status === 'DRAFT') await leasesApi.activate(lease.id);
      onSaved(saved);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!lease}
      title={isNew ? t('leases.add') : t('leases.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          {!locked ? <Button variant="secondary" title={t('leases.saveDraft')} onPress={() => save(false)} loading={busy} /> : null}
          <Button title={locked ? t('common.save') : t('leases.saveActivate')} onPress={() => save(!locked)} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      {!locked ? (
        <>
          <PickerButton label={t('leases.unit')} value={form.unitLabel} placeholder={t('leases.pickUnit')} onPress={() => setUnitPicker(true)} error={fieldError('unitId')} />
          <PickerButton label={t('leases.tenant')} value={form.tenantName} placeholder={t('leases.pickTenant')} onPress={() => setTenantPicker(true)} error={fieldError('tenantId')} />
          <FieldRow>
            <DateField
              label={t('leases.startDate')}
              value={form.startDate}
              onChangeText={(v) => setForm((f) => ({ ...f, startDate: v, endDate: isDateText(v) && !f.endTouched ? endAfterMonths(v, 12) : f.endDate }))}
              error={fieldError('startDate')}
            />
            <DateField label={t('leases.endDate')} value={form.endDate} onChangeText={(v) => setForm((f) => ({ ...f, endDate: v, endTouched: true }))} error={fieldError('endDate')} hint=" " />
          </FieldRow>
          <ChipSelect
            value={null}
            onChange={(m) => setForm((f) => ({ ...f, endDate: endAfterMonths(f.startDate, m), endTouched: true }))}
            options={[6, 12, 24].map((m) => ({ value: m, label: t('leases.months', { count: m }) }))}
          />
          <FieldRow>
            <MoneyField label={t('leases.monthlyRent')} value={form.monthlyRent} onChangeText={set('monthlyRent')} error={fieldError('monthlyRent')} />
            <MoneyField label={t('leases.discount')} value={form.discount} onChangeText={set('discount')} error={fieldError('discount')} />
          </FieldRow>
          <Txt weight="weightMedium" size="small">{t('leases.frequency')}</Txt>
          <ChipSelect value={form.paymentFrequency} onChange={set('paymentFrequency')} options={FREQUENCIES.map((f) => ({ value: f, label: t(`leases.frequencyValues.${f}`) }))} />
          <FieldRow>
            <Field
              label={t('leases.dueDay')}
              value={form.dueDay}
              onChangeText={(v) => set('dueDay')(toLatinDigits(v).replace(/[^0-9]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              inputMode="numeric"
            />
            <MoneyField label={t('leases.deposit')} value={form.deposit} onChangeText={set('deposit')} hint={t('leases.depositHint')} error={fieldError('deposit')} />
          </FieldRow>
        </>
      ) : null}
      <FieldRow>
        <Field label={t('leases.municipalityNo')} value={form.municipalityNo} onChangeText={set('municipalityNo')} />
        <MoneyField label={t('leases.municipalityFee')} value={form.municipalityFee} onChangeText={set('municipalityFee')} />
      </FieldRow>
      <Field label={t('leases.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />

      {preview ? (
        <View style={styles.preview}>
          <Row>
            <Txt muted>{t('leases.scheduleSummary', { count: preview.schedule.length })}</Txt>
            <Money baisa={preview.total} weight="weightBold" />
          </Row>
        </View>
      ) : null}

      <UnitPicker
        visible={unitPicker}
        onClose={() => setUnitPicker(false)}
        onSelect={(unit, property) => {
          setUnitPicker(false);
          setForm((f) => ({
            ...f,
            unitId: unit.id,
            unitLabel: `${property.name} · ${unit.number}`,
            monthlyRent: f.monthlyRent || money(unit.askingRent),
            deposit: f.deposit || money(unit.askingRent),
          }));
        }}
      />
      <TenantPicker
        visible={tenantPicker}
        onClose={() => setTenantPicker(false)}
        onSelect={(tenant) => {
          setTenantPicker(false);
          setForm((f) => ({ ...f, tenantId: tenant.id, tenantName: tenant.name }));
        }}
      />
    </Sheet>
  );
}

/** Step 1: property → step 2: unit (vacant first). */
function UnitPicker({ visible, onClose, onSelect }) {
  const { t, forwardIcon } = useI18n();
  const [properties, setProperties] = useState(null);
  const [property, setProperty] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setProperty(null);
    propertiesApi.list().then(setProperties).catch(() => setProperties([]));
  }, [visible]);

  const open = async (p) => {
    try {
      setProperty(await propertiesApi.get(p.id));
    } catch {
      setProperty(null);
    }
  };

  const order = { VACANT: 0, RESERVED: 1, MAINTENANCE: 2, OCCUPIED: 3 };
  const units = property ? [...property.units].sort((a, b) => order[a.status] - order[b.status]) : [];

  return (
    <Sheet visible={visible} title={property ? property.name : t('leases.pickProperty')} onClose={onClose}>
      {!property ? (
        properties === null ? (
          <Loading />
        ) : (
          <View style={styles.list}>
            {properties.map((p, i) => (
              <Pressable key={p.id} onPress={() => open(p)}>
                <Row style={[styles.row, i > 0 && styles.divider]}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="weightMedium">{p.name}</Txt>
                    <Txt muted size="small">{`${t('dashboard.vacant')}: ${p.stats.vacant} / ${p.stats.total}`}</Txt>
                  </View>
                  <MaterialCommunityIcons name={forwardIcon} size={18} color={COLORS.textMuted} />
                </Row>
              </Pressable>
            ))}
          </View>
        )
      ) : (
        <>
          <Button small variant="ghost" icon="arrow-left-right" title={t('leases.pickProperty')} onPress={() => setProperty(null)} />
          <Txt muted size="small">{t('leases.vacantOnly')}</Txt>
          <View style={styles.list}>
            {units.map((u, i) => (
              <Pressable key={u.id} onPress={() => onSelect(u, property)}>
                <Row style={[styles.row, i > 0 && styles.divider]}>
                  <Txt weight="weightBold" style={{ minWidth: 60 }}>{u.number}</Txt>
                  <View style={{ flex: 1 }}>
                    <Txt size="small">{t(`units.typeValues.${u.type}`)}</Txt>
                    {u.leases?.[0] ? <Txt muted size="small">{u.leases[0].tenant.name}</Txt> : null}
                  </View>
                  <Badge label={t(`units.statusValues.${u.status}`)} tone={u.status === 'VACANT' ? 'success' : u.status === 'OCCUPIED' ? 'danger' : 'warning'} />
                </Row>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

function TenantPicker({ visible, onClose, onSelect }) {
  const { t } = useI18n();
  const [tenants, setTenants] = useState(null);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(null);
  const { TenantForm } = require('./TenantsScreen');

  useEffect(() => {
    if (!visible) return;
    setFilter('');
    tenantsApi.list().then(setTenants).catch(() => setTenants([]));
  }, [visible]);

  const list = (tenants ?? []).filter((x) => !filter.trim() || matches([x.name, x.phone, x.civilId].filter(Boolean).join(' '), filter));

  return (
    <Sheet visible={visible} title={t('leases.pickTenant')} onClose={onClose}>
      <Button small icon="account-plus-outline" title={t('leases.newTenant')} onPress={() => setCreating({})} />
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
              </Row>
            </Pressable>
          ))}
        </View>
      )}
      <TenantForm
        tenant={creating}
        onClose={() => setCreating(null)}
        onSaved={(saved) => {
          setCreating(null);
          if (saved?.id) onSelect(saved);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  scheduleRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  preview: { backgroundColor: COLORS.primarySoft, borderRadius: RADIUS.md, padding: SPACING.md },
});
