import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { propertiesApi } from '../services/api';
import { confirm } from '../services/dialog';
import { matches } from '../services/text';
import { customApi, sectionName, useCustomSections } from '../services/customSections';
import { optionLabel, toEditable, toPayload, useFieldRules } from '../services/fields';
import CustomFields, { CustomValues } from '../components/CustomFields';
import CustomActions from '../components/CustomActions';
import SectionAnalytics from '../components/SectionAnalytics';
import { metricsApi } from '../services/api';
import { Money, SectionIcon } from '../components/Rial';
import { formatDate } from '../components/Fields';
import { BackButton, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, IconButton, Loading, Row, Screen, Segmented, Sheet, Txt } from '../components/ui';

// A section created by the platform team (قسم مضاف): list, record page with its sub-sections, form, search, trash.
// Its fields come from the "Fields" admin page (entity "cs:<key>").

/** Text of one value for titles and lists. */
function valueText(def, value, lang, t) {
  if (value === undefined || value === null || value === '') return '';
  if (def.type === 'DATE') return formatDate(value, lang);
  if (def.type === 'BOOLEAN') return value ? t('common.yes') : t('common.no');
  if (def.type === 'SELECT') return optionLabel((def.options ?? []).find((o) => o.value === value) ?? { value }, lang);
  if (def.type === 'MULTISELECT') return (value ?? []).map((x) => optionLabel((def.options ?? []).find((o) => o.value === x) ?? { value: x }, lang)).join('، ');
  if (def.type === 'MONEY') return null; // drawn with <Money />
  return String(value);
}

function titleOf(section, defs, record, lang, t) {
  const def = defs.find((d) => d.key === section.titleKey) ?? defs.find((d) => d.type !== 'MONEY') ?? defs[0];
  const text = def ? valueText(def, record.custom?.[def.key], lang, t) : '';
  return text || t('sectionsUser.untitled');
}

/** Up to two other values shown under the title. */
function SummaryLine({ defs, record, skipKey }) {
  const { t, lang } = useI18n();
  const parts = [];
  for (const d of defs) {
    if (d.key === skipKey || parts.length >= 2) continue;
    const v = record.custom?.[d.key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(
      d.type === 'MONEY' ? (
        <Money key={d.key} baisa={v} size={12} color={COLORS.textMuted} />
      ) : (
        <Txt key={d.key} muted size="small">{valueText(d, v, lang, t)}</Txt>
      ),
    );
  }
  return parts.length ? <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>{parts}</Row> : null;
}

export default function CustomSectionScreen({ sectionKey, params, onNavigate }) {
  const { t, lang } = useI18n();
  const sections = useCustomSections();
  const section = sections.find((s) => s.key === sectionKey);
  const children = useMemo(() => sections.filter((s) => s.parentId === section?.id), [sections, section]);
  const [openId, setOpenId] = useState(null);
  // indicators of this section (and its sub-sections) the user may see — the "Analytics" view
  const [metrics, setMetrics] = useState([]);
  const [view, setView] = useState(params?.analytics ? 'analytics' : 'records');

  useEffect(() => {
    metricsApi
      .list(sectionKey)
      .then(setMetrics)
      .catch(() => setMetrics([]));
  }, [sectionKey]);

  // opened from the global search: a record of this section, or of one of its sub-sections (open its parent)
  useEffect(() => {
    if (!params?.recordId) return;
    if (!params.sectionKey || params.sectionKey === sectionKey) {
      setOpenId(params.recordId);
      return;
    }
    customApi
      .get(params.sectionKey, params.recordId)
      .then((r) => r.parentRecordId && setOpenId(r.parentRecordId))
      .catch(() => {});
  }, [params, sectionKey]);

  if (!section) return <Screen><Loading /></Screen>;
  if (openId) return <RecordPage section={section} subSections={children} id={openId} onBack={() => setOpenId(null)} onNavigate={onNavigate} />;
  // params.newRecord: opened by an added button on another record page, with values to copy into the new record
  const tabs = metrics.length ? (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { value: 'records', label: t('metrics.records') },
        { value: 'analytics', label: t('metrics.analytics') },
      ]}
    />
  ) : null;
  if (view === 'analytics' && metrics.length) {
    return (
      <Screen title={sectionName(section, lang)}>
        <View style={{ gap: SPACING.md }}>
          {tabs}
          <SectionAnalytics metrics={metrics} filename={`${section.key}-analytics`} />
        </View>
      </Screen>
    );
  }
  return <RecordList section={section} onOpen={setOpenId} title={sectionName(section, lang)} openCreate={!!params?.create} prefill={params?.newRecord} tabs={tabs} />;
}

