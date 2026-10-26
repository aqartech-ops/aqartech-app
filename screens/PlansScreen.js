import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatOMR, parseOMR } from '../services/money';
import { Money, MoneyField } from '../components/Rial';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  FieldRow,
  IconButton,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  Txt,
  errorText,
  toLatinDigits,
} from '../components/ui';

// Platform team: plans (الباقات) — prices, limits, sections, active/inactive. Nothing is hard-coded:
// subscribers see changes on their next request (the app refreshes when it returns to the foreground).

const AUDIENCES = ['COMPANY', 'INDIVIDUAL', 'ANY'];
const moneyText = (baisa) => (baisa ? formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, '') : '');

export default function PlansScreen() {
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, opts] = await Promise.all([adminApi.plans(), adminApi.planOptions()]);
      setPlans(list);
      setOptions(opts);
    } catch (e) {
      setError(e);
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (plan) => {
    const name = lang === 'ar' ? plan.nameAr : plan.nameEn;
    const ok = await confirm({
      title: plan.subscribers ? t('plans.deactivate') : t('common.delete'),
      message: plan.subscribers ? t('plans.deactivateConfirm', { name, count: plan.subscribers }) : t('plans.deleteConfirm', { name }),
      confirmText: plan.subscribers ? t('plans.deactivate') : t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await adminApi.removePlan(plan.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const reactivate = async (plan) => {
    try {
      await adminApi.updatePlan(plan.id, { isActive: true });
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen title={t('plans.title')} subtitle={t('plans.subtitle')} actions={options ? <Button icon="plus" title={t('plans.add')} onPress={() => setEditing({})} /> : null}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        {plans === null ? (
          <Loading />
        ) : plans.length === 0 ? (
          <Card>
            <EmptyState icon="package-variant-closed" body={t('plans.empty')} />
          </Card>
        ) : (
          plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              sections={options?.sections ?? []}
              onEdit={() => setEditing(plan)}
              onRemove={() => remove(plan)}
              onReactivate={() => reactivate(plan)}
            />
          ))
        )}
      </View>
      <PlanForm
        plan={editing}
        options={options}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Screen>
  );
}

function PlanCard({ plan, sections, onEdit, onRemove, onReactivate }) {
  const { t, lang, row } = useI18n();
  const limits = Object.entries(plan.limits ?? {});
  return (
    <Card style={[{ gap: SPACING.sm }, !plan.isActive && { opacity: 0.7 }]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
            <Txt size="medium" weight="weightBold">{lang === 'ar' ? plan.nameAr : plan.nameEn}</Txt>
            <Badge label={t(`plans.audienceValues.${plan.audience}`)} tone="info" />
            {!plan.isActive ? <Badge label={t('common.inactive')} tone="danger" /> : null}
          </Row>
          <Txt muted size="small">{`${plan.code} · ${t('plans.subscribers', { count: plan.subscribers })}`}</Txt>
        </View>
        <Row gap={0}>
          <IconButton icon="pencil-outline" label={t('common.edit')} onPress={onEdit} />
          {plan.isActive ? <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={onRemove} /> : null}
        </Row>
      </Row>

      <Row gap={SPACING.lg} style={{ flexWrap: 'wrap' }}>
        <Row gap={SPACING.xs}>
          <Money baisa={plan.priceMonthly} weight="weightBold" />
          <Txt muted size="small">{t('plans.perMonth')}</Txt>
        </Row>
        <Row gap={SPACING.xs}>
          <Money baisa={plan.priceYearly} weight="weightBold" />
          <Txt muted size="small">{t('plans.perYear')}</Txt>
        </Row>
      </Row>

      <Txt size="small">
        {limits.map(([key, value]) => `${t(`plan.limits.${key}`)}: ${value === null ? t('common.unlimited') : value}`).join(' · ')}
      </Txt>

      <View style={[styles.chips, { flexDirection: row }]}>
        {sections.map((key) => {
          const on = plan.features.includes(key);
          return (
            <View key={key} style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
              <Txt size="small" style={{ color: on ? COLORS.primaryDark : COLORS.textMuted, textDecorationLine: on ? 'none' : 'line-through' }}>
                {t(`sections.${key}`)}
              </Txt>
            </View>
          );
        })}
      </View>

      {!plan.isActive ? <Button small variant="secondary" icon="restore" title={t('plans.reactivate')} onPress={onReactivate} style={{ alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

function ToggleRow({ label, hint, value, onChange, disabled }) {
  return (
    <Pressable onPress={disabled ? undefined : () => onChange(!value)} style={styles.toggle}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="weightMedium">{label}</Txt>
          {hint ? <Txt muted size="small">{hint}</Txt> : null}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }}
          thumbColor={COLORS.surface}
        />
      </Row>
    </Pressable>
  );
}

function PlanForm({ plan, options, onClose, onSaved }) {
  const { t, row } = useI18n();
  const isNew = plan && !plan.id;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  const limitKeys = options?.limitKeys ?? [];
  const alwaysOn = options?.alwaysOn ?? [];

  useEffect(() => {
    if (!plan) {
      setForm(null);
      return;
    }
    setForm({
      code: plan.code ?? '',
      nameAr: plan.nameAr ?? '',
      nameEn: plan.nameEn ?? '',
      descriptionAr: plan.descriptionAr ?? '',
      descriptionEn: plan.descriptionEn ?? '',
      audience: plan.audience ?? 'COMPANY',
      priceMonthly: moneyText(plan.priceMonthly),
      priceYearly: moneyText(plan.priceYearly),
      limits: Object.fromEntries(limitKeys.map((k) => [k, plan.limits?.[k] === null || plan.limits?.[k] === undefined ? '' : String(plan.limits[k])])),
      features: new Set(plan.features ?? alwaysOn),
      sortOrder: plan.sortOrder === undefined ? '' : String(plan.sortOrder),
      isActive: plan.isActive ?? true,
    });
    setError(null);
    setBusy(false);
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan || !form) return <Sheet visible={false} />;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setLimit = (key) => (value) => setForm((f) => ({ ...f, limits: { ...f.limits, [key]: toLatinDigits(value).replace(/[^0-9]/g, '') } }));
  const toggleFeature = (key) =>
    setForm((f) => {
      const features = new Set(f.features);
      if (features.has(key)) features.delete(key);
      else features.add(key);
      return { ...f, features };
    });

  const save = async () => {
    const priceMonthly = String(form.priceMonthly).trim() ? parseOMR(form.priceMonthly) : 0;
    const priceYearly = String(form.priceYearly).trim() ? parseOMR(form.priceYearly) : 0;
    if (priceMonthly === null) return setError({ code: 'validation.invalid', field: 'priceMonthly' });
    if (priceYearly === null) return setError({ code: 'validation.invalid', field: 'priceYearly' });
    const payload = {
      nameAr: form.nameAr,
      nameEn: form.nameEn,
      descriptionAr: form.descriptionAr,
      descriptionEn: form.descriptionEn,
      audience: form.audience,
      priceMonthly,
      priceYearly,
      limits: Object.fromEntries(limitKeys.map((k) => [k, form.limits[k] === '' ? null : Number(form.limits[k])])),
      features: [...form.features],
      isActive: form.isActive,
      ...(form.sortOrder !== '' ? { sortOrder: Number(form.sortOrder) } : {}),
      ...(isNew ? { code: form.code } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      if (isNew) await adminApi.createPlan(payload);
      else await adminApi.updatePlan(plan.id, payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? t('plans.add') : t('plans.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      {!isNew && plan.subscribers ? (
        <View style={styles.notice}>
          <Txt size="small" style={{ color: COLORS.warning }}>{t('plans.appliesToAll', { count: plan.subscribers })}</Txt>
        </View>
      ) : null}

      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.nameAr} onChangeText={set('nameAr')} error={fieldError('nameAr')} />
        <Field label={t('plans.nameEn')} value={form.nameEn} onChangeText={set('nameEn')} error={fieldError('nameEn')} />
      </FieldRow>
      {isNew ? (
        <Field
          label={t('plans.code')}
          hint={t('plans.codeHint')}
          value={form.code}
          onChangeText={(v) => set('code')(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          autoCapitalize="none"
          error={fieldError('code')}
        />
      ) : null}
      <Txt weight="weightMedium" size="small">{t('plans.audience')}</Txt>
      <Segmented value={form.audience} onChange={set('audience')} options={AUDIENCES.map((a) => ({ value: a, label: t(`plans.audienceValues.${a}`) }))} />

      <Txt weight="weightBold">{t('plans.prices')}</Txt>
      <FieldRow>
        <MoneyField label={t('plans.priceMonthly')} value={form.priceMonthly} onChangeText={set('priceMonthly')} error={fieldError('priceMonthly')} />
        <MoneyField label={t('plans.priceYearly')} value={form.priceYearly} onChangeText={set('priceYearly')} error={fieldError('priceYearly')} />
      </FieldRow>

      <Txt weight="weightBold">{t('plans.limits')}</Txt>
      <Txt muted size="small">{t('plans.limitsHint')}</Txt>
      <View style={[styles.grid, { flexDirection: row }]}>
        {limitKeys.map((key) => (
          <View key={key} style={styles.gridItem}>
            <Field
              label={t(`plan.limits.${key}`)}
              value={form.limits[key]}
              onChangeText={setLimit(key)}
              placeholder={t('common.unlimited')}
              keyboardType="number-pad"
              inputMode="numeric"
              error={fieldError(`limits.${key}`)}
            />
          </View>
        ))}
      </View>

      <Txt weight="weightBold">{t('plans.sections')}</Txt>
      <Txt muted size="small">{t('plans.sectionsHint')}</Txt>
      <View style={styles.toggles}>
        {(options?.sections ?? []).map((key, i) => {
          const locked = alwaysOn.includes(key);
          return (
            <View key={key} style={i > 0 && styles.divider}>
              <ToggleRow
                label={t(`sections.${key}`)}
                hint={locked ? t('plans.alwaysOn') : undefined}
                value={locked || form.features.has(key)}
                onChange={() => toggleFeature(key)}
                disabled={locked}
              />
            </View>
          );
        })}
      </View>

      <Field label={t('plans.descriptionAr')} value={form.descriptionAr} onChangeText={set('descriptionAr')} multiline inputStyle={{ minHeight: 60 }} />
      <Field label={t('plans.descriptionEn')} value={form.descriptionEn} onChangeText={set('descriptionEn')} multiline inputStyle={{ minHeight: 60 }} />
      <Field
        label={t('plans.sortOrder')}
        hint={t('plans.sortOrderHint')}
        value={form.sortOrder}
        onChangeText={(v) => set('sortOrder')(toLatinDigits(v).replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
      />
      <View style={styles.toggles}>
        <ToggleRow label={t('plans.isActive')} hint={t('plans.isActiveHint')} value={form.isActive} onChange={set('isActive')} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexWrap: 'wrap', gap: SPACING.xs },
  chip: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.pill, borderWidth: 1 },
  chipOn: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primarySoft },
  chipOff: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  toggles: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  toggle: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  grid: { flexWrap: 'wrap', marginHorizontal: -SPACING.xs },
  gridItem: { width: '50%', padding: SPACING.xs },
  notice: { backgroundColor: COLORS.warningSoft, borderRadius: RADIUS.md, padding: SPACING.md },
});
