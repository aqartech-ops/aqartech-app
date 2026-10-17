import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { matches } from '../services/text';
import { EmptyState, Field, Loading, Row, Sheet, Txt, toLatinDigits } from './ui';

// ---------------------------------------------------------------- dates

/** "2026-10-17" ↔ Date. Dates are entered as YYYY-MM-DD (a calendar picker comes with the web/form phase). */
export function DateField({ label, value, onChangeText, error, hint }) {
  const { t } = useI18n();
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(text) => onChangeText(toLatinDigits(text).replace(/[^0-9-]/g, '').slice(0, 10))}
      placeholder="2026-01-31"
      keyboardType="numbers-and-punctuation"
      inputMode="numeric"
      error={error}
      hint={hint ?? t('common.dateHint')}
    />
  );
}

export const today = () => new Date().toISOString().slice(0, 10);
export const dateText = (value) => (value ? String(value).slice(0, 10) : '');
export const isDateText = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(new Date(`${text}T00:00:00Z`).getTime());

export function formatDate(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { timeZone: 'UTC' });
}

// ---------------------------------------------------------------- percentages (basis points: 500 = 5%)

export function PercentField({ label, value, onChangeText, error, hint }) {
  return (
    <Field
      label={label}
      value={value}
      onChangeText={(text) => onChangeText(toLatinDigits(text).replace(/[^0-9.]/g, ''))}
      placeholder="5"
      keyboardType="decimal-pad"
      inputMode="decimal"
      error={error}
      hint={hint}
    />
  );
}

/** "5" → 500, "2.5" → 250, "" → null, invalid → NaN */
export function bpFromText(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
export const textFromBp = (bp) => (bp === null || bp === undefined ? '' : String(bp / 100));
export const pctLabel = (bp) => `${(bp / 100).toLocaleString('en', { maximumFractionDigits: 2 })}%`;

// ---------------------------------------------------------------- owner picker

/** Choose one owner from the company's list. */
export function OwnerPicker({ visible, onClose, onSelect, owners, excludeIds = [] }) {
  const { t, forwardIcon } = useI18n();
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (visible) setFilter('');
  }, [visible]);
  const list = useMemo(
    () => (owners ?? []).filter((o) => !excludeIds.includes(o.id) && (!filter.trim() || matches([o.name, o.phone, o.civilId].filter(Boolean).join(' '), filter))),
    [owners, filter, excludeIds],
  );
  return (
    <Sheet visible={visible} title={t('owners.pick')} onClose={onClose}>
      <Field value={filter} onChangeText={setFilter} placeholder={t('owners.filterPlaceholder')} />
      {owners === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState icon="account-tie-outline" body={t('owners.pickEmpty')} />
      ) : (
        <View style={styles.list}>
          {list.map((o, i) => (
            <Pressable key={o.id} onPress={() => onSelect(o)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]}>
                <MaterialCommunityIcons name={o.type === 'COMPANY' ? 'domain' : 'account-tie-outline'} size={20} color={COLORS.primaryDark} />
                <View style={{ flex: 1 }}>
                  <Txt weight="weightMedium">{o.name}</Txt>
                  {o.phone ? <Txt muted size="small">{o.phone}</Txt> : null}
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

/** A field-looking button that opens a picker. */
export function PickerButton({ label, value, placeholder, onPress, error }) {
  const { row, forwardIcon } = useI18n();
  return (
    <View style={{ gap: 4 }}>
      {label ? <Txt weight="weightMedium" size="small">{label}</Txt> : null}
      <Pressable onPress={onPress} style={[styles.picker, { flexDirection: row }, error && { borderColor: COLORS.danger }]}>
        <Txt style={{ flex: 1, color: value ? COLORS.textDark : COLORS.textMuted }}>{value || placeholder}</Txt>
        <MaterialCommunityIcons name={forwardIcon} size={18} color={COLORS.textMuted} />
      </Pressable>
      {error ? <Txt size="small" style={{ color: COLORS.danger }}>{error}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  row: { padding: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  picker: {
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 46,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.md,
  },
});
