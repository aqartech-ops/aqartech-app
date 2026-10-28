import React, { useState } from 'react';
import { useI18n } from '../i18n';
import { exportCsv } from '../services/exportCsv';
import { notify } from '../services/dialog';
import { Button } from './ui';

/** "Export to Excel" — `build` returns the rows (first row = headers); may be async (to fetch everything). */
export default function ExportButton({ filename, build, small = true, style }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const rows = await build();
      await exportCsv(filename, rows);
    } catch {
      notify(t('export.failedTitle'), t('export.failed'));
    } finally {
      setBusy(false);
    }
  };
  return <Button id="export.excel" small={small} variant="secondary" icon="microsoft-excel" title={t('export.excel')} onPress={run} loading={busy} style={style} />;
}
