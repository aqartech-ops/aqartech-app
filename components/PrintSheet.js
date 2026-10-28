import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SPACING } from '../theme';
import { useI18n } from '../i18n';
import { useSession } from '../services/session';
import { financeApi } from '../services/api';
import { useFieldRules } from '../services/fields';
import { printHtml, shareHtml } from '../services/receipt';
import { BALANCE_FIELDS, pick, templateHtml, usedFields } from '../services/printTemplate';
import { omanToday } from '../services/templates';
import { Button, ErrorBox, Loading, Row, Sheet, Txt } from './ui';

/**
 * Print or share (PDF) one print template for a record. The receivable balance ({{balance}}, {{overdue}})
 * is loaded only when the template uses it, and only for users who may see the financials.
 */
export default function PrintSheet({ template, entity, record, onClose }) {
  const { t, lang } = useI18n();
  const { me, levelOf } = useSession();
  const rules = useFieldRules(entity);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!template) return;
    setExtra(null);
    setError(null);
    const text = `${pick(template, lang, 'title')}\n${pick(template, lang, 'body')}`;
    const needsBalance = usedFields(text).some((f) => BALANCE_FIELDS.includes(f));
    const tenantId = entity === 'tenant' ? record?.id : entity === 'lease' ? record?.tenantId : null;
    if (!needsBalance || !tenantId || levelOf('financials') === 'HIDDEN') {
      setExtra({});
      return;
    }
    financeApi
      .tenantLeases(tenantId)
      .then((leases) => {
        const list = entity === 'lease' ? leases.filter((l) => l.id === record.id) : leases;
        setExtra({ balance: list.reduce((s, l) => s + (l.balance ?? 0), 0), overdue: list.reduce((s, l) => s + (l.overdue ?? 0), 0) });
      })
      .catch((e) => {
        setError(e);
        setExtra({});
      });
  }, [template, entity, record, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!template) return null;
  const html = () =>
    templateHtml(template, { ...record, ...extra, today: omanToday(), company: me?.company ?? {} }, { lang, entity, defs: rules.custom, yes: t('common.yes'), no: t('common.no') });
  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Sheet visible title={pick(template, lang, 'name')} onClose={onClose}>
      <ErrorBox error={error} />
      {extra === null ? (
        <Loading />
      ) : (
        <View style={{ gap: SPACING.md }}>
          <Txt muted size="small">{t('print.hint')}</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button id="print.print" icon="printer-outline" title={t('receipt.print')} onPress={() => run(() => printHtml(html()))} />
            <Button id="print.share" variant="secondary" icon="share-variant-outline" title={t('receipt.share')} onPress={() => run(() => shareHtml(html(), pick(template, lang, 'name')))} />
          </Row>
        </View>
      )}
    </Sheet>
  );
}
