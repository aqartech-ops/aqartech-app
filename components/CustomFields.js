import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { fieldLabel, optionLabel } from '../services/fields';
import { Money, MoneyField } from './Rial';
import { DateField, formatDate } from './Fields';
import { ChipSelect, Field, Row, Txt, errorText, toLatinDigits } from './ui';

/** Inputs for the extra fields of a form (defined by the platform team). `values` are in editing format. */
export default function CustomFields({ defs, values, onChange, error }) {
  const { t, lang, row } = useI18n();
  if (!defs?.length) return null;
  const set = (key) => (value) => onChange({ ...(values ?? {}), [key]: value });

  return (
    <View style={{ gap: SPACING.md }}>
      {defs.map((d) => {
        const label = `${fieldLabel(d, lang)}${d.required ? ' *' : ''}`;
        const hint = lang === 'ar' ? d.helpAr : d.helpEn;
        const err = error?.field === `custom.${d.key}` ? errorText(t, error) : undefined;
        const value = values?.[d.key];
        switch (d.type) {
          case 'MONEY':
            return <MoneyField key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} error={err} hint={hint} />;
          case 'DATE':
            return <DateField key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} error={err} hint={hint} />;
          case 'NUMBER':
            return (
              <Field
                key={d.key}
                label={label}
                value={value ?? ''}
                onChangeText={(v) => set(d.key)(toLatinDigits(v).replace(/[^0-9.-]/g, ''))}
                keyboardType="decimal-pad"
                inputMode="decimal"
                error={err}
                hint={hint}
              />
            );
          case 'LONGTEXT':
            return <Field key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} multiline inputStyle={{ minHeight: 60 }} error={err} hint={hint} />;
          case 'PHONE':
            return <Field key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} keyboardType="phone-pad" inputMode="tel" error={err} hint={hint} />;
          case 'EMAIL':
            return <Field key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} autoCapitalize="none" inputMode="email" error={err} hint={hint} />;
          case 'BOOLEAN':
            return (
              <View key={d.key} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt weight="weightMedium" size="small" style={{ flex: 1 }}>{label}</Txt>
                  <Switch value={!!value} onValueChange={set(d.key)} trackColor={{ true: COLORS.primary, false: COLORS.borderStrong }} thumbColor={COLORS.surface} />
                </Row>
                {err ? <Txt size="small" style={{ color: COLORS.danger }}>{err}</Txt> : hint ? <Txt size="small" muted>{hint}</Txt> : null}
              </View>
            );
          case 'SELECT':
            return (
              <View key={d.key} style={{ gap: 4 }}>
                <Txt weight="weightMedium" size="small">{label}</Txt>
                <ChipSelect
                  value={value ?? ''}
                  onChange={(v) => set(d.key)(v || null)}
                  options={[...(d.required ? [] : [{ value: '', label: t('common.none') }]), ...(d.options ?? []).map((o) => ({ value: o.value, label: optionLabel(o, lang) }))]}
                />
                {err ? <Txt size="small" style={{ color: COLORS.danger }}>{err}</Txt> : hint ? <Txt size="small" muted>{hint}</Txt> : null}
              </View>
            );
          case 'MULTISELECT': {
            const list = Array.isArray(value) ? value : [];
            const toggle = (v) => set(d.key)(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
            return (
              <View key={d.key} style={{ gap: 4 }}>
                <Txt weight="weightMedium" size="small">{label}</Txt>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: SPACING.sm }}>
                  {(d.options ?? []).map((o) => {
                    const on = list.includes(o.value);
                    return (
                      <Pressable key={o.value} onPress={() => toggle(o.value)} style={[styles.chip, on && styles.chipOn]}>
                        <Txt size="small" style={{ color: on ? COLORS.onPrimary : COLORS.textDark }}>{optionLabel(o, lang)}</Txt>
                      </Pressable>
                    );
                  })}
                </View>
                {err ? <Txt size="small" style={{ color: COLORS.danger }}>{err}</Txt> : hint ? <Txt size="small" muted>{hint}</Txt> : null}
              </View>
            );
          }
          default:
            return <Field key={d.key} label={label} value={value ?? ''} onChangeText={set(d.key)} error={err} hint={hint} />;
        }
      })}
    </View>
  );
}

/** Read-only display of saved extra-field values (detail pages). */
export function CustomValues({ defs, values }) {
  const { t, lang } = useI18n();
  const rows = (defs ?? [])
    .map((d) => {
      const v = values?.[d.key];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
      let shown;
      if (d.type === 'MONEY') shown = <Money baisa={v} />;
      else if (d.type === 'DATE') shown = <Txt>{formatDate(v, lang)}</Txt>;
      else if (d.type === 'BOOLEAN') shown = <Txt>{v ? t('common.yes') : t('common.no')}</Txt>;
      else if (d.type === 'SELECT') shown = <Txt>{optionLabel((d.options ?? []).find((o) => o.value === v) ?? { value: v }, lang)}</Txt>;
      else if (d.type === 'MULTISELECT') shown = <Txt>{v.map((x) => optionLabel((d.options ?? []).find((o) => o.value === x) ?? { value: x }, lang)).join('، ')}</Txt>;
      else shown = <Txt style={{ flexShrink: 1 }}>{String(v)}</Txt>;
      return (
        <Row key={d.key} style={{ justifyContent: 'space-between' }}>
          <Txt muted>{fieldLabel(d, lang)}</Txt>
          {shown}
        </Row>
      );
    })
    .filter(Boolean);
  return rows.length ? <View style={{ gap: SPACING.sm }}>{rows}</View> : null;
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: SPACING.md, paddingVertical: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: COLORS.surface },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
});
