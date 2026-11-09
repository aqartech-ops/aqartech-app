import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { adminApi } from '../services/api';
import { confirm } from '../services/dialog';
import { parseOMR } from '../services/money';
import { matches } from '../services/text';
import { DateField, dateText, formatDate, isDateText } from '../components/Fields';
import { Money, MoneyField } from '../components/Rial';
import { BackButton, Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, Loading, Row, STATUS_TONE, Screen, Segmented, Sheet, Txt } from '../components/ui';

// Platform team: subscribers (المشتركون) — list with filters, a page per subscriber (usage, users, history),
// manual activation / renewal with the payment received / plan change / suspension. Manual until online payment (phase 8).

const FILTERS = ['all', 'PENDING', 'ACTIVE', 'ending', 'EXPIRED', 'SUSPENDED', 'CANCELLED'];
const METHODS = ['BANK', 'CASH', 'CARD', 'OTHER'];
const EVENT_ICON = {
  ACTIVATED: 'check-decagram-outline',
  RENEWED: 'autorenew',
  PLAN_CHANGED: 'swap-horizontal',
  SUSPENDED: 'pause-circle-outline',
  RESUMED: 'play-circle-outline',
  CANCELLED: 'close-circle-outline',
  EXPIRED: 'calendar-remove-outline',
  UPDATED: 'pencil-outline',
};

const statusOf = (c) => c.state?.status ?? c.subscription?.status;
const isEnding = (c) => statusOf(c) === 'ACTIVE' && typeof c.state?.daysLeft === 'number' && c.state.daysLeft <= 14;

/** Small badge: days left / in grace / ended. */
function DaysBadge({ state }) {
  const { t } = useI18n();
  if (!state || typeof state.daysLeft !== 'number' || state.status !== 'ACTIVE') return null;
  if (state.inGrace) return <Badge label={t('subscribers.inGrace')} tone="danger" />;
  if (state.daysLeft > 14) return null;
  return <Badge label={t('subscribers.daysLeft', { count: state.daysLeft })} tone={state.daysLeft <= 3 ? 'danger' : 'warning'} />;
}

