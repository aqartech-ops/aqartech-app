import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { documentsApi } from '../services/api';
import { pickImage } from '../services/files';
import { omrInput, parseOMR } from '../services/money';
import { DateField } from './Fields';
import { MoneyField } from './Rial';
import { Badge, Button, ErrorBox, Field, Loading, Row, Sheet, Txt } from './ui';

// Scan a document (قراءة مستند): photograph or choose 1–2 images (an ID card: front + back), our own engine
// reads them on our server, then the staff member checks every field (coloured by confidence) before using it.
// Nothing is saved here: `onApply` gets the checked values and the images; the caller decides what to do.

const ORDER = {
  CIVIL_ID: ['nameAr', 'nameEn', 'civilId', 'nationality', 'nationalityCode', 'birthDate', 'expiryDate', 'sex', 'documentNumber'],
  CHEQUE: ['number', 'bankName', 'bankNameAr', 'amount', 'date', 'account'],
};
const DATE_KEYS = new Set(['birthDate', 'expiryDate', 'date']);
const MONEY_KEYS = new Set(['amount']);
const TONE = { high: COLORS.success, medium: COLORS.warning, low: COLORS.danger };

const toText = (key, value) => (MONEY_KEYS.has(key) ? omrInput(value) : Array.isArray(value) ? value.map((v) => (key === 'amounts' ? omrInput(v) : v)).join(', ') : String(value ?? ''));

/** The checked values back in API shape: amounts in baisa, the rest as text. */
function fromText(values) {
  const out = {};
  for (const [key, text] of Object.entries(values)) {
    if (!String(text).trim()) continue;
    out[key] = MONEY_KEYS.has(key) ? parseOMR(text) : String(text).trim();
  }
  return out;
}

