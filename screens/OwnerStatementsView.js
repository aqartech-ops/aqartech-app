import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi } from '../services/api';
import { formatOMR, parseOMR } from '../services/money';
import { printHtml, shareHtml } from '../services/receipt';
import { ownerStatementHtml } from '../services/ownerStatement';
import { Money, MoneyField } from '../components/Rial';
import { DateField, formatDate, isDateText, today } from '../components/Fields';
import { Badge, Button, Card, ChipSelect, EmptyState, ErrorBox, Field, Loading, Row, Segmented, Sheet, Txt, errorText } from '../components/ui';

// Owner statements & payouts (كشوف الملاك والتحويلات).

const moneyText = (baisa) => (baisa > 0 ? formatOMR(baisa, 'en', { withCurrency: false }).replace(/,/g, '') : '');
const iso = (d) => d.toISOString().slice(0, 10);

/** Quick periods: last month, this month so far, last quarter. */
function quickPeriods() {
  const now = new Date(`${today()}T00:00:00Z`);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const q = Math.floor(m / 3);
  return {
    lastMonth: { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    thisMonth: { from: iso(new Date(Date.UTC(y, m, 1))), to: today() },
    lastQuarter: { from: iso(new Date(Date.UTC(y, (q - 1) * 3, 1))), to: iso(new Date(Date.UTC(y, q * 3, 0))) },
  };
}

export function OwnersTab({ editable, version, onChanged, focusOwnerId }) {
  const { t } = useI18n();
  const [view, setView] = useState(focusOwnerId ? 'accounts' : 'statements');
  return (
    <View style={{ gap: SPACING.md }}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'statements', label: t('ownerStatements.tabs.statements') },
          { value: 'accounts', label: t('ownerStatements.tabs.accounts') },
        ]}
      />
      {view === 'statements' ? (
        <Statements editable={editable} version={version} onChanged={onChanged} />
      ) : (
        <Accounts editable={editable} version={version} onChanged={onChanged} focusOwnerId={focusOwnerId} />
      )}
    </View>
  );
}

// ================================================================ statements

