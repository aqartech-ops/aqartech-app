import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { fieldLabel } from '../services/fields';
import { BUTTON_ENTITIES } from '../services/buttons';
import { COMMON_FIELDS, PRINT_FIELDS, pick, templateHtml } from '../services/printTemplate';
import { loadTemplates, omanToday } from '../services/templates';
import { printHtml } from '../services/receipt';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Segmented, Sheet, Txt, errorText } from '../components/ui';

// Platform team: print templates (قوالب الطباعة) — letters, notices and forms for every subscriber.
// Each active template appears as a print button on its record page; {{fields}} are filled from the record.

const MAX_SIGNATURES = 4;

export default function TemplatesScreen() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  const [sections, setSections] = useState([]);
  const [entity, setEntity] = useState('lease');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.templates());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
    adminApi
      .sections()
      .then((list) => setSections(list.filter((s) => s.isActive && !s.parentId)))
      .catch(() => setSections([]));
  }, [load]);

  const changed = async () => {
    await load();
    loadTemplates(true).catch(() => {});
  };
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      await changed();
    } catch (e) {
      setError(e);
    }
  };

  const entityName = (e) => {
    if (!e.startsWith('cs:')) return t(`buttonsAdmin.entities.${e}`);
    const s = sections.find((x) => `cs:${x.key}` === e);
    return s ? (lang === 'ar' ? s.nameAr : s.nameEn) : e;
  };
  const entities = [...BUTTON_ENTITIES, ...sections.map((s) => `cs:${s.key}`)];
  const list = (rows ?? []).filter((r) => r.entity === entity);

  return (
    <Screen title={t('templatesAdmin.title')} subtitle={t('templatesAdmin.subtitle')} actions={<Button icon="plus" title={t('templatesAdmin.add')} onPress={() => setEditing({ entity })} />}>
      <View style={{ gap: SPACING.md }}>
        <ChipSelect value={entity} onChange={setEntity} options={entities.map((e) => ({ value: e, label: entityName(e) }))} />
        <ErrorBox error={error} onRetry={load} />
        {rows === null ? (
          <Loading />
        ) : (
          <Card padded={false}>
            {list.length === 0 ? (
              <EmptyState icon="file-document-edit-outline" body={t('templatesAdmin.empty', { name: entityName(entity) })} />
            ) : (
              list.map((r, i) => (
                <Row key={r.id} style={[styles.row, i > 0 && styles.divider, !r.isActive && { opacity: 0.55 }]}>
                  <View style={styles.icon}>
                    <MaterialCommunityIcons name="printer-outline" size={18} color={COLORS.primaryDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                      <Txt weight="weightMedium">{pick(r, lang, 'name')}</Txt>
                      <Badge label={r.paper} tone="neutral" />
                      {!r.isActive ? <Badge label={t('fields.removed')} tone="danger" /> : null}
                    </Row>
                    {pick(r, lang, 'title') ? <Txt muted size="small">{pick(r, lang, 'title')}</Txt> : null}
                  </View>
                  {r.isActive ? (
                    <>
                      <IconButton icon="arrow-up" label={t('fields.up')} onPress={() => run(() => adminApi.moveTemplate(r.id, 'up'))} />
                      <IconButton icon="arrow-down" label={t('fields.down')} onPress={() => run(() => adminApi.moveTemplate(r.id, 'down'))} />
                      <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(r)} />
                      <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => run(() => adminApi.removeTemplate(r.id))} />
                    </>
                  ) : (
                    <>
                      <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => run(() => adminApi.updateTemplate(r.id, { isActive: true }))} />
                      <IconButton icon="delete-forever-outline" color={COLORS.danger} label={t('fields.purge')} onPress={() => run(() => adminApi.removeTemplate(r.id, true))} />
                    </>
                  )}
                </Row>
              ))
            )}
          </Card>
        )}
        <Txt muted size="small">{t('templatesAdmin.howItWorks')}</Txt>
      </View>
      <TemplateForm
        template={editing}
        entityName={editing ? entityName(editing.entity) : ''}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          changed();
        }}
      />
    </Screen>
  );
}

/** Fields that can be inserted: built-in ones of the record page, its extra fields, and the common ones. */
function useInsertableFields(entity) {
  const { t, lang } = useI18n();
  const [extra, setExtra] = useState([]);
  useEffect(() => {
    if (!entity) return;
    adminApi
      .fields(entity)
      .then((d) => setExtra(d.custom.filter((f) => f.isActive)))
      .catch(() => setExtra([]));
  }, [entity]);
  return useMemo(() => {
    const formatOf = (type) => (type === 'MONEY' ? 'money' : type === 'DATE' ? 'date' : undefined);
    return {
      defs: extra,
      list: [
        ...(PRINT_FIELDS[entity] ?? []).map(([key, labelKey, format]) => ({ key, label: t(labelKey), format })),
        ...extra.map((def) => ({ key: def.key, label: fieldLabel(def, lang), format: formatOf(def.type) })),
        ...COMMON_FIELDS.map(([key, labelKey, format]) => ({ key, label: t(labelKey), format })),
      ],
    };
  }, [entity, extra, lang, t]);
}

