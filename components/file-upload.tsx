import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { getFileExtension } from '@/utils/fileUtils';
import { auth } from '@/utils/firebaseConfig';
import { getFirebaseIdToken } from '@/utils/firebaseAuth';
import { uploadJsonToStoragePath, uploadLocalFileToStorage } from '@/utils/firebaseStorageHelpers';
import { bumpDashboardSummary } from '@/utils/firestoreDashboard';
import { upsertUserDocument, type DocumentType } from '@/utils/firestoreDocuments';
import { downloadJsonFromStoragePath } from '@/utils/firebaseStorageHelpers';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Check if file format is supported
 */
const isSupportedFormat = (filename: string): boolean => {
  const ext = getFileExtension(filename).toLowerCase();
  const supportedFormats = ['pdf', 'docx', 'txt', 'rtf'];
  return supportedFormats.includes(ext);
};

export interface UploadedFile {
  uri: string;
  name: string;
}

interface FileUploadProps {
  onFileUploaded?: (file: UploadedFile) => void;
}

export default function FileUpload({ onFileUploaded }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const buildPdfFormData = async (params: { uri: string; name: string }) => {
    // Ensures the URI is uploadable by fetch/multipart on Android (content:// can be flaky).
    let uploadUri = params.uri;
    let tempFileUri: string | null = null;

    if (Platform.OS !== 'web' && !uploadUri.startsWith('file://')) {
      const base64 = await FileSystem.readAsStringAsync(uploadUri, { encoding: 'base64' } as any);
      tempFileUri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}readx-upload-${Date.now()}.pdf`;
      await FileSystem.writeAsStringAsync(tempFileUri, base64, { encoding: 'base64' } as any);
      uploadUri = tempFileUri;
    }

    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(params.uri)).blob();
      (formData as any).append('file', blob, params.name);
    } else {
      formData.append('file', {
        uri: uploadUri,
        name: params.name,
        type: 'application/pdf',
      } as any);
    }

    return {
      formData,
      cleanup: async () => {
        if (tempFileUri) {
          try {
            await FileSystem.deleteAsync(tempFileUri, { idempotent: true } as any);
          } catch {
            // ignore
          }
        }
      },
    };
  };

  const waitForProcessedJson = async (processedPath: string): Promise<{ pages?: number; text?: string } | null> => {
    // Poll Storage for up to ~60s (backend processing time).
    const maxAttempts = 10;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const json = await downloadJsonFromStoragePath(processedPath);
        return json;
      } catch {
        // backoff: 0.5s, 1s, 2s, 4s... capped
        const delay = Math.min(8000, 500 * Math.pow(2, attempt));
        await sleep(delay);
      }
    }
    return null;
  };

  const normalizePickedFileUri = async (params: { uri: string; extension: string }) => {
    if (Platform.OS === 'web') {
      return { uri: params.uri, cleanup: async () => {} };
    }
    if (params.uri.startsWith('file://')) {
      return { uri: params.uri, cleanup: async () => {} };
    }
    // Copy content:// (or other) into cache so both conversion + Storage upload are stable.
    const tmp = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}readx-picked-${Date.now()}.${params.extension}`;
    await FileSystem.copyAsync({ from: params.uri, to: tmp });
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
  };

  const requireSignedIn = () => {
    if (!auth.currentUser?.uid) {
      Alert.alert('Sign in required', 'Please sign in to upload files.');
      return false;
    }
    return true;
  };

  const toDocType = (ext: string): DocumentType => {
    if (ext === 'pdf') return 'pdf';
    if (ext === 'doc' || ext === 'docx') return 'docx';
    return 'txt';
  };

  const contentTypeFromExt = (ext: string): string => {
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === 'doc') return 'application/msword';
    if (ext === 'txt') return 'text/plain';
    if (ext === 'rtf') return 'application/rtf';
    return 'application/octet-stream';
  };

  const pickDocument = async () => {
    try {
      if (!requireSignedIn()) return;
      setUploading(true);
      console.log('[FileUpload] Opening document picker...');
      
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        console.log('[FileUpload] Document picker was canceled');
        setUploading(false);
        return;
      }

      const file = result.assets[0];
      console.log('[FileUpload] File selected:', file.name, 'URI:', file.uri, 'Size:', file.size);

      if (!file || !file.uri) {
        throw new Error('Invalid file selected');
      }

      // Validate file format
      if (!isSupportedFormat(file.name)) {
        const ext = getFileExtension(file.name).toUpperCase() || 'Unknown';
        Alert.alert(
          'Unsupported File Format',
          `The file format "${ext}" is not supported.\n\nSupported formats: PDF, DOCX, TXT, RTF only.`,
          [{ text: 'OK' }]
        );
        setUploading(false);
        return;
      }

      const uid = auth.currentUser!.uid;
      const email = auth.currentUser?.email || '';
      const name = auth.currentUser?.displayName || email || 'User';

      const ext = getFileExtension(file.name).toLowerCase();
      const type = toDocType(ext);
      const title = file.name;
      const contentType = contentTypeFromExt(ext);

      // For PDFs, backend generates docId (fileId). For others, we use a timestamp docId.
      let docId = `${Date.now()}`;

      if (ext === 'pdf') {
        // 1) Call secured backend with Firebase ID token (backend writes processed JSON to Storage)
        const idToken = await getFirebaseIdToken();
        const { formData, cleanup } = await buildPdfFormData({ uri: file.uri, name: file.name });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        let resp: Response;
        try {
          resp = await fetch(`https://readx-backend-740104261370.asia-south1.run.app/extract/pdf`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
            body: formData,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
          await cleanup();
        }

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          throw new Error(txt ? 'PDF extraction failed. Please try another PDF.' : 'PDF extraction failed.');
        }

        const json = await resp.json();
        docId = String(json.fileId || docId);
      }

      const storagePath = `users/${uid}/files/${docId}/original.${ext}`;
      const processedPath = `users/${uid}/processed/${docId}.json`;

      // 2) Create Firestore metadata early only for PDF (processing → ready/error)
      if (ext === 'pdf') {
        await upsertUserDocument({
          uid,
          docId,
          data: {
            type,
            title,
            pages: 1,
            status: 'processing',
            storagePath,
            processedPath,
          },
        });
      }

      let normalized: { uri: string; cleanup: () => Promise<void> } | null = null;
      try {
        // Normalize URI once so conversion + Storage upload don't break on Android content:// URIs.
        normalized =
          ext === 'pdf'
            ? { uri: file.uri, cleanup: async () => {} }
            : await normalizePickedFileUri({ uri: file.uri, extension: ext });

        // 3) Upload original file to Storage (required schema)
        await uploadLocalFileToStorage({ storagePath, fileUri: normalized.uri, contentType });

        // 4) For non-PDF types, create processed JSON ourselves (no large text in Firestore)
        if (ext !== 'pdf') {
          const { convertFileToText } = await import('@/utils/fileConverter');
          const conversionTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('File conversion timeout. Please try again.')), 30000)
          );
          const text = await Promise.race([convertFileToText(normalized.uri, file.name), conversionTimeout]);
          const pages = 1;
          await uploadJsonToStoragePath({ storagePath: processedPath, json: { pages, text } });

          await upsertUserDocument({
            uid,
            docId,
            data: {
              type,
              title,
              pages,
              status: 'ready',
              storagePath,
              processedPath,
            },
          });
        } else {
          // Wait for backend processed JSON (realtime UI shows "processing" while we wait)
          const processed = await waitForProcessedJson(processedPath);
          if (!processed || typeof processed?.text !== 'string' || !processed.text.trim()) {
            await upsertUserDocument({
              uid,
              docId,
              data: {
                type,
                title,
                pages: typeof processed?.pages === 'number' ? processed.pages : 1,
                status: 'error',
                storagePath,
                processedPath,
                errorMessage: 'PDF processing failed. Please upload a text-based PDF (not images).',
              } as any,
            });
            throw new Error('PDF processing failed. Please upload a correct PDF format without images.');
          }

          await upsertUserDocument({
            uid,
            docId,
            data: {
              type,
              title,
              pages: typeof processed?.pages === 'number' ? processed.pages : 1,
              status: 'ready',
              storagePath,
              processedPath,
            },
          });
        }

      } catch (e: any) {
        // Ensure documents never get stuck in "processing"
        const msg =
          typeof e?.message === 'string' && e.message.trim()
            ? e.message
            : 'Processing failed. Please try again.';
        await upsertUserDocument({
          uid,
          docId,
          data: {
            type,
            title,
            pages: 1,
            status: 'error',
            storagePath,
            processedPath,
            errorMessage:
              ext === 'pdf'
                ? 'PDF processing failed. Please upload a correct PDF format without images.'
                : 'File processing failed. Please upload only PDF, DOCX, TXT, RTF files.',
          } as any,
        });
        throw new Error(msg);
      } finally {
        try {
          await normalized?.cleanup();
        } catch {
          // ignore
        }
      }

      // 5) Update dashboard summary counters (strict path)
      await bumpDashboardSummary({
        uid,
        name,
        email,
        filesUploadedDelta: 1,
      });

      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        console.log('[FileUpload] Calling onFileUploaded callback');
        onFileUploaded({ uri: processedPath, name: file.name });
      }

      Alert.alert('Success', `File "${file.name}" uploaded successfully!`);
      
      setUploading(false);
    } catch (error: any) {
      const message =
        typeof error?.message === 'string'
          ? error.message
          : 'Failed to upload file. Please try again.';
      Alert.alert('Error', `Upload failed: ${message}`);
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Upload a file to read</Text>
      <TouchableOpacity
        onPress={pickDocument}
        disabled={uploading}
        style={[styles.button, uploading && styles.buttonDisabled]}
      >
        {uploading ? (
          <>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.buttonText}>Uploading...</Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>Upload File</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.hint}>Supported formats: PDF, DOCX, TXT, RTF only</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  hint: {
    marginTop: 10,
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
  },
});
