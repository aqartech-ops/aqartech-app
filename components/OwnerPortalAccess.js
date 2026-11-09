import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { ownerPortalApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatDate } from './Fields';
import { Badge, Button, Card, ErrorBox, Field, Loading, Row, Txt, errorText } from './ui';

const MONO = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 16, letterSpacing: 1 };

/**
 * Owner page (company side): give the owner a sign-in to the owner portal — read-only, only their properties.
 * The temporary password is shown once; the owner changes it at the first sign-in.
 */
export default function OwnerPortalAccess({ owner, editable }) {
  const { t, lang } = useI18n();
  const [user, setUser] = useState(undefined);
  const [email, setEmail] = useState(owner.email ?? '');
  const [inviting, setInviting] = useState(false);
  const [secret, setSecret] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setUser(undefined);
    ownerPortalApi
      .get(owner.id)
      .then((r) => setUser(r?.user ?? null))
      .catch((e) => {
        setError(e);
        setUser(null);
      });
  }, [owner.id]);
  useEffect(load, [load]);

  const run = async (name, fn) => {
    setBusy(name);
    setError(null);
    try {
      const res = await fn();
      if (res?.user !== undefined) setUser(res.user);
      if (res?.temporaryPassword) setSecret(res.temporaryPassword);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    if (!(await confirm({ title: t('portalAccess.disable'), message: t('portalAccess.disableConfirm', { name: owner.name }), confirmText: t('portalAccess.disable'), cancelText: t('common.cancel'), destructive: true }))) return;
    run('toggle', () => ownerPortalApi.setActive(owner.id, false));
  };

  // the card is always shown (even while loading or when the server can't be reached) so the company can see it
  if (user === undefined && !error) {
    return (
      <Card style={{ gap: SPACING.sm }}>
        <Txt weight="weightBold">{t('portalAccess.title')}</Txt>
        <Loading />
      </Card>
    );
  }

  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{t('portalAccess.title')}</Txt>
        {user ? <Badge label={user.isActive ? t('portalAccess.active') : t('portalAccess.disabled')} tone={user.isActive ? 'success' : 'danger'} /> : <Badge label={t('portalAccess.none')} />}
      </Row>
      <Txt muted size="small">{t('portalAccess.hint')}</Txt>
      {error && error.field !== 'email' ? <ErrorBox error={error} onRetry={load} /> : null}

      {secret ? (
        <View style={{ gap: SPACING.sm }}>
          <Txt weight="weightMedium">{t('portalAccess.passwordTitle')}</Txt>
          <Txt muted size="small">{t('portalAccess.passwordOnce', { email: user?.email ?? '' })}</Txt>
          <View style={styles.secret}>
            <Txt selectable style={MONO}>{secret}</Txt>
          </View>
          <Button small variant="secondary" title={t('common.close')} onPress={() => setSecret(null)} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}

      {user ? (
        <>
          <Txt size="small">
            {[user.email, user.lastLoginAt ? t('team.lastLogin', { date: formatDate(user.lastLoginAt, lang) }) : t('team.neverSignedIn'), user.mustChangePassword ? t('team.pendingPassword') : null]
              .filter(Boolean)
              .join(' · ')}
          </Txt>
          {editable ? (
            <Row style={{ flexWrap: 'wrap' }}>
              <Button id="owners.portalReset" small variant="secondary" icon="lock-reset" title={t('portalAccess.resetPassword')} loading={busy === 'reset'} onPress={() => run('reset', () => ownerPortalApi.resetPassword(owner.id))} />
              {user.isActive ? (
                <Button id="owners.portalDisable" small variant="danger" icon="account-cancel-outline" title={t('portalAccess.disable')} loading={busy === 'toggle'} onPress={disable} />
              ) : (
                <Button id="owners.portalEnable" small icon="account-check-outline" title={t('portalAccess.enable')} loading={busy === 'toggle'} onPress={() => run('toggle', () => ownerPortalApi.setActive(owner.id, true))} />
              )}
            </Row>
          ) : null}
        </>
      ) : editable ? (
        inviting ? (
          <View style={{ gap: SPACING.sm }}>
            <Field label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" inputMode="email" error={error?.field === 'email' ? errorText(t, error) : undefined} />
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small variant="secondary" title={t('common.cancel')} onPress={() => setInviting(false)} />
              <Button id="owners.portalInvite" small icon="check" title={t('portalAccess.create')} loading={busy === 'invite'} disabled={!email.trim()} onPress={() => run('invite', () => ownerPortalApi.invite(owner.id, email.trim()))} />
            </Row>
          </View>
        ) : (
          <Button id="owners.portalInvite" small icon="account-key-outline" title={t('portalAccess.invite')} onPress={() => setInviting(true)} style={{ alignSelf: 'flex-start' }} />
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  secret: { padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'flex-start' },
});
