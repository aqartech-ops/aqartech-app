import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { WEB_SKIN } from '../services/skin';
import { LANGUAGES, useI18n } from '../i18n';
import { useSession } from '../services/session';
import DraftBanner, { DRAFT_PAGES } from './DraftBanner';
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
  const { t, row } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const fixedSidebar = !IS_APP && width >= BREAKPOINTS.desktop;

  const go = (key) => {
    onNavigate(key);
    setMenuOpen(false);
  };

  const title = useMemo(() => items.find((i) => i.key === active)?.label ?? '', [items, active]);
  const { isAdmin } = useSession();
  // Platform team, on a page whose changes wait for "Publish": a reminder above the page.
  const banner = isAdmin && DRAFT_PAGES.includes(active) && items.some((i) => i.key === 'publish') ? <DraftBanner onOpen={() => go('publish')} /> : null;

  // Web: the browser tab shows the current section ("Tenants · AqarTech")
  useEffect(() => {
    if (!IS_APP && typeof document !== 'undefined') document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  }, [title, t]);

  // Web look (Ivory & Emerald): a white navigation bar along the top on wide screens. Same items, same navigation.
  if (WEB_SKIN && fixedSidebar) {
    return (
      <View style={styles.root}>
        <WebHeader items={items} active={active} onSelect={go} onSearch={() => setSearchOpen(true)} />
        <View style={{ flex: 1 }}>
          {banner}
          {children}
        </View>
        <SearchModal visible={searchOpen} onClose={() => setSearchOpen(false)} items={items} onNavigate={onNavigate} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={IS_APP ? ['top'] : ['top', 'bottom']}>
      <View style={[styles.body, { flexDirection: row }]}>
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
          <View style={{ flex: 1 }}>
            {banner}
            {children}
          </View>
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
        <View style={[styles.drawerLayer, { flexDirection: row }]}>
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
        <MaterialCommunityIcons name="home-city-outline" size={compact ? 16 : 20} color={COLORS.accentSoft} />
      </View>
      {!compact ? <Txt display size="medium" weight="weightBold" style={{ color: COLORS.primary }}>{t('app.name')}</Txt> : null}
    </Row>
  );
}

// ------------------------------------------------------------------ web look: top navigation bar

// Rough width of a tab, to decide how many fit (Arabic and Latin at 14px, plus the tab's padding).
const tabWidth = (label) => Math.round(String(label).length * 7.6) + 2 * SPACING.md + 4;

/**
 * Logo, the sections as tabs, search, language, the person. Fits any width: on smaller screens the person
 * shows only the avatar, and the sections that do not fit go into a "More" menu (the open section stays visible).
 */
