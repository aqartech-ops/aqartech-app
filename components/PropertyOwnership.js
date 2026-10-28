import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { ownersApi } from '../services/api';
import { confirm } from '../services/dialog';
import { formatOMR, parseOMR } from '../services/money';
import { Money, MoneyField } from './Rial';
import {
  DateField,
  OwnerPicker,
  PercentField,
  PickerButton,
  bpFromText,
  dateText,
  formatDate,
  isDateText,
  pctLabel,
  textFromBp,
  today,
} from './Fields';
import { Badge, Button, Card, ChipSelect, ErrorBox, Field, IconButton, Row, Segmented, Sheet, Txt, errorText } from './ui';

const FEE_METHODS = ['PERCENT_OF_COLLECTED', 'PERCENT_OF_DUE', 'FIXED'];
const PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'];

/** Owner & management agreement + partners, shown inside a property (needs the "owners" section). */
export default function PropertyOwnership({ property, linkOwnerId, onLinkHandled }) {
  const { levelOf, canEdit } = useSession();
  const [agreementState, setAgreementState] = useState(null); // { hasActive } once loaded
  if (levelOf('owners') === 'HIDDEN') return null;
  const editable = canEdit('owners');
  // Linking from an owner's page: a managed property without an active agreement → agreement
  // editor; otherwise → partners editor. Wait until we know whether an agreement exists.
  const managed = property.ownership === 'MANAGED';
  const ready = !linkOwnerId || !managed || agreementState !== null;
  const linkTarget = editable && linkOwnerId && ready ? (managed && !agreementState?.hasActive ? 'agreement' : 'partners') : null;
  return (
    <>
      <AgreementCard
        property={property}
        editable={editable}
        onLoaded={setAgreementState}
        linkOwnerId={linkTarget === 'agreement' ? linkOwnerId : null}
        onLinkHandled={onLinkHandled}
      />
      <PartnersCard
        property={property}
        editable={editable}
        linkOwnerId={linkTarget === 'partners' ? linkOwnerId : null}
        onLinkHandled={onLinkHandled}
      />
    </>
  );
}

function useOwners(enabled) {
  const [owners, setOwners] = useState(null);
  useEffect(() => {
    if (enabled) ownersApi.list().then(setOwners).catch(() => setOwners([]));
  }, [enabled]);
  return owners;
}

// ------------------------------------------------------------------ agreement

