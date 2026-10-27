import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { SectionIcon } from '../components/Rial';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, FieldRow, IconButton, Loading, Row, Screen, Sheet, Txt, errorText } from '../components/ui';

// Platform team: sections (الأقسام) — create whole new sections with sub-sections. Each section gets
// its own menu entry, list, form (fields from the "Fields" page), search and trash, for every subscriber.

const ICONS = [
  'folder-outline',
  'briefcase-outline',
  'hammer-wrench',
  'clipboard-text-outline',
  'calendar-check-outline',
  'car-outline',
  'parking',
  'key-outline',
  'shield-check-outline',
  'water-outline',
  'flash-outline',
  'cash-multiple',
  'chart-box-outline',
  'account-group-outline',
  'home-city-outline',
  'truck-outline',
  'file-document-outline',
  'bell-outline',
];

export default function SectionsScreen({ onNavigate }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // {} | {parentId} | section
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await adminApi.sections());
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

  const name = (s) => (lang === 'ar' ? s.nameAr : s.nameEn);
  const top = (rows ?? []).filter((s) => !s.parentId);
  const childrenOf = (id) => (rows ?? []).filter((s) => s.parentId === id);

  const SectionRow = ({ s, child }) => (
    <Row style={[styles.row, child && styles.child, !s.isActive && { opacity: 0.55 }]}>
      <View style={styles.icon}>
        <SectionIcon name={s.icon} size={18} color={COLORS.primaryDark} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
          <Txt weight="weightMedium">{name(s)}</Txt>
          {child ? <Badge label={t('sectionsAdmin.subSection')} tone="info" /> : null}
          {!s.isActive ? <Badge label={t('fields.removed')} tone="danger" /> : null}
          {s.withProperty ? <Badge label={t('sectionsAdmin.linkedToProperty')} tone="neutral" /> : null}
        </Row>
        <Txt muted size="small">{`${s.key} · ${t('sectionsAdmin.recordsCount', { count: s.records })}`}</Txt>
      </View>
      {s.isActive ? (
        <>
          <Button small variant="secondary" icon="form-textbox" title={t('sectionsAdmin.fields')} onPress={() => onNavigate?.('fields', { entity: `cs:${s.key}` })} />
          <IconButton icon="arrow-up" label={t('fields.up')} onPress={() => run(() => adminApi.moveSection(s.id, 'up'))} />
          <IconButton icon="arrow-down" label={t('fields.down')} onPress={() => run(() => adminApi.moveSection(s.id, 'down'))} />
          <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(s)} />
          <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => setRemoving(s)} />
        </>
      ) : (
        <>
          <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => run(() => adminApi.updateSection(s.id, { isActive: true }))} />
          <IconButton icon="delete-forever-outline" color={COLORS.danger} label={t('fields.purge')} onPress={() => setRemoving(s)} />
        </>
      )}
    </Row>
  );

  return (
    <Screen title={t('sectionsAdmin.title')} subtitle={t('sectionsAdmin.subtitle')} actions={<Button icon="plus" title={t('sectionsAdmin.add')} onPress={() => setEditing({})} />}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        {rows === null ? (
          <Loading />
        ) : top.length === 0 ? (
          <Card>
            <EmptyState icon="view-grid-plus-outline" body={t('sectionsAdmin.empty')} />
          </Card>
        ) : (
          top.map((s) => (
            <Card key={s.id} padded={false}>
              <SectionRow s={s} />
              {childrenOf(s.id).map((c) => (
                <View key={c.id} style={styles.divider}>
                  <SectionRow s={c} child />
                </View>
              ))}
              {s.isActive ? (
                <Pressable onPress={() => setEditing({ parentId: s.id })} style={[styles.addSub, styles.divider]}>
                  <Txt size="small" style={{ color: COLORS.primaryDark }}>{`+ ${t('sectionsAdmin.addSub')}`}</Txt>
                </Pressable>
              ) : null}
            </Card>
          ))
        )}
        <Txt muted size="small">{t('sectionsAdmin.howItWorks')}</Txt>
      </View>
      <SectionForm
        section={editing}
        parent={editing?.parentId ? (rows ?? []).find((s) => s.id === editing.parentId) : null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <RemoveSection
        section={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setRemoving(null);
          load();
        }}
      />
    </Screen>
  );
}

