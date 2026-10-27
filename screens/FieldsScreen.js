import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { fieldLabel } from '../services/fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Sheet, Txt, errorText } from '../components/ui';

// Platform team: configurable fields (الحقول). Applies to every subscriber.
//  - built-in optional fields: make required, hide, rename;
//  - extra fields: add, edit, reorder, remove (keeping or deleting saved values).

const ENTITIES = ['property', 'unit', 'owner', 'tenant', 'lease', 'expense', 'workOrder', 'vendor'];
const TYPES = ['TEXT', 'LONGTEXT', 'NUMBER', 'MONEY', 'DATE', 'SELECT', 'MULTISELECT', 'BOOLEAN', 'PHONE', 'EMAIL'];

/** The i18n key of a built-in field's default name (same as in the forms). */
const NS = { property: 'properties', unit: 'units', owner: 'owners', tenant: 'tenants', lease: 'leases' };
const SPECIAL = {
  'expense.vendorId': 'expenses.vendor',
  'expense.invoiceNo': 'expenses.invoiceNo',
  'workOrder.description': 'maintenance.description',
  'workOrder.vendorId': 'expenses.vendor',
  'workOrder.estimatedCost': 'maintenance.estimatedCost',
  'workOrder.scheduledDate': 'maintenance.scheduledDate',
  'workOrder.reportedBy': 'maintenance.reportedBy',
  'vendor.phone': 'tenants.phone',
  'vendor.email': 'tenants.email',
  'vendor.specialty': 'maintenance.specialty',
};
const coreLabelKey = (entity, key) => SPECIAL[`${entity}.${key}`] ?? `${NS[entity]}.${key}`;

