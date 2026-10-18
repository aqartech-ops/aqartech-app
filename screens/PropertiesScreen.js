import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { propertiesApi } from '../services/api';
import { confirm, notify } from '../services/dialog';
import { formatOMR, parseOMR } from '../services/money';
import { matches } from '../services/text';
import { Money, MoneyField } from '../components/Rial';
import PropertyOwnership from '../components/PropertyOwnership';
import {
  Badge,
  Button,
  Card,
  ChipSelect,
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
  toLatinDigits,
} from '../components/ui';

const CATEGORIES = ['BUILDING', 'VILLA_COMPOUND', 'VILLA', 'COMMERCIAL_COMPLEX', 'LAND', 'OTHER'];
const UNIT_TYPES = ['APARTMENT', 'STUDIO', 'VILLA', 'ROOM', 'SHOP', 'OFFICE', 'WAREHOUSE', 'OTHER'];
const UNIT_STATUSES = ['VACANT', 'OCCUPIED', 'MAINTENANCE', 'RESERVED'];
export const UNIT_STATUS_TONE = { VACANT: 'info', OCCUPIED: 'success', MAINTENANCE: 'warning', RESERVED: 'neutral' };
const CATEGORY_ICON = {
  BUILDING: 'office-building-outline',
  VILLA_COMPOUND: 'home-group',
  VILLA: 'home-outline',
  COMMERCIAL_COMPLEX: 'storefront-outline',
  LAND: 'terrain',
  OTHER: 'map-marker-outline',
};

// "12" → 12, "" → null, "abc" → NaN (invalid)
const intOrNull = (text) => {
  const s = toLatinDigits(text).trim();
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
};
const numOrNull = (text) => {
  const s = toLatinDigits(text).trim();
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
};
const moneyOrNull = (text) => (String(text ?? '').trim() ? parseOMR(text) ?? NaN : null);
const moneyText = (baisa) => (baisa === null || baisa === undefined ? '' : formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, ''));

export default function PropertiesScreen({ params, onNavigate }) {
  const [selectedId, setSelectedId] = useState(params?.propertyId ?? null);
  // Coming from an owner's page: open the agreement / partners editor with that owner
  const [linkOwnerId, setLinkOwnerId] = useState(params?.linkOwnerId ?? null);

  useEffect(() => {
    if (params?.propertyId) setSelectedId(params.propertyId);
  }, [params]);

  if (selectedId) {
    return (
      <PropertyDetail
        id={selectedId}
        linkOwnerId={linkOwnerId}
        onLinkHandled={() => setLinkOwnerId(null)}
        onBack={() => setSelectedId(null)}
      />
    );
  }
  return (
    <PropertyList
      openCreate={!!params?.create}
      createAsManaged={!!linkOwnerId}
      onOpen={setSelectedId}
      onNavigate={onNavigate}
    />
  );
}

// =================================================================== list

function PropertyList({ onOpen, openCreate, createAsManaged }) {
  const { t } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('properties');
  const { width } = useWindowDimensions();
  const columns = width >= BREAKPOINTS.desktop ? 3 : width >= BREAKPOINTS.tablet ? 2 : 1;
  const [trash, setTrash] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(openCreate && editable ? (createAsManaged ? { ownership: 'MANAGED' } : {}) : null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await propertiesApi.list(trash));
    } catch (e) {
      setError(e);
      setItems([]);
    }
  }, [trash]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (p) => !filter.trim() || matches([p.name, p.wilayat, p.governorate, p.address, p.plotNumber].filter(Boolean).join(' '), filter),
      ),
    [items, filter],
  );

  const restore = async (p) => {
    try {
      await propertiesApi.restore(p.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen
      title={t('properties.title')}
      actions={editable && !trash ? <Button icon="plus" title={t('properties.add')} onPress={() => setEditing({})} /> : null}
    >
      <View style={{ gap: SPACING.md }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field value={filter} onChangeText={setFilter} placeholder={t('properties.filterPlaceholder')} />
          </View>
          {editable ? (
            <Button small variant={trash ? 'primary' : 'secondary'} icon="delete-restore" title={t('common.trash')} onPress={() => setTrash((v) => !v)} />
          ) : null}
        </Row>
        <ErrorBox error={error} onRetry={load} />

        {items === null ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={trash ? 'delete-empty-outline' : 'office-building-outline'}
              body={trash ? t('properties.trashEmpty') : t('properties.empty')}
              action={editable && !trash && !filter ? <Button icon="plus" title={t('properties.add')} onPress={() => setEditing({})} /> : null}
            />
          </Card>
        ) : (
          <Grid columns={columns}>
            {visible.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                onPress={trash ? undefined : () => onOpen(p.id)}
                footer={trash ? <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(p)} /> : null}
              />
            ))}
          </Grid>
        )}
      </View>

      <PropertyForm
        property={editing}
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

