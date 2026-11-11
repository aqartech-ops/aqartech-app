import React from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { Txt } from './ui';

// Small charts drawn with plain views (no chart library — same look on phone, tablet and web).

/** Vertical bars with their value on top and label below. bars: [{ key, label, value, color }] */
export function BarChart({ bars, height = 170, format = (v) => String(v) }) {
  const { row } = useI18n();
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  return (
    <View>
      {[0.25, 0.5, 0.75].map((g) => (
        <View key={g} pointerEvents="none" style={[styles.grid, { top: height * (1 - g) }]} />
      ))}
      <View style={{ flexDirection: row, gap: SPACING.md, justifyContent: 'space-around' }}>
        {bars.map((b) => (
          <View key={b.key ?? b.label} style={styles.col}>
            <View style={[styles.area, { height }]}>
              <Txt size="small" weight="weightMedium" numberOfLines={1}>{format(b.value)}</Txt>
              <View style={[styles.bar, { height: Math.max(b.value ? 3 : 0, (Math.abs(b.value) / max) * (height - 24)), backgroundColor: b.color ?? COLORS.primary }]} />
            </View>
            <Txt muted size="small" numberOfLines={2} style={styles.label}>{b.label}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

/** One slice of at most 180°, starting at `start` degrees (clockwise from 12 o'clock). */
function Slice({ size, start, angle, color }) {
  const half = size / 2;
  return (
    <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${start}deg` }] }]}>
      {/* the right half of the circle is the window; a left half-disc turns into it by `angle` */}
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: -half, top: 0, width: size, height: size, transform: [{ rotate: `${angle}deg` }] }}>
          <View style={{ width: half, height: size, backgroundColor: color, borderTopLeftRadius: half, borderBottomLeftRadius: half }} />
        </View>
      </View>
    </View>
  );
}

/** Donut chart. slices: [{ key, value, color }] */
export function Donut({ slices, size = 150, thickness = 26, center }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const parts = [];
  let start = 0;
  for (const s of slices) {
    if (!total || s.value <= 0) continue;
    let angle = (s.value / total) * 360;
    let from = start;
    while (angle > 0.01) {
      const piece = Math.min(180, angle);
      parts.push({ key: `${s.key}-${from}`, start: from, angle: piece, color: s.color });
      from += piece;
      angle -= piece;
    }
    start += (s.value / total) * 360;
  }
  const hole = size - thickness * 2;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: COLORS.border, alignSelf: 'center' }}>
      {parts.map((p) => (
        <Slice key={p.key} size={size} start={p.start} angle={p.angle} color={p.color} />
      ))}
      <View style={[styles.hole, { width: hole, height: hole, borderRadius: hole / 2, top: thickness, left: thickness }]}>{center}</View>
    </View>
  );
}

/** Legend rows: colour, label, value, share of the total. */
export function Legend({ items, format = (v) => String(v) }) {
  const { row } = useI18n();
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  return (
    <View style={{ gap: 6 }}>
      {items.map((i) => (
        <View key={i.key ?? i.label} style={[styles.legendRow, { flexDirection: row }]}>
          <View style={[styles.dot, { backgroundColor: i.color }]} />
          <Txt size="small" style={{ flex: 1 }}>{i.label}</Txt>
          <Txt size="small" weight="weightMedium">{format(i.value)}</Txt>
          <Txt muted size="small" style={{ minWidth: 40, textAlign: 'center' }}>{total ? `${Math.round((i.value / total) * 100)}%` : '—'}</Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.border },
  col: { flex: 1, maxWidth: 120, alignItems: 'center', gap: SPACING.xs },
  area: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', gap: 4, borderBottomWidth: 1, borderBottomColor: COLORS.borderStrong },
  bar: { width: '70%', borderTopLeftRadius: RADIUS.sm / 2, borderTopRightRadius: RADIUS.sm / 2 },
  label: { textAlign: 'center' },
  hole: { position: 'absolute', backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  legendRow: { alignItems: 'center', gap: SPACING.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