function TemplateForm({ template, entityName, onClose, onSaved }) {
  const { t, lang, row } = useI18n();
  const isNew = template && !template.id;
  const fields = useInsertableFields(template?.entity);
  const [form, setForm] = useState(null);
  const [bodyLang, setBodyLang] = useState(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!template) return;
    setForm({
      nameAr: template.nameAr ?? '',
      nameEn: template.nameEn ?? '',
      titleAr: template.titleAr ?? '',
      titleEn: template.titleEn ?? '',
      bodyAr: template.bodyAr ?? '',
      bodyEn: template.bodyEn ?? '',
      signatures: template.signatures ?? [],
      paper: template.paper ?? 'A4',
    });
    setBusy(false);
    setError(null);
  }, [template]);

  if (!template || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const bodyKey = bodyLang === 'ar' ? 'bodyAr' : 'bodyEn';
  const insert = (f) => set(bodyKey)(`${form[bodyKey]}{{${f.key}${f.format ? ` | ${f.format}` : ''}}}`);
  const errorFor = (key) => (error?.field === key ? `${errorText(t, error)}${error.extra?.detail ? ` ${error.extra.detail}` : ''}` : undefined);

  const setSignature = (i, key) => (value) => set('signatures')(form.signatures.map((s, j) => (j === i ? { ...s, [key]: value } : s)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await adminApi.createTemplate({ ...form, entity: template.entity });
      else await adminApi.updateTemplate(template.id, form);
      onSaved();
    } catch (e) {
      setError(e);
      if (e.field === 'bodyAr' || e.field === 'bodyEn') setBodyLang(e.field === 'bodyAr' ? 'ar' : 'en');
      setBusy(false);
    }
  };

  /** Sample page: every field shows its own name, amounts and dates a sample value. */
  const preview = () => {
    const data = { today: omanToday(), company: { name: t('templatesAdmin.sampleCompany'), phone: '9XXX XXXX' }, custom: {} };
    for (const f of fields.list) {
      const value = f.format === 'money' ? 1234500 : f.format === 'date' ? omanToday() : `[${f.label}]`;
      const parts = f.key.split('.');
      if (parts.length === 2) data[parts[0]] = { ...(data[parts[0]] ?? {}), [parts[1]]: value };
      else if (fields.defs.some((d) => d.key === f.key)) data.custom[f.key] = value;
      else data[f.key] = value;
    }
    printHtml(templateHtml({ ...form }, data, { lang: bodyLang, entity: template.entity, defs: fields.defs, yes: t('common.yes'), no: t('common.no') }));
  };

  return (
    <Sheet
      visible
      title={`${isNew ? t('templatesAdmin.add') : t('common.edit')} · ${entityName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" icon="eye-outline" title={t('templatesAdmin.preview')} onPress={preview} />
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.nameAr.trim() || !form.nameEn.trim()} />
        </>
      }
    >
      {error && !['nameAr', 'nameEn', 'bodyAr', 'bodyEn'].includes(error.field) ? <ErrorBox error={error} /> : null}
      <FieldRow>
        <Field label={t('templatesAdmin.nameAr')} value={form.nameAr} onChangeText={set('nameAr')} error={errorFor('nameAr')} />
        <Field label={t('templatesAdmin.nameEn')} value={form.nameEn} onChangeText={set('nameEn')} error={errorFor('nameEn')} />
      </FieldRow>
      <FieldRow>
        <Field label={t('templatesAdmin.titleAr')} value={form.titleAr} onChangeText={set('titleAr')} />
        <Field label={t('templatesAdmin.titleEn')} value={form.titleEn} onChangeText={set('titleEn')} />
      </FieldRow>

      <Txt weight="weightMedium">{t('templatesAdmin.body')}</Txt>
      <Segmented
        value={bodyLang}
        onChange={setBodyLang}
        options={[
          { value: 'ar', label: t('templatesAdmin.arabic') },
          { value: 'en', label: t('templatesAdmin.english') },
        ]}
      />
      <Field
        key={bodyKey}
        value={form[bodyKey]}
        onChangeText={set(bodyKey)}
        multiline
        inputStyle={{ minHeight: 220, textAlignVertical: 'top' }}
        placeholder={t('templatesAdmin.bodyPlaceholder')}
        error={errorFor(bodyKey)}
      />
      <Txt muted size="small">{t('templatesAdmin.formatHelp')}</Txt>
      <Txt muted size="small">{t('templatesAdmin.otherLanguage')}</Txt>
      <View style={{ gap: SPACING.xs }}>
        <Txt muted size="small">{t('buttonsAdmin.insertField')}</Txt>
        <View style={[styles.chips, { flexDirection: row }]}>
          {fields.list.map((f) => (
            <Pressable key={f.key} onPress={() => insert(f)} style={styles.insert}>
              <Txt size="small" style={{ color: COLORS.primaryDark }}>{`+ ${f.label}`}</Txt>
            </Pressable>
          ))}
        </View>
      </View>

      <Txt weight="weightMedium">{t('templatesAdmin.signatures')}</Txt>
      {form.signatures.map((s, i) => (
        <Row key={i} style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <FieldRow>
              <Field label={t('templatesAdmin.signatureAr')} value={s.labelAr} onChangeText={setSignature(i, 'labelAr')} />
              <Field label={t('templatesAdmin.signatureEn')} value={s.labelEn} onChangeText={setSignature(i, 'labelEn')} />
            </FieldRow>
          </View>
          <IconButton icon="close" color={COLORS.danger} label={t('common.delete')} onPress={() => set('signatures')(form.signatures.filter((_, j) => j !== i))} />
        </Row>
      ))}
      {form.signatures.length < MAX_SIGNATURES ? (
        <Button small variant="secondary" icon="plus" title={t('templatesAdmin.addSignature')} onPress={() => set('signatures')([...form.signatures, { labelAr: '', labelEn: '' }])} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      <Txt weight="weightMedium">{t('templatesAdmin.paper')}</Txt>
      <Segmented value={form.paper} onChange={set('paper')} options={['A4', 'A5'].map((p) => ({ value: p, label: p }))} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  chips: { flexWrap: 'wrap', gap: SPACING.xs },
  insert: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
});