// ================================================================ list

function RecordList({ section, onOpen, title, openCreate, prefill, tabs }) {
  const { t, lang, forwardIcon } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit(`cs_${section.key}`);
  const rules = useFieldRules(`cs:${section.key}`);
  const [trash, setTrash] = useState(false);
  const [text, setText] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(editable ? (prefill ? { propertyId: section.withProperty ? prefill.propertyId ?? null : null, custom: prefill.custom ?? {} } : openCreate ? {} : null) : null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await customApi.list(section.key, trash ? { trash: '1' } : undefined));
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, [section.key, trash]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const visible = (rows ?? []).filter(
    (r) => !text.trim() || matches(Object.values(r.custom ?? {}).flat().map(String).join(' '), text),
  );

  const restore = async (r) => {
    try {
      await customApi.restore(section.key, r.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen title={title} actions={editable && !trash ? <Button id="records.add" icon="plus" title={t('sectionsUser.add')} onPress={() => setEditing({})} /> : null}>
      <View style={{ gap: SPACING.md }}>
        {tabs}
        <Row style={{ flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field value={text} onChangeText={setText} placeholder={t('search.placeholder')} />
          </View>
          {editable ? <Button id="records.trash" small variant={trash ? 'primary' : 'secondary'} icon="delete-restore" title={t('common.trash')} onPress={() => setTrash((x) => !x)} /> : null}
        </Row>
        <ErrorBox error={error} onRetry={load} />
        {rows === null ? (
          <Loading />
        ) : rules.custom.length === 0 ? (
          <Card>
            <EmptyState icon={section.icon} body={t('sectionsUser.noFields')} />
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon={section.icon} body={trash ? t('tenants.trashEmpty') : t('sectionsUser.empty')} />
          </Card>
        ) : (
          <Card padded={false}>
            {visible.map((r, i) => (
              <Pressable key={r.id} onPress={trash ? undefined : () => onOpen(r.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
                <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                  <View style={styles.icon}>
                    <SectionIcon name={section.icon} size={18} color={COLORS.primaryDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="weightMedium">{titleOf(section, rules.custom, r, lang, t)}</Txt>
                    <SummaryLine defs={rules.custom} record={r} skipKey={section.titleKey ?? rules.custom[0]?.key} />
                  </View>
                  {trash ? (
                    <Button id="records.restore" small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(r)} />
                  ) : (
                    <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
                  )}
                </Row>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
      <RecordForm
        section={section}
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setEditing(null);
          load();
          if (saved?.id) onOpen(saved.id);
        }}
      />
    </Screen>
  );
}

// ================================================================ record page

function RecordPage({ section, subSections, id, onBack, onNavigate }) {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit(`cs_${section.key}`);
  const rules = useFieldRules(`cs:${section.key}`);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [propertyName, setPropertyName] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecord(await customApi.get(section.key, id));
    } catch (e) {
      setError(e);
    }
  }, [section.key, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!record?.propertyId) return;
    propertiesApi.get(record.propertyId).then((p) => setPropertyName(p.name)).catch(() => {});
  }, [record?.propertyId]);

  const remove = async () => {
    const ok = await confirm({ title: t('common.delete'), message: t('sectionsUser.deleteConfirm'), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true });
    if (!ok) return;
    try {
      await customApi.remove(section.key, id);
      onBack();
    } catch (e) {
      setError(e);
    }
  };

  const back = <BackButton onPress={onBack} label={sectionName(section, lang)} />;
  if (!record) {
    return (
      <Screen back={back}>
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      back={back}
      title={titleOf(section, rules.custom, record, lang, t)}
      actions={
        editable ? (
          <>
            <IconButton id="records.edit" icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(record)} />
            <IconButton id="records.delete" icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={remove} />
          </>
        ) : null
      }
    >
      <View style={{ gap: SPACING.lg }}>
        <ErrorBox error={error} />
        <Card style={{ gap: SPACING.sm }}>
          {propertyName ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('expenses.property')}</Txt>
              <Txt>{propertyName}</Txt>
            </Row>
          ) : null}
          <CustomValues defs={rules.custom} values={record.custom} />
          <CustomActions
            entity={`cs:${section.key}`}
            record={record}
            editable={editable}
            onNavigate={onNavigate}
            onUpdate={async (custom) => {
              await customApi.update(section.key, record.id, { custom });
              await load();
            }}
          />
          <Txt muted size="small">{t('sectionsUser.updated', { date: formatDate(record.updatedAt, lang) })}</Txt>
        </Card>
        {subSections.map((sub) => (
          <SubRecords key={sub.id} section={sub} parentId={record.id} editable={editable} />
        ))}
      </View>
      <RecordForm
        section={section}
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Screen>
  );
}

/** Records of a sub-section inside a parent record, with totals of amount fields. */
function SubRecords({ section, parentId, editable }) {
  const { t, lang } = useI18n();
  const rules = useFieldRules(`cs:${section.key}`);
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => customApi.list(section.key, { parentRecordId: parentId }).then(setRows).catch((e) => (setError(e), setRows([]))), [section.key, parentId]);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (r) => {
    const ok = await confirm({ title: t('common.delete'), message: t('sectionsUser.deleteConfirm'), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true });
    if (!ok) return;
    try {
      await customApi.remove(section.key, r.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const moneyDefs = rules.custom.filter((d) => d.type === 'MONEY');
  const totals = moneyDefs.map((d) => ({ def: d, sum: (rows ?? []).reduce((s, r) => s + (Number(r.custom?.[d.key]) || 0), 0) }));

  return (
    <Card style={{ gap: SPACING.sm }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Row gap={SPACING.sm}>
          <SectionIcon name={section.icon} size={18} color={COLORS.primaryDark} />
          <Txt weight="weightBold">{sectionName(section, lang)}</Txt>
          {rows ? <Txt muted size="small">{`(${rows.length})`}</Txt> : null}
        </Row>
        {editable ? <Button id="records.addSub" small icon="plus" title={t('sectionsUser.add')} onPress={() => setEditing({ parentRecordId: parentId })} /> : null}
      </Row>
      <ErrorBox error={error} />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Txt muted size="small">{t('sectionsUser.empty')}</Txt>
      ) : (
        <View style={styles.list}>
          {rows.map((r, i) => (
            <Pressable key={r.id} onPress={editable ? () => setEditing(r) : undefined}>
              <Row style={[styles.subRow, i > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt size="small" weight="weightMedium">{titleOf(section, rules.custom, r, lang, t)}</Txt>
                  <SummaryLine defs={rules.custom} record={r} skipKey={section.titleKey ?? rules.custom[0]?.key} />
                </View>
                {editable ? <IconButton id="records.deleteSub" icon="delete-outline" size={18} color={COLORS.danger} label={t('common.delete')} onPress={() => remove(r)} /> : null}
              </Row>
            </Pressable>
          ))}
        </View>
      )}
      {rows?.length && totals.length ? (
        <View style={{ gap: 2 }}>
          {totals.map(({ def, sum }) => (
            <Row key={def.key} style={{ justifyContent: 'space-between' }}>
              <Txt weight="weightBold" size="small">{t('sectionsUser.total', { name: lang === 'ar' ? def.labelAr : def.labelEn })}</Txt>
              <Money baisa={sum} weight="weightBold" size={13} />
            </Row>
          ))}
        </View>
      ) : null}
      <RecordForm
        section={section}
        record={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Card>
  );
}

// ================================================================ form

function RecordForm({ section, record, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const isNew = record && !record.id;
  const [error, setError] = useState(null);
  const rules = useFieldRules(`cs:${section.key}`, error);
  const [form, setForm] = useState(null);
  const [properties, setProperties] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!record) {
      setForm(null);
      return;
    }
    setForm({ propertyId: record.propertyId ?? null, custom: toEditable(rules.custom, record.custom) });
    setError(null);
    setBusy(false);
    if (section.withProperty) propertiesApi.list().then(setProperties).catch(() => setProperties([]));
  }, [record]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!record || !form) return null;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        custom: toPayload(rules.custom, form.custom),
        ...(section.withProperty ? { propertyId: form.propertyId || null } : {}),
        ...(isNew && record.parentRecordId ? { parentRecordId: record.parentRecordId } : {}),
      };
      onSaved(isNew ? await customApi.create(section.key, payload) : await customApi.update(section.key, record.id, payload));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={`${isNew ? t('sectionsUser.add') : t('common.edit')} · ${sectionName(section, lang)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!rules.custom.length} />
        </>
      }
    >
      {error && !String(error.field ?? '').startsWith('custom.') && error.field !== 'propertyId' ? <ErrorBox error={error} /> : null}
      {!rules.custom.length ? <Txt muted>{t('sectionsUser.noFields')}</Txt> : null}
      {section.withProperty ? (
        <>
          <Txt weight="weightMedium" size="small">{t('expenses.property')}</Txt>
          <ChipSelect
            value={form.propertyId ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, propertyId: v || null }))}
            options={[{ value: '', label: t('common.none') }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
          />
        </>
      ) : null}
      <CustomFields defs={rules.custom} values={form.custom} onChange={(custom) => setForm((f) => ({ ...f, custom }))} error={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  subRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  icon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
});
