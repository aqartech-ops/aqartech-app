import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { LANGUAGES, useI18n } from '../i18n';
import { useSession } from '../services/session';
import { companyApi } from '../services/api';
import { API_URL } from '../services/config';
import { Money } from '../components/Rial';
import { Badge, Button, Card, ErrorBox, Field, Row, STATUS_TONE, Screen, Segmented, Txt, errorText } from '../components/ui';

export default function SettingsScreen() {
  const { t, start } = useI18n();
  const { me, isAdmin, signOut } = useSession();

  return (
    <Screen title={t('settings.title')}>
      <View style={{ gap: SPACING.lg, maxWidth: 720 }}>
        <LanguageCard />
        <ProfileCard me={me} isAdmin={isAdmin} />
        {!isAdmin ? <ChangePasswordCard /> : null}
        {!isAdmin && me.user.isCompanyAdmin ? <CompanyCard /> : null}
        {!isAdmin && me.subscription ? <SubscriptionCard subscription={me.subscription} /> : null}
        <Card style={{ gap: SPACING.sm }}>
          <Txt muted size="small">{t('settings.server')}</Txt>
          <Txt size="small" selectable>{API_URL}</Txt>
        </Card>
        <Button variant="danger" icon="logout" title={t('auth.signOut')} onPress={signOut} style={{ alignSelf: start }} />
      </View>
    </Screen>
  );
}

function LanguageCard() {
  const { t, lang, setLang } = useI18n();
  return (
    <Card style={{ gap: SPACING.md }}>
      <Txt weight="weightBold">{t('settings.language')}</Txt>
      <Segmented value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} />
    </Card>
  );
}

function ProfileCard({ me, isAdmin }) {
  const { t } = useI18n();
  const person = isAdmin ? me.admin : me.user;
  return (
    <Card style={{ gap: SPACING.sm }}>
      <Txt weight="weightBold">{t('settings.profile')}</Txt>
      <Txt>{person.name}</Txt>
      <Txt muted>{person.email}</Txt>
    </Card>
  );
}

function ChangePasswordCard() {
  const { t } = useI18n();
  const { changePassword } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: SPACING.md }}>
      <Txt weight="weightBold">{t('settings.changePassword')}</Txt>
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field
        label={t('settings.currentPassword')}
        value={current}
        onChangeText={setCurrent}
        secure
        autoComplete="current-password"
        textContentType="password"
        error={fieldError('currentPassword')}
      />
      <Field
        label={t('settings.newPassword')}
        hint={t('settings.changePasswordHint')}
        value={next}
        onChangeText={setNext}
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldError('password')}
      />
      <Row style={{ justifyContent: 'flex-end' }}>
        {saved ? <Txt style={{ color: COLORS.success }}>{t('common.saved')}</Txt> : null}
        <Button title={t('common.save')} onPress={save} loading={busy} disabled={!current || next.length < 8} />
      </Row>
    </Card>
  );
}

function CompanyCard() {
  const { t } = useI18n();
  const { me, refresh } = useSession();
  const individual = me.company.type === 'INDIVIDUAL';
  const [form, setForm] = useState({ name: '', ownerName: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name: me.company.name ?? '',
      ownerName: me.company.ownerName ?? '',
      email: me.company.email ?? '',
      phone: me.company.phone ?? '',
    });
  }, [me.company]);

  const set = (key) => (value) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await companyApi.update(form);
      await refresh();
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: SPACING.md }}>
      <Txt weight="weightBold">{t('settings.company')}</Txt>
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={individual ? t('auth.ownerName') : t('auth.companyName')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      {!individual ? <Field label={t('auth.ownerName')} value={form.ownerName} onChangeText={set('ownerName')} /> : null}
      <Field label={t('auth.email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" inputMode="email" error={fieldError('email')} />
      <Field label={t('auth.phone')} value={form.phone} onChangeText={set('phone')} inputMode="tel" />
      <Row style={{ justifyContent: 'flex-end' }}>
        {saved ? <Txt style={{ color: COLORS.success }}>{t('common.saved')}</Txt> : null}
        <Button title={t('common.save')} onPress={save} loading={busy} disabled={!form.name} />
      </Row>
    </Card>
  );
}

function SubscriptionCard({ subscription }) {
  const { t, lang } = useI18n();
  const plan = subscription.plan;
  const yearly = subscription.billingCycle === 'YEARLY';
  return (
    <Card style={{ gap: SPACING.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight="weightBold">{t('settings.subscription')}</Txt>
        <Badge label={t(`plan.status.${subscription.status}`)} tone={STATUS_TONE[subscription.status]} />
      </Row>
      <Txt size="medium" weight="weightMedium">{lang === 'ar' ? plan.nameAr : plan.nameEn}</Txt>
      <Row gap={6}>
        <Money baisa={yearly ? plan.priceYearly : plan.priceMonthly} color={COLORS.textMuted} />
        <Txt muted>{yearly ? t('auth.perYear') : t('auth.perMonth')}</Txt>
      </Row>
    </Card>
  );
}
