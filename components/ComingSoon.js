import React from 'react';
import { useI18n } from '../i18n';
import { Card, EmptyState, Screen } from './ui';

/** Placeholder for sections that are scheduled in a later build phase (see docs/PROJECT.md §9). */
export default function ComingSoon({ section, phase, icon }) {
  const { t } = useI18n();
  return (
    <Screen title={t(`sections.${section}`)}>
      <Card>
        <EmptyState icon={icon} title={t('comingSoon.title', { phase })} body={t('comingSoon.body')} />
      </Card>
    </Screen>
  );
}
