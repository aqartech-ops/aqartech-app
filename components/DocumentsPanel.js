import React, { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { documentsApi } from '../services/api';
import { confirm } from '../services/dialog';
import { KINDS, daysLeft, expiryTone, saveScanImages } from '../services/documents';
import { dataUri, openInBrowser, pickFile, pickImage } from '../services/files';
import { DateField, dateText, formatDate, isDateText } from './Fields';
import ScanSheet from './ScanSheet';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, IconButton, Loading, Row, Sheet, Txt, errorText } from './ui';

// Documents of one record (tenant, owner, property, unit, lease, cheque): list, open, add (file / photo / scan),
// rename, set the expiry date, move to the trash. Files stay on our server; every opening is logged.

const ICON = { CIVIL_ID: 'card-account-details-outline', PASSPORT: 'passport', CHEQUE: 'checkbook', CONTRACT: 'file-sign', INVOICE: 'receipt', PHOTO: 'image-outline', OTHER: 'file-document-outline' };

export function ExpiryBadge({ expiryDate }) {
  const { t, lang } = useI18n();
  const tone = expiryTone(expiryDate);
  if (!tone) return null;
  const d = daysLeft(expiryDate);
  const label = d < 0 ? t('documents.expired', { date: formatDate(expiryDate, lang) }) : d <= 30 ? t('documents.expiresIn', { count: d }) : t('documents.expiresOn', { date: formatDate(expiryDate, lang) });
  return <Badge label={label} tone={tone} />;
}

