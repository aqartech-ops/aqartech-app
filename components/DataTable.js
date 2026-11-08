import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { BREAKPOINTS } from '../services/config';
import { WEB_SKIN } from '../services/skin';
import { Txt } from './ui';

/** True when a list should show as a table: the web look on a screen wide enough. */
export function useTableLayout() {
  const { width } = useWindowDimensions();
  return WEB_SKIN && width >= BREAKPOINTS.tablet;
}

/**
 * Table for lists in the web look.
 *  columns: [{ key, label, flex = 1, width, align: 'start' | 'end', render(row) }]
 *  rows, rowKey(row), onRowPress(row) (optional)
 */
export default function DataTable({ columns, rows, rowKey = (r) => r.id, onRowPress }) {
  const { row: dir } = useI18n();
  const cell = (c) => [styles.cell, c.width ? { width: c.width } : { flex: c.flex ?? 1 }, c.align === 'end' && { alignItems: 'flex-end' }];

  return (
    <View style={styles.table}>
      <View style={[styles.head, { flexDirection: dir }]}>
        {columns.map((c) => (
          <View key={c.key} style={cell(c)}>
            <Txt size="small" weight="weightMedium" muted numberOfLines={1}>{c.label ?? ''}</Txt>
          </View>
        ))}
      </View>
      {rows.map((r, i) => (
        <Pressable
          key={rowKey(r)}
          onPress={onRowPress ? () => onRowPress(r) : undefined}
          disabled={!onRowPress}
          style={({ hovered, pressed }) => [styles.row, { flexDirection: dir }, i > 0 && styles.divider, (hovered || pressed) && onRowPress && { backgroundColor: COLORS.surfaceSoft }]}
        >
          {columns.map((c) => (
            <View key={c.key} style={cell(c)}>
              {c.render ? c.render(r) : <Txt numberOfLines={1}>{r[c.key] ?? '—'}</Txt>}
            </View>
          ))}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOWS.card },
  head: { backgroundColor: COLORS.surfaceSoft, borderBottomWidth: 1, borderBottomColor: COLORS.border, minHeight: 40, alignItems: 'center' },
  row: { minHeight: 56, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  cell: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, justifyContent: 'center', minWidth: 0 },
});
