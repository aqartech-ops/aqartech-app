import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { confirm } from '../services/dialog';
import { Badge, Button, Card, EmptyState, ErrorBox, Loading, Row, STATUS_TONE, Screen, Txt } from '../components/ui';

// Platform team: list of subscribers and manual activation (until online payment, phase 8).
export default function CompaniesScreen() {
  const { t, lang } = useI18n();
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCompanies(await adminApi.companies());
    } catch (e) {
      setError(e);
      setCompanies([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (company, status) => {
    const ok = await confirm({
      title: status === 'ACTIVE' ? t('companies.activate') : t('companies.suspend'),
      message: t(status === 'ACTIVE' ? 'companies.activateConfirm' : 'companies.suspendConfirm', { name: company.name }),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      destructive: status !== 'ACTIVE',
    });
    if (!ok) return;
    setBusyId(company.id);
    try {
      await adminApi.updateSubscription(company.id, { status });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title={t('companies.title')}>
      <ErrorBox error={error} onRetry={load} />
      {companies === null ? (
        <Loading />
      ) : companies.length === 0 ? (
        <Card>
          <EmptyState icon="domain" body={t('companies.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {companies.map((company, index) => {
            const status = company.subscription?.status;
            const plan = company.subscription?.plan;
            return (
              <Row key={company.id} style={[styles.row, index > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 4, minWidth: 200 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightBold">{company.name}</Txt>
                    <Badge label={company.type === 'INDIVIDUAL' ? t('companies.individual') : t('companies.company')} />
                    {status ? <Badge label={t(`plan.status.${status}`)} tone={STATUS_TONE[status]} /> : null}
                  </Row>
                  <Txt muted size="small">
                    {[company.ownerName, company.email, company.phone].filter(Boolean).join(' · ')}
                  </Txt>
                  <Txt muted size="small">
                    {plan ? (lang === 'ar' ? plan.nameAr : plan.nameEn) : '—'} · {t('companies.usersCount', { count: company.users })} ·{' '}
                    {t('companies.since')} {new Date(company.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-OM' : 'en-GB')}
                  </Txt>
                </View>
                {status && status !== 'ACTIVE' ? (
                  <Button
                    small
                    icon="check-decagram-outline"
                    title={t('companies.activate')}
                    loading={busyId === company.id}
                    onPress={() => setStatus(company, 'ACTIVE')}
                  />
                ) : status === 'ACTIVE' ? (
                  <Button
                    small
                    variant="danger"
                    icon="pause-circle-outline"
                    title={t('companies.suspend')}
                    loading={busyId === company.id}
                    onPress={() => setStatus(company, 'SUSPENDED')}
                  />
                ) : null}
              </Row>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { padding: SPACING.lg, flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