function SectionForm({ section, parent, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const isNew = section && !section.id;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!section) return;
    setForm({
      nameAr: section.nameAr ?? '',
      nameEn: section.nameEn ?? '',
      icon: section.icon ?? 'folder-outline',
      withProperty: section.withProperty ?? false,
      addToPlans: true,
    });
    setBusy(false);
    setError(null);
  }, [section]);

  if (!section || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await adminApi.createSection({ ...form, parentId: section.parentId ?? undefined });
      else {
        const { addToPlans, ...rest } = form;
        await adminApi.updateSection(section.id, rest);
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
      title={isNew ? (parent ? t('sectionsAdmin.addSubTo', { name: lang === 'ar' ? parent.nameAr : parent.nameEn }) : t('sectionsAdmin.add')) : t('sectionsAdmin.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.nameAr.trim() || !form.nameEn.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      {parent ? <Txt muted size="small">{t('sectionsAdmin.subHint')}</Txt> : null}
      <FieldRow>
        <Field label={t('plans.nameAr')} value={form.nameAr} onChangeText={set('nameAr')} error={error?.field === 'nameAr' ? errorText(t, error) : undefined} />
        <Field label={t('plans.nameEn')} value={form.nameEn} onChangeText={set('nameEn')} error={error?.field === 'nameEn' ? errorText(t, error) : undefined} />
      </FieldRow>
      <Txt weight="weightMedium" size="small">{t('sectionsAdmin.icon')}</Txt>
      <View style={styles.icons}>
        {ICONS.map((icon) => (
          <Pressable key={icon} onPress={() => set('icon')(icon)} style={[styles.iconChoice, form.icon === icon && styles.iconChosen]}>
            <SectionIcon name={icon} size={22} color={form.icon === icon ? COLORS.onPrimary : COLORS.primaryDark} />
          </Pressable>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt weight="weightMedium">{t('sectionsAdmin.withProperty')}</Txt>
          <Txt muted size="small">{t('sectionsAdmin.withPropertyHint')}</Txt>
        </View>
        <Switch value={form.withProperty} onValueChange={set('withProperty')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
      </Row>
      {isNew && !parent ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt weight="weightMedium">{t('sectionsAdmin.addToPlans')}</Txt>
            <Txt muted size="small">{t('sectionsAdmin.addToPlansHint')}</Txt>
          </View>
          <Switch value={form.addToPlans} onValueChange={set('addToPlans')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
        </Row>
      ) : null}
      {isNew ? <Txt muted size="small">{t('sectionsAdmin.nextFields')}</Txt> : null}
    </Sheet>
  );
}

function RemoveSection({ section, onClose, onDone }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [section]);
  if (!section) return null;
  const go = async (purge) => {
    setBusy(true);
    try {
      await adminApi.removeSection(section.id, purge);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Sheet visible title={t('fields.removeTitle', { name: lang === 'ar' ? section.nameAr : section.nameEn })} onClose={onClose}>
      <ErrorBox error={error} />
      <Txt>{t('sectionsAdmin.recordsCount', { count: section.records })}</Txt>
      {section.isActive ? (
        <View style={styles.box}>
          <Txt weight="weightMedium">{t('sectionsAdmin.hide')}</Txt>
          <Txt muted size="small">{t('sectionsAdmin.hideHint')}</Txt>
          <Button small variant="secondary" icon="eye-off-outline" title={t('sectionsAdmin.hide')} loading={busy} onPress={() => go(false)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      <View style={[styles.box, { borderColor: COLORS.dangerSoft }]}>
        <Txt weight="weightMedium" style={{ color: COLORS.danger }}>{t('fields.purge')}</Txt>
        <Txt muted size="small">{t('sectionsAdmin.purgeHint')}</Txt>
        <Button small variant="danger" icon="delete-forever-outline" title={t('fields.purge')} loading={busy} disabled={section.records > 0} onPress={() => go(true)} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  child: { paddingStart: SPACING.xl, backgroundColor: COLORS.surfaceSoft },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  icon: { width: 34, height: 34, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  addSub: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  iconChoice: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  iconChosen: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
