import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { confirm, notify } from '../services/dialog';
import { useCustomSections } from '../services/customSections';
import { EDIT_ACTIONS, fillTemplate, readPath, useButtonsConfig, whatsappUrl } from '../services/buttons';
import { Button, ErrorBox } from './ui';

/**
 * Buttons added by the platform team on a record page (Buttons page → "Added buttons").
 *  - entity: 'tenant' | 'lease' | 'owner' | 'property' | 'cs:<section key>'
 *  - record: the record as loaded by the page (its fields fill {{…}} in texts and links)
 *  - editable: the user may edit this record (needed by actions that change data)
 *  - onUpdate(customValues): saves extra-field values on the record and reloads the page (for "set a field")
 *  - onNavigate: app navigation (for "new record in a section")
 */
export default function CustomActions({ entity, record, editable, onUpdate, onNavigate }) {
  const { t, lang, row } = useI18n();
  const { levelOf } = useSession();
  const { custom } = useButtonsConfig();
  const sections = useCustomSections();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const label = (b) => (lang === 'ar' ? b.labelAr : b.labelEn);
  const allowed = (b) => {
    if (b.action === 'NEW_RECORD') {
      const target = sections.find((s) => s.key === b.config?.section && !s.parentId);
      return !!target && levelOf(`cs_${target.key}`) === 'EDIT' && !!onNavigate;
    }
    if (EDIT_ACTIONS.includes(b.action)) return editable && !!onUpdate;
    return true;
  };
  const buttons = (custom ?? []).filter((b) => b.entity === entity && allowed(b));
  if (!record || !buttons.length) return null;

  const open = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      notify(t('buttons.cannotOpen'), url);
    }
  };

  const run = async (b) => {
    const c = b.config ?? {};
    setError(null);
    switch (b.action) {
      case 'LINK':
        return open(fillTemplate(c.url, record, encodeURIComponent));
      case 'WHATSAPP': {
        const url = whatsappUrl(readPath(record, c.phoneField), fillTemplate(c.message, record));
        return url ? open(url) : notify(label(b), t('buttons.noPhone'));
      }
      case 'CALL': {
        const phone = readPath(record, c.phoneField);
        return phone ? open(`tel:${String(phone).replace(/\s+/g, '')}`) : notify(label(b), t('buttons.noPhone'));
      }
      case 'EMAIL': {
        const to = readPath(record, c.emailField);
        if (!to) return notify(label(b), t('buttons.noEmail'));
        const query = [c.subject && `subject=${encodeURIComponent(fillTemplate(c.subject, record))}`, c.body && `body=${encodeURIComponent(fillTemplate(c.body, record))}`].filter(Boolean).join('&');
        return open(`mailto:${to}${query ? `?${query}` : ''}`);
      }
      case 'SET_FIELD': {
        if (c.confirm) {
          const ok = await confirm({ title: label(b), message: t('buttons.confirmRun', { name: label(b) }), confirmText: label(b), cancelText: t('common.cancel') });
          if (!ok) return undefined;
        }
        setBusy(b.id);
        try {
          await onUpdate({ [c.field]: c.value });
        } catch (e) {
          setError(e);
        } finally {
          setBusy(null);
        }
        return undefined;
      }
      case 'NEW_RECORD': {
        const values = {};
        for (const pair of c.copy ?? []) {
          const value = readPath(record, pair.from);
          if (value !== undefined && value !== null && value !== '') values[pair.to] = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value;
        }
        const propertyId = entity === 'property' ? record.id : record.propertyId ?? undefined;
        return onNavigate(`cs_${c.section}`, { newRecord: { custom: values, propertyId } });
      }
      default:
        return undefined;
    }
  };

  return (
    <View style={{ gap: SPACING.sm }}>
      <ErrorBox error={error} />
      <View style={[styles.row, { flexDirection: row }]}>
        {buttons.map((b) => (
          <Button key={b.id} small variant="secondary" icon={b.icon} title={label(b)} loading={busy === b.id} onPress={() => run(b)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: SPACING.sm },
});
