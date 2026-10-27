import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { searchApi } from '../services/api';
import { matches, normalizeSearch } from '../services/text';
import { ErrorBox, IconButton, Row, Txt } from './ui';
import { SectionIcon } from './Rial';

/**
 * Global search (محرك البحث): every letter typed searches sections on the device and
 * records on the server (users now; properties, tenants, leases, cheques… as phases land).
 */
export default function SearchModal({ visible, onClose, items, onNavigate }) {
  const { t, align, row } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResult(null);
      setError(null);
    }
  }, [visible]);

  // Debounced server search on every keystroke
  useEffect(() => {
    if (!normalizeSearch(query)) {
      setResult(null);
      setLoading(false);
      return undefined;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchApi.run(query);
        if (id === requestId.current) {
          setResult(data);
          setError(null);
        }
      } catch (e) {
        if (id === requestId.current) setError(e);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const sectionHits = useMemo(
    () => items.filter((i) => matches(i.label, query) || matches(t(`tabs.${i.key}`), query)),
    [items, query, t],
  );

  const go = (section, params) => {
    onNavigate(section, params);
    onClose();
  };

  const hasQuery = !!normalizeSearch(query);
  const groups = result?.groups ?? [];
  const nothing = hasQuery && !loading && sectionHits.length === 0 && groups.length === 0 && !error;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Row style={styles.header}>
          <View style={[styles.inputWrap, { flexDirection: row }]}>
            <MaterialCommunityIcons name="magnify" size={22} color={COLORS.textMuted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t('search.placeholder')}
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, { textAlign: align }]}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            {query ? <IconButton icon="close-circle" size={20} color={COLORS.textMuted} onPress={() => setQuery('')} /> : null}
          </View>
          <Pressable onPress={onClose} hitSlop={8}>
            <Txt weight="weightMedium" style={{ color: COLORS.primaryDark }}>{t('common.cancel')}</Txt>
          </Pressable>
        </Row>

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.lg }} keyboardShouldPersistTaps="handled">
          {!hasQuery ? <Txt muted style={{ textAlign: 'center' }}>{t('search.hint')}</Txt> : null}
          <ErrorBox error={error} />

          {sectionHits.length ? (
            <Group title={t('search.sections')}>
              {sectionHits.map((s) => (
                <ResultRow key={s.key} icon={s.icon} title={s.label} onPress={() => go(s.key)} />
              ))}
            </Group>
          ) : null}

          {groups.map((g) => (
            <Group key={g.type} title={t(`search.${g.type}`)}>
              {g.items.map((item) => (
                <ResultRow
                  key={item.id}
                  icon={items.find((i) => i.key === g.section)?.icon ?? 'file-outline'}
                  title={item.title}
                  subtitle={item.subtitle}
                  onPress={() => go(g.section, item.propertyId ? { propertyId: item.propertyId } : item.ownerId ? { ownerId: item.ownerId } : item.tenantId ? { tenantId: item.tenantId } : item.leaseId ? { leaseId: item.leaseId } : item.paymentId ? { paymentId: item.paymentId } : item.chequeId ? { chequeId: item.chequeId } : item.workOrderId ? { workOrderId: item.workOrderId } : null)}
                />
              ))}
            </Group>
          ))}

          {nothing ? <Txt muted style={{ textAlign: 'center' }}>{t('search.noResults', { query })}</Txt> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Group({ title, children }) {
  return (
    <View style={{ gap: SPACING.sm }}>
      <Txt size="small" weight="weightBold" muted>{title}</Txt>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function ResultRow({ icon, title, subtitle, onPress }) {
  const { forwardIcon } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
      <Row style={styles.resultRow} gap={SPACING.md}>
        <View style={styles.resultIcon}>
          <SectionIcon name={icon} size={20} color={COLORS.primaryDark} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt weight="weightMedium" numberOfLines={1}>{title}</Txt>
          {subtitle ? <Txt muted size="small" numberOfLines={1}>{subtitle}</Txt> : null}
        </View>
        <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    padding: SPACING.md,
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  inputWrap: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
  },
  input: { flex: 1, fontSize: FONT.medium, color: COLORS.textDark, paddingVertical: SPACING.sm, outlineStyle: 'none' },
  group: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  resultRow: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