function Grid({ columns, children }) {
  const { row } = useI18n();
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', marginHorizontal: -SPACING.sm }}>
      {React.Children.toArray(children).map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: SPACING.sm }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function PropertyCard({ property: p, onPress, footer }) {
  const { t, forwardIcon } = useI18n();
  const s = p.stats;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flexGrow: 1 }, pressed && { opacity: 0.85 }]}>
      <Card style={{ gap: SPACING.md, flexGrow: 1 }}>
        <Row gap={SPACING.md}>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name={CATEGORY_ICON[p.category] ?? 'office-building-outline'} size={22} color={COLORS.primaryDark} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="weightBold" numberOfLines={1}>{p.name}</Txt>
            <Txt muted size="small" numberOfLines={1}>
              {[t(`properties.categoryValues.${p.category}`), p.wilayat, p.governorate].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          {onPress ? <MaterialCommunityIcons name={forwardIcon} size={22} color={COLORS.textMuted} /> : null}
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge label={t(`properties.ownershipValues.${p.ownership}`)} tone={p.ownership === 'MANAGED' ? 'info' : 'neutral'} />
          <Badge label={t('properties.unitsCount', { count: s.total })} />
          {s.vacant ? <Badge label={`${t('units.statusValues.VACANT')}: ${s.vacant}`} tone="warning" /> : null}
        </Row>
        <OccupancyBar stats={s} />
        {footer}
      </Card>
    </Pressable>
  );
}

function OccupancyBar({ stats: s }) {
  const { t, row } = useI18n();
  const rate = s.occupancyRate;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt muted size="small">{t('dashboard.occupancy')}</Txt>
        <Txt size="small" weight="weightBold">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</Txt>
      </Row>
      <View style={[styles.track, { flexDirection: row }]}>
        {s.total ? (
          <>
            <View style={{ flex: s.occupied, backgroundColor: COLORS.success }} />
            <View style={{ flex: s.reserved, backgroundColor: COLORS.info }} />
            <View style={{ flex: s.maintenance, backgroundColor: COLORS.warning }} />
            <View style={{ flex: s.vacant }} />
          </>
        ) : null}
      </View>
    </View>
  );
}

// =================================================================== detail