function WebHeader({ items, active, onSelect, onSearch }) {
  const { t, row, lang, setLang, isRTL } = useI18n();
  const { me, signOut } = useSession();
  const { width } = useWindowDimensions();
  const [moreOpen, setMoreOpen] = useState(false);
  const other = LANGUAGES.find((l) => l.code !== lang);
  const displayName = me?.kind === 'admin' ? me.admin.name : me?.user?.name;
  const subtitle = me?.kind === 'admin' ? t('auth.adminSignInTitle') : me?.company?.name;
  const initials = (displayName ?? '?').trim().slice(0, 1).toUpperCase();

  const compact = width < 1500; // avatar only, smaller gaps
  const pad = width >= 1800 ? 48 : compact ? SPACING.xl : SPACING.xxl;
  const logoW = 46 + SPACING.sm + Math.round(String(t('app.name')).length * 13);
  const toolsW = 44 + (other ? 72 : 0) + (compact ? 92 : 300) + 2 * SPACING.sm;
  const moreW = 112;
  const available = width - 2 * pad - logoW - toolsW - 2 * SPACING.xl;

  // the tabs that fit, in order; the open one is always among them
  const { shown, hidden } = useMemo(() => {
    const total = items.reduce((sum, i) => sum + tabWidth(i.label) + 4, 0);
    if (total <= available) return { shown: items, hidden: [] };
    const room = available - moreW;
    const out = [];
    let used = 0;
    for (const item of items) {
      const w = tabWidth(item.label) + 4;
      if (used + w > room) break;
      out.push(item);
      used += w;
    }
    const activeItem = items.find((i) => i.key === active);
    if (activeItem && !out.includes(activeItem)) {
      while (out.length && used + tabWidth(activeItem.label) + 4 > room) used -= tabWidth(out.pop().label) + 4;
      out.push(activeItem);
    }
    return { shown: out, hidden: items.filter((i) => !out.includes(i)) };
  }, [items, active, available]);

  const tab = (item) => {
    const selected = item.key === active;
    return (
      <Pressable
        key={item.key}
        onPress={() => onSelect(item.key)}
        accessibilityRole="link"
        accessibilityState={{ selected }}
        style={({ hovered }) => [web.tab, selected ? web.tabActive : hovered && web.tabHover]}
      >
        <Txt numberOfLines={1} style={[web.tabText, selected && web.tabTextActive]}>{item.label}</Txt>
      </Pressable>
    );
  };

  return (
    <View style={[web.header, { flexDirection: row, paddingHorizontal: pad, gap: compact ? SPACING.lg : SPACING.xl }]}>
      <Row gap={SPACING.sm} style={{ flexShrink: 0 }}>
        <View style={web.logo}>
          <MaterialCommunityIcons name="home-city-outline" size={22} color={COLORS.accentSoft} />
        </View>
        <Txt display size={22} weight="weightBold" style={{ color: COLORS.primary }}>{t('app.name')}</Txt>
      </Row>

      <View style={[web.tabs, { flexDirection: row, flex: 1 }]}>
        {shown.map(tab)}
        {hidden.length ? (
          <View style={{ position: 'relative', zIndex: 20 }}>
            <Pressable
              onPress={() => setMoreOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: moreOpen }}
              style={({ hovered }) => [web.tab, { flexDirection: row, alignItems: 'center', gap: 4 }, (moreOpen || hovered) && web.tabHover]}
            >
              <Txt style={web.tabText}>{t('tabs.more')}</Txt>
              <MaterialCommunityIcons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
            </Pressable>
            {moreOpen ? (
              <View style={[web.menu, isRTL ? { right: 0 } : { left: 0 }]}>
                {hidden.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => {
                      setMoreOpen(false);
                      onSelect(item.key);
                    }}
                    accessibilityRole="link"
                    style={({ hovered }) => [web.menuItem, { flexDirection: row }, hovered && { backgroundColor: COLORS.background }]}
                  >
                    <SectionIcon name={item.icon} size={18} color={COLORS.textMuted} />
                    <Txt numberOfLines={1} style={{ flex: 1 }}>{item.label}</Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <Row gap={SPACING.sm} style={{ flexShrink: 0 }}>
        <Pressable onPress={onSearch} accessibilityRole="search" accessibilityLabel={t('search.title')} style={({ hovered }) => [web.square, hovered && web.squareHover]}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.textDark} />
        </Pressable>
        {other ? (
          <Pressable onPress={() => setLang(other.code)} style={({ hovered }) => [web.square, { width: undefined, paddingHorizontal: SPACING.md }, hovered && web.squareHover]}>
            <Txt weight="weightMedium" size="small">{other.label}</Txt>
          </Pressable>
        ) : null}
        <View style={[web.person, { flexDirection: row }]}>
          <View style={web.avatar} accessibilityLabel={displayName}>
            <Txt weight="weightBold" style={{ color: COLORS.onPrimary }}>{initials}</Txt>
          </View>
          {!compact ? (
            <View style={{ maxWidth: 170 }}>
              <Txt weight="weightMedium" size="small" numberOfLines={1}>{displayName}</Txt>
              {subtitle ? <Txt muted size={11} numberOfLines={1}>{subtitle}</Txt> : null}
            </View>
          ) : null}
          <IconButton icon="logout" size={18} color={COLORS.textMuted} label={t('auth.signOut')} onPress={signOut} />
        </View>
      </Row>
    </View>
  );
}

const web = StyleSheet.create({
  header: {
    height: 76,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logo: { width: 42, height: 42, borderRadius: RADIUS.md, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  tabs: { alignItems: 'center', gap: 4 },
  tab: { paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: RADIUS.sm },
  tabHover: { backgroundColor: COLORS.background },
  tabActive: { backgroundColor: COLORS.primarySoft },
  tabText: { fontSize: FONT.body, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: FONT.weightBold },
  square: { width: 44, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  squareHover: { borderColor: COLORS.borderStrong, backgroundColor: COLORS.background },
  person: { alignItems: 'center', gap: SPACING.sm, paddingVertical: 5, paddingHorizontal: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  menu: {
    position: 'absolute',
    top: 48,
    minWidth: 240,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    boxShadow: '0px 12px 32px rgba(10, 51, 41, 0.14)',
  },
  menuItem: { alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2 },
});

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
