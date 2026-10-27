import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatDate } from '../components/Fields';
import { Badge, Button, Card, ErrorBox, Field, Row, Txt } from '../components/ui';

// Month close (إقفال الشهر): lock a finished month so its figures can no longer change.

const monthLabel = (key, lang) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export function ClosingCard() {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('financials');
  const [s, setS] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => financeApi.closing().then(setS).catch(setError), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      setS(await fn());
      setReopening(false);
      setReason('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    const ok = await confirm({
      title: t('closing.close'),
      message: t('closing.confirm', { month: monthLabel(s.nextMonth, lang) }),
      confirmText: t('closing.close'),
      cancelText: t('common.cancel'),
    });
    if (ok) run(() => financeApi.closeMonth(s.nextMonth));
  };

  if (!s) return error ? <ErrorBox error={error} onRetry={load} /> : null;
  const latest = s.history.find((h) => !h.reopenedAt);

  return (
    <Card style={{ gap: SPACING.sm }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{t('closing.title')}</Txt>
        <Badge label={s.lockedUntil ? t('closing.lockedUntil', { date: formatDate(s.lockedUntil, lang) }) : t('closing.nothingClosed')} tone={s.lockedUntil ? 'success' : 'neutral'} />
      </Row>
      <Txt muted size="small">{t('closing.hint')}</Txt>
      <ErrorBox error={error} />
      {editable ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {s.nextMonth ? <Button small icon="lock-outline" title={t('closing.closeMonth', { month: monthLabel(s.nextMonth, lang) })} loading={busy && !reopening} onPress={close} /> : <Txt muted size="small">{t('closing.allClosed')}</Txt>}
          {s.canReopen && !reopening ? <Button small variant="ghost" icon="lock-open-outline" title={t('closing.reopen', { month: monthLabel(latest.month, lang) })} onPress={() => setReopening(true)} /> : null}
        </Row>
      ) : null}
      {reopening ? (
        <View style={styles.box}>
          <Txt size="small" style={{ color: COLORS.warning }}>{t('closing.reopenHint')}</Txt>
          <Field label={t('payments.voidReason')} value={reason} onChangeText={setReason} />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button small variant="secondary" title={t('common.cancel')} onPress={() => setReopening(false)} />
            <Button small variant="danger" title={t('closing.reopenShort')} loading={busy} disabled={!reason.trim()} onPress={() => run(() => financeApi.reopenMonth(reason.trim()))} />
          </Row>
        </View>
      ) : null}
      {s.history.length ? (
        <View style={{ gap: 2 }}>
          {s.history.slice(0, 6).map((h) => (
            <Txt key={h.id} muted size="small">
              {`${monthLabel(h.month, lang)} · ${t('closing.closedOn', { date: formatDate(h.closedAt, lang) })}${h.reopenedAt ? ` · ${t('closing.reopenedOn', { date: formatDate(h.reopenedAt, lang) })}` : ''}`}
            </Txt>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
});
