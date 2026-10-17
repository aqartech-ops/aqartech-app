import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { API_URL, BREAKPOINTS } from '../services/config';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { authApi, plansApi } from '../services/api';
import { Button, Card, ErrorBox, Field, Row, Segmented, Txt, errorText } from '../components/ui';
import { Money } from '../components/Rial';

// Three modes: customer sign in, customer registration, platform-team sign in.
export default function LoginScreen() {
  const { t, lang, setLang } = useI18n();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState('signIn'); // signIn | register | admin | forgot
  const [notice, setNotice] = useState(null);
  const [prefillEmail, setPrefillEmail] = useState('');
  const wide = width >= BREAKPOINTS.desktop;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.split, wide && { flexDirection: 'row' }]}>
          {wide ? <BrandPanel /> : null}
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Row style={{ justifyContent: 'space-between', width: '100%', maxWidth: 520 }}>
              {!wide ? <BrandMark /> : <View />}
              <Button
                small
                variant="ghost"
                icon="translate"
                title={lang === 'ar' ? 'English' : 'العربية'}
                onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              />
            </Row>

            <Card style={styles.card}>
              {mode === 'register' ? (
                <RegisterForm onSwitch={() => setMode('signIn')} />
              ) : mode === 'forgot' ? (
                <ForgotForm
                  initialEmail={prefillEmail}
                  onCancel={() => setMode('signIn')}
                  onDone={(email) => {
                    setPrefillEmail(email);
                    setNotice(t('reset.done'));
                    setMode('signIn');
                  }}
                />
              ) : (
                <SignInForm
                  key={mode}
                  admin={mode === 'admin'}
                  initialEmail={prefillEmail}
                  notice={mode === 'signIn' ? notice : null}
                  onSwitch={() => setMode('register')}
                  onForgot={(email) => {
                    setPrefillEmail(email);
                    setNotice(null);
                    setMode('forgot');
                  }}
                />
              )}
            </Card>

            <Pressable onPress={() => setMode(mode === 'admin' ? 'signIn' : 'admin')} style={{ padding: SPACING.sm }}>
              <Txt muted size="small" style={{ textAlign: 'center' }}>
                {mode === 'admin' ? t('auth.backToUserSignIn') : t('auth.adminSignIn')}
              </Txt>
            </Pressable>
            {__DEV__ ? (
              <Txt muted size="small" style={{ textAlign: 'center' }} selectable>
                {t('settings.server')}: {API_URL}
              </Txt>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BrandMark() {
  const { t } = useI18n();
  return (
    <Row>
      <View style={styles.logo}>
        <MaterialCommunityIcons name="home-city" size={20} color={COLORS.onPrimary} />
      </View>
      <Txt size="medium" weight="weightBold">{t('app.name')}</Txt>
    </Row>
  );
}

function BrandPanel() {
  const { t } = useI18n();
  return (
    <View style={styles.brandPanel}>
      <View style={[styles.logo, { width: 56, height: 56, borderRadius: RADIUS.md, backgroundColor: COLORS.surface }]}>
        <MaterialCommunityIcons name="home-city" size={30} color={COLORS.primary} />
      </View>
      <Txt size="large" weight="weightBold" style={{ color: COLORS.onPrimary, textAlign: 'center' }}>{t('app.name')}</Txt>
      <Txt size="medium" style={{ color: COLORS.onPrimary, opacity: 0.9, textAlign: 'center' }}>{t('app.tagline')}</Txt>
    </View>
  );
}

function SignInForm({ admin, onSwitch, onForgot, initialEmail = '', notice }) {
  const { t, start } = useI18n();
  const { signIn, adminSignIn } = useSession();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await (admin ? adminSignIn : signIn)(email.trim(), password);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: SPACING.lg }}>
      <View style={{ gap: 4 }}>
        <Txt size="title" weight="weightBold">{admin ? t('auth.adminSignInTitle') : t('auth.welcomeBack')}</Txt>
        {!admin ? <Txt muted>{t('auth.signInSubtitle')}</Txt> : null}
      </View>
      {notice ? (
        <View style={styles.notice}>
          <Txt style={{ color: COLORS.success }}>{notice}</Txt>
        </View>
      ) : null}
      <ErrorBox error={error} />
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secure
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      {!admin ? (
        <Pressable onPress={() => onForgot(email.trim())} style={{ alignSelf: start }} hitSlop={6}>
          <Txt size="small" style={{ color: COLORS.primaryDark }}>{t('reset.forgotLink')}</Txt>
        </Pressable>
      ) : null}
      <Button title={t('auth.signIn')} onPress={submit} loading={busy} disabled={!email || !password} />
      {!admin ? (
        <Row style={{ justifyContent: 'center' }}>
          <Txt muted>{t('auth.noAccount')}</Txt>
          <Button small variant="ghost" title={t('auth.createAccount')} onPress={onSwitch} />
        </Row>
      ) : null}
    </View>
  );
}

