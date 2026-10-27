import React, { useCallback, useEffect, useState } from 'react';
import { toEditable, toPayload, useFieldRules } from '../services/fields';
import CustomFields from '../components/CustomFields';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { maintenanceApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatOMR, parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import { DateField, formatDate, isDateText, today } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Segmented, Sheet, Txt, errorText } from '../components/ui';
import { BEARERS, PAID_FROM, PropertyUnitPicker } from './ExpensesView';

// Maintenance (الصيانة): work orders and contractors. Closing a work order with a cost records the expense.

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];
const PRIORITY_TONE = { URGENT: 'danger', HIGH: 'warning', NORMAL: 'info', LOW: 'neutral' };
const STATUS_TONE = { OPEN: 'warning', IN_PROGRESS: 'info', DONE: 'success', CANCELLED: 'neutral' };
const moneyText = (baisa) => (baisa ? formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, '') : '');

export default function MaintenanceProvidersScreen({ params }) {
  const { t } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('maintenance');
  const [tab, setTab] = useState('orders');
  return (
    <Screen title={t('sections.maintenance')}>
      <View style={{ gap: SPACING.lg }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'orders', label: t('maintenance.tabs.orders') },
            { value: 'vendors', label: t('maintenance.tabs.vendors') },
          ]}
        />
        {tab === 'orders' ? <WorkOrders editable={editable} openCreate={!!params?.create} focusId={params?.workOrderId} /> : <Vendors editable={editable} />}
      </View>
    </Screen>
  );
}

// ================================================================ work orders

