import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { storage } from '@/utils/firebaseConfig';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';

function tempPath(filename: string) {
  const dir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
  return `${dir}${filename}`;
}

async function normalizeToFileUri(inputUri: string, extensionHint?: string): Promise<{
  uri: string;
  cleanup: () => Promise<void>;
}> {
  // Web: keep as-is.
  if (Platform.OS === 'web') {
    return { uri: inputUri, cleanup: async () => {} };
  }

  // If already file://, nothing to do.
  if (inputUri.startsWith('file://')) {
    return { uri: inputUri, cleanup: async () => {} };
  }

  // Android content:// URIs are often not readable by upload libs.
  // Copy into app cache and use that file:// path.
  const ext = extensionHint ? `.${extensionHint.replace(/^\./, '')}` : '';
  const tmp = tempPath(`readx-src-${Date.now()}-${Math.random().toString(16).slice(2)}${ext || '.bin'}`);
  await FileSystem.copyAsync({ from: inputUri, to: tmp });
  return {
    uri: tmp,
    cleanup: async () => {
      try {
        await FileSystem.deleteAsync(tmp, { idempotent: true } as any);
      } catch {
        // ignore
      }
    },
  };
}

export async function uploadLocalFileToStorage(params: {
  storagePath: string;
  fileUri: string;
  contentType: string;
}): Promise<void> {
  const extFromPath = params.storagePath.split('.').pop();
  const { uri, cleanup } = await normalizeToFileUri(params.fileUri, extFromPath);
  try {
    let blob: Blob;
    // Prefer fetch(file://...).blob() first (avoids huge base64 strings that can crash/reload the app).
    try {
      blob = await (await fetch(uri)).blob();
    } catch {
      // Fallback: base64 -> dataUrl -> blob
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' } as any);
      const dataUrl = `data:${params.contentType};base64,${base64}`;
      blob = await (await fetch(dataUrl)).blob();
    }

    await uploadBytes(storageRef(storage, params.storagePath), blob, { contentType: params.contentType });
  } catch (e: any) {
    const code = e?.code || e?.message || '';
    if (String(code).includes('storage/unauthorized') || String(code).includes('storage/forbidden')) {
      throw new Error('Upload blocked by Firebase Storage rules. Please publish Storage rules to allow authenticated writes.');
    }
    throw e;
  } finally {
    await cleanup();
  }
}

export async function uploadJsonToStoragePath(params: { storagePath: string; json: any }): Promise<void> {
  const p = tempPath(`readx-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  try {
    await FileSystem.writeAsStringAsync(p, JSON.stringify(params.json), {
      encoding: FileSystem.EncodingType.UTF8,
    } as any);
    await uploadLocalFileToStorage({ storagePath: params.storagePath, fileUri: p, contentType: 'application/json' });
  } finally {
    try {
      await FileSystem.deleteAsync(p, { idempotent: true } as any);
    } catch {
      // ignore
    }
  }
}

export async function uploadTextToStoragePath(params: {
  storagePath: string;
  text: string;
  contentType?: string;
  extension?: string;
}): Promise<void> {
  const ext = params.extension || 'txt';
  const p = tempPath(`readx-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`);
  try {
    await FileSystem.writeAsStringAsync(p, params.text, {
      encoding: FileSystem.EncodingType.UTF8,
    } as any);
    await uploadLocalFileToStorage({
      storagePath: params.storagePath,
      fileUri: p,
      contentType: params.contentType || 'text/plain',
    });
  } finally {
    try {
      await FileSystem.deleteAsync(p, { idempotent: true } as any);
    } catch {
      // ignore
    }
  }
}

export async function downloadJsonFromStoragePath(storagePath: string): Promise<any> {
  const url = await getDownloadURL(storageRef(storage, storagePath));
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Failed to download processed content.');
  return await resp.json();
}

