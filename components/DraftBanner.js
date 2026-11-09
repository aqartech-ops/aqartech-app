import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi, onConfigChange } from '../services/api';
import { Txt } from './ui';

/** Admin pages whose changes wait in the draft until they are published. */
export const DRAFT_PAGES = ['fields', 'sections', 'buttons', 'templates', 'metrics'];

/** Count of unpublished changes, refreshed after every change of the draft. */
export function useDraftCount(enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () =>
      adminApi
        .configStatus()
        .then((s) => alive && setCount(s.changes.length))
        .catch(() => {});
    load();
    const off = onConfigChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);
  return count;
}

/** "N changes not published yet — subscribers still see the published version." */
export default function DraftBanner({ onOpen }) {
  const { t, row } = useI18n();
  const count = useDraftCount();
  if (!count) return null;
  return (
    <Pressable onPress={onOpen} style={({ hovered }) => [styles.banner, { flexDirection: row }, hovered && { opacity: 0.9 }]} accessibilityRole="button">
      <MaterialCommunityIcons name="file-clock-outline" size={20} color={COLORS.warning} />
      <View style={{ flex: 1 }}>
        <Txt weight="weightMedium">{t('publish.bannerTitle', { count })}</Txt>
        <Txt muted size="small">{t('publish.bannerHint')}</Txt>
      </View>
      <Txt weight="weightMedium" style={{ color: COLORS.primaryDark }}>{t('publish.review')}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    gap: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.surface,
  },
});
