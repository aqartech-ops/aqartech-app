import { documentsApi } from './api';

// Save scanned / chosen images as documents of a record (e.g. after "Scan the civil ID" in the tenant form).

export const KINDS = ['CIVIL_ID', 'PASSPORT', 'CHEQUE', 'CONTRACT', 'INVOICE', 'PHOTO', 'OTHER'];

/** Days left before a document expires (negative = expired), or null. */
export function daysLeft(expiryDate) {
  if (!expiryDate) return null;
  const end = new Date(String(expiryDate).slice(0, 10) + 'T00:00:00Z').getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((end - today) / 86_400_000);
}

export const EXPIRY_SOON_DAYS = 30;

export function expiryTone(expiryDate) {
  const d = daysLeft(expiryDate);
  if (d === null) return null;
  return d < 0 ? 'danger' : d <= EXPIRY_SOON_DAYS ? 'warning' : 'neutral';
}

/** Attach scan images to a record. Sides: an ID card's first image is the front, the second the back. */
export async function saveScanImages({ entity, entityId, images, kind, name, recognitionId, extracted, expiryDate }) {
  const two = images.length > 1;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    await documentsApi.create({
      entity,
      entityId,
      kind,
      name: two ? `${name} (${i + 1})` : name,
      side: kind === 'CIVIL_ID' && two ? (i === 0 ? 'FRONT' : 'BACK') : undefined,
      mimeType: img.mimeType,
      data: img.data,
      recognitionId,
      extracted: i === 0 ? extracted : undefined,
      expiryDate: expiryDate || undefined,
    });
  }
}
