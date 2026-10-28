import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { fieldLabel, optionLabel } from '../services/fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Sheet, Txt, errorText } from '../components/ui';

// Platform team: indicators (المؤشرات) — flexible analytics over the sections added by the platform team.
// Each indicator adds up (or counts, averages…) an amount / number field of a section over a period, optionally
// filtered and broken down; it shows on the subscribers' dashboard and in the section's "Analytics" view.

const AGGREGATES = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'];
const PERIODS = ['MONTH', 'YEAR', 'ALL'];
const CHOICE = ['SELECT', 'MULTISELECT', 'BOOLEAN'];

export default function MetricsScreen() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  const [sections, setSections] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [metrics, list] = await Promise.all([adminApi.metrics(), adminApi.sections()]);
      setRows(metrics);
      setSections(list.filter((s) => s.isActive));
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const sectionLabel = useCallback(
    (key) => {
      const s = sections.find((x) => x.key === key);
      if (!s) return key;
      const name = (x) => (lang === 'ar' ? x.nameAr : x.nameEn);
      const parent = s.parentId ? sections.find((x) => x.id === s.parentId) : null;
      return parent ? `${name(parent)} › ${name(s)}` : name(s);
    },
    [sections, lang],
  );

  return (
    <Screen title={t('metricsAdmin.title')} subtitle={t('metricsAdmin.subtitle')} actions={<Button icon="plus" title={t('metricsAdmin.add')} onPress={() => setEditing({})} disabled={!sections.length} />}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        {rows === null ? (
          <Loading />
        ) : (
          <Card padded={false}>
            {rows.length === 0 ? (
              <EmptyState icon="chart-box-outline" body={sections.length ? t('metricsAdmin.empty') : t('buttonsAdmin.noSections')} />
            ) : (
              rows.map((m, i) => (
                <Row key={m.id} style={[styles.row, i > 0 && styles.divider, !m.isActive && { opacity: 0.55 }]}>
                  <View style={styles.icon}>
                    <MaterialCommunityIcons name="chart-box-outline" size={18} color={COLORS.primaryDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                      <Txt weight="weightMedium">{lang === 'ar' ? m.nameAr : m.nameEn}</Txt>
                      {m.onDashboard ? <Badge label={t('metricsAdmin.onDashboard')} tone="info" /> : null}
                      {!m.isActive ? <Badge label={t('fields.removed')} tone="danger" /> : null}
                    </Row>
                    <Txt muted size="small">{`${sectionLabel(m.section)} · ${t(`metricsAdmin.aggregates.${m.aggregate}`)}`}</Txt>
                  </View>
                  {m.isActive ? (
                    <>
                      <IconButton icon="arrow-up" label={t('fields.up')} onPress={() => run(() => adminApi.moveMetric(m.id, 'up'))} />
                      <IconButton icon="arrow-down" label={t('fields.down')} onPress={() => run(() => adminApi.moveMetric(m.id, 'down'))} />
                      <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(m)} />
                      <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => run(() => adminApi.removeMetric(m.id))} />
                    </>
                  ) : (
                    <>
                      <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => run(() => adminApi.updateMetric(m.id, { isActive: true }))} />
                      <IconButton icon="delete-forever-outline" color={COLORS.danger} label={t('fields.purge')} onPress={() => run(() => adminApi.removeMetric(m.id, true))} />
                    </>
                  )}
                </Row>
              ))
            )}
          </Card>
        )}
        <Txt muted size="small">{t('metricsAdmin.howItWorks')}</Txt>
      </View>
      <MetricForm
        metric={editing}
        sections={sections}
        sectionLabel={sectionLabel}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Screen>
  );
}

