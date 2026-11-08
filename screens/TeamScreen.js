import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { teamApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatDate } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, IconButton, Loading, Row, Screen, Sheet, Txt, errorText } from '../components/ui';

// Platform team (فريق المنصة) — owners only: add admins, set their role, reset password / two-step sign-in.

const ROLES = ['OWNER', 'MANAGER', 'SUPPORT'];
const ROLE_TONE = { OWNER: 'info', MANAGER: 'success', SUPPORT: 'neutral' };
const MONO = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 16, letterSpacing: 1 };

export default function TeamScreen() {
  const { t, lang } = useI18n();
  const { me } = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null); // { name, password } shown once

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await teamApi.list());
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

  const resetPassword = async (a) => {
    if (!(await confirm({ title: t('team.resetPassword'), message: t('team.resetPasswordConfirm', { name: a.name }), confirmText: t('team.resetPassword'), cancelText: t('common.cancel') }))) return;
    run(async () => {
      const res = await teamApi.resetPassword(a.id);
      setSecret({ name: a.name, password: res.temporaryPassword });
    });
  };
  const reset2fa = async (a) => {
    if (!(await confirm({ title: t('team.reset2fa'), message: t('team.reset2faConfirm', { name: a.name }), confirmText: t('team.reset2fa'), cancelText: t('common.cancel'), destructive: true }))) return;
    run(() => teamApi.reset2fa(a.id));
  };

  return (
    <Screen title={t('team.title')} subtitle={t('team.subtitle')} actions={<Button icon="account-plus-outline" title={t('team.add')} onPress={() => setEditing({})} />}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        {secret ? (
          <Card style={{ gap: SPACING.sm, borderColor: COLORS.warning }}>
            <Txt weight="weightBold">{t('team.passwordFor', { name: secret.name })}</Txt>
            <Txt muted size="small">{t('team.passwordOnce')}</Txt>
            <View style={styles.secret}>
              <Txt selectable style={MONO}>{secret.password}</Txt>
            </View>
            <Button small variant="secondary" title={t('common.close')} onPress={() => setSecret(null)} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState icon="account-group-outline" body={t('team.empty')} />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((a, i) => {
              const self = a.id === me?.admin?.id;
              return (
                <Row key={a.id} style={[styles.row, i > 0 && styles.divider, !a.isActive && { opacity: 0.55 }]}>
                  <View style={styles.avatar}>
                    <MaterialCommunityIcons name="account-key-outline" size={20} color={COLORS.primaryDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2, minWidth: 180 }}>
                    <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                      <Txt weight="weightMedium">{a.name}</Txt>
                      {self ? <Badge label={t('team.you')} /> : null}
                      <Badge label={t(`team.roles.${a.role}`)} tone={ROLE_TONE[a.role] ?? 'neutral'} />
                      <Badge label={a.totpEnabled ? t('twoFactor.on') : t('twoFactor.off')} tone={a.totpEnabled ? 'success' : 'warning'} />
                      {!a.isActive ? <Badge label={t('team.inactive')} tone="danger" /> : null}
                      {a.mustChangePassword ? <Badge label={t('team.pendingPassword')} tone="warning" /> : null}
                    </Row>
                    <Txt muted size="small">{[a.email, a.lastLoginAt ? t('team.lastLogin', { date: formatDate(a.lastLoginAt, lang) }) : t('team.neverSignedIn')].join(' · ')}</Txt>
                  </View>
                  <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(a)} />
                  {!self ? <IconButton icon="lock-reset" label={t('team.resetPassword')} onPress={() => resetPassword(a)} /> : null}
                  {!self && a.totpEnabled ? <IconButton icon="shield-off-outline" color={COLORS.danger} label={t('team.reset2fa')} onPress={() => reset2fa(a)} /> : null}
                </Row>
              );
            })}
          </Card>
        )}
        <Txt muted size="small">{t('team.rolesHelp')}</Txt>
      </View>
      <MemberForm
        member={editing}
        self={editing?.id === me?.admin?.id}
        onClose={() => setEditing(null)}
        onSaved={(res) => {
          setEditing(null);
          if (res?.temporaryPassword) setSecret({ name: res.admin.name, password: res.temporaryPassword });
          load();
        }}
      />
    </Screen>
  );
}

function MemberForm({ member, self, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = member && !member.id;
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!member) return;
    setForm({ name: member.name ?? '', email: member.email ?? '', role: member.role ?? 'MANAGER', isActive: member.isActive ?? true });
    setBusy(false);
    setError(null);
  }, [member]);

  if (!member || !form) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) onSaved(await teamApi.create({ name: form.name, email: form.email.trim(), role: form.role }));
      else {
        await teamApi.update(member.id, self ? { name: form.name } : { name: form.name, role: form.role, isActive: form.isActive });
        onSaved(null);
      }
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={isNew ? t('team.add') : t('common.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name.trim() || (isNew && !form.email.trim())} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('team.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      {isNew ? <Field label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" inputMode="email" error={fieldError('email')} /> : <Txt muted>{member.email}</Txt>}
      {self ? (
        <Txt muted size="small">{t('team.selfHint')}</Txt>
      ) : (
        <>
          <Txt weight="weightMedium" size="small">{t('team.role')}</Txt>
          <ChipSelect value={form.role} onChange={set('role')} options={ROLES.map((r) => ({ value: r, label: t(`team.roles.${r}`) }))} />
          <Txt muted size="small">{t(`team.roleHints.${form.role}`)}</Txt>
          {!isNew ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ flex: 1 }}>{t('team.active')}</Txt>
              <Switch value={form.isActive} onValueChange={set('isActive')} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
            </Row>
          ) : (
            <Txt muted size="small">{t('team.newHint')}</Txt>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  secret: { padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border, alignSelf: 'flex-start' },
});
