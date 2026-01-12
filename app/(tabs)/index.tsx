import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, StyleSheet, Text, TouchableOpacity, ScrollView, FlatList, Alert, ImageBackground } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FileUpload, { UploadedFile } from '@/components/file-upload';
import FileViewer from '@/components/file-viewer';
import ReadingViewer from '@/components/reading-viewer';
import { getAllFiles, FileInfo } from '@/utils/fileUtils';
import { ErrorBoundary } from '@/components/error-boundary';
import { getFileReadingProgress } from '@/utils/readingStorage';
import { useTheme } from '@/contexts/ThemeContext';
import { getUserProfile } from '@/utils/profileStorage';

const backgroundImage = require('@/assets/images/dashboard.png');

export default function HomeScreen() {
  const { theme, toggleTheme } = useTheme();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fileProgressMap, setFileProgressMap] = useState<Map<string, { hasProgress: boolean; percentage: number }>>(new Map());
  const [userName, setUserName] = useState<string | null>(null);
  
  const isDark = theme === 'dark';

  // Refresh files when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadFiles();
      loadUserProfile();
    }, [])
  );

  const loadUserProfile = async () => {
    try {
      const profile = await getUserProfile();
      if (profile) {
        setUserName(profile.displayName);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadFiles = async () => {
    try {
      console.log('Loading files...');
      const fileList = await getAllFiles();
      console.log('Loaded files:', fileList.length);
      setFiles(fileList);
      
      // Load reading progress for all files
      const progressMap = new Map<string, { hasProgress: boolean; percentage: number }>();
      for (const file of fileList) {
        try {
          const progress = await getFileReadingProgress(file.name, file.uri);
          if (progress) {
            const percentage = progress.totalParagraphs > 0
              ? Math.round((progress.completedParagraphs.length / progress.totalParagraphs) * 100)
              : 0;
            progressMap.set(file.name, { hasProgress: true, percentage });
          } else {
            progressMap.set(file.name, { hasProgress: false, percentage: 0 });
          }
        } catch (error) {
          console.warn('Error loading progress for file:', file.name, error);
          progressMap.set(file.name, { hasProgress: false, percentage: 0 });
        }
      }
      setFileProgressMap(progressMap);
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  const handleUploaded = async (file: UploadedFile) => {
    console.log('File uploaded callback received:', file);
    // Wait a bit for metadata to be saved
    await new Promise(resolve => setTimeout(resolve, 500));
    // Refresh the file list from storage
    await loadFiles();
    setRefreshKey(prev => prev + 1);
  };

  if (selectedFile) {
    // Validate selected file before rendering
    if (!selectedFile.uri || !selectedFile.name) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.viewerHeader}>
            <TouchableOpacity onPress={() => setSelectedFile(null)}>
              <Text style={styles.backText}>{'< Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.viewerTitle}>Invalid File</Text>
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Text style={{ fontSize: 16, color: '#EF4444', textAlign: 'center' }}>
              File information is invalid. Please try selecting the file again.
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    
    // Accept any file format for reading
    const isReadableFile = true;
    
    if (readingMode && isReadableFile) {
      return (
        <ErrorBoundary>
          <ReadingViewer
            fileUri={selectedFile.uri}
            filename={selectedFile.name}
            onClose={() => {
              setReadingMode(false);
              setSelectedFile(null);
              loadFiles(); // Refresh to update dashboard
            }}
            onComplete={(stats) => {
              loadFiles(); // Refresh to update dashboard
            }}
          />
        </ErrorBoundary>
      );
    }
    
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.viewerHeader}>
          <View style={styles.viewerHeaderTop}>
            <TouchableOpacity onPress={() => {
              setReadingMode(false);
              setSelectedFile(null);
            }}>
              <Text style={styles.backText}>{'< Back'}</Text>
            </TouchableOpacity>
            {isReadableFile && (
              <TouchableOpacity
                onPress={() => setReadingMode(true)}
                style={styles.readButton}
              >
                <Text style={styles.readButtonText}>Read</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.viewerTitle} numberOfLines={1}>
            {selectedFile.name}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <ErrorBoundary>
            <FileViewer
              fileUri={selectedFile.uri}
              filename={selectedFile.name}
              onClose={() => {
                setReadingMode(false);
                setSelectedFile(null);
              }}
            />
          </ErrorBoundary>
        </View>
      </SafeAreaView>
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
            {userName ? `Hello ${userName}` : 'Your Files'}
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>Upload a file, then tap it below to read.</Text>
        </View>

        <View style={styles.uploadSection}>
          <FileUpload onFileUploaded={handleUploaded} />
        </View>

        <View style={styles.listSection}>
          {files.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, isDark && styles.emptyTitleDark]}>No files yet</Text>
              <Text style={[styles.emptySubtitle, isDark && styles.emptySubtitleDark]}>Upload a file to see it listed here.</Text>
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(item) => item.id}
              renderItem={({ item: file }) => {
                const progress = fileProgressMap.get(file.name);
                const hasProgress = progress?.hasProgress || false;
                const progressPercentage = progress?.percentage || 0;
                
                return (
                  <TouchableOpacity
                    style={[styles.fileItem, isDark && styles.fileItemDark]}
                    onPress={async () => {
                      try {
                        console.log('[HomeScreen] File selected:', file.name, 'URI:', file.uri);
                        
                        // Validate file before setting
                        if (!file || !file.uri || file.uri.trim() === '') {
                          console.error('[HomeScreen] Invalid file or file URI');
                          Alert.alert('Error', 'File information is invalid. Please try uploading the file again.');
                          return;
                        }
                        
                        if (!file.name || file.name.trim() === '') {
                          console.error('[HomeScreen] Invalid file name');
                          Alert.alert('Error', 'File name is invalid. Please try uploading the file again.');
                          return;
                        }
                        
                        // Verify file exists (non-blocking - just log warnings)
                        // Don't block opening - let the file viewer handle errors
                        try {
                          const { FileSystem } = await import('expo-file-system');
                          const fileInfo = await FileSystem.getInfoAsync(file.uri);
                          
                          if (!fileInfo || !fileInfo.exists) {
                            console.warn('[HomeScreen] File does not exist at URI:', file.uri);
                            // Don't block - let user try to open it anyway
                            // The file viewer will show a proper error if it really doesn't work
                          } else {
                            console.log('[HomeScreen] File verified, exists');
                          }
                        } catch (verifyError: any) {
                          // Verification failed, but continue anyway
                          // File might still be accessible (e.g., DocumentPicker URIs)
                          console.warn('[HomeScreen] Could not verify file, but continuing:', verifyError.message);
                        }
                        
                        // Use setTimeout to prevent immediate crash if component fails to mount
                        setTimeout(() => {
                          try {
                            setSelectedFile(file);
                          } catch (setError: any) {
                            console.error('[HomeScreen] Error setting selected file:', setError);
                            Alert.alert('Error', 'Failed to open file. Please try again.');
                          }
                        }, 100);
                      } catch (error: any) {
                        console.error('[HomeScreen] Error selecting file:', error);
                        console.error('[HomeScreen] Error stack:', error?.stack);
                        Alert.alert('Error', `Failed to open file: ${error.message || 'Unknown error'}`);
                      }
                    }}
                  >
                    <View style={styles.fileItemContent}>
                      <View style={styles.fileItemLeft}>
                        <Text style={[styles.fileName, isDark && styles.fileNameDark]} numberOfLines={1}>
                          {file.name}
                        </Text>
                        <View style={styles.fileHintRow}>
                          <Text style={[styles.fileHint, isDark && styles.fileHintDark]}>Tap to read • {file.type}</Text>
                          {hasProgress && (
                            <View style={styles.progressBadge}>
                              <Text style={styles.progressBadgeText}>
                                {progressPercentage < 100 ? `Resume (${progressPercentage}%)` : 'Completed'}
                              </Text>
                            </View>
                          )}
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


