import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toEditable, toPayload, useFieldRules } from '../services/fields';
import CustomFields, { CustomValues } from '../components/CustomFields';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { ownersApi, propertiesApi } from '../services/api';
import { confirm } from '../services/dialog';
import { matches } from '../services/text';
import { formatDate, pctLabel } from '../components/Fields';
import {
  Badge,
  BackButton,
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

/** Owners of the properties the company manages (الملاك), their bank details and their properties. */
export default function OwnersScreen({ params, onNavigate }) {
  const [selectedId, setSelectedId] = useState(params?.ownerId ?? null);
  if (selectedId) return <OwnerDetail id={selectedId} onBack={() => setSelectedId(null)} onNavigate={onNavigate} />;
  return <OwnerList onOpen={setSelectedId} />;
}

function OwnerList({ onOpen }) {
  const { t, forwardIcon } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('owners');
  const [trash, setTrash] = useState(false);
  const [owners, setOwners] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOwners(await ownersApi.list(trash));
    } catch (e) {
      setError(e);
      setOwners([]);
    }
  }, [trash]);

  useEffect(() => {
    setOwners(null);
    load();
  }, [load]);

  const visible = useMemo(
    () => (owners ?? []).filter((o) => !filter.trim() || matches([o.name, o.phone, o.civilId, o.crNumber, o.email].filter(Boolean).join(' '), filter)),
    [owners, filter],
  );

  const restore = async (o) => {
    try {
      await ownersApi.restore(o.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen title={t('owners.title')} actions={editable && !trash ? <Button icon="plus" title={t('owners.add')} onPress={() => setEditing({})} /> : null}>
      <View style={{ gap: SPACING.md }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field value={filter} onChangeText={setFilter} placeholder={t('owners.filterPlaceholder')} />
          </View>
          {editable ? (
            <Button small variant={trash ? 'primary' : 'secondary'} icon="delete-restore" title={t('common.trash')} onPress={() => setTrash((v) => !v)} />
          ) : null}
        </Row>
        <ErrorBox error={error} onRetry={load} />
        {owners === null ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon="account-tie-outline" body={trash ? t('owners.trashEmpty') : t('owners.empty')} />
          </Card>
        ) : (
          <Card padded={false}>
            {visible.map((o, i) => (
              <Pressable key={o.id} onPress={trash ? undefined : () => onOpen(o.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
                <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                  <View style={styles.avatar}>
                    <MaterialCommunityIcons name={o.type === 'COMPANY' ? 'domain' : 'account-tie-outline'} size={20} color={COLORS.primaryDark} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="weightMedium">{o.name}</Txt>
                    <Txt muted size="small">{[o.phone, o.civilId || o.crNumber].filter(Boolean).join(' · ') || t(`owners.typeValues.${o.type}`)}</Txt>
                  </View>
                  {trash ? (
                    <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(o)} />
                  ) : (
                    <>
                      <Badge label={t('owners.propertiesCount', { count: o.propertiesCount })} />
                      <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
                    </>
                  )}
                </Row>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
      <OwnerForm
        owner={editing}
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

function OwnerDetail({ id, onBack, onNavigate }) {
  const { t, lang, isRTL, start } = useI18n();
  const extraFields = useFieldRules('owner');
  const { canEdit, levelOf } = useSession();
  const editable = canEdit('owners');
  const canLink = editable && levelOf('properties') !== 'HIDDEN';
  const [linkOpen, setLinkOpen] = useState(false);
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOwner(await ownersApi.get(id));
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
      message: t('owners.deleteConfirm', { name: owner.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await ownersApi.remove(id);
      onBack();
    } catch (e) {
      setError(e);
    }
  };

  const back = <BackButton onPress={onBack} label={t('owners.title')} />;
  if (!owner) {
    return (
      <Screen back={back}>
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  // One row per property: the share (if partner) and/or the active agreement (if contracting owner)
  const byProperty = new Map();
  for (const p of owner.partners) byProperty.set(p.property.id, { property: p.property, shareBp: p.shareBp });
  for (const a of owner.agreements) {
    const entry = byProperty.get(a.property.id) ?? { property: a.property };
    if (a.status === 'ACTIVE') entry.agreement = a;
    byProperty.set(a.property.id, entry);
  }
  const rows = [...byProperty.values()];

  const info = [
    [t('owners.type'), t(`owners.typeValues.${owner.type}`)],
    [t('owners.civilId'), owner.civilId],
    [t('owners.crNumber'), owner.crNumber],
    [t('owners.nationality'), owner.nationality],
    [t('owners.email'), owner.email],
  ].filter(([, v]) => v);

  return (
    <Screen back={back}
      title={owner.name}
      subtitle={owner.phone}
      actions={
        editable ? (
          <>
            <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(owner)} />
            <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={remove} />
          </>
        ) : null
      }
    >
      <View style={{ gap: SPACING.lg }}>
        {levelOf('financials') !== 'HIDDEN' ? (
          <Button
            variant="secondary"
            icon="file-document-outline"
            title={t('ownerStatements.account')}
            onPress={() => onNavigate?.('financials', { ownerId: id })}
            style={{ alignSelf: start }}
          />
        ) : null}
        <ErrorBox error={error} onRetry={load} />

        {owner.phone ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small variant="secondary" icon="phone-outline" title={owner.phone} onPress={() => Linking.openURL(`tel:${owner.phone}`)} />
            <Button
              small
              variant="secondary"
              icon="whatsapp"
              title="WhatsApp"
              onPress={() => Linking.openURL(`https://wa.me/${owner.phone.replace(/[^0-9]/g, '')}`)}
            />
          </Row>
        ) : null}

        <Card style={{ gap: SPACING.sm }}>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{value}</Txt>
            </Row>
          ))}
          {owner.accountNumber || owner.bankName ? (
            <View style={{ gap: 2, marginTop: SPACING.sm }}>
              <Txt weight="weightBold" size="small">{t('owners.bank')}</Txt>
              <Txt>{[owner.bankName, owner.accountName].filter(Boolean).join(' · ')}</Txt>
              {owner.accountNumber ? <Txt selectable muted>{owner.accountNumber}</Txt> : null}
            </View>
          ) : null}
          {owner.notes ? <Txt muted>{owner.notes}</Txt> : null}
          <CustomValues defs={extraFields.custom} values={owner.custom} />
        </Card>

        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Txt size="medium" weight="weightBold">{t('owners.properties')}</Txt>
          {canLink ? <Button small icon="link-variant-plus" title={t('owners.linkProperty')} onPress={() => setLinkOpen(true)} /> : null}
        </Row>
        {rows.length === 0 ? (
          <Card>
            <EmptyState icon="office-building-outline" body={t('owners.noProperties')} />
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((r, i) => (
              <Pressable key={r.property.id} onPress={() => onNavigate?.('properties', { propertyId: r.property.id })}>
                <Row style={[styles.row, i > 0 && styles.divider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="weightMedium">{r.property.name}</Txt>
                    {r.agreement ? (
                      <Txt muted size="small">
                        {t('owners.manager')} · {t('agreement.since', { date: formatDate(r.agreement.startDate, lang) })}
                      </Txt>
                    ) : null}
                  </View>
                  {r.shareBp ? <Badge label={t('owners.share', { pct: pctLabel(r.shareBp) })} tone="info" /> : null}
                </Row>
              </Pressable>
            ))}
          </Card>
        )}
      </View>
      <OwnerForm
        owner={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
      <LinkPropertySheet
        visible={linkOpen}
        canCreate={canEdit('properties')}
        excludeIds={[]}
        onClose={() => setLinkOpen(false)}
        onPick={(propertyId) => {
          setLinkOpen(false);
          onNavigate?.('properties', { propertyId, linkOwnerId: owner.id });
        }}
        onCreate={() => {
          setLinkOpen(false);
          onNavigate?.('properties', { create: true, linkOwnerId: owner.id });
        }}
      />
    </Screen>
  );
}

/**
 * Link an owner to a property: pick an existing property (then the agreement or partners editor
 * opens there with this owner), or create a new managed property for them.
 */
function LinkPropertySheet({ visible, canCreate, excludeIds, onClose, onPick, onCreate }) {
  const { t, forwardIcon } = useI18n();
  const [properties, setProperties] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!visible) return;
    setFilter('');
    propertiesApi.list().then(setProperties).catch(() => setProperties([]));
  }, [visible]);

  const list = (properties ?? []).filter(
    (p) => !excludeIds.includes(p.id) && (!filter.trim() || matches([p.name, p.wilayat].filter(Boolean).join(' '), filter)),
  );

  return (
    <Sheet visible={visible} title={t('owners.linkProperty')} onClose={onClose}>
      <Txt muted>{t('owners.linkHint')}</Txt>
      {canCreate ? <Button icon="home-plus-outline" title={t('owners.newPropertyForOwner')} onPress={onCreate} /> : null}
      <Field value={filter} onChangeText={setFilter} placeholder={t('properties.filterPlaceholder')} />
      {properties === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState icon="office-building-outline" body={t('properties.empty')} />
      ) : (
        <View style={styles.pickList}>
          {list.map((p, i) => (
            <Pressable key={p.id} onPress={() => onPick(p.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="weightMedium">{p.name}</Txt>
                  <Txt muted size="small">
                    {[t(`properties.ownershipValues.${p.ownership}`), p.wilayat].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <MaterialCommunityIcons name={forwardIcon} size={18} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

export function OwnerForm({ owner, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = owner && !owner.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  const rules = useFieldRules('owner', error);

  useEffect(() => {
    if (!owner) return;
    setForm({
      type: owner.type ?? 'INDIVIDUAL',
      name: owner.name ?? '',
      civilId: owner.civilId ?? '',
      crNumber: owner.crNumber ?? '',
      nationality: owner.nationality ?? '',
      phone: owner.phone ?? '',
      email: owner.email ?? '',
      bankName: owner.bankName ?? '',
      accountName: owner.accountName ?? '',
      accountNumber: owner.accountNumber ?? '',
      notes: owner.notes ?? '',
      custom: toEditable(rules.custom, owner?.custom),
    });
    setError(null);
    setBusy(false);
  }, [owner]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const company = form.type === 'COMPANY';

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, email: form.email.trim(), custom: toPayload(rules.custom, form.custom) };
      const saved = isNew ? await ownersApi.create(payload) : await ownersApi.update(owner.id, payload);
      onSaved(isNew ? saved : null);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!owner}
      title={isNew ? t('owners.add') : t('owners.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name?.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Segmented value={form.type} onChange={set('type')} options={['INDIVIDUAL', 'COMPANY'].map((v) => ({ value: v, label: t(`owners.typeValues.${v}`) }))} />
      <Field label={t('owners.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      <FieldRow>
        {company ? (
          <Field {...rules.props('crNumber', t('owners.crNumber'))} value={form.crNumber} onChangeText={set('crNumber')} />
        ) : (
          <Field {...rules.props('civilId', t('owners.civilId'))} value={form.civilId} onChangeText={set('civilId')} keyboardType="number-pad" />
        )}
        <Field {...rules.props('nationality', t('owners.nationality'))} value={form.nationality} onChangeText={set('nationality')} />
      </FieldRow>
      <FieldRow>
        <Field {...rules.props('phone', t('owners.phone'))} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" inputMode="tel" placeholder="+968" />
        <Field {...rules.props('email', t('owners.email'))} value={form.email} onChangeText={set('email')} autoCapitalize="none" inputMode="email" error={fieldError('email')} />
      </FieldRow>
      <Txt weight="weightBold" size="small">{t('owners.bank')}</Txt>
      <FieldRow>
        <Field {...rules.props('bankName', t('owners.bankName'))} value={form.bankName} onChangeText={set('bankName')} />
        <Field {...rules.props('accountName', t('owners.accountName'))} value={form.accountName} onChangeText={set('accountName')} />
      </FieldRow>
      <Field {...rules.props('accountNumber', t('owners.accountNumber'))} value={form.accountNumber} onChangeText={set('accountNumber')} autoCapitalize="characters" />
      <Field {...rules.props('notes', t('owners.notes'))} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />
      <CustomFields defs={rules.custom} values={form.custom} onChange={set('custom')} error={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pickList: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
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
});
