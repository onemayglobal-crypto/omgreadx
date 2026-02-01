import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, StyleSheet, Text, TouchableOpacity, FlatList, Alert, ImageBackground } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FileUpload, { UploadedFile } from '@/components/file-upload';
import ReadingViewer from '@/components/reading-viewer';
import { ErrorBoundary } from '@/components/error-boundary';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { listenUserDocuments, type UserDocument } from '@/utils/firestoreDocuments';
import { downloadJsonFromStoragePath, uploadJsonToStoragePath } from '@/utils/firebaseStorageHelpers';
import { upsertUserDocument } from '@/utils/firestoreDocuments';
import * as FileSystem from 'expo-file-system/legacy';
import { storage } from '@/utils/firebaseConfig';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';

const backgroundImage = require('@/assets/images/dashboard.png');

export default function HomeScreen() {
  const { theme, toggleTheme } = useTheme();
  const { uid, userDoc } = useAuth();
  const [docs, setDocs] = useState<Array<{ id: string; data: UserDocument }>>([]);
  const [selectedDoc, setSelectedDoc] = useState<{ id: string; data: UserDocument } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const processingAttemptCount = useRef<Map<string, number>>(new Map());
  const processingFirstSeen = useRef<Map<string, number>>(new Map());
  
  const isDark = theme === 'dark';

  // Refresh files when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // realtime listener handles updates
    }, [])
  );

  useEffect(() => {
    if (!uid) return;
    const unsub = listenUserDocuments(uid, setDocs);
    return () => unsub();
  }, [uid]);

  // Repair: if a doc is stuck in "processing" (e.g. app reloaded mid-upload),
  // flip it to "ready" once processed JSON exists in Storage.
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;

      const candidates = docs.filter(
        (d) =>
          d.data.status === 'processing' &&
          typeof d.data.processedPath === 'string' &&
          d.data.processedPath.startsWith('users/') &&
          d.data.processedPath.endsWith('.json')
      );

      for (const doc of candidates) {
        if (cancelled) return;
        if (!processingFirstSeen.current.has(doc.id)) {
          processingFirstSeen.current.set(doc.id, Date.now());
        }
        const attempts = processingAttemptCount.current.get(doc.id) || 0;
        processingAttemptCount.current.set(doc.id, attempts + 1);

        // IMPORTANT: Don't interfere with brand-new uploads that are still converting.
        // Only attempt repairs for processing docs older than ~90s.
        const createdAt: any = (doc.data as any).createdAt;
        const createdMs =
          typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : typeof createdAt === 'number' ? createdAt : null;
        const firstSeen = processingFirstSeen.current.get(doc.id) || Date.now();
        const ageMs = createdMs ? Date.now() - createdMs : Date.now() - firstSeen;
        if (ageMs < 90 * 1000) {
          continue;
        }

        let processedOk = false;
        try {
          // 1) If processed JSON exists, mark ready.
          try {
            const json = await downloadJsonFromStoragePath(doc.data.processedPath);
            const text = typeof json?.text === 'string' ? json.text.trim() : '';
            if (text) {
              await upsertUserDocument({
                uid,
                docId: doc.id,
                data: {
                  type: doc.data.type,
                  title: doc.data.title,
                  pages: typeof json?.pages === 'number' ? json.pages : doc.data.pages || 1,
                  status: 'ready',
                  storagePath: doc.data.storagePath,
                  processedPath: doc.data.processedPath,
                },
              });
              processedOk = true;
            }
          } catch {
            // processed not available yet
          }

          // 2) If non-PDF and processed is missing, attempt to rebuild processed JSON from original.
          if (doc.data.type !== 'pdf' && doc.data.storagePath?.startsWith('users/')) {
            const url = await (await import('firebase/storage')).getDownloadURL(
              (await import('firebase/storage')).ref((await import('@/utils/firebaseConfig')).storage, doc.data.storagePath)
            );
            const resp = await fetch(url);
            if (resp.ok) {
              const ext = doc.data.storagePath.split('.').pop() || 'bin';
              const tmp = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}readx-repair-${doc.id}.${ext}`;
              const blob = await resp.blob();
              const ab = await blob.arrayBuffer();
              const bytes = new Uint8Array(ab);
              const { uint8ArrayToBase64 } = await import('@/utils/base64');
              await FileSystem.writeAsStringAsync(tmp, uint8ArrayToBase64(bytes), {
                encoding: FileSystem.EncodingType.Base64,
              } as any);

              try {
                const { convertFileToText } = await import('@/utils/fileConverter');
                const text = await convertFileToText(tmp, doc.data.title || doc.data.name);
                await uploadJsonToStoragePath({
                  storagePath: doc.data.processedPath,
                  json: { pages: 1, text },
                });
                await upsertUserDocument({
                  uid,
                  docId: doc.id,
                  data: {
                    type: doc.data.type,
                    title: doc.data.title,
                    pages: 1,
                    status: 'ready',
                    storagePath: doc.data.storagePath,
                    processedPath: doc.data.processedPath,
                  },
                });
                processedOk = true;
              } catch {
                // fall through to error handling below
              } finally {
                try {
                  await FileSystem.deleteAsync(tmp, { idempotent: true } as any);
                } catch {
                  // ignore
                }
              }
            }
          }
        } catch {
          // ignore
        } finally {
          if (processedOk) continue;

          // 3) If still processing after a while or multiple attempts, mark error.
          // Give non-PDF up to 3 minutes before failing; PDF up to 5 minutes.
          const maxAge = doc.data.type === 'pdf' ? 5 * 60 * 1000 : 3 * 60 * 1000;

          if (ageMs > maxAge) {
            await upsertUserDocument({
              uid,
              docId: doc.id,
              data: {
                type: doc.data.type,
                title: doc.data.title,
                pages: doc.data.pages || 1,
                status: 'error',
                storagePath: doc.data.storagePath,
                processedPath: doc.data.processedPath,
                errorMessage:
                  doc.data.type === 'pdf'
                    ? 'Upload was interrupted. Please re-upload the PDF.'
                    : 'DOCX/TXT/RTF processing failed. Please re-upload the file.',
              } as any,
            });
          }
        }
      }

      if (candidates.length > 0 && !cancelled) {
        setTimeout(run, 8000);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [docs, uid]);

  const handleUploaded = async (file: UploadedFile) => {
    console.log('File uploaded callback received:', file);
    setRefreshKey(prev => prev + 1);
  };

  const retryProcessDoc = async (doc: { id: string; data: UserDocument }) => {
    if (!uid) return;
    if (!doc.data.storagePath || !doc.data.processedPath) return;

    try {
      // Download original from Storage to local temp
      const url = await getDownloadURL(storageRef(storage, doc.data.storagePath));
      const ext = doc.data.storagePath.split('.').pop() || 'bin';
      const tmp = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}readx-retry-${doc.id}.${ext}`;
      await FileSystem.downloadAsync(url, tmp);

      // Convert locally
      const { convertFileToText } = await import('@/utils/fileConverter');
      const text = await convertFileToText(tmp, doc.data.title || doc.data.name);
      await uploadJsonToStoragePath({ storagePath: doc.data.processedPath, json: { pages: 1, text } });

      // Mark ready
      await upsertUserDocument({
        uid,
        docId: doc.id,
        data: {
          type: doc.data.type,
          title: doc.data.title,
          pages: 1,
          status: 'ready',
          storagePath: doc.data.storagePath,
          processedPath: doc.data.processedPath,
        },
      });
    } catch (e: any) {
      await upsertUserDocument({
        uid,
        docId: doc.id,
        data: {
          type: doc.data.type,
          title: doc.data.title,
          pages: doc.data.pages || 1,
          status: 'error',
          storagePath: doc.data.storagePath,
          processedPath: doc.data.processedPath,
          errorMessage: e?.message || 'Processing failed. Please re-upload the file.',
        } as any,
      });
      throw e;
    }
  };

  if (selectedDoc) {
    return (
      <ErrorBoundary>
        <ReadingViewer
          fileUri={selectedDoc.data.processedPath}
          filename={selectedDoc.data.title || selectedDoc.data.name}
          docId={selectedDoc.id}
          onClose={() => setSelectedDoc(null)}
          onComplete={() => {
            Alert.alert('Reading Complete', 'Great job! You can close this reader when you are ready.');
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage} resizeMode="cover">
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
        <View style={[styles.header, isDark && styles.headerDark]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={[styles.brandName, isDark && styles.brandNameDark]}>ReadX</Text>
            </View>
            <TouchableOpacity
              style={styles.themeToggle}
              onPress={toggleTheme}
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
            <Ionicons 
              name={isDark ? 'sunny' : 'moon'} 
              size={26} 
              color={isDark ? '#FCD34D' : '#1F2937'} 
            />
            </TouchableOpacity>
          </View>
          <Text style={[styles.title, isDark && styles.titleDark]}>
            {userDoc?.displayName ? `Hello ${userDoc.displayName}` : 'Your Documents'}
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Upload a file, then tap it below to read.</Text>
        </View>

        <View style={styles.uploadSection}>
          <FileUpload onFileUploaded={handleUploaded} />
        </View>

        <View style={styles.listSection}>
          {docs.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>No files yet</Text>
              <Text style={[styles.emptySubtitle, isDark && styles.emptySubtitleDark]}>Upload a file to see it listed here.</Text>
            </View>
          ) : (
            <FlatList
              data={docs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                
                return (
                  <TouchableOpacity
                    style={[styles.fileItem, isDark && styles.fileItemDark]}
                    onPress={() => {
                      if (item.data.status === 'processing') {
                        Alert.alert(
                          'Processing',
                          'This document is still processing. Retry now?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Retry',
                              onPress: async () => {
                                try {
                                  await retryProcessDoc(item);
                                } catch {
                                  Alert.alert('Error', 'Failed to process. Please re-upload the file.');
                                }
                              },
                            },
                          ]
                        );
                        return;
                      }
                      if (item.data.status === 'error') {
                        Alert.alert('Error', item.data.errorMessage || 'Processing failed. Please re-upload the file.');
                        return;
                      }
                      setSelectedDoc(item);
                    }}
                  >
                    <View style={styles.fileItemContent}>
                      <View style={styles.fileItemLeft}>
                        <Text style={[styles.fileName, isDark && styles.fileNameDark]} numberOfLines={1}>
                          {item.data.title || item.data.name}
                        </Text>
                        <View style={styles.fileHintRow}>
                          <Text style={[styles.fileHint, isDark && styles.fileHintDark]}>
                            Tap to read • {item.data.type.toUpperCase()} • {item.data.status}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.fileListContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>No files yet</Text>
                  <Text style={[styles.emptySubtitle, isDark && styles.emptySubtitleDark]}>Upload a file to see it listed here.</Text>
                </View>
              }
            />
          )}
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  containerDark: {
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerDark: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  brandNameDark: {
    color: '#93C5FD',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  themeToggle: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  titleDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitleDark: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  uploadSection: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  listSection: {
    flex: 1,
  },
  viewerHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  viewerHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
    color: '#2563EB',
  },
  viewerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    margin: 24,
    padding: 32,
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyTitleDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  emptySubtitleDark: {
    color: '#E5E7EB',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  fileListContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  fileItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 10,
    marginVertical: 5,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  fileItemDark: {
    borderBottomColor: '#4B5563',
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fileItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileItemLeft: {
    flex: 1,
  },
  fileName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fileNameDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fileHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  fileHint: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
  fileHintDark: {
    color: '#E5E7EB',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  progressBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  readButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  readButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});