function PropertyDetail({ id, onBack, linkOwnerId, onLinkHandled }) {
  const { t, lang, isRTL, start } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('properties');
  const [property, setProperty] = useState(null);
  const [error, setError] = useState(null);
  const [editingProperty, setEditingProperty] = useState(null);
  const [editingUnit, setEditingUnit] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deletedUnits, setDeletedUnits] = useState(null); // null = hidden

  const load = useCallback(async () => {
    setError(null);
    try {
      setProperty(await propertiesApi.get(id));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const removeProperty = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('properties.deleteConfirm', { name: property.name }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await propertiesApi.remove(id);
      onBack();
    } catch (e) {
      setError(e);
    }
  };

  const removeUnit = async (unit) => {
    const ok = await confirm({
      title: t('common.delete'),
      message: t('units.deleteConfirm', { number: unit.number }),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await propertiesApi.removeUnit(unit.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  const toggleDeletedUnits = async () => {
    if (deletedUnits) return setDeletedUnits(null);
    try {
      setDeletedUnits(await propertiesApi.units(id, true));
    } catch (e) {
      setError(e);
    }
  };

  const restoreUnit = async (unit) => {
    try {
      await propertiesApi.restoreUnit(unit.id);
      setDeletedUnits(await propertiesApi.units(id, true));
      load();
    } catch (e) {
      setError(e);
    }
  };

  const backButton = (
    <Button small variant="ghost" icon={isRTL ? 'chevron-right' : 'chevron-left'} title={t('common.back')} onPress={onBack} />
  );

  if (!property) {
    return (
      <Screen>
        {backButton}
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  const s = property.stats;
  const info = [
    [t('properties.category'), t(`properties.categoryValues.${property.category}`)],
    [t('properties.ownership'), t(`properties.ownershipValues.${property.ownership}`)],
    [t('properties.governorate'), property.governorate],
    [t('properties.wilayat'), property.wilayat],
    [t('properties.address'), property.address],
    [t('properties.plotNumber'), property.plotNumber],
    [t('properties.floors'), property.floors],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <Screen
      title={property.name}
      subtitle={[property.wilayat, property.governorate].filter(Boolean).join(' · ') || null}
      actions={
        editable ? (
          <>
            <IconButton icon="pencil-outline" label={t('common.edit')} onPress={() => setEditingProperty(property)} />
            <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={removeProperty} />
          </>
        ) : null
      }
    >
      <View style={{ gap: SPACING.lg }}>
        <View style={{ alignSelf: start }}>{backButton}</View>
        <ErrorBox error={error} onRetry={load} />

        <Row style={{ flexWrap: 'wrap' }} gap={SPACING.md}>
          <Stat label={t('dashboard.units')} value={s.total} />
          <Stat label={t('dashboard.occupied')} value={s.occupied} color={COLORS.success} />
          <Stat label={t('dashboard.vacant')} value={s.vacant} color={COLORS.warning} />
          <Stat label={t('dashboard.occupancy')} value={s.occupancyRate === null ? '—' : `${Math.round(s.occupancyRate * 100)}%`} />
        </Row>

        <Card style={{ gap: SPACING.sm }}>
          <Txt weight="weightBold">{t('properties.details')}</Txt>
          {info.map(([label, value]) => (
            <Row key={label} style={{ justifyContent: 'space-between' }}>
              <Txt muted>{label}</Txt>
              <Txt style={{ flexShrink: 1 }}>{String(value)}</Txt>
            </Row>
          ))}
          {property.propertyValue !== null ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('properties.propertyValue')}</Txt>
              <Money baisa={property.propertyValue} />
            </Row>
          ) : null}
          {property.investmentCost !== null ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt muted>{t('properties.investmentCost')}</Txt>
              <Money baisa={property.investmentCost} />
            </Row>
          ) : null}
          {property.notes ? <Txt muted>{property.notes}</Txt> : null}
        </Card>

        <PropertyOwnership property={property} linkOwnerId={linkOwnerId} onLinkHandled={onLinkHandled} />

        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Txt size="medium" weight="weightBold">{t('units.title')}</Txt>
          {editable ? (
            <Row style={{ flexWrap: 'wrap' }}>
              <Button small variant={deletedUnits ? 'primary' : 'secondary'} icon="delete-restore" title={t('common.trash')} onPress={toggleDeletedUnits} />
              <Button small variant="secondary" icon="format-list-numbered" title={t('units.addBulk')} onPress={() => setBulkOpen(true)} />
              <Button small icon="plus" title={t('units.add')} onPress={() => setEditingUnit({})} />
            </Row>
          ) : null}
        </Row>

        {deletedUnits ? (
          <Card padded={false}>
            {deletedUnits.length === 0 ? (
              <EmptyState icon="delete-empty-outline" body={t('users.trashEmpty')} />
            ) : (
              deletedUnits.map((unit, index) => (
                <Row key={unit.id} style={[styles.unitRow, index > 0 && styles.divider]}>
                  <Txt weight="weightBold" style={{ flex: 1 }}>{unit.number}</Txt>
                  <Button small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restoreUnit(unit)} />
                </Row>
              ))
            )}
          </Card>
        ) : null}

        {property.units.length === 0 ? (
          <Card>
            <EmptyState icon="door" body={t('units.empty')} />
          </Card>
        ) : (
          <Card padded={false}>
            {property.units.map((unit, index) => (
              <Pressable key={unit.id} onPress={editable ? () => setEditingUnit(unit) : undefined}>
                <Row style={[styles.unitRow, index > 0 && styles.divider]} gap={SPACING.md}>
                  <View style={styles.unitNumber}>
                    <Txt weight="weightBold" style={{ color: COLORS.primaryDark, textAlign: 'center' }} numberOfLines={1}>
                      {unit.number}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                      <Txt weight="weightMedium">{t(`units.typeValues.${unit.type}`)}</Txt>
                      <Badge label={t(`units.statusValues.${unit.status}`)} tone={UNIT_STATUS_TONE[unit.status]} />
                    </Row>
                    <Txt muted size="small">
                      {[
                        unit.floor ? `${t('units.floor')} ${unit.floor}` : null,
                        unit.area ? `${unit.area} m²` : null,
                        unit.bedrooms ? `${unit.bedrooms} ${t('units.bedrooms')}` : null,
                        unit.status === 'VACANT' && unit.vacantSince
                          ? t('units.vacantSince', { date: new Date(unit.vacantSince).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB') })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Txt>
                  </View>
                  {unit.askingRent ? <Money baisa={unit.askingRent} size={14} weight="weightMedium" /> : null}
                  {editable ? (
                    <IconButton icon="delete-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => removeUnit(unit)} />
                  ) : null}
                </Row>
              </Pressable>
            ))}
          </Card>
        )}
      </View>

      <PropertyForm
        property={editingProperty}
        onClose={() => setEditingProperty(null)}
        onSaved={() => {
          setEditingProperty(null);
          load();
        }}
      />
      <UnitForm
        propertyId={id}
        unit={editingUnit}
        onClose={() => setEditingUnit(null)}
        onSaved={() => {
          setEditingUnit(null);
          load();
        }}
      />
      <BulkUnitsForm
        propertyId={id}
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={(count) => {
          setBulkOpen(false);
          load();
          notify(t('units.created', { count }));
        }}
      />
    </Screen>
  );
}

function Stat({ label, value, color = COLORS.textDark }) {
  return (
    <Card style={{ flexGrow: 1, flexBasis: 130, gap: 4 }}>
      <Txt muted size="small">{label}</Txt>
      <Txt size="title" weight="weightBold" style={{ color }}>{String(value)}</Txt>
    </Card>
  );
}

// =================================================================== forms

function useFormError() {
  const { t } = useI18n();
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  return { error, setError, fieldError };
}

function PropertyForm({ property, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = property && !property.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const { error, setError, fieldError } = useFormError();

  useEffect(() => {
    if (!property) return;
    setForm({
      name: property.name ?? '',
      category: property.category ?? 'BUILDING',
      ownership: property.ownership ?? 'OWNED',
      governorate: property.governorate ?? '',
      wilayat: property.wilayat ?? '',
      address: property.address ?? '',
      plotNumber: property.plotNumber ?? '',
      floors: property.floors?.toString() ?? '',
      propertyValue: moneyText(property.propertyValue),
      investmentCost: moneyText(property.investmentCost),
      notes: property.notes ?? '',
    });
    setError(null);
    setBusy(false);
  }, [property]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const payload = {
      ...form,
      floors: intOrNull(form.floors),
      propertyValue: moneyOrNull(form.propertyValue),
      investmentCost: moneyOrNull(form.investmentCost),
    };
    for (const k of ['floors', 'propertyValue', 'investmentCost']) {
      if (Number.isNaN(payload[k])) return setError({ code: 'validation.invalid', field: k });
    }
    setBusy(true);
    setError(null);
    try {
      const saved = isNew ? await propertiesApi.create(payload) : await propertiesApi.update(property.id, payload);
      onSaved(isNew ? saved : null);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!property}
      title={isNew ? t('properties.add') : t('properties.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name?.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={t('properties.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      <Txt weight="weightMedium" size="small">{t('properties.category')}</Txt>
      <ChipSelect
        value={form.category}
        onChange={set('category')}
        options={CATEGORIES.map((c) => ({ value: c, label: t(`properties.categoryValues.${c}`) }))}
      />
      <Txt weight="weightMedium" size="small">{t('properties.ownership')}</Txt>
      <Segmented
        value={form.ownership}
        onChange={set('ownership')}
        options={['OWNED', 'MANAGED'].map((o) => ({ value: o, label: t(`properties.ownershipValues.${o}`) }))}
      />
      <FieldRow>
        <Field label={t('properties.governorate')} value={form.governorate} onChangeText={set('governorate')} />
        <Field label={t('properties.wilayat')} value={form.wilayat} onChangeText={set('wilayat')} />
      </FieldRow>
      <Field label={t('properties.address')} value={form.address} onChangeText={set('address')} />
      <FieldRow>
        <Field label={t('properties.plotNumber')} value={form.plotNumber} onChangeText={set('plotNumber')} />
        <Field
          label={t('properties.floors')}
          value={form.floors}
          onChangeText={set('floors')}
          keyboardType="number-pad"
          inputMode="numeric"
          error={fieldError('floors')}
        />
      </FieldRow>
      <Txt muted size="small">{t('properties.financialInfo')}</Txt>
      <FieldRow>
        <MoneyField label={t('properties.propertyValue')} value={form.propertyValue} onChangeText={set('propertyValue')} error={fieldError('propertyValue')} />
        <MoneyField label={t('properties.investmentCost')} value={form.investmentCost} onChangeText={set('investmentCost')} error={fieldError('investmentCost')} />
      </FieldRow>
      <Field label={t('properties.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 70 }} />
    </Sheet>
  );
}

function UnitForm({ propertyId, unit, onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = unit && !unit.id;
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const { error, setError, fieldError } = useFormError();

  useEffect(() => {
    if (!unit) return;
    setForm({
      number: unit.number ?? '',
      floor: unit.floor ?? '',
      type: unit.type ?? 'APARTMENT',
      status: unit.status ?? 'VACANT',
      askingRent: moneyText(unit.askingRent || null),
      area: unit.area?.toString() ?? '',
      bedrooms: unit.bedrooms?.toString() ?? '',
      bathrooms: unit.bathrooms?.toString() ?? '',
      electricityMeter: unit.electricityMeter ?? '',
      waterMeter: unit.waterMeter ?? '',
      notes: unit.notes ?? '',
    });
    setError(null);
    setBusy(false);
  }, [unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const payload = {
      ...form,
      askingRent: moneyOrNull(form.askingRent) ?? 0,
      area: numOrNull(form.area),
      bedrooms: intOrNull(form.bedrooms),
      bathrooms: intOrNull(form.bathrooms),
    };
    for (const k of ['askingRent', 'area', 'bedrooms', 'bathrooms']) {
      if (Number.isNaN(payload[k])) return setError({ code: 'validation.invalid', field: k });
    }
    setBusy(true);
    setError(null);
    try {
      if (isNew) await propertiesApi.createUnit(propertyId, payload);
      else await propertiesApi.updateUnit(unit.id, payload);
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!unit}
      title={isNew ? t('units.add') : t('units.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.number?.trim()} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <FieldRow>
        <Field label={t('units.number')} value={form.number} onChangeText={set('number')} error={fieldError('number')} />
        <Field label={t('units.floor')} value={form.floor} onChangeText={set('floor')} />
      </FieldRow>
      <Txt weight="weightMedium" size="small">{t('units.type')}</Txt>
      <ChipSelect value={form.type} onChange={set('type')} options={UNIT_TYPES.map((v) => ({ value: v, label: t(`units.typeValues.${v}`) }))} />
      <Txt weight="weightMedium" size="small">{t('units.status')}</Txt>
      <ChipSelect value={form.status} onChange={set('status')} options={UNIT_STATUSES.map((v) => ({ value: v, label: t(`units.statusValues.${v}`) }))} />
      <MoneyField label={t('units.askingRent')} value={form.askingRent} onChangeText={set('askingRent')} error={fieldError('askingRent')} />
      <FieldRow>
        <Field label={t('units.area')} value={form.area} onChangeText={set('area')} keyboardType="decimal-pad" inputMode="decimal" error={fieldError('area')} />
        <Field label={t('units.bedrooms')} value={form.bedrooms} onChangeText={set('bedrooms')} keyboardType="number-pad" inputMode="numeric" error={fieldError('bedrooms')} />
        <Field label={t('units.bathrooms')} value={form.bathrooms} onChangeText={set('bathrooms')} keyboardType="number-pad" inputMode="numeric" error={fieldError('bathrooms')} />
      </FieldRow>
      <FieldRow>
        <Field label={t('units.electricityMeter')} value={form.electricityMeter} onChangeText={set('electricityMeter')} />
        <Field label={t('units.waterMeter')} value={form.waterMeter} onChangeText={set('waterMeter')} />
      </FieldRow>
      <Field label={t('units.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />
    </Sheet>
  );
}

function BulkUnitsForm({ propertyId, visible, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ prefix: '', from: '', to: '', floor: '', type: 'APARTMENT', askingRent: '' });
  const [busy, setBusy] = useState(false);
  const { error, setError, fieldError } = useFormError();

  useEffect(() => {
    if (visible) {
      setForm({ prefix: '', from: '', to: '', floor: '', type: 'APARTMENT', askingRent: '' });
      setError(null);
      setBusy(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const from = intOrNull(form.from);
  const to = intOrNull(form.to);
  const count = Number.isInteger(from) && Number.isInteger(to) && to >= from ? to - from + 1 : 0;

  const save = async () => {
    const askingRent = moneyOrNull(form.askingRent) ?? 0;
    if (Number.isNaN(askingRent)) return setError({ code: 'validation.invalid', field: 'askingRent' });
    setBusy(true);
    setError(null);
    try {
      const res = await propertiesApi.createUnitsBulk(propertyId, {
        prefix: form.prefix,
        from,
        to,
        floor: form.floor,
        type: form.type,
        askingRent,
      });
      onSaved(res.created);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t('units.bulkTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.add')} onPress={save} loading={busy} disabled={count === 0 || count > 300} />
        </>
      }
    >
      <Txt muted>{t('units.bulkHint')}</Txt>
      {error && !['to', 'askingRent'].includes(error.field) ? <ErrorBox error={error} /> : null}
      <FieldRow>
        <Field label={`${t('units.prefix')} (${t('common.optional')})`} value={form.prefix} onChangeText={set('prefix')} autoCapitalize="characters" />
        <Field label={t('units.from')} value={form.from} onChangeText={set('from')} keyboardType="number-pad" inputMode="numeric" />
        <Field label={t('units.to')} value={form.to} onChangeText={set('to')} keyboardType="number-pad" inputMode="numeric" error={fieldError('to')} />
      </FieldRow>
      {count > 0 ? (
        <Txt style={{ color: COLORS.primaryDark }}>
          {t('units.bulkPreview', { count, first: `${form.prefix}${from}`, last: `${form.prefix}${to}` })}
        </Txt>
      ) : null}
      <Field label={t('units.floor')} value={form.floor} onChangeText={set('floor')} />
      <Txt weight="weightMedium" size="small">{t('units.type')}</Txt>
      <ChipSelect value={form.type} onChange={set('type')} options={UNIT_TYPES.map((v) => ({ value: v, label: t(`units.typeValues.${v}`) }))} />
      <MoneyField label={t('units.askingRent')} value={form.askingRent} onChangeText={set('askingRent')} error={fieldError('askingRent')} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSoft, overflow: 'hidden' },
  unitRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  unitNumber: {
    minWidth: 52,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
