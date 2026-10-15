import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOWS, SPACING } from '../theme';
import { useI18n } from '../i18n';

// Preferred order of the side tabs; if a section is hidden for this user/plan the next one fills its place.
const PREFERRED = ['properties', 'financials', 'tenants', 'maintenance', 'documents', 'owners', 'users', 'companies', 'settings'];
const CENTER = 'dashboard';

/**
 * Floating bottom bar (phone & tablet app): two tabs · raised Home button · one tab · "More".
 * `items` = visible sections ({ key, icon }); `onMore` opens the full side menu.
 */
export default function BottomBar({ items, active, onSelect, onMore, bottomInset = 0 }) {
  const { t, isRTL } = useI18n();
  const keyboardOpen = useKeyboardOpen();

  const { left, right, center } = useMemo(() => {
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    const side = PREFERRED.filter((k) => byKey[k]).slice(0, 3).map((k) => byKey[k]);
    return { left: side.slice(0, 2), right: side.slice(2, 3), center: byKey[CENTER] };
  }, [items]);

  if (keyboardOpen) return null;

  const sideTab = (item) => {
    const selected = item.key === active;
    const color = selected ? COLORS.primaryDark : COLORS.textMuted;
    return (
      <Pressable
        key={item.key}
        onPress={() => onSelect(item.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={styles.tab}
        hitSlop={4}
      >
        <MaterialCommunityIcons name={item.icon} size={24} color={color} />
        <Text numberOfLines={1} style={[styles.tabLabel, { color }, selected && { fontWeight: FONT.weightBold }]}>
          {t(`tabs.${item.key}`)}
        </Text>
      </Pressable>
    );
  };

  const homeSelected = active === CENTER;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, SPACING.sm) }]} pointerEvents="box-none">
      <View style={[styles.bar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {left.map(sideTab)}

        {center ? (
          <Pressable
            onPress={() => onSelect(CENTER)}
            accessibilityRole="tab"
            accessibilityState={{ selected: homeSelected }}
            accessibilityLabel={t('tabs.dashboard')}
            style={styles.centerSlot}
          >
            <View style={[styles.centerButton, homeSelected && styles.centerButtonActive]}>
              <MaterialCommunityIcons name="home-variant" size={30} color={COLORS.onPrimary} />
            </View>
            <Text style={[styles.tabLabel, styles.centerLabel]}>{t('tabs.dashboard')}</Text>
          </Pressable>
        ) : null}

        {right.map(sideTab)}

        <Pressable onPress={onMore} accessibilityRole="button" style={styles.tab} hitSlop={4}>
          <MaterialCommunityIcons name="dots-grid" size={24} color={COLORS.textMuted} />
          <Text numberOfLines={1} style={[styles.tabLabel, { color: COLORS.textMuted }]}>{t('tabs.more')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

const CENTER_SIZE = 62;

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, backgroundColor: 'transparent' },
  bar: {
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    ...SHADOWS.floating,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, paddingVertical: 2, minHeight: 48 },
  tabLabel: { fontSize: FONT.small, textAlign: 'center' },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  centerButton: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    marginTop: -CENTER_SIZE / 2,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.background,
    ...SHADOWS.floating,
  },
  centerButtonActive: { backgroundColor: COLORS.primaryDark },
  centerLabel: { color: COLORS.primaryDark, fontWeight: FONT.weightBold },
});
