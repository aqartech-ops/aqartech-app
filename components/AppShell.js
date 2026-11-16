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

// Rough width of a text at 14px (Arabic and Latin), to decide how compact the bar must be.
const textWidth = (label) => Math.round(String(label).length * 8); // a little generous, so the bar never overflows

/**
 * Logo, every section as a tab, search, language, the person with their name — always on ONE row.
 * On narrower screens it tightens step by step until everything fits:
 *   1. smaller spacing between tabs   2. the sections' short names ("الفريق" for "المستخدمون والأدوار")
 *   3. the company name under the person's name and the app name next to the logo are dropped
 *   4. (very narrow) tabs show their icon, the open one keeps its name.
 */
function WebHeader({ items, active, onSelect, onSearch }) {
  const { t, row, lang, setLang } = useI18n();
  const { me, signOut } = useSession();
  const { width } = useWindowDimensions();
  const other = LANGUAGES.find((l) => l.code !== lang);
  const displayName = me?.kind === 'admin' ? me.admin.name : me?.user?.name;
  const subtitle = me?.kind === 'admin' ? t('auth.adminSignInTitle') : me?.company?.name;
  const initials = (displayName ?? '?').trim().slice(0, 1).toUpperCase();

  const short = (item) => item.tabLabel ?? (t(`tabs.${item.key}`) !== `tabs.${item.key}` ? t(`tabs.${item.key}`) : item.label);
  const nameW = Math.min(170, Math.max(textWidth(displayName ?? ''), subtitle ? textWidth(subtitle) * 0.8 : 0));

  // the most comfortable level that fits on one row
  const level = useMemo(() => {
    const pad = width >= 1800 ? 48 : SPACING.xl;
    const tools = (withCompany) => 44 + (other ? 72 : 0) + 34 + (withCompany ? nameW : Math.min(nameW, 130)) + 30 + 20 + 3 * SPACING.sm;
    const logo = (withName) => 42 + (withName ? SPACING.sm + Math.round(String(t('app.name')).length * 13) : 0);
    const tabs = (labelOf, tabPad) => items.reduce((sum, i) => sum + textWidth(labelOf(i)) + 2 * tabPad + 4, 0);
    const fits = (l) => {
      const used = 2 * pad + 2 * SPACING.lg + logo(l.logoName) + tools(l.company);
      if (l.icons) {
        const activeItem = items.find((i) => i.key === active);
        return used + items.length * 44 + (activeItem ? textWidth(short(activeItem)) + 8 : 0) <= width;
      }
      return used + tabs(l.labels === 'short' ? short : (i) => i.label, l.tabPad) <= width;
    };
    const levels = [
      { pad, tabPad: SPACING.md, labels: 'full', company: true, logoName: true },
      { pad, tabPad: SPACING.sm, labels: 'full', company: true, logoName: true },
      { pad, tabPad: SPACING.sm, labels: 'short', company: true, logoName: true },
      { pad, tabPad: SPACING.sm, labels: 'short', company: false, logoName: false },
      { pad, tabPad: SPACING.sm, labels: 'short', company: false, logoName: false, icons: true },
    ];
    return levels.find(fits) ?? levels[levels.length - 1];
  }, [width, items, active, other, nameW, t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[web.header, { flexDirection: row, paddingHorizontal: level.pad, gap: SPACING.lg }]}>
      <Row gap={SPACING.sm} style={{ flexShrink: 0 }}>
        <View style={web.logo}>
          <MaterialCommunityIcons name="home-city-outline" size={22} color={COLORS.accentSoft} />
        </View>
        {level.logoName ? <Txt display size={22} weight="weightBold" style={{ color: COLORS.primary }}>{t('app.name')}</Txt> : null}
      </Row>

      <View style={[web.tabs, { flexDirection: row, flex: 1, minWidth: 0, overflow: 'hidden' }]}>
        {items.map((item) => {
          const selected = item.key === active;
          const label = level.labels === 'short' ? short(item) : item.label;
          const iconOnly = level.icons && !selected;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              accessibilityRole="link"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              style={({ hovered }) => [web.tab, { paddingHorizontal: iconOnly ? 10 : level.tabPad, flexDirection: row }, selected ? web.tabActive : hovered && web.tabHover]}
            >
              {level.icons ? <SectionIcon name={item.icon} size={20} color={selected ? COLORS.primary : COLORS.textMuted} /> : null}
              {!iconOnly ? <Txt numberOfLines={1} style={[web.tabText, selected && web.tabTextActive]}>{label}</Txt> : null}
            </Pressable>
          );
        })}
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
          <View style={web.avatar}>
            <Txt weight="weightBold" style={{ color: COLORS.onPrimary }}>{initials}</Txt>
          </View>
          <View style={{ maxWidth: level.company ? 170 : 130 }}>
            <Txt weight="weightMedium" size="small" numberOfLines={1}>{displayName}</Txt>
            {subtitle && level.company ? <Txt muted size={11} numberOfLines={1}>{subtitle}</Txt> : null}
          </View>
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
  tab: { paddingVertical: 10, borderRadius: RADIUS.sm, alignItems: 'center', gap: 6 },
  tabHover: { backgroundColor: COLORS.background },
  tabActive: { backgroundColor: COLORS.primarySoft },
  tabText: { fontSize: FONT.body, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: FONT.weightBold },
  square: { width: 44, height: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  squareHover: { borderColor: COLORS.borderStrong, backgroundColor: COLORS.background },
  person: { alignItems: 'center', gap: SPACING.sm, paddingVertical: 5, paddingHorizontal: 6, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.border },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
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
