import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { tenantsApi } from '../services/api';
import { confirm } from '../services/dialog';
import { matches } from '../services/text';
import { DateField, dateText, formatDate, isDateText } from '../components/Fields';
import { LeaseDetail, LeaseForm, LeasesTab, TenantLeases } from './LeasesView';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  FieldRow,
  IconButton,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  Txt,
  errorText,
} from '../components/ui';

const SOON_DAYS = 30;

/** 'expired' | 'soon' | null for an ID expiry date */
function idState(idExpiry) {
  if (!idExpiry) return null;
  const days = (new Date(idExpiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return 'expired';
  if (days <= SOON_DAYS) return 'soon';
  return null;
}

/** Tenants (المستأجرون) — records only — and their leases (العقود), in two tabs. */
export default function TenantsScreen({ params }) {
  const [tab, setTab] = useState(params?.leaseId || params?.tab === 'leases' ? 'leases' : 'tenants');
  const [tenantId, setTenantId] = useState(params?.tenantId ?? null);
  const [leaseId, setLeaseId] = useState(params?.leaseId ?? null);

  if (leaseId) {
    return (
      <LeaseDetail
        key={leaseId}
        id={leaseId}
        onBack={() => setLeaseId(null)}
        onOpen={setLeaseId}
        onOpenTenant={(id) => {
          setLeaseId(null);
          setTenantId(id);
        }}
      />
    );
  }
  if (tenantId) return <TenantDetail id={tenantId} onBack={() => setTenantId(null)} onOpenLease={setLeaseId} />;
  const tabs = <TabSwitch value={tab} onChange={setTab} />;
  if (tab === 'leases') return <LeasesList tabs={tabs} onOpen={setLeaseId} />;
  return <TenantList tabs={tabs} onOpen={setTenantId} openCreate={!!params?.create} />;
}

function TabSwitch({ value, onChange }) {
  const { t } = useI18n();
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: 'tenants', label: t('leases.tabTenants') },
        { value: 'leases', label: t('leases.tabLeases') },
      ]}
    />
  );
}

function LeasesList({ tabs, onOpen }) {
  const { t } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('tenants');
  const [creating, setCreating] = useState(null);
  const [version, setVersion] = useState(0);
  return (
    <Screen title={t('leases.title')}>
      <View style={{ gap: SPACING.md }}>
        {tabs}
        <LeasesTab key={version} editable={editable} onOpen={onOpen} onNew={() => setCreating({})} />
      </View>
      <LeaseForm
        lease={creating}
        onClose={() => setCreating(null)}
        onSaved={(saved) => {
          setCreating(null);
          setVersion((v) => v + 1);
          if (saved?.id) onOpen(saved.id);
        }}
      />
    </Screen>
  );
}