function WorkOrders({ editable, openCreate, focusId }) {
  const { t, lang, forwardIcon } = useI18n();
  const [filter, setFilter] = useState(focusId ? 'all' : 'open');
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(openCreate && editable ? {} : null);
  const [openId, setOpenId] = useState(focusId ?? null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await maintenanceApi.list({ filter }));
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
    (w) => !text.trim() || matches([w.number, w.title, w.description, w.property.name, w.unit?.number, w.vendor?.name].filter(Boolean).join(' '), text),
  );

  return (
    <View style={{ gap: SPACING.md }}>
      {editable ? <Button icon="wrench-outline" title={t('maintenance.add')} onPress={() => setEditing({})} style={{ alignSelf: 'flex-start' }} /> : null}
      <ChipSelect value={filter} onChange={setFilter} options={['open', 'done', 'cancelled', 'all'].map((f) => ({ value: f, label: t(`maintenance.filters.${f}`) }))} />
      <Field value={text} onChangeText={setText} placeholder={t('maintenance.searchPlaceholder')} />
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="wrench-outline" body={t(`maintenance.empty.${filter}`)} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((w, i) => (
            <Pressable key={w.id} onPress={() => setOpenId(w.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{w.title}</Txt>
                    <Badge label={t(`maintenance.priorities.${w.priority}`)} tone={PRIORITY_TONE[w.priority]} />
                    <Badge label={t(`maintenance.statuses.${w.status}`)} tone={STATUS_TONE[w.status]} />
                  </Row>
                  <Txt muted size="small">
                    {[w.number, `${w.property.name} · ${w.unit ? w.unit.number : t('expenses.commonArea')}`, w.vendor?.name, formatDate(w.createdAt, lang)].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                {w.expense ? <Money baisa={w.expense.amount} size={13} /> : null}
                <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
      <WorkOrderForm
        order={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          load();
          setOpenId(saved.id);
        }}
      />
      <WorkOrderSheet id={openId} editable={editable} onClose={() => setOpenId(null)} onChanged={load} onEdit={(w) => (setOpenId(null), setEditing(w))} />
    </View>
  );
}

function WorkOrderForm({ order, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = order && !order.id;
  const [form, setForm] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [property, setProperty] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  const rules = useFieldRules('workOrder', error);

  useEffect(() => {
    if (!order) return;
    setForm({
      propertyId: order.propertyId ?? null,
      unitId: order.unitId ?? null,
      title: order.title ?? '',
      description: order.description ?? '',
      priority: order.priority ?? 'NORMAL',
      bearer: order.bearer ?? null,
      vendorId: order.vendorId ?? null,
      estimatedCost: moneyText(order.estimatedCost),
      reportedBy: order.reportedBy ?? '',
      scheduledDate: order.scheduledDate ? String(order.scheduledDate).slice(0, 10) : '',
      notes: order.notes ?? '',
      custom: toEditable(rules.custom, order.custom),
    });
    setProperty(order.property ?? null);
    setBusy(false);
    setError(null);
    maintenanceApi.vendors().then(setVendors).catch(() => setVendors([]));
  }, [order]);

  if (!order || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const bearers = property?.ownership === 'MANAGED' ? BEARERS : ['COMPANY', 'TENANT'];

  const save = async () => {
    if (!form.propertyId) return setError({ code: 'validation.required', field: 'propertyId' });
    if (!form.title.trim()) return setError({ code: 'validation.required', field: 'title' });
    if (form.scheduledDate && !isDateText(form.scheduledDate)) return setError({ code: 'validation.date', field: 'scheduledDate' });
    const estimatedCost = String(form.estimatedCost).trim() ? parseOMR(form.estimatedCost) : null;
    if (estimatedCost === null && String(form.estimatedCost).trim()) return setError({ code: 'validation.invalid', field: 'estimatedCost' });
    const payload = {
      ...form,
      custom: toPayload(rules.custom, form.custom),
      estimatedCost,
      scheduledDate: form.scheduledDate || null,
      bearer: form.bearer ?? undefined,
    };
    if (!isNew) delete payload.propertyId;
    setBusy(true);
    setError(null);
    try {
      onSaved(isNew ? await maintenanceApi.create(payload) : await maintenanceApi.update(order.id, payload));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? t('maintenance.add') : t('maintenance.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('maintenance.titleField')} value={form.title} onChangeText={set('title')} error={fieldError('title')} placeholder={t('maintenance.titlePlaceholder')} />
      {isNew ? (
        <PropertyUnitPicker
          value={{ propertyId: form.propertyId, unitId: form.unitId }}
          onChange={(v) => setForm((f) => ({ ...f, ...v }))}
          onProperty={(p) => {
            setProperty(p);
            if (p) setForm((f) => ({ ...f, bearer: f.bearer ?? (p.ownership === 'MANAGED' ? 'OWNER' : 'COMPANY') }));
          }}
          error={fieldError('propertyId')}
        />
      ) : null}
      <Txt weight="weightMedium" size="small">{t('maintenance.priority')}</Txt>
      <ChipSelect value={form.priority} onChange={set('priority')} options={PRIORITIES.map((p) => ({ value: p, label: t(`maintenance.priorities.${p}`) }))} />
      {form.bearer ? (
        <>
          <Txt weight="weightMedium" size="small">{t('expenses.bearer')}</Txt>
          <ChipSelect value={form.bearer} onChange={set('bearer')} options={bearers.map((b) => ({ value: b, label: t(`expenses.bearers.${b}`) }))} />
          <Txt muted size="small">{t(`expenses.bearerHints.${form.bearer}`)}</Txt>
          {fieldError('unitId') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('unitId')}</Txt> : null}
        </>
      ) : null}
      {vendors.length ? (
        <>
          <Txt weight="weightMedium" size="small">{rules.props('vendorId', t('expenses.vendor')).label}</Txt>
          {rules.props('vendorId', '').error ? <Txt size="small" style={{ color: COLORS.danger }}>{rules.props('vendorId', '').error}</Txt> : null}
          <ChipSelect value={form.vendorId ?? ''} onChange={(id) => set('vendorId')(id || null)} options={[{ value: '', label: t('common.none') }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]} />
        </>
      ) : null}
      <Field {...rules.props('description', t('maintenance.description'))} value={form.description} onChangeText={set('description')} multiline inputStyle={{ minHeight: 60 }} />
      <FieldRow>
        <MoneyField {...rules.props('estimatedCost', t('maintenance.estimatedCost'))} value={form.estimatedCost} onChangeText={set('estimatedCost')} error={fieldError('estimatedCost')} />
        <DateField {...rules.props('scheduledDate', t('maintenance.scheduledDate'))} value={form.scheduledDate} onChangeText={set('scheduledDate')} error={fieldError('scheduledDate')} />
      </FieldRow>
      <Field {...rules.props('reportedBy', t('maintenance.reportedBy'))} value={form.reportedBy} onChangeText={set('reportedBy')} />
      <Field label={t('payments.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 50 }} />
      <CustomFields defs={rules.custom} values={form.custom} onChange={set('custom')} error={error} />
    </Sheet>
  );
}

function WorkOrderSheet({ id, editable, onClose, onChanged, onEdit }) {
  const { t, lang } = useI18n();
  const [w, setW] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // complete | cancel
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setW(null);
    setError(null);
    setMode(null);
    maintenanceApi.get(id).then(setW).catch(setError);
  }, [id]);

  const act = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      setW(await fn());
      setMode(null);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const openComplete = () => {
    setForm({ amount: moneyText(w.estimatedCost), date: today(), paidFrom: 'CASH', bearer: w.bearer, invoiceNo: '' });
    setMode('complete');
  };

  const complete = () => {
    const amount = String(form.amount).trim() ? parseOMR(form.amount) : 0;
    if (amount === null) return setError({ code: 'validation.invalid', field: 'amount' });
    if (!isDateText(form.date)) return setError({ code: 'validation.date', field: 'date' });
    return act(() => maintenanceApi.complete(id, amount > 0 ? { ...form, amount } : { date: form.date }));
  };

  const info = w
    ? [
        [t('expenses.property'), `${w.property.name} · ${w.unit ? w.unit.number : t('expenses.commonArea')}`],
        [t('maintenance.priority'), t(`maintenance.priorities.${w.priority}`)],
        [t('expenses.bearer'), t(`expenses.bearers.${w.bearer}`)],
        w.vendor ? [t('expenses.vendor'), w.vendor.name] : null,
        w.reportedBy ? [t('maintenance.reportedBy'), w.reportedBy] : null,
        w.scheduledDate ? [t('maintenance.scheduledDate'), formatDate(w.scheduledDate, lang)] : null,
        [t('maintenance.created'), formatDate(w.createdAt, lang)],
        w.completedAt ? [t('maintenance.completed'), formatDate(w.completedAt, lang)] : null,
      ].filter(Boolean)
    : [];

  return (
    <Sheet visible={!!id} title={w ? `${w.number} · ${w.title}` : t('maintenance.workOrder')} onClose={onClose}>
      <ErrorBox error={error} />
      {!w && !error ? <Loading /> : null}
      {w ? (
        <>
          <Row style={{ flexWrap: 'wrap' }} gap={SPACING.sm}>
            <Badge label={t(`maintenance.statuses.${w.status}`)} tone={STATUS_TONE[w.status]} />
            <Badge label={t(`maintenance.priorities.${w.priority}`)} tone={PRIORITY_TONE[w.priority]} />
          </Row>
          {w.description ? <Txt>{w.description}</Txt> : null}
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          {w.estimatedCost ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('maintenance.estimatedCost')}</Txt>
              <Money baisa={w.estimatedCost} />
            </Row>
          ) : null}
          {w.expense ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('maintenance.actualCost', { number: w.expense.number })}</Txt>
              <Money baisa={w.expense.amount} weight="weightBold" color={COLORS.danger} />
            </Row>
          ) : null}
          {w.cancelReason ? <Txt style={{ color: COLORS.danger }}>{w.cancelReason}</Txt> : null}
          {w.vendor?.phone ? (
            <Button small variant="secondary" icon="phone-outline" title={w.vendor.phone} onPress={() => Linking.openURL(`tel:${w.vendor.phone}`)} style={{ alignSelf: 'flex-start' }} />
          ) : null}

          {editable && (w.status === 'OPEN' || w.status === 'IN_PROGRESS') && !mode ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {w.status === 'OPEN' ? <Button small icon="play" title={t('maintenance.start')} loading={busy} onPress={() => act(() => maintenanceApi.start(id))} /> : null}
              <Button small icon="check" title={t('maintenance.complete')} onPress={openComplete} />
              <Button small variant="secondary" icon="pencil-outline" title={t('common.edit')} onPress={() => onEdit(w)} />
              <Button small variant="danger" icon="close" title={t('maintenance.cancel')} onPress={() => (setForm({ reason: '' }), setMode('cancel'))} />
            </Row>
          ) : null}

          {mode === 'complete' ? (
            <View style={styles.box}>
              <Txt weight="weightBold">{t('maintenance.complete')}</Txt>
              <Txt muted size="small">{t('maintenance.completeHint')}</Txt>
              <FieldRow>
                <MoneyField label={t('maintenance.cost')} value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} />
                <DateField label={t('maintenance.completed')} value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: v }))} />
              </FieldRow>
              <Txt weight="weightMedium" size="small">{t('expenses.paidFrom')}</Txt>
              <ChipSelect value={form.paidFrom} onChange={(v) => setForm((f) => ({ ...f, paidFrom: v }))} options={PAID_FROM.map((p) => ({ value: p, label: t(`finance.accounts.${p}`) }))} />
              <Txt weight="weightMedium" size="small">{t('expenses.bearer')}</Txt>
              <ChipSelect
                value={form.bearer}
                onChange={(v) => setForm((f) => ({ ...f, bearer: v }))}
                options={(w.property.ownership === 'MANAGED' ? BEARERS : ['COMPANY', 'TENANT']).map((b) => ({ value: b, label: t(`expenses.bearers.${b}`) }))}
              />
              <Field label={t('expenses.invoiceNo')} value={form.invoiceNo} onChangeText={(v) => setForm((f) => ({ ...f, invoiceNo: v }))} />
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button small variant="secondary" title={t('common.cancel')} onPress={() => setMode(null)} />
                <Button small icon="check" title={t('maintenance.complete')} loading={busy} onPress={complete} />
              </Row>
            </View>
          ) : null}

          {mode === 'cancel' ? (
            <View style={styles.box}>
              <Field label={t('cheques.cancelReason')} value={form.reason} onChangeText={(v) => setForm({ reason: v })} />
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button small variant="secondary" title={t('common.back')} onPress={() => setMode(null)} />
                <Button small variant="danger" title={t('maintenance.cancel')} loading={busy} disabled={!form.reason?.trim()} onPress={() => act(() => maintenanceApi.cancel(id, form.reason.trim()))} />
              </Row>
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ================================================================ vendors

function Vendors({ editable }) {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await maintenanceApi.vendors());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (v) => {
    const ok = await confirm({ title: t('common.delete'), message: t('maintenance.deleteVendor', { name: v.name }), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true });
    if (!ok) return;
    try {
      await maintenanceApi.removeVendor(v.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const visible = (rows ?? []).filter((v) => !text.trim() || matches([v.name, v.phone, v.specialty].filter(Boolean).join(' '), text));

  return (
    <View style={{ gap: SPACING.md }}>
      {editable ? <Button icon="account-hard-hat" title={t('maintenance.addVendor')} onPress={() => setEditing({})} style={{ alignSelf: 'flex-start' }} /> : null}
      <Field value={text} onChangeText={setText} placeholder={t('maintenance.vendorSearch')} />
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="account-hard-hat" body={t('maintenance.noVendors')} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((v, i) => (
            <Row key={v.id} style={[styles.row, i > 0 && styles.divider]} gap={SPACING.sm}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="weightMedium">{v.name}</Txt>
                <Txt muted size="small">{[v.specialty, v.phone, v.email].filter(Boolean).join(' · ')}</Txt>
              </View>
              {v.phone ? <IconButton icon="phone-outline" label={v.phone} onPress={() => Linking.openURL(`tel:${v.phone}`)} /> : null}
              {editable ? <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(v)} /> : null}
              {editable ? <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => remove(v)} /> : null}
            </Row>
          ))}
        </Card>
      )}
      <VendorForm
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

function VendorForm({ vendor, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const rules = useFieldRules('vendor', error);

  useEffect(() => {
    if (!vendor) return;
    setForm({ name: vendor.name ?? '', phone: vendor.phone ?? '', email: vendor.email ?? '', specialty: vendor.specialty ?? '', notes: vendor.notes ?? '', custom: toEditable(rules.custom, vendor.custom) });
    setBusy(false);
    setError(null);
  }, [vendor]);

  if (!vendor) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    if (!form.name?.trim()) return setError({ code: 'validation.required', field: 'name' });
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, custom: toPayload(rules.custom, form.custom) };
      if (vendor.id) await maintenanceApi.updateVendor(vendor.id, payload);
      else await maintenanceApi.createVendor(payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={vendor.id ? t('maintenance.editVendor') : t('maintenance.addVendor')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('maintenance.vendorName')} value={form.name} onChangeText={set('name')} error={error?.field === 'name' ? errorText(t, error) : undefined} />
      <Field {...rules.props('specialty', t('maintenance.specialty'))} value={form.specialty} onChangeText={set('specialty')} placeholder={t('maintenance.specialtyPlaceholder')} />
      <FieldRow>
        <Field {...rules.props('phone', t('tenants.phone'))} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" inputMode="tel" placeholder="+968" />
        <Field {...rules.props('email', t('tenants.email'))} value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      </FieldRow>
      <Field label={t('payments.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 50 }} />
      <CustomFields defs={rules.custom} values={form.custom} onChange={set('custom')} error={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
