import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { ACTIONS, ACTION_ICONS, BUTTON_ENTITIES, BUTTON_GROUPS, RECORD_FIELDS, loadButtons } from '../services/buttons';
import { fieldLabel, toEditable, toPayload } from '../services/fields';
import { matches } from '../services/text';
import CustomFields from '../components/CustomFields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Segmented, Sheet, Txt, errorText } from '../components/ui';

// Platform team: buttons (الأزرار), for every subscriber.
//  - Built-in buttons: every action button of the app (catalog in services/buttons.js) — rename, change icon, hide.
//  - Added buttons: new buttons on record pages, from the actions library.

const ICONS = [
  'gesture-tap-button', 'plus', 'pencil-outline', 'delete-outline', 'check', 'check-circle-outline', 'close', 'whatsapp', 'phone-outline', 'email-outline',
  'open-in-new', 'link-variant', 'map-marker-outline', 'printer-outline', 'share-variant-outline', 'file-document-outline', 'cash-plus', 'cash-minus',
  'calendar-check-outline', 'bell-outline', 'star-outline', 'flag-outline', 'clipboard-check-outline', 'wrench-outline', 'key-outline', 'home-outline',
];

/** Text for default labels that contain data (a month, a count…). */
const SAMPLE = { month: '…', count: '…', number: '…', name: '…' };

