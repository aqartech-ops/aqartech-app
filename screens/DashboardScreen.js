import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { adminApi, dashboardApi } from '../services/api';
import { Badge, Button, Card, ErrorBox, Loading, Row, STATUS_TONE, Screen, Txt } from '../components/ui';
import { Money, SectionIcon } from '../components/Rial';

export default function DashboardScreen({ onNavigate }) {
  const { isAdmin } = useSession();
  return isAdmin ? <AdminDashboard onNavigate={onNavigate} /> : <CompanyDashboard onNavigate={onNavigate} />;
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
    <Card style={{ gap: SPACING.sm, flexGrow: 1 }}>
      <Row>
        <View style={[styles.kpiIcon, { backgroundColor: COLORS.primarySoft }]}>
          <SectionIcon name={icon} size={20} color={tone} />
        </View>
        <Txt muted style={{ flex: 1 }}>{label}</Txt>
      </Row>
      {React.isValidElement(value) ? value : <Txt size="large" weight="weightBold">{value}</Txt>}
      {hint ? <Txt muted size="small">{hint}</Txt> : null}
    </Card>
  );
}

/**
 * Every user gets the dashboard; each widget only appears when the server sent it,
 * i.e. when the user's role and plan allow that section.
 */
function CompanyDashboard({ onNavigate }) {
  const { t, lang, row } = useI18n();
  const { me, refresh } = useSession();
  const columns = useColumns();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const subscription = me.subscription;

  const load = useCallback(async () => {
    setError(null);
    try {
      await refresh();
      setData(await dashboardApi.get());
    } catch (e) {
      setError(e);
    }
  }, [refresh]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planName = subscription ? (lang === 'ar' ? subscription.plan.nameAr : subscription.plan.nameEn) : '—';
  const w = data?.widgets ?? {};
  const portfolio = w.portfolio;
  const quick = data?.quickActions ?? [];
  const pct = (r) => (r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`);

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

      {data === null && !error ? <Loading /> : null}

      {quick.length ? (
        <Row style={{ flexWrap: 'wrap', marginBottom: SPACING.md }}>
          {quick.includes('tenants') ? (
            <Button id="dashboard.newTenant" icon="account-plus-outline" title={t('dashboard.newTenant')} onPress={() => onNavigate?.('tenants', { create: true })} style={{ flexGrow: 1 }} />
          ) : null}
          {quick.includes('properties') ? (
            <Button id="dashboard.addProperty"
              variant="secondary"
              icon="home-plus-outline"
              title={t('properties.add')}
              onPress={() => onNavigate?.('properties', { create: true })}
              style={{ flexGrow: 1 }}
            />
          ) : null}
          {quick.includes('maintenance') ? (
            <Button id="dashboard.newWorkOrder"
              variant="secondary"
              icon="wrench-outline"
              title={t('maintenance.add')}
              onPress={() => onNavigate?.('maintenance', { create: true })}
              style={{ flexGrow: 1 }}
            />
          ) : null}
        </Row>
      ) : null}

      {portfolio ? (
        <Grid columns={columns}>
          <Kpi icon="office-building-outline" label={t('dashboard.properties')} value={portfolio.properties} />
          <Kpi icon="door" label={t('dashboard.units')} value={portfolio.total} />
          <Kpi icon="door-open" label={t('dashboard.vacant')} value={portfolio.vacant} tone={COLORS.warning} />
          <Kpi icon="home-percent-outline" label={t('dashboard.occupancy')} value={pct(portfolio.occupancyRate)} tone={COLORS.success} />
        </Grid>
      ) : null}

      {w.tenants ? (
        <Grid columns={columns}>
          <Kpi icon="account-group-outline" label={t('tenants.count')} value={w.tenants.count} />
          {w.tenants.leases ? <Kpi icon="file-sign" label={t('leases.activeCount')} value={w.tenants.leases.active} tone={COLORS.success} /> : null}
          {w.tenants.leases ? <Kpi icon="calendar-alert" label={t('leases.expiring30')} value={w.tenants.leases.expiring30} tone={COLORS.danger} /> : null}
          {w.tenants.leases ? <Kpi icon="calendar-clock" label={t('leases.expiring90')} value={w.tenants.leases.expiring90} tone={COLORS.warning} /> : null}
        </Grid>
      ) : null}

      {w.maintenance ? (
        <Grid columns={columns}>
          <Kpi icon="wrench-outline" label={t('maintenance.openCount')} value={String(w.maintenance.open)} />
          <Kpi icon="alert" label={t('maintenance.urgentCount')} value={String(w.maintenance.urgent)} tone={w.maintenance.urgent ? COLORS.danger : COLORS.primary} />
        </Grid>
      ) : null}

      {w.financials ? (
        <>
          <View style={{ height: SPACING.sm }} />
          <Grid columns={columns}>
            <Kpi icon="rial" label={t('finance.rentIncomeMonth')} value={<Money baisa={w.financials.rentIncomeMonth} size={FONT.title} weight="weightBold" />} />
            <Kpi
              icon="cash-check"
              label={t('dashboard.collection')}
              tone={COLORS.success}
              value={w.financials.collectionRate === null || w.financials.collectionRate === undefined ? '—' : `${w.financials.collectionRate}%`}
              hint={t('finance.collectedOfMonth')}
            />
            <Kpi icon="cash-clock" label={t('finance.receivable')} value={<Money baisa={w.financials.receivable} size={FONT.title} weight="weightBold" />} />
            <Kpi
              icon="alert-octagon-outline"
              label={t('dashboard.arrears')}
              tone={COLORS.danger}
              value={<Money baisa={w.financials.overdue} size={FONT.title} weight="weightBold" color={w.financials.overdue ? COLORS.danger : COLORS.textDark} />}
            />
            {w.financials.municipality ? (
              <Kpi
                icon="file-certificate-outline"
                label={t('municipality.unregisteredKpi')}
                tone={w.financials.municipality.unregistered ? COLORS.danger : COLORS.primary}
                value={String(w.financials.municipality.unregistered)}
              />
            ) : null}
            {w.financials.chequesToDeposit ? (
              <Kpi
                icon="checkbook"
                label={t('cheques.stats.toDeposit')}
                tone={w.financials.chequesToDeposit.count ? COLORS.warning : COLORS.primary}
                value={String(w.financials.chequesToDeposit.count)}
              />
            ) : null}
            <Kpi
              icon="chart-line"
              label={t('finance.noiMonth')}
              value={<Money baisa={w.financials.noiMonth} size={FONT.title} weight="weightBold" color={w.financials.noiMonth < 0 ? COLORS.danger : COLORS.textDark} />}
            />
          </Grid>
        </>
      ) : null}

      {w.planUsage ? (
        <>
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
              <UsageBar key={key} label={t(`plan.limits.${key}`)} used={w.planUsage.used?.[key] ?? 0} limit={w.planUsage.limits?.[key]} />
            ))}
          </Card>
        </>
      ) : null}
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
