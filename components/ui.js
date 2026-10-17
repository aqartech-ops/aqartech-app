import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOWS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { SectionIcon } from './Rial';

// Shared building blocks. All of them respect the current language direction.

export function Txt({ style, muted, weight, size, children, ...rest }) {
  const { align } = useI18n();
  return (
    <Text
      style={[
        styles.text,
        { textAlign: align },
        muted && { color: COLORS.textMuted },
        weight && { fontWeight: FONT[weight] ?? weight },
        size && { fontSize: FONT[size] ?? size },
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function Row({ style, children, gap = SPACING.sm, ...rest }) {
  const { row } = useI18n();
  return (
    <View style={[{ flexDirection: row, alignItems: 'center', gap }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Card({ style, children, padded = true }) {
  return <View style={[styles.card, padded && { padding: SPACING.lg }, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, style }) {
  const { row } = useI18n();
  const palette = {
    primary: { bg: COLORS.primary, fg: COLORS.onPrimary, border: COLORS.primary },
    secondary: { bg: COLORS.surface, fg: COLORS.textDark, border: COLORS.borderStrong },
    ghost: { bg: 'transparent', fg: COLORS.primaryDark, border: 'transparent' },
    danger: { bg: COLORS.dangerSoft, fg: COLORS.danger, border: COLORS.dangerSoft },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.bg, borderColor: palette.border, flexDirection: row },
        pressed && !inactive && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={small ? 16 : 18} color={palette.fg} /> : null}
          {title ? (
            <Text style={[styles.buttonText, small && { fontSize: FONT.small }, { color: palette.fg }]}>{title}</Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = COLORS.textDark, size = 22, label, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: COLORS.primarySoft }, style]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Field({ label, hint, error, secure, style, inputStyle, ...inputProps }) {
  const { t, align, row } = useI18n();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={[{ gap: SPACING.xs }, style]}>
      {label ? <Txt weight="weightMedium" size="small">{label}</Txt> : null}
      <View style={[styles.inputWrap, { flexDirection: row }, error && { borderColor: COLORS.danger }]}>
        <TextInput
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={secure && hidden}
          style={[styles.input, { textAlign: align }, inputStyle]}
          {...inputProps}
        />
        {secure ? (
          <IconButton
            icon={hidden ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={COLORS.textMuted}
            label={hidden ? t('auth.showPassword') : t('auth.hidePassword')}
            onPress={() => setHidden((h) => !h)}
          />
        ) : null}
      </View>
      {error ? (
        <Txt size="small" style={{ color: COLORS.danger }}>{error}</Txt>
      ) : hint ? (
        <Txt size="small" muted>{hint}</Txt>
      ) : null}
    </View>
  );
}

/** Pick one option from a small list (segmented control). */
export function Segmented({ options, value, onChange, style }) {
  const { row } = useI18n();
  return (
    <View style={[styles.segmented, { flexDirection: row }, style]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && { color: COLORS.primaryDark, fontWeight: FONT.weightBold }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const BADGE_TONES = {
  success: [COLORS.successSoft, COLORS.success],
  warning: [COLORS.warningSoft, COLORS.warning],
  danger: [COLORS.dangerSoft, COLORS.danger],
  info: [COLORS.infoSoft, COLORS.info],
  neutral: [COLORS.surfaceSoft, COLORS.textMuted],
};

export function Badge({ label, tone = 'neutral' }) {
  const [bg, fg] = BADGE_TONES[tone] ?? BADGE_TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: FONT.small, fontWeight: FONT.weightMedium }}>{label}</Text>
    </View>
  );
}

export const STATUS_TONE = { ACTIVE: 'success', PENDING: 'warning', SUSPENDED: 'danger', EXPIRED: 'danger', CANCELLED: 'neutral' };

/** Standard page: title row with optional actions, then scrollable content. */
export function Screen({ title, subtitle, actions, children, scroll = true }) {
  const content = (
    <View style={styles.screenInner}>
      {title ? (
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: SPACING.lg }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Txt size="title" weight="weightBold">{title}</Txt>
            {subtitle ? <Txt muted>{subtitle}</Txt> : null}
          </View>
          {actions ? <Row>{actions}</Row> : null}
        </Row>
      ) : null}
      {children}
    </View>
  );
  if (!scroll) return <View style={styles.screen}>{content}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {content}
    </ScrollView>
  );
}

export function EmptyState({ icon = 'tray', title, body, action }) {
  return (
    <View style={styles.empty}>
      <SectionIcon name={icon} size={40} color={COLORS.primary} />
      {title ? <Txt weight="weightBold" size="medium" style={{ textAlign: 'center' }}>{title}</Txt> : null}
      {body ? <Txt muted style={{ textAlign: 'center', maxWidth: 420 }}>{body}</Txt> : null}
      {action}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <View style={styles.errorBox}>
      <Txt style={{ color: COLORS.danger, flexShrink: 1 }}>{errorText(t, error)}</Txt>
      {onRetry ? <Button small variant="secondary" title={t('common.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

/** Translate an ApiError (or any error) into a message. */
export function errorText(t, error) {
  const code = error?.code ?? 'generic';
  const message = t(`errors.${code}`);
  return message === `errors.${code}` ? t('errors.generic') : message;
}

/** A simple modal-like panel that works on phone, tablet and web. */
export function Sheet({ visible, title, onClose, children, footer }) {
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between', marginBottom: SPACING.md }}>
            <Txt size="medium" weight="weightBold" style={{ flexShrink: 1 }}>{title}</Txt>
            <IconButton icon="close" onPress={onClose} />
          </Row>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: SPACING.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <Row style={{ justifyContent: 'flex-end', marginTop: SPACING.lg }}>{footer}</Row> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  text: { color: COLORS.textDark, fontSize: FONT.body },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  buttonSmall: { minHeight: 34, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm },
  buttonText: { fontSize: FONT.body, fontWeight: FONT.weightMedium },
  iconButton: { padding: 6, borderRadius: RADIUS.pill },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    minHeight: 46,
  },
  input: { flex: 1, fontSize: FONT.body, color: COLORS.textDark, paddingVertical: SPACING.sm, outlineStyle: 'none' },
  segmented: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.sm },
  segmentSelected: { backgroundColor: COLORS.surface, ...SHADOWS.card },
  segmentText: { color: COLORS.textMuted, fontSize: FONT.body, textAlign: 'center' },
  badge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.pill, alignSelf: 'flex-start' },
  screen: { flex: 1, backgroundColor: COLORS.background },
  screenInner: { flexGrow: 1, padding: SPACING.lg, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: SPACING.md, padding: SPACING.xxl },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    backgroundColor: COLORS.dangerSoft,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    ...SHADOWS.floating,
  },
});
