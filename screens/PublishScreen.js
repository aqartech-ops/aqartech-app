import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { confirm } from '../services/dialog';
import { loadFields } from '../services/fields';
import { formatDate } from '../components/Fields';
import { Badge, Button, Card, EmptyState, ErrorBox, Field, Loading, Row, Screen, Txt } from '../components/ui';

// Draft & publish (المسودة والنشر): changes of the platform team's pages wait here; subscribers keep the
// published version until "Publish". History of versions, each can be brought back.

const KIND_TONE = { added: 'success', changed: 'info', removed: 'danger' };
const KIND_ICON = { added: 'plus-circle-outline', changed: 'pencil-circle-outline', removed: 'minus-circle-outline' };

function ChangeList({ changes }) {
  const { t, lang } = useI18n();
  const byArea = changes.reduce((m, c) => ({ ...m, [c.area]: [...(m[c.area] ?? []), c] }), {});
  return (
    <View style={{ gap: SPACING.md }}>
      {Object.entries(byArea).map(([area, list]) => (
        <View key={area} style={{ gap: SPACING.xs }}>
          <Txt weight="weightMedium" size="small" muted>{t(`publish.areas.${area}`)}</Txt>
          {list.map((c) => (
            <Row key={`${c.area}:${c.id}`} gap={SPACING.sm}>
              <MaterialCommunityIcons name={KIND_ICON[c.kind]} size={16} color={c.kind === 'removed' ? COLORS.danger : c.kind === 'added' ? COLORS.success : COLORS.primaryDark} />
              <Txt style={{ flex: 1 }} numberOfLines={1}>{(lang === 'ar' ? c.labelAr : c.labelEn) || c.id}</Txt>
              <Badge label={t(`publish.kinds.${c.kind}`)} tone={KIND_TONE[c.kind]} />
            </Row>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function PublishScreen() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState(null);
  const [versions, setVersions] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [openVersion, setOpenVersion] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, list] = await Promise.all([adminApi.configStatus(), adminApi.configVersions()]);
      setStatus(s);
      setVersions(list);
    } catch (e) {
      setError(e);
      setStatus((s) => s ?? { changes: [], number: 0 });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (name, fn) => {
    setBusy(name);
    setError(null);
    setDone(null);
    try {
      const res = await fn();
      await load();
      loadFields(true).catch(() => {});
      return res;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const res = await run('publish', () => adminApi.publish(note.trim() || undefined));
    if (res) {
      setNote('');
      setDone(t('publish.published', { number: res.number }));
    }
  };
  const discard = async () => {
    if (!(await confirm({ title: t('publish.discard'), message: t('publish.discardConfirm'), confirmText: t('publish.discard'), cancelText: t('common.cancel'), destructive: true }))) return;
    if (await run('discard', () => adminApi.discardDraft())) setDone(t('publish.discarded'));
  };
  const restore = async (v) => {
    if (!(await confirm({ title: t('publish.restore'), message: t('publish.restoreConfirm', { number: v.number }), confirmText: t('publish.restore'), cancelText: t('common.cancel') }))) return;
    const res = await run(`restore:${v.number}`, () => adminApi.restoreVersion(v.number));
    if (res) setDone(t('publish.published', { number: res.number }));
  };

  if (!status) {
    return (
      <Screen title={t('publish.title')}>
        <Loading />
      </Screen>
    );
  }
  const changes = status.changes ?? [];

  return (
    <Screen title={t('publish.title')} subtitle={t('publish.subtitle')}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        {done ? (
          <Card>
            <Txt style={{ color: COLORS.success }}>{done}</Txt>
          </Card>
        ) : null}

        <Card style={{ gap: SPACING.md }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt weight="weightBold">{t('publish.draft')}</Txt>
            <Badge label={t('publish.liveVersion', { number: status.number })} tone="info" />
          </Row>
          {changes.length === 0 ? (
            <EmptyState icon="check-circle-outline" body={t('publish.noChanges')} />
          ) : (
            <>
              <Txt muted>{t('publish.pending', { count: changes.length })}</Txt>
              <ChangeList changes={changes} />
              <Field label={t('publish.note')} value={note} onChangeText={setNote} placeholder={t('publish.notePlaceholder')} />
              <Row style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="ghost" icon="undo-variant" title={t('publish.discard')} onPress={discard} loading={busy === 'discard'} disabled={!!busy} />
                <Button icon="publish" title={t('publish.publish')} onPress={publish} loading={busy === 'publish'} disabled={!!busy} />
              </Row>
            </>
          )}
          <Txt muted size="small">{t('publish.howItWorks')}</Txt>
        </Card>

        <Txt weight="weightBold">{t('publish.history')}</Txt>
        <Card padded={false}>
          {versions.map((v, i) => (
            <View key={v.number} style={[styles.version, i > 0 && styles.divider]}>
              <Row style={{ flexWrap: 'wrap' }}>
                <View style={{ flex: 1, gap: 2, minWidth: 200 }}>
                  <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{t('publish.version', { number: v.number })}</Txt>
                    {v.number === status.number ? <Badge label={t('publish.current')} tone="success" /> : null}
                  </Row>
                  <Txt muted size="small">
                    {[formatDate(v.createdAt, lang), v.publishedByName, v.note === 'initial' ? t('publish.initial') : v.note, t('publish.changesCount', { count: (v.changes ?? []).length })].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                {(v.changes ?? []).length ? (
                  <Button small variant="ghost" title={openVersion === v.number ? t('publish.hideChanges') : t('publish.showChanges')} onPress={() => setOpenVersion(openVersion === v.number ? null : v.number)} />
                ) : null}
                {v.number !== status.number ? (
                  <Button small variant="secondary" icon="restore" title={t('publish.restore')} onPress={() => restore(v)} loading={busy === `restore:${v.number}`} disabled={!!busy} />
                ) : null}
              </Row>
              {openVersion === v.number ? <ChangeList changes={v.changes ?? []} /> : null}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  version: { padding: SPACING.md, gap: SPACING.sm },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