export default function DocumentsPanel({ entity, entityId, editable = true, title }) {
  const { t, lang, row } = useI18n();
  const { levelOf } = useSession();
  const level = levelOf('documents');
  const canEdit = editable && level === 'EDIT';
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null); // picked file waiting for its name/kind
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    if (level === 'HIDDEN') return;
    setError(null);
    documentsApi
      .list({ entity, entityId })
      .then(setDocs)
      .catch((e) => {
        setError(e);
        setDocs([]);
      });
  }, [entity, entityId, level]);
  useEffect(load, [load]);

  if (level === 'HIDDEN') return null;

  const choose = async (how) => {
    setError(null);
    try {
      const file = how === 'file' ? await pickFile() : await pickImage({ camera: how === 'camera' });
      if (file) setAdding(file);
    } catch (e) {
      setError(e);
    }
  };

  const remove = async (doc) => {
    if (!(await confirm({ title: t('common.delete'), message: t('documents.deleteConfirm', { name: doc.name }), confirmText: t('common.delete'), cancelText: t('common.cancel'), destructive: true }))) return;
    try {
      await documentsApi.remove(doc.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{title ?? t('documents.title')}</Txt>
        {canEdit ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Button id="documents.scan" small icon="text-recognition" title={t('documents.scan')} onPress={() => setScanning(true)} />
            <Button id="documents.photo" small variant="secondary" icon="camera-outline" title={t('documents.photo')} onPress={() => choose('camera')} />
            <Button id="documents.upload" small variant="secondary" icon="paperclip" title={t('documents.upload')} onPress={() => choose('file')} />
          </Row>
        ) : null}
      </Row>
      <ErrorBox error={error} onRetry={load} />
      {docs === null ? (
        <Loading />
      ) : docs.length === 0 ? (
        <EmptyState icon="file-document-outline" body={t('documents.none')} />
      ) : (
        docs.map((d, i) => (
          <Row key={d.id} style={[styles.row, i > 0 && styles.divider]}>
            <Pressable onPress={() => setViewing(d)} style={[styles.main, { flexDirection: row }]} accessibilityRole="button">
              <MaterialCommunityIcons name={ICON[d.kind] ?? ICON.OTHER} size={22} color={COLORS.primaryDark} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="weightMedium" numberOfLines={1}>{d.name}</Txt>
                <Txt muted size="small">{[t(`documents.kinds.${d.kind}`), d.side ? t(`documents.sides.${d.side}`) : null, formatDate(d.createdAt, lang)].filter(Boolean).join(' · ')}</Txt>
              </View>
            </Pressable>
            <ExpiryBadge expiryDate={d.expiryDate} />
            {canEdit ? <IconButton id="documents.edit" icon="pencil-outline" label={t('common.edit')} onPress={() => setEditing(d)} /> : null}
            {canEdit ? <IconButton id="documents.delete" icon="trash-can-outline" color={COLORS.danger} label={t('common.delete')} onPress={() => remove(d)} /> : null}
          </Row>
        ))
      )}

      <DocumentForm
        visible={!!adding || !!editing}
        file={adding}
        doc={editing}
        entity={entity}
        entityId={entityId}
        onClose={() => {
          setAdding(null);
          setEditing(null);
        }}
        onSaved={() => {
          setAdding(null);
          setEditing(null);
          load();
        }}
      />
      <ScanSheet
        visible={scanning}
        onClose={() => setScanning(false)}
        applyLabel={t('documents.saveScan')}
        onApply={async ({ kind, values, images, recognitionId }) => {
          setScanning(false);
          try {
            await saveScanImages({ entity, entityId, images, kind: KINDS.includes(kind) ? kind : 'OTHER', name: t(`documents.kinds.${kind}`), recognitionId, extracted: values, expiryDate: isDateText(values.expiryDate ?? '') ? values.expiryDate : undefined });
            load();
          } catch (e) {
            setError(e);
          }
        }}
      />
      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

/** Name, kind and expiry of a new file (or of an existing document). */
export function DocumentForm({ visible, file, doc, entity, entityId, onClose, onSaved }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: '', kind: 'OTHER', expiryDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setForm(doc ? { name: doc.name, kind: doc.kind, expiryDate: dateText(doc.expiryDate) } : { name: (file?.name ?? '').replace(/\.[a-z0-9]+$/i, '') || t('documents.kinds.OTHER'), kind: file?.mimeType?.startsWith('image/') ? 'PHOTO' : 'OTHER', expiryDate: '' });
    setBusy(false);
    setError(null);
  }, [visible, doc, file, t]);

  if (!visible) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) return setError({ code: 'validation.required', field: 'name' });
    if (form.expiryDate && !isDateText(form.expiryDate)) return setError({ code: 'validation.date', field: 'expiryDate' });
    setBusy(true);
    setError(null);
    try {
      const fields = { name: form.name.trim(), kind: form.kind, expiryDate: form.expiryDate || null };
      if (doc) await documentsApi.update(doc.id, fields);
      else await documentsApi.create({ entity, entityId, ...fields, mimeType: file.mimeType, data: file.data });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);
  return (
    <Sheet
      visible
      title={doc ? t('documents.editTitle') : t('documents.addTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !['name', 'expiryDate'].includes(error.field) ? <ErrorBox error={error} /> : null}
      {file?.mimeType?.startsWith('image/') ? <Image source={{ uri: file.uri }} style={styles.preview} resizeMode="contain" /> : null}
      <Field label={t('documents.name')} value={form.name} onChangeText={set('name')} error={fieldError('name')} />
      <Txt size="small" weight="weightMedium">{t('documents.kind')}</Txt>
      <ChipSelect value={form.kind} onChange={set('kind')} options={KINDS.map((k) => ({ value: k, label: t(`documents.kinds.${k}`) }))} />
      <DateField label={t('documents.expiryDate')} value={form.expiryDate} onChangeText={set('expiryDate')} error={fieldError('expiryDate')} hint={t('documents.expiryHint')} />
    </Sheet>
  );
}

/** Opens a document: images inside the app; PDFs in a new browser tab (web — opened by a click, so no pop-up blocker). */
export function DocumentViewer({ doc, onClose }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setFile(null);
    setError(null);
    if (!doc) return;
    documentsApi
      .file(doc.id)
      .then(setFile)
      .catch(setError);
  }, [doc]);

  if (!doc) return null;
  const image = file?.mimeType?.startsWith('image/');
  return (
    <Sheet visible title={doc.name} onClose={onClose}>
      <ErrorBox error={error} />
      {!file && !error ? <Loading /> : null}
      {image ? <Image source={{ uri: dataUri(file) }} style={styles.full} resizeMode="contain" /> : null}
      {file && !image && Platform.OS !== 'web' ? <Txt muted>{t('documents.pdfOnWeb')}</Txt> : null}
      {file && Platform.OS === 'web' ? <Button id="documents.open" small variant="secondary" icon="open-in-new" title={t('documents.openFull')} onPress={() => openInBrowser(file)} style={{ alignSelf: 'flex-start' }} /> : null}
      <ExpiryBadge expiryDate={doc.expiryDate} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: SPACING.sm, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  main: { flex: 1, minWidth: 180, alignItems: 'center', gap: SPACING.sm },
  preview: { width: '100%', height: 180, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceSoft },
  full: { width: '100%', height: 420, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceSoft },
});
