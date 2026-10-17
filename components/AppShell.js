import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { IconButton, Row, Txt } from './ui';
import BottomBar from './BottomBar';
import { SectionIcon } from './Rial';
import SearchModal from './SearchModal';

const IS_APP = Platform.OS !== 'web';

/**
 * Frame around every screen.
 *   App (phone & tablet): top bar (menu · title · search) + side menu + floating bottom bar.
 *   Web: fixed sidebar on wide screens, top bar + side menu on narrow ones (web layout gets its own pass later).
 * `items` = [{ key, icon, label }] already filtered by permissions.
 */
export default function AppShell({ items, active, onNavigate, children }) {
  const { width } = useWindowDimensions();
  const { t, isRTL } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const fixedSidebar = !IS_APP && width >= BREAKPOINTS.desktop;

  const go = (key) => {
    onNavigate(key);
    setMenuOpen(false);
  };

  const title = useMemo(() => items.find((i) => i.key === active)?.label ?? '', [items, active]);

  return (
    <SafeAreaView style={styles.root} edges={IS_APP ? ['top'] : ['top', 'bottom']}>
      <View style={[styles.body, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {fixedSidebar ? (
          <View style={{ width: 260 }}>
            <Sidebar items={items} active={active} onSelect={go} onSearch={() => setSearchOpen(true)} />
          </View>
        ) : null}

        <View style={{ flex: 1 }}>
          {!fixedSidebar ? (
            <Row style={styles.topBar}>
              <IconButton icon="menu" size={26} label={t('common.menu')} onPress={() => setMenuOpen(true)} style={{ padding: 10 }} />
              <Txt size="medium" weight="weightBold" style={{ flex: 1 }} numberOfLines={1}>{title}</Txt>
              <IconButton icon="magnify" size={26} label={t('search.title')} onPress={() => setSearchOpen(true)} style={{ padding: 10 }} />
              <Brand compact />
            </Row>
          ) : null}
          <View style={{ flex: 1 }}>{children}</View>
          {IS_APP ? (
            <BottomBar
              items={items}
              active={active}
              onSelect={go}
              onMore={() => setMenuOpen(true)}
              bottomInset={insets.bottom}
            />
          ) : null}
        </View>
      </View>

      {/* Side menu: a Modal always renders above everything and receives touches on every platform. */}
      <Modal
        visible={!fixedSidebar && menuOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={[styles.drawerLayer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.drawer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <Sidebar
              items={items}
              active={active}
              onSelect={go}
              onSearch={() => {
                setMenuOpen(false);
                setSearchOpen(true);
              }}
            />
          </View>
          <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} accessibilityLabel={t('common.close')} />
        </View>
      </Modal>

      <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} items={items} onNavigate={onNavigate} />
    </SafeAreaView>
  );
}

function Brand({ compact }) {
  const { t } = useI18n();
  return (
    <Row gap={SPACING.sm}>
      <View style={styles.logo}>
        <MaterialCommunityIcons name="home-city" size={compact ? 16 : 20} color={COLORS.onPrimary} />
      </View>
      {!compact ? <Txt size="medium" weight="weightBold">{t('app.name')}</Txt> : null}
    </Row>
  );
}

function Sidebar({ items, active, onSelect, onSearch }) {
  const { t, row, lang, setLang } = useI18n();
  const { me, signOut } = useSession();
  const displayName = me?.kind === 'admin' ? me.admin.name : me?.user?.name;
  const subtitle = me?.kind === 'admin' ? t('auth.adminSignInTitle') : me?.company?.name;

  return (
    <View style={styles.sidebar}>
      <View style={{ padding: SPACING.lg, gap: SPACING.md }}>
        <Brand />
        <Pressable onPress={onSearch} style={[styles.searchButton, { flexDirection: row }]} accessibilityRole="search">
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textMuted} />
          <Txt muted>{t('search.placeholder')}</Txt>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SPACING.sm, gap: 2 }}>
        {items.map((item) => {
          const selected = item.key === active;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.navItem,
                { flexDirection: row },
                selected && styles.navItemActive,
                pressed && !selected && { backgroundColor: COLORS.surfaceSoft },
              ]}
            >
              <SectionIcon
                name={item.icon}
                size={20}
                color={selected ? COLORS.primaryDark : COLORS.textMuted}
              />
              <Txt style={[styles.navText, selected && { color: COLORS.primaryDark, fontWeight: FONT.weightBold }]}>
                {item.label}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sidebarFooter}>
        <Pressable onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} style={[styles.navItem, { flexDirection: row }]}>
          <MaterialCommunityIcons name="translate" size={20} color={COLORS.textMuted} />
          <Txt style={styles.navText}>{lang === 'ar' ? 'English' : 'العربية'}</Txt>
        </Pressable>
        <View style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 2 }}>
          <Txt weight="weightMedium" numberOfLines={1}>{displayName}</Txt>
          {subtitle ? <Txt muted size="small" numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        <Pressable onPress={signOut} style={[styles.navItem, { flexDirection: row }]}>
          <MaterialCommunityIcons name="logout" size={20} color={COLORS.danger} />
          <Txt style={[styles.navText, { color: COLORS.danger }]}>{t('auth.signOut')}</Txt>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  body: { flex: 1 },
  topBar: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sidebar: {
    width: '100%',
    minWidth: 240,
    height: '100%',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderEndWidth: 1,
  },
  navItem: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  navItemActive: { backgroundColor: COLORS.primarySoft },
  navText: { color: COLORS.textDark, fontSize: FONT.body },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: SPACING.sm, gap: 2 },
  logo: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButton: {
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  drawerLayer: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: COLORS.overlay },
  drawer: { width: 280, maxWidth: '85%', backgroundColor: COLORS.surface },
});