function Statements({ editable, version, onChanged }) {
  const { t, lang, forwardIcon } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await financeApi.statements());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  return (
    <View style={{ gap: SPACING.md }}>
      {editable ? <Button id="ownerStatements.new" icon="file-document-edit-outline" title={t('ownerStatements.new')} onPress={() => setBuilding(true)} style={{ alignSelf: 'flex-start' }} /> : null}
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="file-document-outline" body={t('ownerStatements.empty')} />
        </Card>
      ) : (
        <Card padded={false}>
          {rows.map((st, i) => (
            <Pressable key={st.id} onPress={() => setOpenId(st.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={SPACING.sm} style={{ flexWrap: 'wrap' }}>
                    <Txt weight="weightMedium">{st.property.name}</Txt>
                    {st.status === 'VOIDED' ? <Badge label={t('payments.voided')} tone="danger" /> : null}
                  </Row>
                  <Txt muted size="small">{[st.number, `${formatDate(st.periodStart, lang)} → ${formatDate(st.periodEnd, lang)}`, st.owner?.name].filter(Boolean).join(' · ')}</Txt>
                </View>
                <Money baisa={st.net} weight="weightBold" color={st.status === 'VOIDED' ? COLORS.textMuted : st.net < 0 ? COLORS.danger : COLORS.success} />
                <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
      <StatementBuilder
        visible={building}
        onClose={() => setBuilding(false)}
        onIssued={(st) => {
          setBuilding(false);
          onChanged();
          setOpenId(st.id);
        }}
      />
      <StatementSheet id={openId} editable={editable} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </View>
  );
}

/** Breakdown shown in the preview and in an issued statement. */
function Breakdown({ s }) {
  const { t, lang } = useI18n();
  const name = (c) => (c ? (lang === 'ar' ? c.nameAr : c.nameEn) : '');
  const line = (label, amount, opts = {}) => (
    <Row style={[{ justifyContent: 'space-between' }, opts.total && styles.totalRow]}>
      <Txt weight={opts.total ? 'weightBold' : undefined} muted={!opts.total} style={{ flex: 1 }}>{label}</Txt>
      <Money baisa={amount} weight={opts.total ? 'weightBold' : 'weightMedium'} size={opts.total ? FONT.medium : FONT.body} color={opts.color} />
    </Row>
  );
  const feeRule =
    s.fee?.method === 'FIXED' || s.agreement?.feeMethod === 'FIXED'
      ? t('ownerStatements.feeFixed')
      : s.agreement
        ? t(`ownerStatements.feeRule.${s.agreement.feeMethod}`, { rate: (s.agreement.feeRateBp ?? 0) / 100 })
        : t('ownerStatements.noAgreement');
  return (
    <View style={{ gap: SPACING.sm }}>
      {line(t('ownerStatements.rentCollected'), s.rentCollected)}
      {line(`− ${t('ownerStatements.ownerExpenses')}`, s.ownerExpenses)}
      {line(`− ${t('ownerStatements.fee')} (${feeRule})`, s.feeAmount ?? s.fee?.amount)}
      {line(t('ownerStatements.net'), s.net, { total: true, color: s.net < 0 ? COLORS.danger : COLORS.success })}

      {s.splits?.length > 1 ? (
        <View style={styles.box}>
          <Txt weight="weightBold" size="small">{t('ownerStatements.splits')}</Txt>
          {s.splits.map((p) => (
            <Row key={p.ownerId} style={{ justifyContent: 'space-between' }}>
              <Txt size="small">{`${p.name} (${p.shareBp / 100}%)`}</Txt>
              <Money baisa={p.amount} size={13} />
            </Row>
          ))}
        </View>
      ) : null}

      {s.leases?.length ? (
        <View style={styles.box}>
          <Row>
            <Txt weight="weightBold" size="small" style={{ flex: 1 }}>{t('ownerStatements.byUnit')}</Txt>
            <Txt muted size="small" style={styles.col}>{t('ownerStatements.due')}</Txt>
            <Txt muted size="small" style={styles.col}>{t('ownerStatements.collected')}</Txt>
          </Row>
          {s.leases.map((l) => (
            <Row key={l.leaseId}>
              <Txt size="small" style={{ flex: 1 }}>{`${l.unit} · ${l.tenant}`}</Txt>
              <View style={styles.col}>
                <Money baisa={l.due} size={12} />
              </View>
              <View style={styles.col}>
                <Money baisa={l.collected} size={12} />
              </View>
            </Row>
          ))}
        </View>
      ) : null}

      {s.expenses?.length ? (
        <View style={styles.box}>
          <Txt weight="weightBold" size="small">{t('ownerStatements.ownerExpenses')}</Txt>
          {s.expenses.map((e) => (
            <Row key={e.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Txt size="small">{e.description}</Txt>
                <Txt muted size="small">{[formatDate(e.date, lang), name(e.category), e.unit].filter(Boolean).join(' · ')}</Txt>
              </View>
              <Money baisa={e.amount} size={12} />
            </Row>
          ))}
        </View>
      ) : null}
      <Txt muted size="small">{t('ownerStatements.basisNote')}</Txt>
    </View>
  );
}

function StatementBuilder({ visible, onClose, onIssued }) {
  const { t } = useI18n();
  const [properties, setProperties] = useState(null);
  const [form, setForm] = useState({ propertyId: null, from: '', to: '' });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const periods = quickPeriods();

  useEffect(() => {
    if (!visible) return;
    setPreview(null);
    setError(null);
    setBusy(false);
    setForm({ propertyId: null, ...periods.lastMonth });
    financeApi.managedProperties().then((list) => {
      setProperties(list);
      if (list.length === 1) setForm((f) => ({ ...f, propertyId: list[0].id }));
    }).catch(() => setProperties([]));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible || !form.propertyId || !isDateText(form.from) || !isDateText(form.to)) {
      setPreview(null);
      return undefined;
    }
    let alive = true;
    setPreview(null);
    setError(null);
    const timer = setTimeout(() => {
      financeApi
        .previewStatement(form)
        .then((p) => alive && setPreview(p))
        .catch((e) => alive && setError(e));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [visible, form.propertyId, form.from, form.to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      onIssued(await financeApi.issueStatement(form));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      title={t('ownerStatements.new')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" title={t('common.cancel')} onPress={onClose} />
          <Button id="ownerStatements.issue" icon="check" title={t('ownerStatements.issue')} onPress={issue} loading={busy} disabled={!preview || !!preview.existing} />
        </>
      }
    >
      <ErrorBox error={error} />
      <Txt weight="weightMedium" size="small">{t('ownerStatements.property')}</Txt>
      {properties === null ? (
        <Loading />
      ) : properties.length === 0 ? (
        <Txt muted>{t('ownerStatements.noManaged')}</Txt>
      ) : (
        <ChipSelect value={form.propertyId} onChange={(id) => setForm((f) => ({ ...f, propertyId: id }))} options={properties.map((p) => ({ value: p.id, label: p.name }))} />
      )}
      <Txt weight="weightMedium" size="small">{t('ownerStatements.period')}</Txt>
      <ChipSelect
        value={Object.keys(periods).find((k) => periods[k].from === form.from && periods[k].to === form.to) ?? null}
        onChange={(k) => setForm((f) => ({ ...f, ...periods[k] }))}
        options={Object.keys(periods).map((k) => ({ value: k, label: t(`ownerStatements.periods.${k}`) }))}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('ownerStatements.from')} value={form.from} onChangeText={(v) => setForm((f) => ({ ...f, from: v }))} hint=" " />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <DateField label={t('ownerStatements.to')} value={form.to} onChangeText={(v) => setForm((f) => ({ ...f, to: v }))} hint=" " />
        </View>
      </Row>
      {form.propertyId && !preview && !error ? <Loading /> : null}
      {preview ? (
        <>
          {preview.existing ? (
            <View style={[styles.box, { backgroundColor: COLORS.warningSoft }]}>
              <Txt size="small" style={{ color: COLORS.warning }}>{t('ownerStatements.alreadyIssued', { number: preview.existing.number })}</Txt>
            </View>
          ) : null}
          <Breakdown s={preview} />
        </>
      ) : null}
    </Sheet>
  );
}

function StatementSheet({ id, editable, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const [st, setSt] = useState(null);
  const [error, setError] = useState(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setSt(null);
    setError(null);
    setVoiding(false);
    setReason('');
    financeApi.statement(id).then(setSt).catch(setError);
  }, [id]);

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    }
  };

  const doVoid = async () => {
    setBusy(true);
    await run(async () => {
      setSt(await financeApi.voidStatement(id, reason.trim()));
      setVoiding(false);
      onChanged();
    });
    setBusy(false);
  };

  const s = st ? { ...st, ...st.details, fee: st.details?.fee } : null;

  return (
    <Sheet
      visible={!!id}
      title={st ? `${t('ownerStatements.title')} ${st.number}` : t('ownerStatements.title')}
      onClose={onClose}
      footer={
        st ? (
          <>
            <Button id="ownerStatements.print" variant="secondary" icon="printer-outline" title={t('receipt.print')} onPress={() => run(() => printHtml(ownerStatementHtml(st, t, lang)))} />
            <Button id="ownerStatements.share" icon="share-variant-outline" title={t('receipt.share')} onPress={() => run(() => shareHtml(ownerStatementHtml(st, t, lang), st.number))} />
          </>
        ) : null
      }
    >
      <ErrorBox error={error} />
      {!st && !error ? <Loading /> : null}
      {st ? (
        <>
          <Txt weight="weightBold">{st.property.name}</Txt>
          <Txt muted size="small">{`${formatDate(st.periodStart, lang)} → ${formatDate(st.periodEnd, lang)}${st.owner ? ` · ${st.owner.name}` : ''}`}</Txt>
          {st.status === 'VOIDED' ? <Txt style={{ color: COLORS.danger }}>{t('payments.voidedOn', { date: formatDate(st.voidedAt, lang), reason: st.voidReason })}</Txt> : null}
          <Breakdown s={s} />
          {editable && st.status === 'ISSUED' ? (
            voiding ? (
              <View style={styles.box}>
                <Txt size="small" style={{ color: COLORS.danger }}>{t('ownerStatements.voidHint')}</Txt>
                <Field label={t('payments.voidReason')} value={reason} onChangeText={setReason} />
                <Row style={{ justifyContent: 'flex-end' }}>
                  <Button small variant="secondary" title={t('common.cancel')} onPress={() => setVoiding(false)} />
                  <Button id="ownerStatements.void" small variant="danger" title={t('ownerStatements.void')} loading={busy} disabled={!reason.trim()} onPress={doVoid} />
                </Row>
              </View>
            ) : (
              <Button id="ownerStatements.void" small variant="danger" icon="cancel" title={t('ownerStatements.void')} onPress={() => setVoiding(true)} style={{ alignSelf: 'flex-start' }} />
            )
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

// ================================================================ owner accounts & payouts

function Accounts({ editable, version, onChanged, focusOwnerId }) {
  const { t, lang, forwardIcon } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(focusOwnerId ?? null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await financeApi.ownerBalances());
    } catch (e) {
      setError(e);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  return (
    <View style={{ gap: SPACING.md }}>
      <ErrorBox error={error} onRetry={load} />
      {rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="account-tie-outline" body={t('ownerStatements.noBalances')} />
        </Card>
      ) : (
        <Card padded={false}>
          {rows.map((o, i) => (
            <Pressable key={o.id} onPress={() => setOpenId(o.id)} style={({ pressed }) => [pressed && { backgroundColor: COLORS.surfaceSoft }]}>
              <Row style={[styles.row, i > 0 && styles.divider]} gap={SPACING.md}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="weightMedium">{o.name}</Txt>
                  <Txt muted size="small">{o.lastPayout ? t('ownerStatements.lastPayout', { date: formatDate(o.lastPayout, lang) }) : t('ownerStatements.noPayouts')}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt muted size="small">{o.balance >= 0 ? t('ownerStatements.owedToOwner') : t('ownerStatements.ownerOwes')}</Txt>
                  <Money baisa={Math.abs(o.balance)} weight="weightBold" color={o.balance > 0 ? COLORS.primaryDark : o.balance < 0 ? COLORS.danger : COLORS.textMuted} />
                </View>
                <MaterialCommunityIcons name={forwardIcon} size={20} color={COLORS.textMuted} />
              </Row>
            </Pressable>
          ))}
        </Card>
      )}
      <OwnerAccountSheet
        ownerId={openId}
        editable={editable}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          load();
          onChanged();
        }}
      />
    </View>
  );
}

function OwnerAccountSheet({ ownerId, editable, onClose, onChanged }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    return financeApi.ownerAccount(ownerId).then(setData).catch(setError);
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    setData(null);
    setPaying(false);
    load();
  }, [ownerId, load]);

  const openPay = () => {
    setForm({ amount: moneyText(data.balance), date: today(), paidFrom: 'BANK', reference: '', notes: '' });
    setPaying(true);
  };

  const pay = async () => {
    const amount = parseOMR(form.amount);
    if (!amount || amount <= 0) return setError({ code: 'validation.required', field: 'amount' });
    if (!isDateText(form.date)) return setError({ code: 'validation.date', field: 'date' });
    setBusy(true);
    setError(null);
    try {
      await financeApi.createPayout({ ownerId, ...form, amount });
      setPaying(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!ownerId} title={data ? t('ownerStatements.accountOf', { name: data.owner.name }) : t('ownerStatements.account')} onClose={onClose}>
      <ErrorBox error={error} />
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt muted>{data.balance >= 0 ? t('ownerStatements.owedToOwner') : t('ownerStatements.ownerOwes')}</Txt>
            <Money baisa={Math.abs(data.balance)} size={FONT.medium} weight="weightBold" color={data.balance < 0 ? COLORS.danger : COLORS.primaryDark} />
          </Row>
          {data.owner.accountNumber ? <Txt muted size="small">{[data.owner.bankName, data.owner.accountName, data.owner.accountNumber].filter(Boolean).join(' · ')}</Txt> : null}

          {editable && !paying ? <Button id="ownerStatements.payout" icon="bank-transfer-out" title={t('ownerStatements.payout')} onPress={openPay} style={{ alignSelf: 'flex-start' }} /> : null}
          {paying ? (
            <View style={styles.box}>
              <Txt weight="weightBold">{t('ownerStatements.payout')}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <MoneyField label={t('payments.amount')} value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} error={error?.field === 'amount' ? errorText(t, error) : undefined} />
                </View>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <DateField label={t('payments.date')} value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: v }))} hint=" " />
                </View>
              </Row>
              <ChipSelect value={form.paidFrom} onChange={(v) => setForm((f) => ({ ...f, paidFrom: v }))} options={['BANK', 'CASH'].map((p) => ({ value: p, label: t(`finance.accounts.${p}`) }))} />
              <Field label={t('payments.reference')} value={form.reference} onChangeText={(v) => setForm((f) => ({ ...f, reference: v }))} />
              {parseOMR(form.amount) > data.balance ? <Txt size="small" style={{ color: COLORS.warning }}>{t('ownerStatements.payoutAboveBalance')}</Txt> : null}
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button small variant="secondary" title={t('common.cancel')} onPress={() => setPaying(false)} />
                <Button small icon="check" title={t('common.save')} loading={busy} onPress={pay} />
              </Row>
            </View>
          ) : null}

          {data.rows.length === 0 ? (
            <EmptyState icon="file-document-outline" body={t('finance.noMovements')} />
          ) : (
            <View style={styles.table}>
              {[...data.rows].reverse().map((r, i) => (
                <Row key={r.id} style={[styles.tableRow, i > 0 && styles.divider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size="small" weight="weightMedium">{t(`finance.entryTypes.${r.type}`)}</Txt>
                    <Txt muted size="small">{[formatDate(r.date, lang), r.number, r.memo].filter(Boolean).join(' · ')}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Money baisa={r.amount} size={13} color={r.amount < 0 ? COLORS.danger : COLORS.textDark} />
                    <Money baisa={r.balance} size={12} color={COLORS.textMuted} />
                  </View>
                </Row>
              ))}
            </View>
          )}
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, alignItems: 'center' },
  divider: { borderTopWidth: 1, borderTopColor: COLORS.border },
  box: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, overflow: 'hidden' },
  tableRow: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, alignItems: 'flex-start' },
  totalRow: { borderTopWidth: 1, borderTopColor: COLORS.borderStrong, paddingTop: SPACING.sm },
  col: { width: 96, alignItems: 'flex-end' },
});
