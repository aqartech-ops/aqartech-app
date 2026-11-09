import React, { useCallback, useState } from 'react';
import { COLORS } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { notify } from '../services/dialog';
import { saveScanImages } from '../services/documents';
import ScanSheet from './ScanSheet';
import { Button, Txt, errorText } from './ui';

// "Scan to fill" inside a form (e.g. tenant form → scan the civil ID): the checked values fill the form,
// and once the record is saved, the images are attached to it as documents.

const titleCase = (s) => String(s ?? '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** The person's name from a scanned ID, in the language of the app when both are there. */
export function scannedName(values, lang) {
  const ar = values.nameAr?.trim();
  const en = values.nameEn?.trim() ? titleCase(values.nameEn.trim()) : '';
  return lang === 'ar' ? ar || en : en || ar;
}

export function useScanFill({ hint, buttonId, label, onFill }) {
  const { t } = useI18n();
  const { levelOf } = useSession();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const allowed = levelOf('documents') === 'EDIT';

  const reset = useCallback(() => setPending(null), []);

  /** After the record is saved: keep the scanned images as its documents (a failure is reported, the record stays). */
  const attach = async (entity, entityId) => {
    if (!pending || !entityId) return;
    try {
      await saveScanImages({
        entity,
        entityId,
        images: pending.images,
        kind: hint,
        name: t(`documents.kinds.${hint}`),
        recognitionId: pending.recognitionId,
        extracted: pending.values,
        expiryDate: /^\d{4}-\d{2}-\d{2}$/.test(pending.values.expiryDate ?? '') ? pending.values.expiryDate : undefined,
      });
    } catch (e) {
      notify(t('documents.attachFailed'), errorText(t, e));
    }
    setPending(null);
  };

  const element = allowed ? (
    <>
      <Button id={buttonId} small variant="secondary" icon="text-recognition" title={label} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      {pending ? <Txt size="small" style={{ color: COLORS.success }}>{t('scan.filled')}</Txt> : null}
      <ScanSheet
        visible={open}
        hint={hint}
        onClose={() => setOpen(false)}
        applyLabel={t('scan.fill')}
        onApply={(r) => {
          setOpen(false);
          setPending(r);
          onFill(r.values, r);
        }}
      />
    </>
  ) : null;

  return { element, attach, reset, pending };
}