export default function CompaniesScreen({ params }) {
  const { t, lang, forwardIcon } = useI18n();
  const [companies, setCompanies] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState(params?.filter ?? 'all');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

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

  const counts = useMemo(() => {
    const out = { all: (companies ?? []).length, ending: (companies ?? []).filter(isEnding).length };
    for (const c of companies ?? []) out[statusOf(c)] = (out[statusOf(c)] ?? 0) + 1;
    return out;
  }, [companies]);

  const visible = (companies ?? []).filter((c) => {
    if (filter === 'ending' ? !isEnding(c) : filter !== 'all' && statusOf(c) !== filter) return false;
    return !text.trim() || matches(`${c.name} ${c.ownerName ?? ''} ${c.email ?? ''} ${c.phone ?? ''}`, text);
  });

  if (openId) {
    return (
      <CompanyPage
        id={openId}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  return (
    <Screen title={t('companies.title')} subtitle={t('subscribers.subtitle')}>
      <View style={{ gap: SPACING.md }}>
        <ErrorBox error={error} onRetry={load} />
        <Field value={text} onChangeText={setText} placeholder={t('subscribers.search')} />
        <ChipSelect value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f, label: `${t(`subscribers.filters.${f}`)} (${counts[f] ?? 0})` }))} />
        {companies === null ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon="domain" body={companies.length ? t('subscribers.noneHere') : t('companies.empty')} />
          </Card>
        ) : (
          <Card padded={false}>
            {visible.map((c, index) => {
              const status = statusOf(c);
              const plan = c.subscription?.plan;
              return (
                <Pressable key={c.id} onPress={() => setOpenId(c.id)} style={({ hovered }) => [styles.row, index > 0 && styles.divider, hovered && { backgroundColor: COLORS.surfaceSoft }]}>
                  <Row gap={SPACING.md}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                        <Txt weight="weightBold">{c.name}</Txt>
                        <Badge label={c.type === 'INDIVIDUAL' ? t('companies.individual') : t('companies.company')} />
                        {status ? <Badge label={t(`plan.status.${status}`)} tone={STATUS_TONE[status]} /> : null}
                        <DaysBadge state={c.state} />
                      </Row>
                      <Txt muted size="small">{[c.ownerName, c.email, c.phone].filter(Boolean).join(' · ')}</Txt>
                      <Txt muted size="small">
                        {[
                          plan ? (lang === 'ar' ? plan.nameAr : plan.nameEn) : '—',
                          c.subscription?.endDate ? t('subscribers.until', { date: formatDate(c.subscription.endDate, lang) }) : null,
                          t('companies.usersCount', { count: c.users }),
                          `${t('companies.since')} ${formatDate(c.createdAt, lang)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Txt>
                    </View>
                    <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
                  </Row>
                </Pressable>
              );
            })}
          </Card>
        )}
      </View>
    </Screen>
  );
}

// ================================================================ one subscriber

function CompanyPage({ id, onBack }) {
  const { t, lang } = useI18n();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(null); // 'renew' | 'plan'
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const c = await adminApi.company(id);
      setCompany(c);
      setNote(c.adminNote ?? '');
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!company) {
    return (
      <Screen title={t('companies.title')}>
        <BackButton label={t('companies.title')} onPress={onBack} />
        <ErrorBox error={error} onRetry={load} />
        {!error ? <Loading /> : null}
      </Screen>
    );
  }

  const sub = company.subscription;
  const state = sub?.state;
  const status = state?.status ?? sub?.status;
  const plan = sub?.plan;

  const setStatus = async (next) => {
    const key = { ACTIVE: 'activate', SUSPENDED: 'suspend', CANCELLED: 'cancel' }[next];
    const ok = await confirm({
      title: t(`subscribers.actions.${key}`),
      message: t(`subscribers.confirm.${key}`, { name: company.name }),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
      destructive: next !== 'ACTIVE',
    });
    if (!ok) return;
    setBusy(next);
    setError(null);
    try {
      await adminApi.updateSubscription(company.id, { status: next });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const saveNote = async () => {
    setBusy('note');
    try {
      await adminApi.updateCompanyNote(company.id, note);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const limits = plan?.limits ?? {};

  return (
    <Screen title={company.name} subtitle={[company.ownerName, company.email, company.phone].filter(Boolean).join(' · ')}>
      <View style={{ gap: SPACING.md }}>
        <BackButton label={t('companies.title')} onPress={onBack} />
        <ErrorBox error={error} onRetry={load} />

        {/* subscription */}
        <Card style={{ gap: SPACING.md }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt weight="weightBold">{t('subscribers.subscription')}</Txt>
            <Row gap={SPACING.xs}>
              {status ? <Badge label={t(`plan.status.${status}`)} tone={STATUS_TONE[status]} /> : null}
              <DaysBadge state={state} />
            </Row>
          </Row>
          {sub ? (
            <View style={styles.facts}>
              <Fact label={t('companies.plan')} value={plan ? (lang === 'ar' ? plan.nameAr : plan.nameEn) : '—'} />
              <Fact label={t('companies.billingCycle')} value={t(`companies.cycle.${sub.billingCycle}`)} />
              <Fact label={t('subscribers.startDate')} value={sub.startDate ? formatDate(sub.startDate, lang) : '—'} />
              <Fact label={t('companies.endDate')} value={sub.endDate ? formatDate(sub.endDate, lang) : t('subscribers.noEnd')} />
            </View>
          ) : null}
          {state?.inGrace ? <Txt size="small" style={{ color: COLORS.danger }}>{t('subscribers.graceHint', { count: state.graceDays + state.daysLeft })}</Txt> : null}
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small icon="autorenew" title={t('subscribers.actions.renew')} onPress={() => setSheet('renew')} />
            <Button small variant="secondary" icon="swap-horizontal" title={t('subscribers.actions.plan')} onPress={() => setSheet('plan')} />
            {status !== 'ACTIVE' ? <Button small variant="secondary" icon="check-decagram-outline" title={t('subscribers.actions.activate')} loading={busy === 'ACTIVE'} onPress={() => setStatus('ACTIVE')} /> : null}
            {status === 'ACTIVE' ? <Button small variant="danger" icon="pause-circle-outline" title={t('subscribers.actions.suspend')} loading={busy === 'SUSPENDED'} onPress={() => setStatus('SUSPENDED')} /> : null}
            {status !== 'CANCELLED' ? <Button small variant="ghost" icon="close-circle-outline" title={t('subscribers.actions.cancel')} loading={busy === 'CANCELLED'} onPress={() => setStatus('CANCELLED')} /> : null}
          </Row>
        </Card>

        {/* usage */}
        <Card style={{ gap: SPACING.md }}>
          <Txt weight="weightBold">{t('subscribers.usage')}</Txt>
          {Object.entries(company.used).map(([key, n]) => {
            const max = limits[key];
            const pct = max ? Math.min(1, n / max) : 0;
            return (
              <View key={key} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt>{t(`plan.limits.${key}`)}</Txt>
                  <Txt weight="weightMedium" style={{ color: max !== null && max !== undefined && n > max ? COLORS.danger : COLORS.textDark }}>
                    {max === null || max === undefined ? `${n} / ${t('common.unlimited')}` : `${n} / ${max}`}
                  </Txt>
                </Row>
                {max ? (
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: pct >= 1 ? COLORS.danger : pct >= 0.8 ? COLORS.warning : COLORS.primary }]} />
                  </View>
                ) : null}
              </View>
            );
          })}
          <Txt muted size="small">{t('subscribers.counts', { tenants: company.counts.tenants, leases: company.counts.activeLeases })}</Txt>
        </Card>

        {/* users */}
        <Card style={{ gap: SPACING.sm }}>
          <Txt weight="weightBold">{t('subscribers.users', { count: company.users.length })}</Txt>
          {company.users.map((u) => (
            <Row key={u.id} style={{ flexWrap: 'wrap', opacity: u.isActive ? 1 : 0.55 }}>
              <Txt style={{ flex: 1, minWidth: 160 }}>{u.name}</Txt>
              <Txt muted size="small">{u.email}</Txt>
              {u.isCompanyAdmin ? <Badge label={t('subscribers.mainAccount')} tone="info" /> : null}
              {u.kind === 'OWNER' ? <Badge label={t('subscribers.linkedOwner')} /> : null}
            </Row>
          ))}
        </Card>

        {/* note */}
        <Card style={{ gap: SPACING.sm }}>
          <Txt weight="weightBold">{t('subscribers.note')}</Txt>
          <Field value={note ?? ''} onChangeText={setNote} multiline placeholder={t('subscribers.notePlaceholder')} />
          {note !== (company.adminNote ?? '') ? <Button small title={t('common.save')} onPress={saveNote} loading={busy === 'note'} style={{ alignSelf: 'flex-start' }} /> : null}
        </Card>

        {/* history */}
        <Card style={{ gap: SPACING.md }}>
          <Txt weight="weightBold">{t('subscribers.history')}</Txt>
          {(sub?.events ?? []).length === 0 ? <Txt muted>{t('subscribers.noHistory')}</Txt> : null}
          {(sub?.events ?? []).map((e) => (
            <Row key={e.id} gap={SPACING.sm} style={{ alignItems: 'flex-start' }}>
              <MaterialCommunityIcons name={EVENT_ICON[e.type] ?? 'circle-small'} size={18} color={COLORS.primaryDark} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={SPACING.xs} style={{ flexWrap: 'wrap' }}>
                  <Txt weight="weightMedium">{t(`subscribers.events.${e.type}`)}</Txt>
                  {e.amount ? <Money baisa={e.amount} size={13} weight="weightMedium" /> : null}
                  {e.method ? <Txt muted size="small">{t(`subscribers.methods.${e.method}`)}</Txt> : null}
                </Row>
                <Txt muted size="small">
                  {[
                    formatDate(e.createdAt, lang),
                    e.adminName ?? t('subscribers.automatic'),
                    e.plan ? (lang === 'ar' ? e.plan.nameAr : e.plan.nameEn) : null,
                    e.endDate ? t('subscribers.until', { date: formatDate(e.endDate, lang) }) : null,
                    e.reference,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
                {e.note ? <Txt size="small">{e.note}</Txt> : null}
              </View>
            </Row>
          ))}
        </Card>
      </View>

      <RenewSheet
        visible={sheet === 'renew'}
        company={company}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          load();
        }}
      />
      <SubscriptionSheet
        company={sheet === 'plan' ? company : null}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          load();
        }}
      />
    </Screen>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Txt muted size="small">{label}</Txt>
      <Txt weight="weightMedium">{value}</Txt>
    </View>
  );
}

/** Renew: periods + the payment received (recorded in the history). */
function RenewSheet({ visible, company, onClose, onSaved }) {
  const { t, lang } = useI18n();
  const sub = company.subscription;
  const yearly = sub?.billingCycle === 'YEARLY';
  const choices = yearly ? [1, 2, 3] : [1, 3, 6, 12];
  const [periods, setPeriods] = useState(1);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const price = yearly ? sub?.plan?.priceYearly : sub?.plan?.priceMonthly;
    setPeriods(1);
    setAmount(price ? (price / 1000).toFixed(3) : '');
    setMethod('BANK');
    setReference('');
    setNote('');
    setError(null);
    setBusy(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || !sub) return null;
  const baisa = amount.trim() ? parseOMR(amount) : null;
  const amountError = amount.trim() && baisa === null ? t('errors.validation.money') : undefined;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.renewSubscription(company.id, { periods, amount: baisa, method: baisa ? method : undefined, reference: reference.trim() || undefined, note: note.trim() || undefined });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('subscribers.renewTitle', { name: company.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('subscribers.actions.renew')} onPress={save} loading={busy} disabled={!!amountError} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Txt muted size="small">{t('subscribers.renewHint', { date: sub.endDate ? formatDate(sub.endDate, lang) : '—' })}</Txt>
      <Txt weight="weightMedium" size="small">{t('subscribers.period')}</Txt>
      <ChipSelect value={periods} onChange={setPeriods} options={choices.map((n) => ({ value: n, label: t(yearly ? 'subscribers.years' : 'subscribers.months', { count: n }) }))} />
      <MoneyField label={t('subscribers.amountReceived')} value={amount} onChangeText={setAmount} error={amountError} hint={t('subscribers.amountHint')} />
      {baisa ? <ChipSelect value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: t(`subscribers.methods.${m}`) }))} /> : null}
      <Field label={t('subscribers.reference')} value={reference} onChangeText={setReference} />
      <Field label={t('subscribers.eventNote')} value={note} onChangeText={setNote} />
    </Sheet>
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
    setForm({ planId: sub.planId ?? sub.plan?.id ?? null, billingCycle: sub.billingCycle ?? 'MONTHLY', endDate: dateText(sub.endDate), note: '' });
    setError(null);
    setBusy(false);
    adminApi
      .plans()
      .then(setPlans)
      .catch((e) => {
        setError(e);
        setPlans([]);
      });
  }, [company]);

  if (!company || !form) return null;
  const plan = plans?.find((p) => p.id === form.planId);
  const over = plan ? Object.entries(plan.limits ?? {}).filter(([key, max]) => max !== null && (company.used?.[key] ?? 0) > max) : [];
  const wrongAudience = plan && plan.audience !== 'ANY' && plan.audience !== company.type;

  const save = async () => {
    if (form.endDate && !isDateText(form.endDate)) return setError({ code: 'validation.date' });
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateSubscription(company.id, { planId: form.planId, billingCycle: form.billingCycle, endDate: form.endDate || null, note: form.note.trim() || undefined });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
    return undefined;
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
      <Segmented value={form.billingCycle} onChange={(billingCycle) => setForm((f) => ({ ...f, billingCycle }))} options={['MONTHLY', 'YEARLY'].map((c) => ({ value: c, label: t(`companies.cycle.${c}`) }))} />
      <DateField label={t('companies.endDate')} value={form.endDate} onChangeText={(endDate) => setForm((f) => ({ ...f, endDate }))} />
      <Field label={t('subscribers.eventNote')} value={form.note} onChangeText={(note) => setForm((f) => ({ ...f, note }))} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { padding: SPACING.lg },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  warning: { backgroundColor: COLORS.warningSoft, borderRadius: 12, padding: SPACING.md },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  fact: { minWidth: 140, flexGrow: 1, gap: 2, padding: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft },
  bar: { height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
});