export default function ButtonsScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState('builtIn');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminApi.buttons());
    } catch (e) {
      setError(e);
      setData({ overrides: [], custom: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reload = async () => {
    await load();
    loadButtons(true).catch(() => {});
  };

  return (
    <Screen title={t('buttonsAdmin.title')} subtitle={t('buttonsAdmin.subtitle')}>
      <View style={{ gap: SPACING.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'builtIn', label: t('buttonsAdmin.builtIn') },
            { value: 'added', label: t('buttonsAdmin.added') },
          ]}
        />
        <ErrorBox error={error} onRetry={load} />
        {data === null ? <Loading /> : tab === 'builtIn' ? <BuiltIn overrides={data.overrides} onChanged={reload} /> : <Added custom={data.custom} onChanged={reload} />}
      </View>
    </Screen>
  );
}

// ================================================================ built-in buttons

function BuiltIn({ overrides, onChanged }) {
  const { t, lang, row } = useI18n();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const byKey = useMemo(() => Object.fromEntries(overrides.map((o) => [o.key, o])), [overrides]);
  const defaultLabel = (b) => t(b.labelKey, SAMPLE);
  const groups = BUTTON_GROUPS.map((g) => ({
    ...g,
    buttons: g.buttons.filter((b) => {
      if (!text.trim()) return true;
      const o = byKey[b.id];
      return matches(`${defaultLabel(b)} ${t(`buttonsAdmin.groups.${g.group}`)} ${b.id} ${o?.labelAr ?? ''} ${o?.labelEn ?? ''}`, text);
    }),
  })).filter((g) => g.buttons.length);
  const total = BUTTON_GROUPS.reduce((n, g) => n + g.buttons.length, 0);

  return (
    <View style={{ gap: SPACING.md }}>
      <Txt muted size="small">{t('buttonsAdmin.builtInHint', { count: total })}</Txt>
      <Field value={text} onChangeText={setText} placeholder={t('search.placeholder')} />
      {groups.map((g) => (
        <Card key={g.group} padded={false}>
          <Txt weight="weightBold" style={styles.groupTitle}>{t(`buttonsAdmin.groups.${g.group}`)}</Txt>
          {g.buttons.map((b) => {
            const o = byKey[b.id];
            const renamed = o && (lang === 'ar' ? o.labelAr : o.labelEn);
            return (
              <Pressable key={b.id} onPress={() => setEditing(b)} style={[styles.row, { flexDirection: row }, styles.divider, o?.hidden && { opacity: 0.55 }]}>
                <View style={styles.icon}>
                  {o?.icon || b.icon ? <MaterialCommunityIcons name={o?.icon || b.icon} size={18} color={COLORS.primaryDark} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{renamed || defaultLabel(b)}</Txt>
                    {o?.hidden ? <Badge label={t('buttonsAdmin.hidden')} tone="danger" /> : null}
                    {o && (o.labelAr || o.labelEn) ? <Badge label={t('buttonsAdmin.renamed')} tone="info" /> : null}
                  </Row>
                  <Txt muted size="small">{renamed ? `${defaultLabel(b)} · ${b.id}` : b.id}</Txt>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
              </Pressable>
            );
          })}
        </Card>
      ))}
      {!groups.length ? <EmptyState icon="magnify" body={t('search.noResults', { query: text })} /> : null}
      <OverrideSheet
        button={editing}
        override={editing ? byKey[editing.id] : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </View>
  );
}

function OverrideSheet({ button, override, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!button) return;
    setForm({ labelAr: override?.labelAr ?? '', labelEn: override?.labelEn ?? '', icon: override?.icon ?? '', hidden: !!override?.hidden });
    setBusy(false);
    setError(null);
  }, [button, override]);

  if (!button || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async (values) => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.setButtonOverride(button.id, values);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t(button.labelKey, SAMPLE)}
      onClose={onClose}
      footer={
        <>
          {override ? <Button variant="ghost" title={t('buttonsAdmin.reset')} onPress={() => save({})} disabled={busy} /> : null}
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={() => save(form)} loading={busy} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Txt muted size="small">{button.id}</Txt>
      {button.rename ? (
        <>
          <Txt muted size="small">{t('buttonsAdmin.renameHint')}</Txt>
          <FieldRow>
            <Field label={t('plans.nameAr')} value={form.labelAr} onChangeText={set('labelAr')} />
            <Field label={t('plans.nameEn')} value={form.labelEn} onChangeText={set('labelEn')} />
          </FieldRow>
        </>
      ) : (
        <Txt muted size="small">{t('buttonsAdmin.fixedText')}</Txt>
      )}
      <IconPicker value={form.icon || button.icon} onChange={(icon) => set('icon')(icon === button.icon ? '' : icon)} />
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt weight="weightMedium">{t('buttonsAdmin.hide')}</Txt>
          <Txt muted size="small">{t('buttonsAdmin.hideHint')}</Txt>
        </View>
        <Switch value={form.hidden} onValueChange={set('hidden')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
      </Row>
    </Sheet>
  );
}

function IconPicker({ value, onChange }) {
  const { t, row } = useI18n();
  const list = value && !ICONS.includes(value) ? [value, ...ICONS] : ICONS;
  return (
    <View style={{ gap: SPACING.sm }}>
      <Txt weight="weightMedium" size="small">{t('sectionsAdmin.icon')}</Txt>
      <View style={[styles.icons, { flexDirection: row }]}>
        {list.map((icon) => (
          <Pressable key={icon} onPress={() => onChange(icon)} style={[styles.iconChoice, value === icon && styles.iconChosen]}>
            <MaterialCommunityIcons name={icon} size={20} color={value === icon ? COLORS.onPrimary : COLORS.primaryDark} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ================================================================ added buttons

function Added({ custom, onChanged }) {
  const { t, lang } = useI18n();
  const [sections, setSections] = useState([]);
  const [entity, setEntity] = useState('tenant');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminApi
      .sections()
      .then((list) => setSections(list.filter((s) => s.isActive && !s.parentId)))
      .catch(() => setSections([]));
  }, []);

  const entityName = (e) => {
    if (!e.startsWith('cs:')) return t(`buttonsAdmin.entities.${e}`);
    const s = sections.find((x) => `cs:${x.key}` === e);
    return s ? (lang === 'ar' ? s.nameAr : s.nameEn) : e;
  };
  const entities = [...BUTTON_ENTITIES, ...sections.map((s) => `cs:${s.key}`)];
  const list = custom.filter((b) => b.entity === entity);
  const label = (b) => (lang === 'ar' ? b.labelAr : b.labelEn);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      <Txt muted size="small">{t('buttonsAdmin.addedHint')}</Txt>
      <ChipSelect value={entity} onChange={setEntity} options={entities.map((e) => ({ value: e, label: entityName(e) }))} />
      <ErrorBox error={error} />
      <Card padded={false}>
        {list.length === 0 ? (
          <EmptyState icon="gesture-tap-button" body={t('buttonsAdmin.noAdded', { name: entityName(entity) })} />
        ) : (
          list.map((b, i) => (
            <Row key={b.id} style={[styles.row, i > 0 && styles.divider, !b.isActive && { opacity: 0.55 }]}>
              <View style={styles.icon}>
                <MaterialCommunityIcons name={b.icon} size={18} color={COLORS.primaryDark} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                  <Txt weight="weightMedium">{label(b)}</Txt>
                  {!b.isActive ? <Badge label={t('fields.removed')} tone="danger" /> : null}
                </Row>
                <Txt muted size="small">{t(`buttonsAdmin.actions.${b.action}`)}</Txt>
              </View>
              {b.isActive ? (
                <>
                  <IconButton icon="arrow-up" label={t('fields.up')} onPress={() => run(() => adminApi.moveButton(b.id, 'up'))} />
                  <IconButton icon="arrow-down" label={t('fields.down')} onPress={() => run(() => adminApi.moveButton(b.id, 'down'))} />
                  <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(b)} />
                  <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => run(() => adminApi.removeButton(b.id))} />
                </>
              ) : (
                <>
                  <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => run(() => adminApi.updateButton(b.id, { isActive: true }))} />
                  <IconButton icon="delete-forever-outline" color={COLORS.danger} label={t('fields.purge')} onPress={() => run(() => adminApi.removeButton(b.id, true))} />
                </>
              )}
            </Row>
          ))
        )}
      </Card>
      <Button icon="plus" title={t('buttonsAdmin.add')} onPress={() => setEditing({ entity })} style={{ alignSelf: 'flex-start' }} />
      <ButtonForm
        button={editing}
        entityName={editing ? entityName(editing.entity) : ''}
        sections={sections}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </View>
  );
}

/** Fields of a record page: built-in ones (tenant, lease…) + its extra fields. [{ key, label, def? }] */
function useEntityFields(entity) {
  const { t, lang } = useI18n();
  const [extra, setExtra] = useState([]);
  useEffect(() => {
    if (!entity) return;
    adminApi
      .fields(entity)
      .then((d) => setExtra(d.custom.filter((f) => f.isActive)))
      .catch(() => setExtra([]));
  }, [entity]);
  return useMemo(
    () => [
      ...(RECORD_FIELDS[entity] ?? []).map(([key, labelKey]) => ({ key, label: t(labelKey) })),
      ...extra.map((def) => ({ key: def.key, label: fieldLabel(def, lang), def })),
    ],
    [entity, extra, lang, t],
  );
}

function ButtonForm({ button, entityName, sections, onClose, onSaved }) {
  const { t, lang, row } = useI18n();
  const isNew = button && !button.id;
  const fields = useEntityFields(button?.entity);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!button) return;
    setForm({
      labelAr: button.labelAr ?? '',
      labelEn: button.labelEn ?? '',
      icon: button.icon ?? '',
      action: button.action ?? 'WHATSAPP',
      config: button.config ?? {},
    });
    setBusy(false);
    setError(null);
  }, [button]);

  if (!button || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setConfig = (key) => (value) => setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  const fieldError = (name) => (error?.field === `config.${name}` ? errorText(t, error) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload = { labelAr: form.labelAr, labelEn: form.labelEn, icon: form.icon || ACTION_ICONS[form.action], action: form.action, config: form.config };
    try {
      if (isNew) await adminApi.createButton({ ...payload, entity: button.entity });
      else await adminApi.updateButton(button.id, payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const fieldChips = (value, onChange) => <ChipSelect value={value} onChange={onChange} options={fields.map((f) => ({ value: f.key, label: f.label }))} />;
  const insertChips = (key) => (
    <View style={{ gap: SPACING.xs }}>
      <Txt muted size="small">{t('buttonsAdmin.insertField')}</Txt>
      <View style={[styles.chips, { flexDirection: row }]}>
        {fields.map((f) => (
          <Pressable key={f.key} onPress={() => setConfig(key)(`${form.config[key] ?? ''}{{${f.key}}}`)} style={styles.insert}>
            <Txt size="small" style={{ color: COLORS.primaryDark }}>{`+ ${f.label}`}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const c = form.config;
  const setFieldDef = fields.find((f) => f.key === c.field && f.def)?.def;
  const target = sections.find((s) => s.key === c.section);

  return (
    <Sheet
      visible
      title={`${isNew ? t('buttonsAdmin.add') : t('common.edit')} · ${entityName}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.labelAr.trim() || !form.labelEn.trim()} />
        </>
      }
    >
      {error && !String(error.field ?? '').startsWith('config.') ? <ErrorBox error={error} /> : null}
      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.labelAr} onChangeText={set('labelAr')} />
        <Field label={t('plans.nameEn')} value={form.labelEn} onChangeText={set('labelEn')} />
      </FieldRow>

      <Txt weight="weightMedium" size="small">{t('buttonsAdmin.action')}</Txt>
      <ChipSelect value={form.action} onChange={(a) => setForm((f) => ({ ...f, action: a, config: {} }))} options={ACTIONS.map((a) => ({ value: a, label: t(`buttonsAdmin.actions.${a}`) }))} />
      <Txt muted size="small">{t(`buttonsAdmin.actionHints.${form.action}`, { name: '{{name}}' })}</Txt>

      {form.action === 'LINK' ? (
        <>
          <Field label={t('buttonsAdmin.url')} value={c.url ?? ''} onChangeText={setConfig('url')} autoCapitalize="none" placeholder="https://" error={fieldError('url')} />
          {insertChips('url')}
        </>
      ) : null}

      {form.action === 'WHATSAPP' || form.action === 'CALL' ? (
        <>
          <Txt weight="weightMedium" size="small">{t('buttonsAdmin.phoneField')}</Txt>
          {fieldChips(c.phoneField, setConfig('phoneField'))}
          {fieldError('phoneField') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('phoneField')}</Txt> : null}
        </>
      ) : null}
      {form.action === 'WHATSAPP' ? (
        <>
          <Field label={t('buttonsAdmin.message')} value={c.message ?? ''} onChangeText={setConfig('message')} multiline error={fieldError('message')} />
          {insertChips('message')}
        </>
      ) : null}

      {form.action === 'EMAIL' ? (
        <>
          <Txt weight="weightMedium" size="small">{t('buttonsAdmin.emailField')}</Txt>
          {fieldChips(c.emailField, setConfig('emailField'))}
          {fieldError('emailField') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('emailField')}</Txt> : null}
          <Field label={t('buttonsAdmin.subject')} value={c.subject ?? ''} onChangeText={setConfig('subject')} />
          <Field label={t('buttonsAdmin.body')} value={c.body ?? ''} onChangeText={setConfig('body')} multiline />
          {insertChips('body')}
        </>
      ) : null}

      {form.action === 'SET_FIELD' ? (
        <>
          <Txt weight="weightMedium" size="small">{t('buttonsAdmin.field')}</Txt>
          {fields.some((f) => f.def) ? (
            <ChipSelect value={c.field} onChange={(key) => setForm((f) => ({ ...f, config: { ...f.config, field: key, value: null } }))} options={fields.filter((f) => f.def).map((f) => ({ value: f.key, label: f.label }))} />
          ) : (
            <Txt muted size="small">{t('buttonsAdmin.noExtraFields')}</Txt>
          )}
          {fieldError('field') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('field')}</Txt> : null}
          {setFieldDef ? (
            <>
              <Txt muted size="small">{t('buttonsAdmin.valueHint')}</Txt>
              <FieldValue key={setFieldDef.key} def={setFieldDef} value={c.value} onChange={setConfig('value')} />
              {fieldError('value') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('value')}</Txt> : null}
            </>
          ) : null}
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ flex: 1 }}>{t('buttonsAdmin.askFirst')}</Txt>
            <Switch value={!!c.confirm} onValueChange={setConfig('confirm')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
          </Row>
        </>
      ) : null}

      {form.action === 'NEW_RECORD' ? (
        <>
          <Txt weight="weightMedium" size="small">{t('buttonsAdmin.targetSection')}</Txt>
          {sections.length ? (
            <ChipSelect value={c.section} onChange={(key) => setForm((f) => ({ ...f, config: { section: key, copy: [] } }))} options={sections.map((s) => ({ value: s.key, label: lang === 'ar' ? s.nameAr : s.nameEn }))} />
          ) : (
            <Txt muted size="small">{t('buttonsAdmin.noSections')}</Txt>
          )}
          {fieldError('section') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('section')}</Txt> : null}
          {target ? <CopyMapping section={target} sourceFields={fields} copy={c.copy ?? []} onChange={setConfig('copy')} /> : null}
          {fieldError('copy') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('copy')}</Txt> : null}
        </>
      ) : null}

      <IconPicker value={form.icon || ACTION_ICONS[form.action]} onChange={set('icon')} />
    </Sheet>
  );
}

/** The value a "set a field" button writes, edited with the field's own input (kept as typed, e.g. "12.5"). */
function FieldValue({ def, value, onChange }) {
  const [vals, setVals] = useState(() => toEditable([def], { [def.key]: value }));
  return (
    <CustomFields
      defs={[{ ...def, required: false }]}
      values={vals}
      onChange={(next) => {
        setVals(next);
        onChange(toPayload([def], next)[def.key] ?? null);
      }}
    />
  );
}

/** For each field of the target section: which field of this record to copy into it (or nothing). */
function CopyMapping({ section, sourceFields, copy, onChange }) {
  const { t, lang } = useI18n();
  const targetFields = useEntityFields(`cs:${section.key}`).filter((f) => f.def);
  if (!targetFields.length) return <Txt muted size="small">{t('buttonsAdmin.noExtraFields')}</Txt>;
  const fromOf = (to) => copy.find((p) => p.to === to)?.from ?? '';
  const setFrom = (to, from) => onChange([...copy.filter((p) => p.to !== to), ...(from ? [{ from, to }] : [])]);
  return (
    <View style={{ gap: SPACING.sm }}>
      <Txt muted size="small">{t('buttonsAdmin.copyHint')}</Txt>
      {targetFields.map((f) => (
        <View key={f.key} style={styles.box}>
          <Txt weight="weightMedium" size="small">{fieldLabel(f.def, lang)}</Txt>
          <ChipSelect
            value={fromOf(f.key)}
            onChange={(from) => setFrom(f.key, from)}
            options={[{ value: '', label: t('buttonsAdmin.dontCopy') }, ...sourceFields.map((s) => ({ value: s.key, label: s.label }))]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  groupTitle: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', gap: SPACING.sm, flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  icons: { flexWrap: 'wrap', gap: SPACING.sm },
  iconChoice: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconChosen: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chips: { flexWrap: 'wrap', gap: SPACING.xs },
  insert: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: COLORS.primarySoft },
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.sm, gap: SPACING.xs },
});
