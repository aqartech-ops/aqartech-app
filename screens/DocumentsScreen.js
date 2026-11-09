import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { documentsApi, ownersApi, propertiesApi, tenantsApi } from '../services/api';
import { EXPIRY_SOON_DAYS, KINDS, saveScanImages } from '../services/documents';
import { matches } from '../services/text';
import { formatDate, isDateText } from '../components/Fields';
import { DocumentViewer, ExpiryBadge } from '../components/DocumentsPanel';
import ScanSheet from '../components/ScanSheet';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, Loading, Row, Screen, Segmented, Sheet, Txt } from '../components/ui';

// Documents (المستندات): every document of the company in one place — what expires soon, the trash —
// and "Scan a document": our own engine reads any document (ID card, cheque, contract, invoice …) and
// the result can be attached to a tenant, an owner or a property.

const OPEN = {
  tenant: (d) => ['tenants', { tenantId: d.entityId }],
  owner: (d) => ['owners', { ownerId: d.entityId }],
  property: (d) => ['properties', { propertyId: d.entityId }],
  lease: (d) => ['tenants', { leaseId: d.entityId }],
  cheque: (d) => ['financials', { chequeId: d.entityId }],
};

export default function DocumentsScreen({ onNavigate }) {
  const { t, lang } = useI18n();
  const { canEdit } = useSession();
  const editable = canEdit('documents');
  const [tab, setTab] = useState('expiring');
  const [kind, setKind] = useState('');
  const [text, setText] = useState('');
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null); // a reading waiting to be attached
  const [ocr, setOcr] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setDocs(null);
    documentsApi
      .list({ kind: kind || undefined, expiring: tab === 'expiring' ? EXPIRY_SOON_DAYS : undefined, deleted: tab === 'trash' ? '1' : undefined })
      .then(setDocs)
      .catch((e) => {
        setError(e);
        setDocs([]);
      });
  }, [tab, kind]);
  useEffect(load, [load]);
  useEffect(() => {
    documentsApi.status().then(setOcr).catch(() => setOcr(null));
  }, []);

  const visible = useMemo(() => (docs ?? []).filter((d) => !text.trim() || matches([d.name, d.label, t(`documents.kinds.${d.kind}`)].filter(Boolean).join(' '), text)), [docs, text, t]);

  const restore = async (d) => {
    try {
      await documentsApi.restore(d.id);
      load();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen
      title={t('documents.title')}
      subtitle={t('documents.subtitle')}
      actions={editable ? <Button id="documents.scanAny" icon="text-recognition" title={t('documents.scanAny')} onPress={() => setScanning(true)} /> : null}
    >
      <View style={{ gap: SPACING.md }}>
        {ocr && !ocr.ocrReady ? (
          <Card style={{ gap: SPACING.xs, borderColor: COLORS.warning }}>
            <Txt weight="weightBold">{t('documents.ocrOffTitle')}</Txt>
            <Txt muted size="small">{t('documents.ocrOffBody')}</Txt>
          </Card>
        ) : null}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expiring', label: t('documents.tabs.expiring') },
            { value: 'all', label: t('documents.tabs.all') },
            { value: 'trash', label: t('documents.tabs.trash') },
          ]}
        />
        <ChipSelect value={kind} onChange={setKind} options={[{ value: '', label: t('documents.allKinds') }, ...KINDS.map((k) => ({ value: k, label: t(`documents.kinds.${k}`) }))]} />
        <Field placeholder={t('documents.search')} value={text} onChangeText={setText} />
        <ErrorBox error={error} onRetry={load} />
        {tab === 'expiring' ? <Txt muted size="small">{t('documents.expiringHint', { days: EXPIRY_SOON_DAYS })}</Txt> : null}

        {docs === null ? (
          <Loading />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState icon="file-document-multiple-outline" body={t(tab === 'expiring' ? 'documents.noneExpiring' : tab === 'trash' ? 'documents.trashEmpty' : 'documents.noneAll')} />
          </Card>
        ) : (
          <Card padded={false}>
            {visible.map((d, i) => (
              <Row key={d.id} style={[styles.row, i > 0 && styles.divider]}>
                <Pressable onPress={() => (tab === 'trash' ? null : setViewing(d))} style={{ flex: 1, minWidth: 200, gap: 2 }} accessibilityRole="button">
                  <Txt weight="weightMedium" numberOfLines={1}>{d.name}</Txt>
                  <Txt muted size="small" numberOfLines={1}>
                    {[t(`documents.entities.${d.entity}`), d.label, t(`documents.kinds.${d.kind}`), formatDate(d.createdAt, lang)].filter(Boolean).join(' · ')}
                  </Txt>
                </Pressable>
                <ExpiryBadge expiryDate={d.expiryDate} />
                {tab === 'trash' ? (
                  editable ? <Button id="documents.restore" small variant="secondary" icon="restore" title={t('common.restore')} onPress={() => restore(d)} /> : null
                ) : OPEN[d.entity] ? (
                  <Button id="documents.openRecord" small variant="ghost" icon="arrow-top-right" title={t('documents.openRecord')} onPress={() => onNavigate?.(...OPEN[d.entity](d))} />
                ) : null}
              </Row>
            ))}
          </Card>
        )}
      </View>

      <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
      <ScanSheet
        visible={scanning}
        onClose={() => setScanning(false)}
        applyLabel={t('documents.attachTo')}
        onApply={(r) => {
          setScanning(false);
          setScan(r);
        }}
      />
      <AttachSheet
        scan={scan}
        onClose={() => setScan(null)}
        onSaved={() => {
          setScan(null);
          setTab('all');
          load();
        }}
      />
    </Screen>
  );
}

