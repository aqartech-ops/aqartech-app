import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { adminApi, plansApi } from '../services/api';
import { Badge, Card, ErrorBox, Row, STATUS_TONE, Screen, Txt } from '../components/ui';

export default function DashboardScreen({ onNavigate }) {
  const { isAdmin } = useSession();
  return isAdmin ? <AdminDashboard onNavigate={onNavigate} /> : <CompanyDashboard />;
}

function useColumns() {
  const { width } = useWindowDimensions();
  if (width >= BREAKPOINTS.desktop) return 4;
  if (width >= BREAKPOINTS.tablet) return 2;
  return 1;
}

function Grid({ columns, children }) {
  const { row } = useI18n();
  const items = React.Children.toArray(children);
  return (
    <View style={{ flexDirection: row, flexWrap: 'wrap', marginHorizontal: -SPACING.sm }}>
      {items.map((child, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: SPACING.sm }}>
          {child}
        </View>
      ))}
    </View>
  );
}

function Kpi({ icon, label, value, hint, tone = COLORS.primary }) {
  return (
    <Card style={{ gap: SPACING.sm, height: '100%' }}>
      <Row>
        <View style={[styles.kpiIcon, { backgroundColor: COLORS.primarySoft }]}>
          <MaterialCommunityIcons name={icon} size={20} color={tone} />
        </View>
        <Txt muted style={{ flex: 1 }}>{label}</Txt>
      </Row>
      <Txt size="large" weight="weightBold">{value}</Txt>
      {hint ? <Txt muted size="small">{hint}</Txt> : null}
    </Card>
  );
}

function CompanyDashboard() {
  const { t, lang, row } = useI18n();
  const { me, refresh } = useSession();
  const columns = useColumns();
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);
  const subscription = me.subscription;

  const load = useCallback(async () => {
    setError(null);
    try {
      await refresh();
      setUsage(await plansApi.usage());
    } catch (e) {
      setError(e);
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planName = subscription ? (lang === 'ar' ? subscription.plan.nameAr : subscription.plan.nameEn) : '—';

  return (
    <Screen title={t('dashboard.hello', { name: me.user.name })} subtitle={t('dashboard.overview')}>
      <ErrorBox error={error} onRetry={load} />

      {subscription && subscription.status !== 'ACTIVE' ? (
        <View style={[styles.banner, { flexDirection: row }, subscription.status === 'PENDING' ? styles.bannerWarn : styles.bannerDanger]}>
          <MaterialCommunityIcons
            name={subscription.status === 'PENDING' ? 'clock-outline' : 'alert-circle-outline'}
            size={22}
            color={subscription.status === 'PENDING' ? COLORS.warning : COLORS.danger}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="weightBold">
              {subscription.status === 'PENDING' ? t('plan.pendingTitle') : t('plan.inactiveTitle')}
            </Txt>
            <Txt>{subscription.status === 'PENDING' ? t('plan.pendingBody') : t('plan.inactiveBody')}</Txt>
          </View>
        </View>
      ) : null}

      <Grid columns={columns}>
        <Kpi icon="home-percent-outline" label={t('dashboard.occupancy')} value="—" hint={t('dashboard.kpiEmpty')} />
        <Kpi icon="cash-check" label={t('dashboard.collection')} value="—" hint={t('dashboard.kpiEmpty')} />
        <Kpi icon="chart-line" label={t('dashboard.noi')} value="—" hint={t('dashboard.kpiEmpty')} />
        <Kpi icon="alert-octagon-outline" label={t('dashboard.arrears')} value="—" hint={t('dashboard.kpiEmpty')} />
      </Grid>

      <View style={{ height: SPACING.md }} />

      <Card style={{ gap: SPACING.lg }}>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <View style={{ gap: 2 }}>
            <Txt muted size="small">{t('plan.yourPlan')}</Txt>
            <Txt size="medium" weight="weightBold">{planName}</Txt>
          </View>
          {subscription ? <Badge label={t(`plan.status.${subscription.status}`)} tone={STATUS_TONE[subscription.status]} /> : null}
        </Row>
        <Txt weight="weightMedium">{t('plan.usage')}</Txt>
        {['properties', 'units', 'users', 'owners'].map((key) => (
          <UsageBar key={key} label={t(`plan.limits.${key}`)} used={usage?.used?.[key] ?? 0} limit={usage?.limits?.[key]} />
        ))}
      </Card>
    </Screen>
  );
}

function UsageBar({ label, used, limit }) {
  const { t, row } = useI18n();
  const unlimited = limit === null || limit === undefined;
  const ratio = unlimited ? 0 : limit === 0 ? 1 : Math.min(1, used / limit);
  const color = ratio >= 1 ? COLORS.danger : ratio >= 0.8 ? COLORS.warning : COLORS.primary;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt>{label}</Txt>
        <Txt muted>{unlimited ? `${used} · ${t('common.unlimited')}` : `${used} ${t('common.of')} ${limit}`}</Txt>
      </Row>
      <View style={[styles.track, { flexDirection: row }]}>
        <View style={{ width: `${ratio * 100}%`, backgroundColor: color, borderRadius: RADIUS.pill }} />
      </View>
    </View>
  );
}

function AdminDashboard({ onNavigate }) {
  const { t } = useI18n();
  const columns = useColumns();
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.companies().then(setCompanies).catch(setError);
  }, []);
  useEffect(load, [load]);

  const count = (status) => (companies ?? []).filter((c) => c.subscription?.status === status).length;

  return (
    <Screen title={t('dashboard.adminHello')}>
      <ErrorBox error={error} onRetry={load} />
      <Grid columns={columns}>
        <Kpi icon="domain" label={t('companies.title')} value={companies ? companies.length : '—'} />
        <Kpi icon="check-decagram-outline" label={t('plan.status.ACTIVE')} value={companies ? count('ACTIVE') : '—'} tone={COLORS.success} />
        <Kpi icon="clock-outline" label={t('plan.status.PENDING')} value={companies ? count('PENDING') : '—'} tone={COLORS.warning} />
        <Kpi icon="pause-circle-outline" label={t('plan.status.SUSPENDED')} value={companies ? count('SUSPENDED') : '—'} tone={COLORS.danger} />
      </Grid>
      {count('PENDING') > 0 ? (
        <View style={{ marginTop: SPACING.md }}>
          <Card style={{ gap: SPACING.sm }}>
            <Txt weight="weightBold">{t('plan.status.PENDING')}: {count('PENDING')}</Txt>
            <Txt muted onPress={() => onNavigate?.('companies')} style={{ color: COLORS.primaryDark }}>
              {t('companies.title')}
            </Txt>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiIcon: { width: 36, height: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  banner: {
    gap: SPACING.md,
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    alignItems: 'flex-start',
  },
  bannerWarn: { backgroundColor: COLORS.warningSoft },
  bannerDanger: { backgroundColor: COLORS.dangerSoft },
  track: { height: 8, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSoft, overflow: 'hidden' },
});
