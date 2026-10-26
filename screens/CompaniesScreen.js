import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { confirm } from '../services/dialog';
import { DateField, dateText, isDateText } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Loading, Row, STATUS_TONE, Screen, Segmented, Sheet, Txt } from '../components/ui';

// Platform team: list of subscribers and manual activation (until online payment, phase 8).
export default function CompaniesScreen() {
  const { t, lang, forwardIcon } = useI18n();
  const [companies, setCompanies] = useState(null);
  const [selected, setSelected] = useState(null);
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
                <Pressable style={{ flex: 1, gap: 4, minWidth: 200 }} onPress={() => setSelected(company)}>
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
                  <Row gap={4}>
                    <Txt size="small" weight="weightMedium" style={{ color: COLORS.primaryDark }}>{t('companies.manage')}</Txt>
                    <MaterialCommunityIcons name={forwardIcon} size={16} color={COLORS.primaryDark} />
                  </Row>
                </Pressable>
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
      <SubscriptionSheet
        company={selected}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          load();
        }}
      />
    </Screen>
  );
}

/** Change a subscriber's plan, billing cycle and end date; warns when current usage exceeds the new plan's limits. */
function SubscriptionSheet({ company, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const [plans, setPlans] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!company) return;
    const sub = company.subscription ?? {};
    setForm({ planId: sub.planId ?? sub.plan?.id ?? null, billingCycle: sub.billingCycle ?? 'MONTHLY', endDate: dateText(sub.endDate) });
    setError(null);
    setBusy(false);
    adminApi.plans().then(setPlans).catch((e) => {
      setError(e);
      setPlans([]);
    });
  }, [company]);

  if (!company || !form) return null;
  const plan = plans?.find((p) => p.id === form.planId);
  const over = plan
    ? Object.entries(plan.limits ?? {}).filter(([key, max]) => max !== null && (company.used?.[key] ?? 0) > max)
    : [];
  const wrongAudience = plan && plan.audience !== 'ANY' && plan.audience !== company.type;

  const save = async () => {
    if (form.endDate && !isDateText(form.endDate)) return setError({ code: 'validation.date' });
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateSubscription(company.id, { planId: form.planId, billingCycle: form.billingCycle, endDate: form.endDate || null });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={company.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.planId} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Txt muted size="small">
        {Object.entries(company.used ?? {})
          .map(([key, n]) => `${t(`plan.limits.${key}`)}: ${n}`)
          .join(' · ')}
      </Txt>
      <Txt weight="weightBold">{t('companies.plan')}</Txt>
      {plans === null ? (
        <Loading />
      ) : (
        <ChipSelect
          value={form.planId}
          onChange={(planId) => setForm((f) => ({ ...f, planId }))}
          options={plans.map((p) => ({ value: p.id, label: `${lang === 'ar' ? p.nameAr : p.nameEn}${p.isActive ? '' : ` (${t('common.inactive')})`}` }))}
        />
      )}
      {plan ? (
        <Txt size="small" muted>
          {Object.entries(plan.limits ?? {})
            .map(([key, max]) => `${t(`plan.limits.${key}`)}: ${max === null ? t('common.unlimited') : max}`)
            .join(' · ')}
        </Txt>
      ) : null}
      {over.length ? (
        <View style={styles.warning}>
          <Txt size="small" style={{ color: COLORS.warning }}>
            {t('companies.overLimit', { items: over.map(([key, max]) => `${t(`plan.limits.${key}`)} ${company.used[key]}/${max}`).join('، ') })}
          </Txt>
        </View>
      ) : null}
      {wrongAudience ? (
        <View style={styles.warning}>
          <Txt size="small" style={{ color: COLORS.warning }}>{t('companies.audienceMismatch')}</Txt>
        </View>
      ) : null}
      <Txt weight="weightMedium" size="small">{t('companies.billingCycle')}</Txt>
      <Segmented
        value={form.billingCycle}
        onChange={(billingCycle) => setForm((f) => ({ ...f, billingCycle }))}
        options={['MONTHLY', 'YEARLY'].map((c) => ({ value: c, label: t(`companies.cycle.${c}`) }))}
      />
      <DateField label={t('companies.endDate')} value={form.endDate} onChangeText={(endDate) => setForm((f) => ({ ...f, endDate }))} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { padding: SPACING.lg, flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  warning: { backgroundColor: COLORS.warningSoft, borderRadius: 12, padding: SPACING.md },
});