function MetricForm({ metric, sections, sectionLabel, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const isNew = metric && !metric.id;
  const [form, setForm] = useState(null);
  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!metric) return;
    setForm({
      nameAr: metric.nameAr ?? '',
      nameEn: metric.nameEn ?? '',
      section: metric.section ?? sections[0]?.key ?? '',
      aggregate: metric.aggregate ?? 'SUM',
      valueField: metric.valueField ?? '',
      dateField: metric.dateField ?? '',
      filterField: metric.filterField ?? '',
      filterValue: metric.filterValue ?? null,
      groupBy: metric.groupBy ?? '',
      onDashboard: metric.onDashboard ?? true,
      period: metric.period ?? 'MONTH',
    });
    setBusy(false);
    setError(null);
  }, [metric]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form?.section) return;
    adminApi
      .fields(`cs:${form.section}`)
      .then((d) => setFields(d.custom.filter((f) => f.isActive)))
      .catch(() => setFields([]));
  }, [form?.section]);

  const section = useMemo(() => sections.find((s) => s.key === form?.section), [sections, form?.section]);
  if (!metric || !form) return null;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const fieldError = (key) => (error?.field === key ? <Txt size="small" style={{ color: COLORS.danger }}>{errorText(t, error)}</Txt> : null);
  const chips = (list) => list.map((f) => ({ value: f.key, label: fieldLabel(f, lang) }));
  const valueFields = fields.filter((f) => f.type === 'MONEY' || f.type === 'NUMBER');
  const dateFields = fields.filter((f) => f.type === 'DATE');
  const choiceFields = fields.filter((f) => CHOICE.includes(f.type));
  const filterDef = choiceFields.find((f) => f.key === form.filterField);

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      nameAr: form.nameAr,
      nameEn: form.nameEn,
      aggregate: form.aggregate,
      valueField: form.aggregate === 'COUNT' ? null : form.valueField || null,
      dateField: form.dateField || null,
      filterField: form.filterField || null,
      filterValue: form.filterField ? form.filterValue : null,
      groupBy: form.groupBy || null,
      onDashboard: form.onDashboard,
      period: form.period,
    };
    try {
      if (isNew) await adminApi.createMetric({ ...payload, section: form.section });
      else await adminApi.updateMetric(metric.id, payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? t('metricsAdmin.add') : t('common.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.nameAr.trim() || !form.nameEn.trim() || !form.section} />
        </>
      }
    >
      {error && !['valueField', 'dateField', 'filterField', 'filterValue', 'groupBy', 'nameAr', 'nameEn'].includes(error.field) ? <ErrorBox error={error} /> : null}
      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.nameAr} onChangeText={set('nameAr')} error={error?.field === 'nameAr' ? errorText(t, error) : undefined} />
        <Field label={t('plans.nameEn')} value={form.nameEn} onChangeText={set('nameEn')} error={error?.field === 'nameEn' ? errorText(t, error) : undefined} />
      </FieldRow>

      <Txt weight="weightMedium" size="small">{t('metricsAdmin.section')}</Txt>
      {isNew ? (
        <ChipSelect
          value={form.section}
          onChange={(key) => setForm((f) => ({ ...f, section: key, valueField: '', dateField: '', filterField: '', filterValue: null, groupBy: '' }))}
          options={sections.map((s) => ({ value: s.key, label: sectionLabel(s.key) }))}
        />
      ) : (
        <Txt>{sectionLabel(form.section)}</Txt>
      )}

      <Txt weight="weightMedium" size="small">{t('metricsAdmin.aggregate')}</Txt>
      <ChipSelect value={form.aggregate} onChange={set('aggregate')} options={AGGREGATES.map((a) => ({ value: a, label: t(`metricsAdmin.aggregates.${a}`) }))} />

      {form.aggregate !== 'COUNT' ? (
        <>
          <Txt weight="weightMedium" size="small">{t('metricsAdmin.valueField')}</Txt>
          {valueFields.length ? <ChipSelect value={form.valueField} onChange={set('valueField')} options={chips(valueFields)} /> : <Txt muted size="small">{t('metricsAdmin.noValueFields')}</Txt>}
          {fieldError('valueField')}
        </>
      ) : null}

      <Txt weight="weightMedium" size="small">{t('metricsAdmin.dateField')}</Txt>
      <ChipSelect value={form.dateField} onChange={set('dateField')} options={[{ value: '', label: t('metricsAdmin.createdDate') }, ...chips(dateFields)]} />
      {fieldError('dateField')}

      <Txt weight="weightMedium" size="small">{t('metricsAdmin.filter')}</Txt>
      <ChipSelect value={form.filterField} onChange={(key) => setForm((f) => ({ ...f, filterField: key, filterValue: null }))} options={[{ value: '', label: t('metricsAdmin.noFilter') }, ...chips(choiceFields)]} />
      {filterDef ? (
        <ChipSelect
          value={form.filterValue}
          onChange={set('filterValue')}
          options={
            filterDef.type === 'BOOLEAN'
              ? [
                  { value: true, label: t('common.yes') },
                  { value: false, label: t('common.no') },
                ]
              : (filterDef.options ?? []).map((o) => ({ value: o.value, label: optionLabel(o, lang) }))
          }
        />
      ) : null}
      {fieldError('filterField')}
      {fieldError('filterValue')}

      <Txt weight="weightMedium" size="small">{t('metricsAdmin.groupBy')}</Txt>
      <ChipSelect
        value={form.groupBy}
        onChange={set('groupBy')}
        options={[
          { value: '', label: t('metricsAdmin.noGroup') },
          { value: 'month', label: t('metricsAdmin.byMonth') },
          ...(section?.withProperty ? [{ value: 'property', label: t('metricsAdmin.byProperty') }] : []),
          ...chips(choiceFields),
        ]}
      />
      {fieldError('groupBy')}

      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt weight="weightMedium">{t('metricsAdmin.onDashboard')}</Txt>
          <Txt muted size="small">{t('metricsAdmin.onDashboardHint')}</Txt>
        </View>
        <Switch value={form.onDashboard} onValueChange={set('onDashboard')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
      </Row>
      {form.onDashboard ? <ChipSelect value={form.period} onChange={set('period')} options={PERIODS.map((p) => ({ value: p, label: t(`metrics.periods.${p}`) }))} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
});