/** Forgot password: 1) email → 6-digit code is sent  2) code + new password. */
function ForgotForm({ initialEmail, onCancel, onDone }) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword(email.trim(), lang);
      setStep(2);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setBusy(true);
    try {
      await authApi.resetPassword(email.trim(), code, password);
      onDone(email.trim());
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: SPACING.lg }}>
      <View style={{ gap: 4 }}>
        <Txt size="title" weight="weightBold">{t('reset.title')}</Txt>
        <Txt muted>{step === 1 ? t('reset.step1') : t('reset.step2', { email: email.trim() })}</Txt>
      </View>
      {error && !error.field ? <ErrorBox error={error} /> : null}
      {step === 1 ? (
        <>
          <Field
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            error={fieldError('email')}
            onSubmitEditing={sendCode}
          />
          <Button title={t('reset.sendCode')} onPress={sendCode} loading={busy} disabled={!email.trim()} />
        </>
      ) : (
        <>
          <Field
            label={t('reset.code')}
            value={code}
            onChangeText={(v) => setCode(v.replace(/[^0-9٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).slice(0, 6))}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            error={fieldError('code')}
            inputStyle={{ letterSpacing: 6, fontSize: 20 }}
          />
          <Field
            label={t('settings.newPassword')}
            hint={t('auth.passwordHint')}
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            error={fieldError('password')}
          />
          <Button title={t('reset.save')} onPress={resetPassword} loading={busy} disabled={code.length !== 6 || password.length < 8} />
          <Button variant="ghost" small title={t('reset.resend')} onPress={sendCode} disabled={busy} />
        </>
      )}
      <Button variant="secondary" title={t('auth.backToSignIn')} onPress={onCancel} />
    </View>
  );
}

