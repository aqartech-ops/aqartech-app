import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, FONT, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { metricsApi } from '../services/api';
import { useFieldRules, optionLabel } from '../services/fields';
import { omanToday } from '../services/templates';
import { omr } from '../services/exportCsv';
import { DateField, isDateText } from './Fields';
import { Money } from './Rial';
import ExportButton from './ExportButton';
import { Card, ChipSelect, ErrorBox, Loading, Row, Txt } from './ui';

// Indicators (المؤشرات) of an added section: value over a period and its breakdown.

export const PERIOD_PRESETS = ['MONTH', 'YEAR', 'ALL', 'CUSTOM'];

/** Days for a preset period (Oman calendar). */
export function presetRange(preset, from, to) {
  const today = omanToday();
  if (preset === 'MONTH') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'YEAR') return { from: `${today.slice(0, 4)}-01-01`, to: today };
  if (preset === 'CUSTOM') return { from: isDateText(from) ? from : undefined, to: isDateText(to) ? to : undefined };
  return {};
}

const numberText = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en', { maximumFractionDigits: 2 }));

/** An indicator value: amounts in rials (from baisa), counts and numbers as numbers. */
export function MetricValue({ value, format, size = FONT.title, color }) {
  if (format === 'money' && value !== null && value !== undefined) return <Money baisa={value} size={size} weight="weightBold" color={color} />;
  return <Txt weight="weightBold" style={{ fontSize: size, color }}>{numberText(value)}</Txt>;
}

/** Text of a breakdown row (month, property, option of a choice field). */
function useGroupLabel(metric, result) {
  const { t, lang } = useI18n();
  const rules = useFieldRules(`cs:${metric.section}`);
  return (key) => {
    if (key === null || key === undefined) return t('metrics.none');
    if (metric.groupBy === 'month') {
      const d = new Date(`${key}-01T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    if (metric.groupBy === 'property') return result?.properties?.[key] ?? '—';
    const def = rules.custom.find((d) => d.key === metric.groupBy);
    if (def?.type === 'BOOLEAN') return key === 'true' ? t('common.yes') : t('common.no');
    return optionLabel((def?.options ?? []).find((o) => o.value === key) ?? { value: key }, lang);
  };
}

function MetricCard({ metric, range }) {
  const { t, lang } = useI18n();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const label = useGroupLabel(metric, result);

  useEffect(() => {
    setResult(null);
    setError(null);
    metricsApi.result(metric.id, range).then(setResult).catch(setError);
  }, [metric.id, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card style={{ gap: SPACING.sm }}>
      <Txt muted>{lang === 'ar' ? metric.nameAr : metric.nameEn}</Txt>
      <ErrorBox error={error} />
      {result === null && !error ? <Loading /> : null}
      {result ? (
        <>
          <MetricValue value={result.value} format={result.format} />
          <Txt muted size="small">{t('metrics.recordsCount', { count: result.count })}</Txt>
          {result.groups.length ? (
            <View style={styles.table}>
              {result.groups.map((g, i) => (
                <Row key={`${g.key}`} style={[styles.groupRow, i > 0 && styles.divider]}>
                  <Txt style={{ flex: 1 }}>{label(g.key)}</Txt>
                  <MetricValue value={g.value} format={result.format} size={FONT.body} />
                </Row>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

/** The analytics view of a section: period chooser, one card per indicator, export. */
export default function SectionAnalytics({ metrics, filename }) {
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState('MONTH');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const range = presetRange(preset, from, to);

  const build = async () => {
    const rows = [[t('metrics.indicator'), t('metrics.breakdown'), t('metrics.value'), t('metrics.records')]];
    for (const m of metrics) {
      const r = await metricsApi.result(m.id, range);
      const name = lang === 'ar' ? m.nameAr : m.nameEn;
      const cell = (v) => (r.format === 'money' ? omr(v) : v ?? '');
      rows.push([name, '', cell(r.value), r.count]);
      for (const g of r.groups) {
        const key = g.key === null ? t('metrics.none') : m.groupBy === 'property' ? r.properties?.[g.key] ?? g.key : g.key;
        rows.push([name, key, cell(g.value), g.count]);
      }
    }
    return rows;
  };

  return (
    <View style={{ gap: SPACING.md }}>
      <ChipSelect value={preset} onChange={setPreset} options={PERIOD_PRESETS.map((p) => ({ value: p, label: t(`metrics.periods.${p}`) }))} />
      {preset === 'CUSTOM' ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <DateField label={t('metrics.from')} value={from} onChangeText={setFrom} />
          </View>
          <View style={{ flex: 1, minWidth: 160 }}>
            <DateField label={t('metrics.to')} value={to} onChangeText={setTo} />
          </View>
        </Row>
      ) : null}
      <Row style={{ justifyContent: 'flex-end' }}>
        <ExportButton filename={filename} build={build} />
      </Row>
      {metrics.map((m) => (
        <MetricCard key={m.id} metric={m} range={range} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xs },
  groupRow: { paddingVertical: SPACING.xs, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
