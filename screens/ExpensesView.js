import React, { useCallback, useEffect, useState } from 'react';
import { toEditable, toPayload, useFieldRules } from '../services/fields';
import CustomFields from '../components/CustomFields';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi, propertiesApi } from '../services/api';
import { parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import { DateField, formatDate, isDateText, today } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Sheet, Txt, errorText } from '../components/ui';
import ExportButton from '../components/ExportButton';
import { day, omr } from '../services/exportCsv';

// Expenses (المصروفات): recorded once, posted to the ledger; voided with a reversing entry, never deleted.

export const BEARERS = ['OWNER', 'COMPANY', 'TENANT'];
export const PAID_FROM = ['CASH', 'BANK'];
const BEARER_TONE = { OWNER: 'info', COMPANY: 'neutral', TENANT: 'warning' };

export const categoryName = (c, lang) => (c ? (lang === 'ar' ? c.nameAr : c.nameEn) : '');

// ================================================================ property + unit picker (shared with maintenance)

/**
 * value = { propertyId, unitId }. `allowNone` adds "company overhead" (no property).
 * Calls onProperty(property) with the loaded property (ownership, units) so callers can pick defaults.
 */
export function PropertyUnitPicker({ value, onChange, onProperty, allowNone, unitLabel, error }) {
  const { t } = useI18n();
  const [properties, setProperties] = useState(null);
  const [property, setProperty] = useState(null);

  useEffect(() => {
    propertiesApi.list().then(setProperties).catch(() => setProperties([]));
  }, []);

  useEffect(() => {
    if (!value.propertyId) {
      setProperty(null);
      onProperty?.(null);
      return;
    }
    propertiesApi
      .get(value.propertyId)
      .then((p) => {
        setProperty(p);
        onProperty?.(p);
      })
      .catch(() => setProperty(null));
  }, [value.propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (properties === null) return <Loading />;
  const options = [
    ...(allowNone ? [{ value: '', label: t('expenses.noProperty') }] : []),
    ...properties.map((p) => ({ value: p.id, label: p.name })),
  ];
  return (
    <View style={{ gap: SPACING.sm }}>
      <Txt weight="weightMedium" size="small">{t('expenses.property')}</Txt>
      <ChipSelect value={value.propertyId ?? ''} onChange={(id) => onChange({ propertyId: id || null, unitId: null })} options={options} />
      {error ? <Txt size="small" style={{ color: COLORS.danger }}>{error}</Txt> : null}
      {property ? (
        <>
          <Txt weight="weightMedium" size="small">{unitLabel ?? t('expenses.unit')}</Txt>
          <ChipSelect
            value={value.unitId ?? ''}
            onChange={(id) => onChange({ ...value, unitId: id || null })}
            options={[{ value: '', label: t('expenses.commonArea') }, ...property.units.map((u) => ({ value: u.id, label: u.number }))]}
          />
        </>
      ) : null}
    </View>
  );
}

// ================================================================ tab

export function ExpensesTab({ editable, version, onChanged }) {
  const { t, lang } = useI18n();
  const [bearer, setBearer] = useState('all');
  const [text, setText] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [managing, setManaging] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      setBusy(true);
      setError(null);
      try {
        const res = await financeApi.expenses({ page, ...(bearer !== 'all' ? { bearer } : {}) });
        setData((prev) => (page === 1 ? res : { ...res, expenses: [...(prev?.expenses ?? []), ...res.expenses] }));
      } catch (e) {
        setError(e);
        setData((prev) => prev ?? { expenses: [], page: 1, pages: 1, sum: 0 });
      } finally {
        setBusy(false);
      }
    },
    [bearer],
  );

  useEffect(() => {
    setData(null);
    load(1);
  }, [load, version]);

  const visible = (data?.expenses ?? []).filter(
    (x) =>
      !text.trim() ||
      matches([x.number, x.description, x.invoiceNo, x.vendor?.name, x.property?.name, x.unit?.number, categoryName(x.category, lang)].filter(Boolean).join(' '), text),
  );

  return (
    <View style={{ gap: SPACING.md }}>
      {editable ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Button id="expenses.add" small icon="cash-minus" title={t('expenses.add')} onPress={() => setAdding(true)} />
          <Button id="expenses.categories" small variant="secondary" icon="format-list-bulleted" title={t('expenses.categories')} onPress={() => setManaging(true)} />
        </Row>
      ) : null}
      <ChipSelect
        value={bearer}
        onChange={setBearer}
        options={[{ value: 'all', label: t('payments.allMethods') }, ...BEARERS.map((b) => ({ value: b, label: t(`expenses.bearers.${b}`) }))]}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Field value={text} onChangeText={setText} placeholder={t('expenses.searchPlaceholder')} />
        </View>
        <ExportButton
          filename="expenses"
          build={async () => {
            const all = await financeApi.expenses({ all: '1', ...(bearer !== 'all' ? { bearer } : {}) });
            return [
              [t('finance.entryNo'), t('expenses.date'), t('expenses.description'), t('expenses.category'), t('expenses.property'), t('expenses.unit'), t('expenses.bearer'), t('expenses.paidFrom'), t('expenses.vendor'), t('expenses.invoiceNo'), t('finance.amount'), t('finance.status')],
              ...all.expenses.map((x) => [x.number, day(x.date), x.description, categoryName(x.category, lang), x.property?.name ?? t('expenses.noProperty'), x.unit?.number, t(`expenses.bearers.${x.bearer}`), t(`finance.accounts.${x.paidFrom}`), x.vendor?.name, x.invoiceNo, omr(x.amount), x.status === 'VOIDED' ? t('payments.voided') : '']),
            ];
          }}
        />
      </Row>
      <ErrorBox error={error} onRetry={() => load(1)} />
      {data ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt muted>{t('expenses.totalShown', { count: data.total })}</Txt>
          <Money baisa={data.sum} weight="weightBold" />
        </Row>
      ) : null}
      {data === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState icon="cash-minus" body={t('expenses.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {visible.map((x, i) => (
            <Pressable key={x.id} onPress={() => setOpenId(x.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{x.description}</Txt>
                    {x.status === 'VOIDED' ? <Badge label={t('payments.voided')} tone="danger" /> : null}
                  </Row>
                  <Txt muted size="small">
                    {[x.number, formatDate(x.date, lang), categoryName(x.category, lang), x.property ? `${x.property.name}${x.unit ? ` · ${x.unit.number}` : ''}` : t('expenses.noProperty')].join(' · ')}
                  </Txt>
                  <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                    <Badge label={t(`expenses.bearers.${x.bearer}`)} tone={BEARER_TONE[x.bearer]} />
                    {x.workOrder ? <Badge label={x.workOrder.number} tone="neutral" /> : null}
                  </Row>
                </View>
                <Money baisa={x.amount} weight="weightBold" color={x.status === 'VOIDED' ? COLORS.textMuted : COLORS.danger} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
      {data && data.page < data.pages ? <Button variant="secondary" title={t('finance.loadMore')} loading={busy} onPress={() => load(data.page + 1)} /> : null}

      <ExpenseForm
        visible={adding}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          setAdding(false);
          onChanged();
          setOpenId(saved.id);
        }}
      />
      <ExpenseSheet id={openId} onClose={() => setOpenId(null)} onChanged={onChanged} />
      <CategoriesSheet visible={managing} onClose={() => setManaging(false)} />
    </View>
  );
}

// ================================================================ form

export function ExpenseForm({ visible, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const [categories, setCategories] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(null);
  const [property, setProperty] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  const rules = useFieldRules('expense', error);

  useEffect(() => {
    if (!visible) return;
    setForm({ propertyId: null, unitId: null, categoryId: null, amount: '', date: today(), paidFrom: 'CASH', bearer: 'COMPANY', vendorId: null, description: '', invoiceNo: '', custom: {} });
    setBusy(false);
    setError(null);
    financeApi.categories().then((list) => {
      setCategories(list);
      setForm((f) => ({ ...f, categoryId: f.categoryId ?? list[0]?.id ?? null }));
    }).catch(() => setCategories([]));
    financeApi.vendors().then(setVendors).catch(() => setVendors([]));
  }, [visible]);

  if (!visible || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const managed = property?.ownership === 'MANAGED';
  const bearers = !form.propertyId ? ['COMPANY'] : managed ? BEARERS : ['COMPANY', 'TENANT'];

  const save = async () => {
    const amount = parseOMR(form.amount);
    if (!amount || amount <= 0) return setError({ code: 'validation.required', field: 'amount' });
    if (!form.description.trim()) return setError({ code: 'validation.required', field: 'description' });
    if (!form.categoryId) return setError({ code: 'validation.required', field: 'categoryId' });
    if (!isDateText(form.date)) return setError({ code: 'validation.date', field: 'date' });
    if (form.bearer === 'TENANT' && !form.unitId) return setError({ code: 'expense.tenantNeedsUnit', field: 'unitId' });
    setBusy(true);
    setError(null);
    try {
      onSaved(await financeApi.createExpense({ ...form, amount, propertyId: form.propertyId || undefined, unitId: form.unitId || undefined, vendorId: form.vendorId || undefined, custom: toPayload(rules.custom, form.custom) }));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('expenses.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('expenses.description')} value={form.description} onChangeText={set('description')} error={fieldError('description')} />
      <FieldRow>
        <MoneyField label={t('payments.amount')} value={form.amount} onChangeText={set('amount')} error={fieldError('amount')} />
        <DateField label={t('expenses.date')} value={form.date} onChangeText={set('date')} error={fieldError('date')} />
      </FieldRow>
      <Txt weight="weightMedium" size="small">{t('expenses.category')}</Txt>
      {categories === null ? (
        <Loading />
      ) : (
        <ChipSelect value={form.categoryId} onChange={set('categoryId')} options={categories.map((c) => ({ value: c.id, label: categoryName(c, lang) }))} />
      )}
      <PropertyUnitPicker
        allowNone
        value={{ propertyId: form.propertyId, unitId: form.unitId }}
        onChange={(v) => setForm((f) => ({ ...f, ...v }))}
        onProperty={(p) => {
          setProperty(p);
          setForm((f) => ({ ...f, bearer: !p ? 'COMPANY' : p.ownership === 'MANAGED' ? 'OWNER' : 'COMPANY' }));
        }}
        error={fieldError('propertyId')}
      />
      <Txt weight="weightMedium" size="small">{t('expenses.bearer')}</Txt>
      <ChipSelect value={form.bearer} onChange={set('bearer')} options={bearers.map((b) => ({ value: b, label: t(`expenses.bearers.${b}`) }))} />
      <Txt muted size="small">{t(`expenses.bearerHints.${form.bearer}`)}</Txt>
      {fieldError('unitId') || fieldError('bearer') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('unitId') || fieldError('bearer')}</Txt> : null}
      <Txt weight="weightMedium" size="small">{t('expenses.paidFrom')}</Txt>
      <ChipSelect value={form.paidFrom} onChange={set('paidFrom')} options={PAID_FROM.map((p) => ({ value: p, label: t(`finance.accounts.${p}`) }))} />
      {vendors.length ? (
        <>
          <Txt weight="weightMedium" size="small">{rules.props('vendorId', t('expenses.vendor')).label}</Txt>
          {rules.props('vendorId', '').error ? <Txt size="small" style={{ color: COLORS.danger }}>{rules.props('vendorId', '').error}</Txt> : null}
          <ChipSelect value={form.vendorId ?? ''} onChange={(id) => set('vendorId')(id || null)} options={[{ value: '', label: t('common.none') }, ...vendors.map((v) => ({ value: v.id, label: v.name }))]} />
        </>
      ) : null}
      <Field {...rules.props('invoiceNo', t('expenses.invoiceNo'))} value={form.invoiceNo} onChangeText={set('invoiceNo')} />
      <CustomFields defs={rules.custom} values={form.custom} onChange={set('custom')} error={error} />
    </Sheet>
  );
}

// ================================================================ detail

function ExpenseSheet({ id, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const [x, setX] = useState(null);
  const [error, setError] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setX(null);
    setError(null);
    setVoiding(false);
    setReason('');
    financeApi.expense(id).then(setX).catch(setError);
  }, [id]);

  const doVoid = async () => {
    setBusy(true);
    setError(null);
    try {
      setX(await financeApi.voidExpense(id, reason.trim()));
      setVoiding(false);
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const info = x
    ? [
        [t('expenses.date'), formatDate(x.date, lang)],
        [t('expenses.category'), categoryName(x.category, lang)],
        [t('expenses.property'), x.property ? `${x.property.name}${x.unit ? ` · ${x.unit.number}` : ` · ${t('expenses.commonArea')}`}` : t('expenses.noProperty')],
        [t('expenses.bearer'), t(`expenses.bearers.${x.bearer}`)],
        [t('expenses.paidFrom'), t(`finance.accounts.${x.paidFrom}`)],
        x.vendor ? [t('expenses.vendor'), x.vendor.name] : null,
        x.invoiceNo ? [t('expenses.invoiceNo'), x.invoiceNo] : null,
        x.workOrder ? [t('maintenance.workOrder'), x.workOrder.number] : null,
      ].filter(Boolean)
    : [];

  return (
    <Sheet visible={!!id} title={x ? `${x.number}` : t('expenses.title')} onClose={onClose}>
      <ErrorBox error={error} />
      {!x && !error ? <Loading /> : null}
      {x ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt weight="weightBold" style={{ flex: 1 }}>{x.description}</Txt>
            <Money baisa={x.amount} size={FONT.medium} weight="weightBold" color={x.status === 'VOIDED' ? COLORS.textMuted : COLORS.danger} />
          </Row>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          {x.status === 'VOIDED' ? (
            <Txt style={{ color: COLORS.danger }}>{t('payments.voidedOn', { date: formatDate(x.voidedAt, lang), reason: x.voidReason })}</Txt>
          ) : canEdit('financials') ? (
            voiding ? (
              <View style={styles.voidBox}>
                <Txt size="small" style={{ color: COLORS.danger }}>{t('expenses.voidHint')}</Txt>
                <Field label={t('payments.voidReason')} value={reason} onChangeText={setReason} />
                <Row style={{ justifyContent: 'flex-end' }}>
                  <Button small variant="secondary" title={t('common.cancel')} onPress={() => setVoiding(false)} />
                  <Button id="expenses.void" small variant="danger" icon="cancel" title={t('expenses.void')} loading={busy} disabled={!reason.trim()} onPress={doVoid} />
                </Row>
              </View>
            ) : (
              <Button id="expenses.void" small variant="danger" icon="cancel" title={t('expenses.void')} onPress={() => setVoiding(true)} style={{ alignSelf: 'flex-start' }} />
            )
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ================================================================ categories (editable per company)

function CategoriesSheet({ visible, onClose }) {
  const { t, lang } = useI18n();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // {} new | category
  const [form, setForm] = useState({ nameAr: '', nameEn: '' });
  const [error, setError] = useState(null);

  const load = useCallback(() => financeApi.categories(true).then(setList).catch(setError), []);
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const open = (c) => {
    setEditing(c);
    setForm({ nameAr: c.nameAr ?? '', nameEn: c.nameEn ?? '' });
    setError(null);
  };

  const save = async () => {
    try {
      if (editing.id) await financeApi.updateCategory(editing.id, form);
      else await financeApi.createCategory(form);
      setEditing(null);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const toggle = async (c) => {
    try {
      await financeApi.updateCategory(c.id, { isActive: !c.isActive });
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Sheet visible={visible} title={t('expenses.categories')} onClose={onClose}>
      <ErrorBox error={error} />
      <Txt muted size="small">{t('expenses.categoriesHint')}</Txt>
      {editing ? (
        <View style={styles.voidBox}>
          <FieldRow>
            <Field label={t('plans.nameAr')} value={form.nameAr} onChangeText={(v) => setForm((f) => ({ ...f, nameAr: v }))} />
            <Field label={t('plans.nameEn')} value={form.nameEn} onChangeText={(v) => setForm((f) => ({ ...f, nameEn: v }))} />
          </FieldRow>
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button small variant="secondary" title={t('common.cancel')} onPress={() => setEditing(null)} />
            <Button small title={t('common.save')} onPress={save} disabled={!form.nameAr.trim() || !form.nameEn.trim()} />
          </Row>
        </View>
      ) : (
        <Button id="expenses.addCategory" small icon="plus" title={t('expenses.addCategory')} onPress={() => open({})} style={{ alignSelf: 'flex-start' }} />
      )}
      {list === null ? (
        <Loading />
      ) : (
        <View style={styles.list}>
          {list.map((c, i) => (
            <Row key={c.id} style={[styles.catRow, i > 0 && styles.divider]}>
              <Txt style={{ flex: 1, opacity: c.isActive ? 1 : 0.5 }}>{categoryName(c, lang)}</Txt>
              <IconButton id="expenses.editCategory" icon="pencil-outline" label={t('common.edit')} onPress={() => open(c)} />
              <Switch value={c.isActive} onValueChange={() => toggle(c)} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
            </Row>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  catRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  voidBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