function AgreementCard({ property, editable, onLoaded, linkOwnerId, onLinkHandled }) {
  const { t, lang } = useI18n();
  const [agreements, setAgreements] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const managed = property.ownership === 'MANAGED';

  const load = useCallback(async () => {
    if (!managed) return;
    try {
      const list = await ownersApi.agreements(property.id);
      setAgreements(list);
      onLoaded?.({ hasActive: list.some((a) => a.status === 'ACTIVE') });
    } catch (e) {
      setError(e);
    }
  }, [property.id, managed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (linkOwnerId) {
      setEditing({ ownerId: linkOwnerId });
      onLinkHandled?.();
    }
  }, [linkOwnerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = agreements?.find((a) => a.status === 'ACTIVE');
  const history = agreements?.filter((a) => a.status !== 'ACTIVE') ?? [];

  const end = async () => {
    const ok = await confirm({ title: t('agreement.end'), message: t('agreement.endConfirm'), confirmText: t('common.confirm'), cancelText: t('common.cancel'), destructive: true });
    if (!ok) return;
    try {
      await ownersApi.endAgreement(property.id, { endDate: today() });
      load();
    } catch (e) {
      setError(e);
    }
  };

  const feeSummary = (a) =>
    a.feeMethod === 'FIXED' ? null : t('agreement.feeSummaryPercent', { pct: pctLabel(a.feeRateBp ?? 0), base: t(a.feeMethod === 'PERCENT_OF_DUE' ? 'agreement.baseDue' : 'agreement.baseCollected') });

  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt weight="weightBold">{t('agreement.title')}</Txt>
        {managed && editable ? (
          <Row>
            {active ? <Button id="agreement.end" small variant="danger" title={t('agreement.end')} onPress={end} /> : null}
            <Button id="agreement.manage" small icon={active ? 'pencil-outline' : 'plus'} title={active ? t('agreement.edit') : t('agreement.add')} onPress={() => setEditing(active ?? {})} />
          </Row>
        ) : null}
      </Row>
      <ErrorBox error={error} />
      {!managed ? (
        <Txt muted>{t('agreement.notManaged')}</Txt>
      ) : !active ? (
        <Txt muted>{agreements ? t('agreement.none') : t('common.loading')}</Txt>
      ) : (
        <View style={{ gap: SPACING.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('agreement.owner')}</Txt>
            <Txt weight="weightMedium">{active.owner.name}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('agreement.startDate')}</Txt>
            <Txt>{formatDate(active.startDate, lang)}{active.endDate ? ` → ${formatDate(active.endDate, lang)}` : ''}</Txt>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('agreement.feeMethod')}</Txt>
            {active.feeMethod === 'FIXED' ? <Money baisa={active.feeFixed} weight="weightMedium" /> : <Txt weight="weightMedium">{feeSummary(active)}</Txt>}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{t('agreement.statementPeriod')}</Txt>
            <Txt>{t(`agreement.periodValues.${active.statementPeriod}`)}</Txt>
          </Row>
          {active.notes ? <Txt muted>{active.notes}</Txt> : null}
        </View>
      )}
      {history.length ? (
        <View style={{ gap: 4 }}>
          <Txt muted size="small" weight="weightBold">{t('agreement.history')}</Txt>
          {history.map((a) => (
            <Txt key={a.id} muted size="small">
              {a.owner.name} · {formatDate(a.startDate, lang)} → {formatDate(a.endDate, lang)}
            </Txt>
          ))}
        </View>
      ) : null}
      <AgreementForm
        propertyId={property.id}
        agreement={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </Card>
  );
}

function AgreementForm({ propertyId, agreement, onClose, onSaved }) {
  const { t } = useI18n();
  const owners = useOwners(!!agreement);
  const [form, setForm] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fieldError = (name) => (error?.field === name ? errorText(t, error) : undefined);

  // Fill in the owner's name when the form was opened with only an owner id
  useEffect(() => {
    if (owners && form.ownerId && !form.ownerName) {
      const o = owners.find((x) => x.id === form.ownerId);
      if (o) setForm((f) => ({ ...f, ownerName: o.name }));
    }
  }, [owners, form.ownerId, form.ownerName]);

  useEffect(() => {
    if (!agreement) return;
    setForm({
      ownerId: agreement.ownerId ?? agreement.owner?.id ?? '',
      ownerName: agreement.owner?.name ?? '',
      startDate: dateText(agreement.startDate) || today(),
      endDate: dateText(agreement.endDate),
      feeMethod: agreement.feeMethod ?? 'PERCENT_OF_COLLECTED',
      feeRate: textFromBp(agreement.feeRateBp),
      feeFixed: agreement.feeFixed ? formatOMR(agreement.feeFixed, 'en', { withCurrency: false }).replace(/,/g, '') : '',
      statementPeriod: agreement.statementPeriod ?? 'MONTHLY',
      notes: agreement.notes ?? '',
    });
    setError(null);
    setBusy(false);
  }, [agreement]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const fixed = form.feeMethod === 'FIXED';

  const save = async () => {
    if (!form.ownerId) return setError({ code: 'owner.notFound', field: 'ownerId' });
    if (!isDateText(form.startDate)) return setError({ code: 'validation.date', field: 'startDate' });
    if (form.endDate && !isDateText(form.endDate)) return setError({ code: 'validation.date', field: 'endDate' });
    const feeRateBp = fixed ? null : bpFromText(form.feeRate);
    const feeFixed = fixed ? parseOMR(form.feeFixed) : null;
    if (!fixed && (feeRateBp === null || Number.isNaN(feeRateBp))) return setError({ code: 'validation.required', field: 'feeRateBp' });
    if (fixed && feeFixed === null) return setError({ code: 'validation.required', field: 'feeFixed' });
    setBusy(true);
    setError(null);
    try {
      await ownersApi.saveAgreement(propertyId, {
        ownerId: form.ownerId,
        startDate: form.startDate,
        endDate: form.endDate || null,
        feeMethod: form.feeMethod,
        feeRateBp,
        feeFixed,
        statementPeriod: form.statementPeriod,
        notes: form.notes,
      });
      onSaved();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={!!agreement}
      title={agreement?.id ? t('agreement.edit') : t('agreement.add')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} />
        </>
      }
    >
      {error && !error.field ? <ErrorBox error={error} /> : null}
      <PickerButton
        label={t('agreement.owner')}
        value={form.ownerName}
        placeholder={t('owners.pick')}
        onPress={() => setPickerOpen(true)}
        error={fieldError('ownerId')}
      />
      <Row style={{ flexWrap: 'wrap' }} gap={SPACING.md}>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <DateField label={t('agreement.startDate')} value={form.startDate} onChangeText={set('startDate')} error={fieldError('startDate')} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 150 }}>
          <DateField label={`${t('agreement.endDate')} (${t('common.optional')})`} value={form.endDate} onChangeText={set('endDate')} error={fieldError('endDate')} hint=" " />
        </View>
      </Row>
      <Txt weight="weightMedium" size="small">{t('agreement.feeMethod')}</Txt>
      <ChipSelect value={form.feeMethod} onChange={set('feeMethod')} options={FEE_METHODS.map((m) => ({ value: m, label: t(`agreement.feeMethodValues.${m}`) }))} />
      {fixed ? (
        <MoneyField label={t('agreement.feeFixed')} value={form.feeFixed} onChangeText={set('feeFixed')} error={fieldError('feeFixed')} />
      ) : (
        <PercentField label={t('agreement.feeRate')} value={form.feeRate} onChangeText={set('feeRate')} error={fieldError('feeRateBp')} />
      )}
      <Txt weight="weightMedium" size="small">{t('agreement.statementPeriod')}</Txt>
      <Segmented value={form.statementPeriod} onChange={set('statementPeriod')} options={PERIODS.map((p) => ({ value: p, label: t(`agreement.periodValues.${p}`) }))} />
      <Field label={t('agreement.notes')} value={form.notes} onChangeText={set('notes')} multiline inputStyle={{ minHeight: 60 }} />

      <OwnerPicker
        visible={pickerOpen}
        owners={owners}
        onClose={() => setPickerOpen(false)}
        onSelect={(o) => {
          setForm((f) => ({ ...f, ownerId: o.id, ownerName: o.name }));
          setPickerOpen(false);
        }}
      />
    </Sheet>
  );
}

