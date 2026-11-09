import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOWS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { plansApi } from '../services/api';
import { Money } from '../components/Rial';
import { Badge, Button, Txt } from '../components/ui';

// Web home page (before signing in): what AqarTech does, the plans (from the plans the platform team manages —
// nothing hard-coded), then "Create an account" / "Sign in". Same app, same system: it opens the sign-in pages.

const FEATURES = [
  ['home-city-outline', 'properties'],
  ['file-sign', 'leases'],
  ['cash-multiple', 'collections'],
  ['account-tie-outline', 'owners'],
  ['wrench-outline', 'maintenance'],
  ['chart-box-outline', 'reports'],
];

const OMAN = ['currency', 'language', 'municipality', 'devices'];

export default function LandingScreen({ onStart }) {
  const { t, lang, setLang, row } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.desktop;
  const [plans, setPlans] = useState(null);

  useEffect(() => {
    plansApi
      .list()
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);

  const name = (p) => (lang === 'ar' ? p.nameAr : p.nameEn);
  const desc = (p) => (lang === 'ar' ? p.descriptionAr : p.descriptionEn);
  const limitsText = (p) =>
    Object.entries(p.limits ?? {})
      .map(([key, max]) => `${t(`plan.limits.${key}`)}: ${max === null ? t('common.unlimited') : max}`)
      .join(' · ');

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ flexGrow: 1 }}>
      {/* top bar */}
      <View style={styles.bar}>
        <View style={[styles.inner, styles.barInner, { flexDirection: row }]}>
          <View style={[styles.brand, { flexDirection: row }]}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="home-city" size={20} color={COLORS.onPrimary} />
            </View>
            <Txt size="medium" weight="weightBold">{t('app.name')}</Txt>
          </View>
          <View style={[styles.brand, { flexDirection: row }]}>
            <Button small variant="ghost" icon="translate" title={lang === 'ar' ? 'English' : 'العربية'} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
            <Button small variant="secondary" title={t('auth.signIn')} onPress={() => onStart('login')} />
          </View>
        </View>
      </View>

      {/* hero */}
      <View style={styles.hero}>
        <View style={[styles.inner, { gap: SPACING.lg, alignItems: 'center', paddingVertical: wide ? 88 : 48 }]}>
          <Badge label={t('landing.badge')} tone="info" />
          <Txt weight="weightBold" style={[styles.heroTitle, { fontSize: wide ? 44 : 30, lineHeight: wide ? 56 : 40 }]}>{t('landing.title')}</Txt>
          <Txt style={styles.heroText}>{t('landing.subtitle')}</Txt>
          <View style={[styles.ctaRow, { flexDirection: row }]}>
            <Button icon="rocket-launch-outline" title={t('landing.start')} onPress={() => onStart('register')} />
            <Button variant="secondary" title={t('auth.signIn')} onPress={() => onStart('login')} />
          </View>
        </View>
      </View>

      {/* features */}
      <View style={[styles.inner, styles.section]}>
        <Txt size="large" weight="weightBold" style={styles.center}>{t('landing.featuresTitle')}</Txt>
        <View style={[styles.grid, { flexDirection: row }]}>
          {FEATURES.map(([icon, key]) => (
            <View key={key} style={[styles.card, { flexBasis: wide ? '31%' : '100%' }]}>
              <View style={styles.iconBox}>
                <MaterialCommunityIcons name={icon} size={22} color={COLORS.primaryDark} />
              </View>
              <Txt weight="weightBold">{t(`landing.features.${key}.title`)}</Txt>
              <Txt muted>{t(`landing.features.${key}.body`)}</Txt>
            </View>
          ))}
        </View>
      </View>

      {/* made for Oman */}
      <View style={styles.band}>
        <View style={[styles.inner, styles.section]}>
          <Txt size="large" weight="weightBold" style={styles.center}>{t('landing.omanTitle')}</Txt>
          <View style={[styles.grid, { flexDirection: row }]}>
            {OMAN.map((key) => (
              <View key={key} style={[styles.point, { flexBasis: wide ? '23%' : '100%', flexDirection: row }]}>
                <MaterialCommunityIcons name="check-circle" size={20} color={COLORS.primary} />
                <Txt style={{ flex: 1 }}>{t(`landing.oman.${key}`)}</Txt>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* plans */}
      {plans && plans.length ? (
        <View style={[styles.inner, styles.section]}>
          <Txt size="large" weight="weightBold" style={styles.center}>{t('landing.plansTitle')}</Txt>
          <View style={[styles.grid, { flexDirection: row }]}>
            {plans.map((p) => (
              <View key={p.id} style={[styles.card, styles.plan, { flexBasis: wide ? `${Math.max(22, Math.floor(96 / plans.length))}%` : '100%' }]}>
                <Txt size="medium" weight="weightBold">{name(p)}</Txt>
                {desc(p) ? <Txt muted>{desc(p)}</Txt> : null}
                <View style={{ gap: 4 }}>
                  {p.priceMonthly ? (
                    <View style={[styles.price, { flexDirection: row }]}>
                      <Money baisa={p.priceMonthly} size={22} weight="weightBold" />
                      <Txt muted>{t('landing.perMonth')}</Txt>
                    </View>
                  ) : null}
                  {p.priceYearly ? (
                    <View style={[styles.price, { flexDirection: row }]}>
                      <Money baisa={p.priceYearly} size={15} weight="weightMedium" />
                      <Txt muted>{t('landing.perYear')}</Txt>
                    </View>
                  ) : null}
                  {!p.priceMonthly && !p.priceYearly ? <Txt weight="weightBold" style={{ fontSize: 22 }}>{t('landing.free')}</Txt> : null}
                </View>
                <Txt muted size="small">{limitsText(p)}</Txt>
                <Button variant="secondary" title={t('landing.choose')} onPress={() => onStart('register')} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* final call */}
      <View style={styles.hero}>
        <View style={[styles.inner, { gap: SPACING.md, alignItems: 'center', paddingVertical: 56 }]}>
          <Txt size="large" weight="weightBold" style={styles.center}>{t('landing.ctaTitle')}</Txt>
          <Txt muted style={styles.center}>{t('landing.ctaBody')}</Txt>
          <Button icon="rocket-launch-outline" title={t('landing.start')} onPress={() => onStart('register')} />
        </View>
      </View>

      <View style={[styles.inner, styles.footer, { flexDirection: row }]}>
        <Txt muted size="small">{`© ${new Date().getFullYear()} ${t('app.name')}`}</Txt>
        <Pressable onPress={() => onStart('admin')} accessibilityRole="link">
          <Txt muted size="small">{t('auth.adminSignIn')}</Txt>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  inner: { width: '100%', maxWidth: 1160, alignSelf: 'center', paddingHorizontal: SPACING.lg },
  bar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  barInner: { height: 64, alignItems: 'center', justifyContent: 'space-between' },
  brand: { alignItems: 'center', gap: SPACING.sm },
  logo: { width: 32, height: 32, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: COLORS.primarySoft },
  heroTitle: { textAlign: 'center', maxWidth: 820, color: COLORS.textDark },
  heroText: { textAlign: 'center', maxWidth: 680, fontSize: FONT.medium, color: COLORS.textMuted, lineHeight: 28 },
  ctaRow: { gap: SPACING.md, flexWrap: 'wrap', justifyContent: 'center' },
  section: { paddingVertical: 56, gap: SPACING.xl },
  center: { textAlign: 'center' },
  grid: { flexWrap: 'wrap', gap: SPACING.lg, justifyContent: 'center' },
  card: { flexGrow: 1, gap: SPACING.sm, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  plan: { gap: SPACING.md, maxWidth: 360 },
  iconBox: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primarySoft },
  band: { backgroundColor: COLORS.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  point: { flexGrow: 1, gap: SPACING.sm, alignItems: 'flex-start' },
  price: { alignItems: 'center', gap: SPACING.xs },
  footer: { paddingVertical: SPACING.lg, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: SPACING.md },
});
