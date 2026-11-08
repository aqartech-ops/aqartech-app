import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { authApi } from '../services/api';
import { Badge, Button, Card, ErrorBox, Field, Row, Txt, errorText } from './ui';

// Platform team — own account security: password and two-step sign-in (authenticator app).

/** Change own password. `forced`: first sign-in with a password given by another admin. */
export function AdminPasswordCard({ forced }) {
  const { t } = useI18n();
  const { adminChangePassword } = useSession();
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
      await adminChangePassword(current, next);
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
      <Txt weight="weightBold">{forced ? t('team.mustChangeTitle') : t('settings.changePassword')}</Txt>
      {forced ? <Txt muted>{t('team.mustChangeHint')}</Txt> : null}
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <Field label={forced ? t('team.temporaryPassword') : t('settings.currentPassword')} value={current} onChangeText={setCurrent} secure autoComplete="current-password" error={fieldError('currentPassword')} />
      <Field label={t('settings.newPassword')} hint={t('settings.changePasswordHint')} value={next} onChangeText={setNext} secure autoComplete="new-password" error={fieldError('password')} />
      <Row style={{ justifyContent: 'flex-end' }}>
        {saved ? <Txt style={{ color: COLORS.success }}>{t('common.saved')}</Txt> : null}
        <Button title={t('common.save')} onPress={save} loading={busy} disabled={!current || next.length < 8} />
      </Row>
    </Card>
  );
}

/** "ABCD EFGH IJKL …" — easier to type into an authenticator app. */
const grouped = (secret) => secret.replace(/(.{4})/g, '$1 ').trim();

function RecoveryCodes({ codes, onDone }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: SPACING.md }}>
      <Txt weight="weightMedium">{t('twoFactor.recoveryTitle')}</Txt>
      <Txt muted size="small">{t('twoFactor.recoveryExplain')}</Txt>
      <View style={styles.codes}>
        {codes.map((c) => (
          <Txt key={c} selectable style={MONO}>{c}</Txt>
        ))}
      </View>
      <Button title={t('twoFactor.savedCodes')} onPress={onDone} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

export function TwoFactorCard() {
  const { t } = useI18n();
  const { me, setProfile } = useSession();
  const enabled = !!me?.admin?.totpEnabled;
  const [step, setStep] = useState(null); // null | { setup } | 'disable' | 'renew' | { codes }
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setStep(null);
    setCode('');
    setPassword('');
    setError(null);
  };
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      setStep({ setup: await authApi.admin2faSetup() });
    });
  const enable = () =>
    run(async () => {
      const res = await authApi.admin2faEnable(code.trim());
      setProfile(res.me);
      setCode('');
      setStep({ codes: res.recoveryCodes });
    });
  const renew = () =>
    run(async () => {
      const res = await authApi.admin2faRecoveryCodes(code.trim());
      setProfile(res.me);
      setCode('');
      setStep({ codes: res.recoveryCodes });
    });
  const disable = () =>
    run(async () => {
      const res = await authApi.admin2faDisable(password, code.trim());
      setProfile(res.me);
      reset();
    });

  const codeField = <Field label={t('twoFactor.code')} value={code} onChangeText={setCode} inputMode="numeric" autoComplete="one-time-code" error={error?.field === 'code' ? errorText(t, error) : undefined} />;

  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight="weightBold">{t('twoFactor.title')}</Txt>
        <Badge label={enabled ? t('twoFactor.on') : t('twoFactor.off')} tone={enabled ? 'success' : 'warning'} />
      </Row>
      <Txt muted size="small">{enabled ? t('twoFactor.onHint', { count: me.admin.recoveryCodesLeft ?? 0 }) : t('twoFactor.offHint')}</Txt>
      {error && error.field !== 'code' ? <ErrorBox error={error} /> : null}

      {step?.codes ? <RecoveryCodes codes={step.codes} onDone={reset} /> : null}

      {step?.setup ? (
        <View style={{ gap: SPACING.md }}>
          <Txt>{t('twoFactor.step1')}</Txt>
          <View style={styles.secret}>
            <Txt selectable style={MONO}>{grouped(step.setup.secret)}</Txt>
          </View>
          {Platform.OS !== 'web' ? (
            <Button small variant="secondary" icon="cellphone-key" title={t('twoFactor.openApp')} onPress={() => Linking.openURL(step.setup.otpauthUrl).catch(() => {})} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          <Txt>{t('twoFactor.step2')}</Txt>
          {codeField}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" title={t('common.cancel')} onPress={reset} />
            <Button title={t('twoFactor.turnOn')} onPress={enable} loading={busy} disabled={code.trim().length < 6} />
          </Row>
        </View>
      ) : null}

      {step === 'renew' ? (
        <View style={{ gap: SPACING.md }}>
          <Txt muted size="small">{t('twoFactor.renewHint')}</Txt>
          {codeField}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" title={t('common.cancel')} onPress={reset} />
            <Button title={t('twoFactor.newCodes')} onPress={renew} loading={busy} disabled={code.trim().length < 6} />
          </Row>
        </View>
      ) : null}

      {step === 'disable' ? (
        <View style={{ gap: SPACING.md }}>
          <Txt muted size="small">{t('twoFactor.disableHint')}</Txt>
          <Field label={t('settings.currentPassword')} value={password} onChangeText={setPassword} secure error={error?.field === 'password' ? errorText(t, error) : undefined} />
          {codeField}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" title={t('common.cancel')} onPress={reset} />
            <Button variant="danger" title={t('twoFactor.turnOff')} onPress={disable} loading={busy} disabled={!password || code.trim().length < 6} />
          </Row>
        </View>
      ) : null}

      {!step ? (
        enabled ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small variant="secondary" icon="key-chain" title={t('twoFactor.newCodes')} onPress={() => setStep('renew')} />
            <Button small variant="danger" icon="shield-off-outline" title={t('twoFactor.turnOff')} onPress={() => setStep('disable')} />
          </Row>
        ) : (
          <Button icon="shield-check-outline" title={t('twoFactor.setUp')} onPress={start} loading={busy} style={{ alignSelf: 'flex-start' }} />
        )
      ) : null}
    </Card>
  );
}

// plain object (not StyleSheet) so it stays an inline style: the web look keeps its own font elsewhere
const MONO = { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 15, letterSpacing: 1 };

const styles = StyleSheet.create({
  secret: { padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft, borderWidth: 1, borderColor: COLORS.border },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft },
});