function RegisterForm({ onSwitch }) {
  const { t, lang } = useI18n();
  const { register } = useSession();
  const [form, setForm] = useState({
    accountType: 'COMPANY',
    companyName: '',
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    planCode: '',
    billingCycle: 'MONTHLY',
  });
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    plansApi.list().then(setPlans).catch((e) => {
      setPlans([]);
      setError(e);
    });
  }, []);

  const visiblePlans = (plans ?? []).filter((p) => p.audience === 'ANY' || p.audience === form.accountType);

  // Keep the selected plan valid when the account type changes
  useEffect(() => {
    if (visiblePlans.length && !visiblePlans.some((p) => p.code === form.planCode)) {
      setForm((f) => ({ ...f, planCode: visiblePlans[0].code }));
    }
  }, [form.accountType, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await register({ ...form, email: form.email.trim(), locale: lang });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const individual = form.accountType === 'INDIVIDUAL';

  return (
    <View style={{ gap: SPACING.lg }}>
      <View style={{ gap: 4 }}>
        <Txt size="title" weight="weightBold">{t('auth.registerTitle')}</Txt>
        <Txt muted>{t('auth.registerSubtitle')}</Txt>
      </View>
      {error && !error.field ? <ErrorBox error={error} /> : null}

      <View style={{ gap: SPACING.sm }}>
        <Txt weight="weightMedium" size="small">{t('auth.accountType')}</Txt>
        <TypeOption
          icon="domain"
          title={t('auth.typeCompany')}
          hint={t('auth.typeCompanyHint')}
          selected={!individual}
          onPress={() => set('accountType')('COMPANY')}
        />
        <TypeOption
          icon="account-key-outline"
          title={t('auth.typeIndividual')}
          hint={t('auth.typeIndividualHint')}
          selected={individual}
          onPress={() => set('accountType')('INDIVIDUAL')}
        />
      </View>

      <Field label={t('auth.ownerName')} value={form.ownerName} onChangeText={set('ownerName')} error={fieldError('ownerName')} />
      {!individual ? (
        <Field label={t('auth.companyName')} value={form.companyName} onChangeText={set('companyName')} error={fieldError('companyName')} />
      ) : null}
      <Field
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        inputMode="email"
        error={fieldError('email')}
      />
      <Field
        label={`${t('auth.phone')} (${t('common.optional')})`}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
        inputMode="tel"
        error={fieldError('phone')}
      />
      <Field
        label={t('auth.password')}
        value={form.password}
        onChangeText={set('password')}
        secure
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={fieldError('password')}
      />

      <View style={{ gap: SPACING.sm }}>
        <Txt weight="weightMedium" size="small">{t('auth.choosePlan')}</Txt>
        <Segmented
          value={form.billingCycle}
          onChange={set('billingCycle')}
          options={[
            { value: 'MONTHLY', label: t('auth.monthly') },
            { value: 'YEARLY', label: t('auth.yearly') },
          ]}
        />
        {plans === null ? (
          <Txt muted>{t('common.loading')}</Txt>
        ) : visiblePlans.length === 0 ? (
          <Txt muted>{t('auth.noPlans')}</Txt>
        ) : (
          visiblePlans.map((plan) => (
            <PlanOption
              key={plan.code}
              plan={plan}
              lang={lang}
              yearly={form.billingCycle === 'YEARLY'}
              selected={form.planCode === plan.code}
              onPress={() => set('planCode')(plan.code)}
            />
          ))
        )}
        {fieldError('planCode') ? <Txt size="small" style={{ color: COLORS.danger }}>{fieldError('planCode')}</Txt> : null}
      </View>

      <Button
        title={t('auth.createAccount')}
        onPress={submit}
        loading={busy}
        disabled={!form.ownerName || !form.email || !form.password || !form.planCode || (!individual && !form.companyName)}
      />
      <Row style={{ justifyContent: 'center' }}>
        <Txt muted>{t('auth.haveAccount')}</Txt>
        <Button small variant="ghost" title={t('auth.signIn')} onPress={onSwitch} />
      </Row>
    </View>
  );
}

function TypeOption({ icon, title, hint, selected, onPress }) {
  const { row } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.option, { flexDirection: row }, selected && styles.optionSelected]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={selected ? COLORS.primaryDark : COLORS.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="weightMedium">{title}</Txt>
        <Txt muted size="small">{hint}</Txt>
      </View>
      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={22}
        color={selected ? COLORS.primary : COLORS.borderStrong}
      />
    </Pressable>
  );
}

function PlanOption({ plan, lang, yearly, selected, onPress }) {
  const { t, row, isRTL } = useI18n();
  const name = lang === 'ar' ? plan.nameAr : plan.nameEn;
  const price = yearly ? plan.priceYearly : plan.priceMonthly;
  const limitText = ['properties', 'users']
    .map((k) => `${t(`plan.limits.${k}`)}: ${plan.limits?.[k] ?? t('common.unlimited')}`)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.option, { flexDirection: row }, selected && styles.optionSelected]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="weightBold">{name}</Txt>
        <Txt muted size="small">{limitText}</Txt>
      </View>
      <View style={{ alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
        <Money baisa={price} weight="weightBold" color={COLORS.primaryDark} size={16} />
        <Txt muted size="small">{yearly ? t('auth.perYear') : t('auth.perMonth')}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  split: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.lg, gap: SPACING.lg },
  card: { width: '100%', maxWidth: 520, padding: SPACING.xl },
  brandPanel: {
    width: '40%',
    maxWidth: 520,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    padding: SPACING.xxl,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  notice: { backgroundColor: COLORS.successSoft, borderRadius: RADIUS.md, padding: SPACING.md },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft, borderWidth: 1.5 },
});