function TenantList({ tabs, onOpen, openCreate }) {
  const { t, forwardIcon } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('tenants');
  const [trash, setTrash] = useState(false);
  const [tenants, setTenants] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(openCreate && editable ? {} : null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTenants(await tenantsApi.list(trash));
    } catch (e) {
      setError(e);
      setTenants([]);
    }
  }, [trash]);

  useEffect(() => {
    setTenants(null);
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      (tenants ?? []).filter(
        (x) => !filter.trim() || matches([x.name, x.phone, x.phone2, x.civilId, x.crNumber, x.employer].filter(Boolean).join(' '), filter),
      ),
    [tenants, filter],
  );

  const restore = async (x) => {
    try {
      await tenantsApi.restore(x.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen title={t('tenants.title')} actions={editable && !trash ? <Button icon="account-plus-outline" title={t('tenants.add')} onPress={() => setEditing({})} /> : null}>
      <View style={{ gap: SPACING.md }}>
        {tabs}
        <Row style={{ flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field value={filter} onChangeText={setFilter} placeholder={t('tenants.filterPlaceholder')} />
          </View>
          {editable ? (
            <Button small variant={trash ? 'primary' : 'secondary'} icon="delete-restore" title={t('common.trash')} onPress={() => setTrash((v) => !v)} />
          ) : null}
        </Row>
        <ErrorBox error={error} onRetry={load} />
        {tenants === null ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon="account-group-outline"
              body={trash ? t('tenants.trashEmpty') : t('tenants.empty')}
              action={editable && !trash && !filter ? <Button icon="account-plus-outline" title={t('tenants.add')} onPress={() => setEditing({})} /> : null}
            />
          </Card>
        ) : (
          <Card padded={false}>
            {visible.map((x, i) => {
              const ids = idState(x.idExpiry);
              return (
                <Pressable key={x.id} onPress={trash ? undefined : () => onOpen(x.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
                  <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                    <View style={styles.avatar}>
                      <MaterialCommunityIcons name={x.type === 'COMPANY' ? 'domain' : 'account-outline'} size={20} color={COLORS.primaryDark} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt weight="weightMedium">{x.name}</Txt>
                      <Txt muted size="small">{[x.phone, x.civilId || x.crNumber].filter(Boolean).join(' · ') || t(`tenants.typeValues.${x.type}`)}</Txt>
                    </View>
                    {ids ? <Badge label={t(ids === 'expired' ? 'tenants.idExpired' : 'tenants.idExpiresSoon')} tone={ids === 'expired' ? 'danger' : 'warning'} /> : null}
                    {trash ? (
                      <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(x)} />
                    ) : (
                      <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
                    )}
                  </Row>
                </Pressable>
              );
            })}
          </Card>
        )}
      </View>
      <TenantForm
        tenant={editing}
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

function TenantDetail({ id, onBack, onOpenLease }) {
  const { t, lang, isRTL, start } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('tenants');
  const [tenant, setTenant] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [newLease, setNewLease] = useState(null);
  const [leasesVersion, setLeasesVersion] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTenant(await tenantsApi.get(id));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('tenants.deleteConfirm', { name: tenant.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await tenantsApi.remove(id);
      onBack();
    } catch (e) {
      setError(e);
    }
  };

  const back = <Button small variant="ghost" icon={isRTL ? 'chevron-right' : 'chevron-left'} title={t('common.back')} onPress={onBack} />;
  if (!tenant) {
    return (
      <Screen>
        {back}
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  const ids = idState(tenant.idExpiry);
  const info = [
    [t('tenants.type'), t(`tenants.typeValues.${tenant.type}`)],
    [t('tenants.civilId'), tenant.civilId],
    [t('tenants.idExpiry'), tenant.idExpiry ? formatDate(tenant.idExpiry, lang) : null],
    [t('tenants.crNumber'), tenant.crNumber],
    [t('tenants.nationality'), tenant.nationality],
    [t('tenants.employer'), tenant.employer],
    [t('tenants.phone2'), tenant.phone2],
    [t('tenants.email'), tenant.email],
  ].filter(([, v]) => v);
  const guarantor = [tenant.guarantorName, tenant.guarantorPhone, tenant.guarantorCivilId].filter(Boolean);

  return (
    <Screen
      title={tenant.name}
      subtitle={tenant.phone}
      actions={
        editable ? (
          <>
            <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(tenant)} />
            <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={remove} />
          </>
        ) : null
      }
    >
      <View style={{ gap: SPACING.lg }}>
        <View style={{ alignSelf: start }}>{back}</View>
        <ErrorBox error={error} onRetry={load} />
        {ids ? (
          <View style={[styles.alert, { backgroundColor: ids === 'expired' ? COLORS.dangerSoft : COLORS.warningSoft }]}>
            <Txt style={{ color: ids === 'expired' ? COLORS.danger : COLORS.warning }}>
              {t(ids === 'expired' ? 'tenants.idExpired' : 'tenants.idExpiresSoon')} · {formatDate(tenant.idExpiry, lang)}
            </Txt>
          </View>
        ) : null}
        {tenant.phone ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small variant="secondary" icon="phone-outline" title={tenant.phone} onPress={() => Linking.openURL(`tel:${tenant.phone}`)} />
            <Button small variant="secondary" icon="whatsapp" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${tenant.phone.replace(/[^0-9]/g, '')}`)} />
          </Row>
        ) : null}
        <Card style={{ gap: SPACING.sm }}>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          {guarantor.length ? (
            <View style={{ gap: 2, marginTop: SPACING.sm }}>
              <Txt weight="weightBold" size="small">{t('tenants.guarantor')}</Txt>
              <Txt>{guarantor.join(' · ')}</Txt>
            </View>
          ) : null}
          {tenant.notes ? <Txt muted>{tenant.notes}</Txt> : null}
        </Card>
        <TenantLeases key={leasesVersion} tenantId={id} editable={editable} onOpen={onOpenLease} onNew={() => setNewLease({ tenantId: id, tenant })} />
      </View>
      <LeaseForm
        lease={newLease}
        onClose={() => setNewLease(null)}
        onSaved={(saved) => {
          setNewLease(null);
          setLeasesVersion((v) => v + 1);
          if (saved?.id) onOpenLease(saved.id);
        }}
      />
      <TenantForm
        tenant={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Screen>
  );
}

export function TenantForm({ tenant, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = tenant && !tenant.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  useEffect(() => {
    if (!tenant) return;
    setForm({
      type: tenant.type ?? 'INDIVIDUAL',
      name: tenant.name ?? '',
      civilId: tenant.civilId ?? '',
      idExpiry: dateText(tenant.idExpiry),
      crNumber: tenant.crNumber ?? '',
      nationality: tenant.nationality ?? '',
      phone: tenant.phone ?? '',
      phone2: tenant.phone2 ?? '',
      email: tenant.email ?? '',
      employer: tenant.employer ?? '',
      guarantorName: tenant.guarantorName ?? '',
      guarantorPhone: tenant.guarantorPhone ?? '',
      guarantorCivilId: tenant.guarantorCivilId ?? '',
      notes: tenant.notes ?? '',
    });
    setError(null);
    setBusy(false);
  }, [tenant]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const company = form.type === 'COMPANY';

  const save = async () => {
    if (form.idExpiry && !isDateText(form.idExpiry)) return setError({ code: 'validation.date', field: 'idExpiry' });
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, email: form.email.trim(), idExpiry: form.idExpiry || null };
      const saved = isNew ? await tenantsApi.create(payload) : await tenantsApi.update(tenant.id, payload);
      onSaved(isNew ? saved : null);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!tenant}
      title={isNew ? t('tenants.add') : t('tenants.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name?.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Segmented value={form.type} onChange={set('type')} options={['INDIVIDUAL', 'COMPANY'].map((v) => ({ value: v, label: t(`tenants.typeValues.${v}`) }))} />
      <Field label={t('tenants.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      {company ? (
        <Field label={t('tenants.crNumber')} value={form.crNumber} onChangeText={set('crNumber')} />
      ) : (
        <FieldRow>
          <Field label={t('tenants.civilId')} value={form.civilId} onChangeText={set('civilId')} keyboardType="number-pad" error={fieldError('civilId')} />
          <DateField label={t('tenants.idExpiry')} value={form.idExpiry} onChangeText={set('idExpiry')} error={fieldError('idExpiry')} />
        </FieldRow>
      )}
      <FieldRow>
        <Field label={t('tenants.phone')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" inputMode="tel" placeholder="+968" />
        <Field label={t('tenants.phone2')} value={form.phone2} onChangeText={set('phone2')} keyboardType="phone-pad" inputMode="tel" />
      </FieldRow>
      <FieldRow>
        <Field label={t('tenants.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" inputMode="email" error={fieldError('email')} />
        <Field label={t('tenants.nationality')} value={form.nationality} onChangeText={set('nationality')} />
      </FieldRow>
      {!company ? <Field label={t('tenants.employer')} value={form.employer} onChangeText={set('employer')} /> : null}
      <Txt weight="weightBold" size="small">{t('tenants.guarantor')}</Txt>
      <FieldRow>
        <Field label={t('tenants.guarantorName')} value={form.guarantorName} onChangeText={set('guarantorName')} />
        <Field label={t('tenants.guarantorPhone')} value={form.guarantorPhone} onChangeText={set('guarantorPhone')} keyboardType="phone-pad" inputMode="tel" />
      </FieldRow>
      <Field label={t('tenants.guarantorCivilId')} value={form.guarantorCivilId} onChangeText={set('guarantorCivilId')} keyboardType="number-pad" />
      <Field label={t('tenants.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alert: { borderRadius: RADIUS.md, padding: SPACING.md },
});
