import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { propertiesApi, rolesApi, usersApi } from '../services/api';
import { confirm } from '../services/dialog';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  IconButton,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  Txt,
  errorText,
} from '../components/ui';

// Sections a role can control (same keys as the server — backend/src/common/sections.ts)
const ROLE_SECTIONS = ['dashboard', 'properties', 'tenants', 'financials', 'maintenance', 'documents', 'owners', 'users', 'settings'];
const LEVELS = ['EDIT', 'VIEW', 'HIDDEN'];

/** Easy-to-read temporary password (no 0/O, 1/l/I) to give to a new team member. */
function generatePassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Aq-${pick('23456789', 4)}-${pick(letters, 4)}`;
}

export default function UsersScreen() {
  const { t } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('users');
  const [tab, setTab] = useState('users');

  return (
    <Screen title={t('users.title')}>
      <Segmented
        style={{ marginBottom: SPACING.lg, maxWidth: 360 }}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'users', label: t('users.tabUsers') },
          { value: 'roles', label: t('users.tabRoles') },
        ]}
      />
      {tab === 'users' ? <UsersTab editable={editable} /> : <RolesTab editable={editable} />}
    </Screen>
  );
}

// ---------------------------------------------------------------- Users

function UsersTab({ editable }) {
  const { t, lang } = useI18n();
  const [trash, setTrash] = useState(false);
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | user

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, r] = await Promise.all([usersApi.list(trash), rolesApi.list()]);
      setUsers(u);
      setRoles(r);
    } catch (e) {
      setError(e);
      setUsers([]);
    }
  }, [trash]);

  useEffect(() => {
    setUsers(null);
    load();
  }, [load]);

  const remove = async (user) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('users.deleteConfirm', { name: user.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await usersApi.remove(user.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const restore = async (user) => {
    try {
      await usersApi.restore(user.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const toggleActive = async (user) => {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Button
          small
          variant={trash ? 'primary' : 'secondary'}
          icon="delete-restore"
          title={t('common.trash')}
          onPress={() => setTrash((v) => !v)}
        />
        {editable && !trash ? <Button icon="account-plus-outline" title={t('users.addUser')} onPress={() => setEditing({})} /> : null}
      </Row>
      <ErrorBox error={error} onRetry={load} />

      {users === null ? (
        <Loading />
      ) : users.length === 0 ? (
        <Card>
          <EmptyState icon={trash ? 'delete-empty-outline' : 'account-multiple-outline'} body={trash ? t('users.trashEmpty') : t('users.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {users.map((user, index) => (
            <Row key={user.id} style={[styles.listRow, index > 0 && styles.divider]} gap={SPACING.md}>
              <View style={styles.avatar}>
                <Txt weight="weightBold" style={{ color: COLORS.primaryDark, textAlign: 'center' }}>
                  {user.name.trim().charAt(0).toUpperCase()}
                </Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                  <Txt weight="weightMedium">{user.name}</Txt>
                  {user.isCompanyAdmin ? <Badge label={t('users.mainAccount')} tone="info" /> : null}
                  {!user.isActive ? <Badge label={t('common.inactive')} tone="danger" /> : null}
                </Row>
                <Txt muted size="small">
                  {user.email} · {user.role?.name ?? (user.isCompanyAdmin ? t('access.EDIT') : t('users.noRole'))}
                </Txt>
                <Txt muted size="small">
                  {t('users.lastLogin')}: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString(lang === 'ar' ? 'ar-OM' : 'en-GB') : t('users.never')}
                </Txt>
              </View>
              {editable ? (
                trash ? (
                  <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(user)} />
                ) : !user.isCompanyAdmin ? (
                  <Row gap={2}>
                    <IconButton
                      icon={user.isActive ? 'account-cancel-outline' : 'account-check-outline'}
                      label={user.isActive ? t('users.deactivate') : t('users.activate')}
                      onPress={() => toggleActive(user)}
                    />
                    <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(user)} />
                    <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => remove(user)} />
                  </Row>
                ) : (
                  <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(user)} />
                )
              ) : null}
            </Row>
          ))}
        </Card>
      )}

      <UserForm
        user={editing}
        roles={roles}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

function UserForm({ user, roles, onClose, onSaved }) {
  const { t, row, start } = useI18n();
  const [generated, setGenerated] = useState(false);
  const isNew = user && !user.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name ?? '', email: user.email ?? '', phone: user.phone ?? '', password: '', roleId: user.roleId ?? '' });
      setGenerated(false);
      setError(null);
      setBusy(false);
    }
  }, [user]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload = { name: form.name, email: form.email.trim(), phone: form.phone };
    if (!user.isCompanyAdmin) payload.roleId = form.roleId || null;
    if (form.password) payload.password = form.password;
    try {
      if (isNew) await usersApi.create(payload);
      else await usersApi.update(user.id, payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!user}
      title={isNew ? t('users.addUser') : t('users.editUser')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name || !form.email || (isNew && !form.password)} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('users.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        inputMode="email"
        error={fieldError('email')}
      />
      <Field label={`${t('auth.phone')} (${t('common.optional')})`} value={form.phone} onChangeText={set('phone')} inputMode="tel" />
      {/* This is another person's password: no keychain suggestion / autofill on the admin's phone */}
      <Field
        key={generated ? 'plain' : 'secure'}
        label={isNew ? t('auth.password') : t('users.newPassword')}
        hint={generated ? t('users.generatedHint') : isNew ? t('auth.passwordHint') : t('users.newPasswordHint')}
        value={form.password}
        onChangeText={(value) => {
          setGenerated(false);
          set('password')(value);
        }}
        secure={!generated}
        autoComplete="off"
        textContentType="none"
        autoCorrect={false}
        autoCapitalize="none"
        importantForAutofill="no"
        selectTextOnFocus={generated}
        error={fieldError('password')}
      />
      <Button
        small
        variant="secondary"
        icon="dice-multiple-outline"
        title={t('users.generatePassword')}
        style={{ alignSelf: start }}
        onPress={() => {
          setGenerated(true);
          set('password')(generatePassword());
        }}
      />
      {user && !user.isCompanyAdmin ? (
        <View style={{ gap: SPACING.sm }}>
          <Txt weight="weightMedium" size="small">{t('users.role')}</Txt>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: SPACING.sm }}>
            {[{ id: '', name: t('users.noRole') }, ...roles].map((role) => (
              <Button
                key={role.id || 'none'}
                small
                variant={form.roleId === role.id ? 'primary' : 'secondary'}
                title={role.name}
                onPress={() => set('roleId')(role.id)}
              />
            ))}
          </View>
          {fieldError('roleId') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('roleId')}</Txt> : null}
        </View>
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Roles

function RolesTab({ editable }) {
  const { t, row } = useI18n();
  const [roles, setRoles] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRoles(await rolesApi.list());
    } catch (e) {
      setError(e);
      setRoles([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (role) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('users.deleteRoleConfirm', { name: role.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await rolesApi.remove(role.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <View style={{ gap: SPACING.md }}>
      {editable ? (
        <Row style={{ justifyContent: 'flex-end' }}>
          <Button icon="shield-plus-outline" title={t('users.addRole')} onPress={() => setEditing({})} />
        </Row>
      ) : null}
      <ErrorBox error={error} onRetry={load} />
      {roles === null ? (
        <Loading />
      ) : roles.length === 0 ? (
        <Card>
          <EmptyState icon="shield-account-outline" body={t('users.rolesEmpty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {roles.map((role, index) => (
            <Row key={role.id} style={[styles.listRow, index > 0 && styles.divider]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt weight="weightMedium">{role.name}</Txt>
                <Txt muted size="small">{t('users.roleUsers', { count: role._count?.users ?? 0 })}</Txt>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: 4 }}>
                  {ROLE_SECTIONS.filter((s) => role.permissions?.[s] && role.permissions[s] !== 'HIDDEN').map((s) => (
                    <Badge
                      key={s}
                      label={`${t(`sections.${s}`)}: ${t(`access.${role.permissions[s]}`)}`}
                      tone={role.permissions[s] === 'EDIT' ? 'success' : 'info'}
                    />
                  ))}
                </View>
              </View>
              {editable ? (
                <Row gap={2}>
                  <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(role)} />
                  <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => remove(role)} />
                </Row>
              ) : null}
            </Row>
          ))}
        </Card>
      )}
      <RoleForm
        role={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </View>
  );
}

function RoleForm({ role, onClose, onSaved }) {
  const { t, row } = useI18n();
  const isNew = role && !role.id;
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState({});
  const [propertyIds, setPropertyIds] = useState([]); // [] = all properties
  const [properties, setProperties] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (role) {
      setName(role.name ?? '');
      setPermissions(Object.fromEntries(ROLE_SECTIONS.map((s) => [s, role.permissions?.[s] ?? (s === 'dashboard' ? 'VIEW' : 'HIDDEN')])));
      setPropertyIds(role.propertyIds ?? []);
      propertiesApi.list().then(setProperties).catch(() => setProperties([]));
      setError(null);
      setBusy(false);
    }
  }, [role]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isNew) await rolesApi.create({ name, permissions, propertyIds });
      else await rolesApi.update(role.id, { name, permissions, propertyIds });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!role}
      title={isNew ? t('users.addRole') : t('users.editRole')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!name.trim()} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Field label={t('users.roleName')} value={name} onChangeText={setName} />
      <Txt weight="weightMedium" size="small">{t('users.permissions')}</Txt>
      {ROLE_SECTIONS.map((section) => (
        <View key={section} style={[styles.permRow, { flexDirection: row }]}>
          <Txt style={{ flex: 1, minWidth: 120 }}>{t(`sections.${section}`)}</Txt>
          <Segmented
            style={{ flex: 2, minWidth: 220 }}
            value={permissions[section]}
            onChange={(level) => setPermissions((p) => ({ ...p, [section]: level }))}
            options={LEVELS.map((level) => ({ value: level, label: t(`access.${level}`) }))}
          />
        </View>
      ))}
      {properties.length ? (
        <View style={{ gap: SPACING.sm }}>
          <Txt weight="weightMedium" size="small">{t('users.propertyScope')}</Txt>
          <Txt muted size="small">{t('users.propertyScopeHint')}</Txt>
          <View style={{ flexDirection: row, flexWrap: 'wrap', gap: SPACING.sm }}>
            <Button
              small
              variant={propertyIds.length === 0 ? 'primary' : 'secondary'}
              title={t('users.allProperties')}
              onPress={() => setPropertyIds([])}
            />
            {properties.map((p) => {
              const on = propertyIds.includes(p.id);
              return (
                <Button
                  key={p.id}
                  small
                  variant={on ? 'primary' : 'secondary'}
                  title={p.name}
                  onPress={() => setPropertyIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  listRow: { padding: SPACING.lg, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permRow: { flexWrap: 'wrap', alignItems: 'center', gap: SPACING.sm },
});