export default function ScanSheet({ visible, onClose, hint = null, title, applyLabel, onApply }) {
  const { t } = useI18n();
  const twoSides = hint === 'CIVIL_ID';
  const [images, setImages] = useState([]);
  const [step, setStep] = useState('pick');
  const [result, setResult] = useState(null);
  const [values, setValues] = useState({});
  const [showText, setShowText] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setImages([]);
    setStep('pick');
    setResult(null);
    setValues({});
    setShowText(false);
    setError(null);
  }, [visible]);

  if (!visible) return null;

  const pick = async (slot, camera) => {
    setError(null);
    try {
      const img = await pickImage({ camera });
      if (img) setImages((list) => Object.assign([...list], { [slot]: img }));
    } catch (e) {
      setError(e);
    }
  };

  const read = async () => {
    const list = images.filter(Boolean);
    if (!list.length) return;
    setStep('reading');
    setError(null);
    try {
      const r = await documentsApi.recognize(list.map((i) => ({ data: i.data, mimeType: i.mimeType })), hint);
      setResult(r);
      setValues(Object.fromEntries(Object.entries(r.fields).map(([k, f]) => [k, toText(k, f.value)])));
      setStep('review');
    } catch (e) {
      setError(e);
      setStep('pick');
    }
  };

  const apply = () => {
    const checked = fromText(values);
    documentsApi.feedback(result.recognitionId, checked).catch(() => {}); // the engine learns from corrections
    onApply?.({ kind: result.kind, values: checked, images: images.filter(Boolean), recognitionId: result.recognitionId });
  };

  const keys = result
    ? [...(ORDER[result.kind] ?? []).filter((k) => k in result.fields), ...Object.keys(result.fields).filter((k) => !(ORDER[result.kind] ?? []).includes(k))]
    : [];

  // an ID card has two sides; any other document can add a second image once the first is there
  const slots = twoSides || images[0] ? [0, 1] : [0];

  return (
    <Sheet
      visible
      title={title ?? t('scan.title')}
      onClose={onClose}
      footer={
        step === 'review' ? (
          <>
            <Button id="scan.again" variant="secondary" icon="camera-retake-outline" title={t('scan.again')} onPress={() => setStep('pick')} />
            <Button id="scan.apply" icon="check" title={applyLabel ?? t('scan.apply')} onPress={apply} />
          </>
        ) : step === 'pick' ? (
          <>
            <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
            <Button id="scan.read" icon="text-recognition" title={t('scan.read')} disabled={!images.some(Boolean)} onPress={read} />
          </>
        ) : null
      }
    >
      {error ? <ErrorBox error={error} /> : null}

      {step === 'pick' ? (
        <>
          <Txt muted size="small">{t(twoSides ? 'scan.hintId' : hint === 'CHEQUE' ? 'scan.hintCheque' : 'scan.hint')}</Txt>
          {slots.map((slot) => (
            <View key={slot} style={styles.slot}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Txt weight="weightMedium">{t(slot === 0 ? (twoSides ? 'scan.front' : 'scan.image') : twoSides ? 'scan.backOptional' : 'scan.secondImage')}</Txt>
                {images[slot] ? <Badge label={t('scan.ready')} tone="success" /> : null}
              </Row>
              {images[slot] ? <Image source={{ uri: images[slot].uri }} style={styles.preview} resizeMode="contain" /> : null}
              <Row style={{ flexWrap: 'wrap' }}>
                <Button id="scan.camera" small icon="camera-outline" title={t('scan.camera')} onPress={() => pick(slot, true)} />
                <Button id="scan.library" small variant="secondary" icon="image-outline" title={t('scan.library')} onPress={() => pick(slot, false)} />
              </Row>
            </View>
          ))}
          <Txt muted size="small">{t('scan.privacy')}</Txt>
        </>
      ) : null}

      {step === 'reading' ? (
        <View style={{ gap: SPACING.sm, alignItems: 'center', paddingVertical: SPACING.lg }}>
          <Loading />
          <Txt muted>{t('scan.reading')}</Txt>
        </View>
      ) : null}

      {step === 'review' && result ? (
        <>
          <Row style={{ flexWrap: 'wrap' }}>
            <Txt>{t('scan.detected')}</Txt>
            <Badge label={t(`documents.kinds.${result.kind}`)} tone="info" />
          </Row>
          {keys.length ? (
            <>
              <Txt muted size="small">{t('scan.check')}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                {['high', 'medium', 'low'].map((c) => (
                  <Row key={c} gap={4}>
                    <View style={[styles.dot, { backgroundColor: TONE[c] }]} />
                    <Txt size="small" muted>{t(`scan.confidence.${c}`)}</Txt>
                  </Row>
                ))}
              </Row>
              {keys.map((key) => {
                const f = result.fields[key];
                const label = t(`scan.fields.${key}`);
                const set = (text) => setValues((v) => ({ ...v, [key]: text }));
                const props = { label, value: values[key] ?? '', onChangeText: set, hint: t(`scan.confidence.${f.confidence}`) };
                return (
                  <View key={key} style={[styles.field, { borderColor: TONE[f.confidence] }]}>
                    {DATE_KEYS.has(key) ? <DateField {...props} /> : MONEY_KEYS.has(key) ? <MoneyField {...props} /> : <Field {...props} />}
                  </View>
                );
              })}
            </>
          ) : (
            <View style={{ alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.md }}>
              <MaterialCommunityIcons name="text-box-search-outline" size={32} color={COLORS.textMuted} />
              <Txt muted style={{ textAlign: 'center' }}>{t('scan.nothing')}</Txt>
            </View>
          )}
          <Button id="scan.showText" small variant="ghost" icon="text-long" title={t(showText ? 'scan.hideText' : 'scan.showText')} onPress={() => setShowText((s) => !s)} style={{ alignSelf: 'flex-start' }} />
          {showText ? (
            <View style={styles.text}>
              <Txt selectable size="small">{result.text || '—'}</Txt>
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  slot: { gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSoft },
  preview: { width: '100%', height: 160, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  dot: { width: 10, height: 10, borderRadius: 5 },
  field: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm },
  text: { padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceSoft, maxHeight: 220 },
});