/** Choose the tenant / owner / property the scanned document belongs to, then save its images there. */
function AttachSheet({ scan, onClose, onSaved }) {
  const { t } = useI18n();
  const { levelOf } = useSession();
  const entities = [
    ['tenant', 'tenants', tenantsApi],
    ['owner', 'owners', ownersApi],
    ['property', 'properties', propertiesApi],
  ].filter(([, section]) => levelOf(section) !== 'HIDDEN');
  const [entity, setEntity] = useState(entities[0]?.[0] ?? 'tenant');
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!scan) return;
    setText(scan.values.civilId ?? '');
    setError(null);
  }, [scan]);

  useEffect(() => {
    if (!scan) return;
    const api = entities.find(([e]) => e === entity)?.[2];
    setRows(null);
    api
      ?.list()
      .then(setRows)
      .catch((e) => {
        setError(e);
        setRows([]);
      });
  }, [scan, entity]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!scan) return null;
  const label = (r) => [r.name, r.civilId || r.crNumber || r.code].filter(Boolean).join(' · ');
  const list = (rows ?? []).filter((r) => !text.trim() || matches(label(r), text)).slice(0, 30);

  const attach = async (r) => {
    setBusy(r.id);
    setError(null);
    try {
      const kind = KINDS.includes(scan.kind) ? scan.kind : 'OTHER';
      await saveScanImages({
        entity,
        entityId: r.id,
        images: scan.images,
        kind,
        name: t(`documents.kinds.${kind}`),
        recognitionId: scan.recognitionId,
        extracted: scan.values,
        expiryDate: isDateText(scan.values.expiryDate ?? '') ? scan.values.expiryDate : undefined,
      });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };

  return (
    <Sheet visible title={t('documents.attachTo')} onClose={onClose}>
      <ErrorBox error={error} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Txt>{t('scan.detected')}</Txt>
        <Badge label={t(`documents.kinds.${scan.kind}`)} tone="info" />
      </Row>
      <Segmented value={entity} onChange={setEntity} options={entities.map(([e]) => ({ value: e, label: t(`documents.entities.${e}`) }))} />
      <Field placeholder={t('documents.findRecord')} value={text} onChangeText={setText} />
      {rows === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState icon="magnify" body={t('documents.noRecord')} />
      ) : (
        list.map((r) => (
          <Row key={r.id} style={styles.row}>
            <MaterialCommunityIcons name="account-outline" size={20} color={COLORS.textMuted} />
            <Txt style={{ flex: 1 }} numberOfLines={1}>{label(r)}</Txt>
            <Button id="documents.attach" small icon="paperclip" title={t('documents.attach')} loading={busy === r.id} onPress={() => attach(r)} />
          </Row>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { padding: SPACING.md, alignItems: 'center', flexWrap: 'wrap' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
});
