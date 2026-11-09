import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

// Picking files for documents and scans: camera, photo library, or any file (images / PDF).
// Everything comes back as { data (base64), mimeType, name, uri } — the shape the documents API takes.

const IMAGE_OPTIONS = { mediaTypes: ['images'], quality: 0.8, base64: true, exif: false };

/** Blob / file URI → base64 (works on web and on the phone). */
async function uriToBase64(uri) {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return { data: String(dataUrl).split(',')[1] ?? '', mimeType: blob.type || null };
}

function guessType(name = '', fallback = 'image/jpeg') {
  const ext = name.split('.').pop()?.toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', pdf: 'application/pdf' }[ext] ?? fallback;
}

async function fromImageAsset(asset) {
  const name = asset.fileName || `photo-${Date.now()}.jpg`;
  if (asset.base64) return { data: asset.base64, mimeType: asset.mimeType || guessType(name), name, uri: asset.uri };
  const read = await uriToBase64(asset.uri);
  return { data: read.data, mimeType: asset.mimeType || read.mimeType || guessType(name), name, uri: asset.uri };
}

/**
 * Take a photo (camera) or choose one (library). Returns null when cancelled.
 * Throws { code: 'documents.cameraDenied' } when the camera permission is refused.
 */
export async function pickImage({ camera = false } = {}) {
  if (camera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw Object.assign(new Error('camera'), { code: 'documents.cameraDenied' });
  }
  const result = camera ? await ImagePicker.launchCameraAsync(IMAGE_OPTIONS) : await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
  if (result.canceled || !result.assets?.length) return null;
  return fromImageAsset(result.assets[0]);
}

/** Any file: an image or a PDF. Returns null when cancelled. */
export async function pickFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const read = await uriToBase64(asset.uri);
  return { data: read.data, mimeType: asset.mimeType || read.mimeType || guessType(asset.name), name: asset.name, uri: asset.uri };
}

/** A file from the documents API → a URI an <Image> can show, or the browser can open. */
export const dataUri = (file) => `data:${file.mimeType};base64,${file.data}`;

/** Web: open a PDF (or image) in a new tab. */
export function openInBrowser(file) {
  if (Platform.OS !== 'web') return false;
  const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