export default function FieldsScreen() {
  const { t, lang } = useI18n();
  const [entity, setEntity] = useState('tenant');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // {} new | extra field
  const [renaming, setRenaming] = useState(null); // core field
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminApi.fields(entity));
    } catch (e) {
      setError(e);
    }
  }, [entity]);

  useEffect(() => {
    setData(null);
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

  return (
    <Screen title={t('fields.title')} subtitle={t('fields.subtitle')}>
      <View style={{ gap: SPACING.lg }}>
        <ChipSelect value={entity} onChange={setEntity} options={ENTITIES.map((e) => ({ value: e, label: t(`fields.entities.${e}`) }))} />
        <ErrorBox error={error} onRetry={load} />
        {!data ? (
          !error ? <Loading /> : null
        ) : (
          <>
            <Card style={{ gap: SPACING.sm }}>
              <Txt weight="weightBold">{t('fields.extra')}</Txt>
              <Txt muted size="small">{t('fields.extraHint')}</Txt>
              <Button small icon="plus" title={t('fields.add')} onPress={() => setEditing({})} style={{ alignSelf: 'flex-start' }} />
              {data.custom.length === 0 ? (
                <EmptyState icon="form-textbox" body={t('fields.noExtra')} />
              ) : (
                <View style={styles.list}>
                  {data.custom.map((f, i) => (
                    <Row key={f.id} style={[styles.row, i > 0 && styles.divider, !f.isActive && { opacity: 0.55 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                          <Txt weight="weightMedium">{fieldLabel(f, lang)}</Txt>
                          <Badge label={t(`fields.types.${f.type}`)} tone="info" />
                          {f.required ? <Badge label={t('fields.required')} tone="warning" /> : null}
                          {!f.isActive ? <Badge label={t('fields.removed')} tone="danger" /> : null}
                        </Row>
                        <Txt muted size="small">{`${f.key} · ${t('fields.usage', { count: f.usage })}`}</Txt>
                      </View>
                      {f.isActive ? (
                        <>
                          <IconButton icon="arrow-up" label={t('fields.up')} onPress={() => run(() => adminApi.moveField(f.id, 'up'))} />
                          <IconButton icon="arrow-down" label={t('fields.down')} onPress={() => run(() => adminApi.moveField(f.id, 'down'))} />
                          <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(f)} />
                          <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => setRemoving(f)} />
                        </>
                      ) : (
                        <>
                          <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => run(() => adminApi.updateField(f.id, { isActive: true }))} />
                          <IconButton icon="delete-forever-outline" color={COLORS.danger} label={t('fields.purge')} onPress={() => setRemoving(f)} />
                        </>
                      )}
                    </Row>
                  ))}
                </View>
              )}
            </Card>

            <Card style={{ gap: SPACING.sm }}>
              <Txt weight="weightBold">{t('fields.core')}</Txt>
              <Txt muted size="small">{t('fields.coreHint')}</Txt>
              <View style={styles.list}>
                <Row style={[styles.row, styles.head]}>
                  <Txt muted size="small" style={{ flex: 1 }}>{t('fields.field')}</Txt>
                  <Txt muted size="small" style={styles.col}>{t('fields.required')}</Txt>
                  <Txt muted size="small" style={styles.col}>{t('fields.hidden')}</Txt>
                  <View style={{ width: 36 }} />
                </Row>
                {data.core.map((c) => {
                  const renamed = lang === 'ar' ? c.labelAr : c.labelEn;
                  return (
                    <Row key={c.key} style={[styles.row, styles.divider]}>
                      <View style={{ flex: 1 }}>
                        <Txt>{renamed || t(coreLabelKey(entity, c.key))}</Txt>
                        {renamed ? <Txt muted size="small">{t(coreLabelKey(entity, c.key))}</Txt> : null}
                      </View>
                      <View style={styles.col}>
                        <Switch
                          value={c.required}
                          onValueChange={(v) => run(() => adminApi.setCoreField(entity, c.key, { required: v, ...(v ? { hidden: false } : {}) }))}
                          trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }}
                          thumbColor={COLORS.surface}
                        />
                      </View>
                      <View style={styles.col}>
                        <Switch
                          value={c.hidden}
                          disabled={c.required}
                          onValueChange={(v) => run(() => adminApi.setCoreField(entity, c.key, { hidden: v }))}
                          trackColor={{ true: COLORS.warning, false: COLORS.borderStrong }}
                          thumbColor={COLORS.surface}
                        />
                      </View>
                      <IconButton icon="rename-box" label={t('fields.rename')} onPress={() => setRenaming(c)} />
                    </Row>
                  );
                })}
              </View>
            </Card>
          </>
        )}
      </View>

      <ExtraFieldForm
        entity={entity}
        field={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <RenameSheet
        entity={entity}
        field={renaming}
        defaultLabel={renaming ? t(coreLabelKey(entity, renaming.key)) : ''}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null);
          load();
        }}
      />
      <RemoveSheet
        field={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          load();
        }}
      />
    </Screen>
  );
}