// ------------------------------------------------------------------ partners

function PartnersCard({ property, editable, linkOwnerId, onLinkHandled }) {
  const { t } = useI18n();
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [preselect, setPreselect] = useState(null);

  useEffect(() => {
    if (linkOwnerId && partners) {
      setPreselect(linkOwnerId);
      setEditing(true);
      onLinkHandled?.();
    }
  }, [linkOwnerId, partners]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      setPartners(await ownersApi.partners(property.id));
    } catch (e) {
      setError(e);
    }
  }, [property.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card style={{ gap: SPACING.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt weight="weightBold">{t('partners.title')}</Txt>
        {editable ? <Button id="partners.edit" small variant="secondary" icon="pencil-outline" title={t('partners.edit')} onPress={() => setEditing(true)} /> : null}
      </Row>
      <ErrorBox error={error} />
      {!partners ? (
        <Txt muted>{t('common.loading')}</Txt>
      ) : partners.length === 0 ? (
        <Txt muted>{t('partners.none')}</Txt>
      ) : (
        partners.map((p) => (
          <View key={p.id} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt>{p.owner.name}</Txt>
              <Badge label={pctLabel(p.shareBp)} tone="info" />
            </Row>
            <View style={styles.track}>
              <View style={{ width: `${p.shareBp / 100}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: RADIUS.pill }} />
            </View>
          </View>
        ))
      )}
      <PartnersForm
        visible={editing}
        propertyId={property.id}
        current={partners ?? []}
        preselectOwnerId={preselect}
        onClose={() => {
          setEditing(false);
          setPreselect(null);
        }}
        onSaved={(list) => {
          setPartners(list);
          setEditing(false);
          setPreselect(null);
        }}
      />
    </Card>
  );
}

function PartnersForm({ visible, propertyId, current, preselectOwnerId, onClose, onSaved }) {
  const { t } = useI18n();
  const owners = useOwners(visible);
  const [rows, setRows] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setRows(current.map((p) => ({ ownerId: p.owner.id, name: p.owner.name, share: textFromBp(p.shareBp) })));
      setError(null);
      setBusy(false);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from an owner's page: add that owner as a new partner row
  useEffect(() => {
    if (!visible || !preselectOwnerId || !owners) return;
    setRows((list) => {
      if (list.some((r) => r.ownerId === preselectOwnerId)) return list;
      const o = owners.find((x) => x.id === preselectOwnerId);
      return o ? [...list, { ownerId: o.id, name: o.name, share: list.length ? '' : '100' }] : list;
    });
  }, [visible, preselectOwnerId, owners]);

  const totalBp = rows.reduce((sum, r) => sum + (bpFromText(r.share) || 0), 0);
  const ok = rows.length === 0 || totalBp === 10000;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await ownersApi.savePartners(
        propertyId,
        rows.map((r) => ({ ownerId: r.ownerId, shareBp: bpFromText(r.share) })),
      );
      onSaved(list);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t('partners.edit')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button title={t('common.save')} onPress={save} loading={busy} disabled={!ok} />
        </>
      }
    >
      <ErrorBox error={error} />
      {rows.map((r, i) => (
        <Row key={r.ownerId} gap={SPACING.sm}>
          <Txt style={{ flex: 1 }} numberOfLines={1}>{r.name}</Txt>
          <View style={{ width: 90 }}>
            <PercentField value={r.share} onChangeText={(v) => setRows((list) => list.map((x, j) => (j === i ? { ...x, share: v } : x)))} />
          </View>
          <Txt muted>%</Txt>
          <IconButton icon="close" color={COLORS.danger} onPress={() => setRows((list) => list.filter((_, j) => j !== i))} />
        </Row>
      ))}
      <Button small variant="secondary" icon="plus" title={t('partners.addPartner')} onPress={() => setPickerOpen(true)} />
      {rows.length ? (
        <Txt weight="weightBold" style={{ color: ok ? COLORS.success : COLORS.danger }}>
          {t('partners.total', { pct: pctLabel(totalBp) })} {ok ? '' : `— ${t('partners.mustBe100')}`}
        </Txt>
      ) : null}
      <OwnerPicker
        visible={pickerOpen}
        owners={owners}
        excludeIds={rows.map((r) => r.ownerId)}
        onClose={() => setPickerOpen(false)}
        onSelect={(o) => {
          setRows((list) => [...list, { ownerId: o.id, name: o.name, share: list.length ? '' : '100' }]);
          setPickerOpen(false);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: RADIUS.pill, backgroundColor: COLORS.surfaceSoft, overflow: 'hidden' },
});