function ExtraFieldForm({ entity, field, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = field && !field.id;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!field) return;
    setForm({
      labelAr: field.labelAr ?? '',
      labelEn: field.labelEn ?? '',
      helpAr: field.helpAr ?? '',
      helpEn: field.helpEn ?? '',
      type: field.type ?? 'TEXT',
      required: field.required ?? false,
      options: (field.options ?? []).map((o) => ({ ...o })),
    });
    setBusy(false);
    setError(null);
  }, [field]);

  if (!field || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const hasOptions = form.type === 'SELECT' || form.type === 'MULTISELECT';
  const setOption = (i, key) => (value) => setForm((f) => ({ ...f, options: f.options.map((o, k) => (k === i ? { ...o, [key]: value } : o)) }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, options: hasOptions ? form.options : undefined };
      if (isNew) await adminApi.createField({ ...payload, entity });
      else {
        delete payload.type;
        await adminApi.updateField(field.id, payload);
      }
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? t('fields.add') : t('fields.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.labelAr.trim() || !form.labelEn.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Txt muted size="small">{t('fields.appliesToAll', { section: t(`fields.entities.${entity}`) })}</Txt>
      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.labelAr} onChangeText={set('labelAr')} error={fieldError('labelAr')} />
        <Field label={t('plans.nameEn')} value={form.labelEn} onChangeText={set('labelEn')} error={fieldError('labelEn')} />
      </FieldRow>
      <Txt weight="weightMedium" size="small">{t('fields.type')}</Txt>
      {isNew ? (
        <ChipSelect value={form.type} onChange={set('type')} options={TYPES.map((x) => ({ value: x, label: t(`fields.types.${x}`) }))} />
      ) : (
        <Txt>{`${t(`fields.types.${form.type}`)} · ${t('fields.typeLocked')}`}</Txt>
      )}
      {hasOptions ? (
        <View style={{ gap: SPACING.sm }}>
          <Txt weight="weightMedium" size="small">{t('fields.options')}</Txt>
          {form.options.map((o, i) => (
            <Row key={i} style={{ alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field placeholder={t('plans.nameAr')} value={o.labelAr} onChangeText={setOption(i, 'labelAr')} />
              </View>
              <View style={{ flex: 1 }}>
                <Field placeholder={t('plans.nameEn')} value={o.labelEn} onChangeText={setOption(i, 'labelEn')} />
              </View>
              <IconButton icon="close" color={COLORS.danger} label={t('common.delete')} onPress={() => setForm((f) => ({ ...f, options: f.options.filter((_, k) => k !== i) }))} />
            </Row>
          ))}
          <Button small variant="secondary" icon="plus" title={t('fields.addOption')} onPress={() => setForm((f) => ({ ...f, options: [...f.options, { labelAr: '', labelEn: '' }] }))} style={{ alignSelf: 'flex-start' }} />
          {fieldError('options') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('options')}</Txt> : null}
        </View>
      ) : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt weight="weightMedium">{t('fields.required')}</Txt>
          <Txt muted size="small">{t('fields.requiredHint')}</Txt>
        </View>
        <Switch value={form.required} onValueChange={set('required')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
      </Row>
      <FieldRow>
        <Field label={t('fields.helpAr')} value={form.helpAr} onChangeText={set('helpAr')} />
        <Field label={t('fields.helpEn')} value={form.helpEn} onChangeText={set('helpEn')} />
      </FieldRow>
    </Sheet>
  );
}

function RenameSheet({ entity, field, defaultLabel, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ labelAr: '', labelEn: '' });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (field) setForm({ labelAr: field.labelAr ?? '', labelEn: field.labelEn ?? '' });
    setError(null);
  }, [field]);
  if (!field) return null;
  const save = async () => {
    try {
      await adminApi.setCoreField(entity, field.key, { labelAr: form.labelAr, labelEn: form.labelEn });
      onSaved();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Sheet
      visible
      title={t('fields.rename')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Txt muted size="small">{t('fields.renameHint', { name: defaultLabel })}</Txt>
      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.labelAr} onChangeText={(v) => setForm((f) => ({ ...f, labelAr: v }))} />
        <Field label={t('plans.nameEn')} value={form.labelEn} onChangeText={(v) => setForm((f) => ({ ...f, labelEn: v }))} />
      </FieldRow>
    </Sheet>
  );
}

/** Remove: hide (values kept, restorable) or delete permanently (values erased everywhere). */
function RemoveSheet({ field, onClose, onDone }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [field]);
  if (!field) return null;
  const go = async (purge) => {
    setBusy(true);
    try {
      await adminApi.removeField(field.id, purge);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Sheet visible title={t('fields.removeTitle', { name: fieldLabel(field, lang) })} onClose={onClose}>
      <ErrorBox error={error} />
      <Txt>{t('fields.usage', { count: field.usage })}</Txt>
      {field.isActive ? (
        <View style={styles.box}>
          <Txt weight="weightMedium">{t('fields.hideOption')}</Txt>
          <Txt muted size="small">{t('fields.hideOptionHint')}</Txt>
          <Button small variant="secondary" icon="eye-off-outline" title={t('fields.hideOption')} loading={busy} onPress={() => go(false)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      <View style={[styles.box, { borderColor: COLORS.dangerSoft }]}>
        <Txt weight="weightMedium" style={{ color: COLORS.danger }}>{t('fields.purge')}</Txt>
        <Txt muted size="small">{t('fields.purgeHint', { count: field.usage })}</Txt>
        <Button small variant="danger" icon="delete-forever-outline" title={t('fields.purge')} loading={busy} onPress={() => go(true)} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  head: { backgroundColor: COLORS.surfaceSoft },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  col: { width: 64, alignItems: 'center' },
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
