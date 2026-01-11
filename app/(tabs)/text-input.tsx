import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
  ImageBackground,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ReadingViewer from '@/components/reading-viewer';
import { ErrorBoundary } from '@/components/error-boundary';
import { saveTextAsFile } from '@/utils/textFileUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { getAllTextDocuments, TextDocument } from '@/utils/textDocumentsStorage';

const dashboardBackground = require('@/assets/images/dashboard.png');

export default function TextInputScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [savedFileUri, setSavedFileUri] = useState<string | null>(null);
  const [savedFileName, setSavedFileName] = useState<string>('');
  const [documents, setDocuments] = useState<TextDocument[]>([]);
  
  const isDark = theme === 'dark';

  const loadDocuments = async () => {
    try {
      const docs = await getAllTextDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('[TextInput] Error loading text documents:', error);
    }
  };

  React.useEffect(() => {
    loadDocuments();
  }, []);

  const handlePaste = async () => {
    try {
      // On mobile, users can paste directly into TextInput by long-pressing
      // Show helpful instructions
      Alert.alert(
        'How to Paste',
        'To paste text:\n\n' +
        '• Long press in the text area\n' +
        '• Select "Paste" from the menu\n\n' +
        'Or use keyboard shortcut:\n' +
        '• iOS: Cmd+V\n' +
        '• Android: Ctrl+V',
        [{ text: 'Got it' }]
      );
    } catch (error) {
      console.error('Error handling paste:', error);
    }
  };

  const handleStartReading = async () => {
    console.log('[TextInput] handleStartReading called');
    console.log('[TextInput] Text length:', text.length);
    console.log('[TextInput] Text trimmed length:', text.trim().length);
    
    // Validate text input
    if (!text.trim()) {
      console.log('[TextInput] Text is empty, showing alert');
      Alert.alert('Empty Text', 'Please enter or paste some text to read.');
      return;
    }

    console.log('[TextInput] Starting file save process...');
    
    // Show loading state
    setIsLoading(true);

    try {
      // Generate a title if not provided
      const fileTitle = title.trim() || `Text Document ${new Date().toLocaleDateString()}`;
      
      console.log('[TextInput] Saving text as file:', fileTitle);
      console.log('[TextInput] Text content preview:', text.substring(0, 100));
      
      // Save the text as a file
      const result = await saveTextAsFile(text, fileTitle);
      console.log('[TextInput] saveTextAsFile returned:', result);
      
      const { uri, filename } = result;
      console.log('[TextInput] File saved successfully:', { uri, filename });
      
      // Verify we got valid values
      if (!uri || !filename) {
        throw new Error('File save returned invalid URI or filename');
      }
      
      console.log('[TextInput] Setting state to show ReadingViewer...');
      
      // Set state to show ReadingViewer
      setSavedFileUri(uri);
      setSavedFileName(filename);
      setIsReading(true);
      setIsLoading(false);

      // Refresh saved documents list
      loadDocuments();
      
      console.log('[TextInput] State updated, ReadingViewer should appear');
    } catch (error: any) {
      console.error('[TextInput] Error saving text:', error);
      console.error('[TextInput] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      setIsLoading(false);
      
      // Show detailed error to user
      const errorMessage = error?.message || 'Unknown error occurred';
      Alert.alert(
        'Error Saving Text',
        `Failed to save text file:\n\n${errorMessage}\n\nPlease check the console for more details and try again.`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Text',
      'Are you sure you want to clear all text?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setText('');
            setTitle('');
          },
        },
      ]
    );
  };

  // Show ReadingViewer when file is saved and ready
  if (isReading && savedFileUri && savedFileName) {
    console.log('[TextInput] Rendering ReadingViewer with:', { savedFileUri, savedFileName });
    return (
      <ErrorBoundary>
        <ReadingViewer
          fileUri={savedFileUri}
          filename={savedFileName}
          onClose={() => {
            console.log('[TextInput] ReadingViewer onClose called');
            setIsReading(false);
            setSavedFileUri(null);
            setSavedFileName('');
            // Show success message
            Alert.alert(
              'Text Saved',
              'Your text has been saved and will appear in your Library. You can continue reading anytime!',
              [
                {
                  text: 'Go to Library',
                  onPress: () => {
                    router.push('/(tabs)');
                  },
                },
                {
                  text: 'Stay Here',
                  style: 'cancel',
                  onPress: () => {
                    // Optionally clear text after saving
                    // setText('');
                    // setTitle('');
                  },
                },
              ]
            );
          }}
          onComplete={(stats) => {
            console.log('[TextInput] Reading completed:', stats);
            // Show completion message
            Alert.alert(
              'Reading Complete!',
              `You've completed reading!\n\n` +
              `Paragraphs: ${stats.completedParagraphs}/${stats.totalParagraphs}\n` +
              `Words: ${stats.totalWords.toLocaleString()}\n` +
              `Time: ${Math.ceil(stats.readingTime / 60)} Min\n` +
              `Completion: ${stats.completionPercentage}%`,
              [{ text: 'OK' }]
            );
          }}
        />
      </ErrorBoundary>
    );
  }
  
  // Debug: Log current state
  console.log('[TextInput] Render state:', {
    isReading,
    savedFileUri: savedFileUri ? 'set' : 'null',
    savedFileName: savedFileName || 'empty',
    isLoading,
    textLength: text.length,
  });

  return (
    <ImageBackground source={dashboardBackground} style={styles.backgroundImage} resizeMode="cover">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
        <View style={[styles.header, isDark && styles.headerDark]}>
          <View style={styles.headerTop}>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.title, isDark && styles.titleDark]}>Paste or Type Text</Text>
              <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
                Paste content from ChatGPT, articles, or type your own text to read
              </Text>
            </View>
            <TouchableOpacity
              style={styles.themeToggle}
              onPress={toggleTheme}
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Ionicons 
                name={isDark ? 'sunny' : 'moon'} 
                size={24} 
                color={isDark ? '#FBBF24' : '#6B7280'} 
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.inputSection}>
            <View style={styles.titleInputContainer}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Document title (optional)</Text>
              <TextInput
                style={[styles.titleInput, isDark && styles.titleInputDark]}
                placeholder="Give a title to save the file"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
            </View>

            <View style={[styles.textInputContainer, isDark && styles.textInputContainerDark]}>
              <View style={[styles.textInputHeader, isDark && styles.textInputHeaderDark]}>
                <Text style={[styles.label, isDark && styles.labelDark]}>Text Content</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={handlePaste}
                    accessibilityLabel="Paste"
                  >
                    <Ionicons name="clipboard-outline" size={20} color={isDark ? '#60A5FA' : '#2563EB'} />
                    <Text style={[styles.iconButtonText, isDark && styles.iconButtonTextDark]}>Paste</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={handleClear}
                    accessibilityLabel="Clear"
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={[styles.iconButtonText, isDark && styles.iconButtonTextDark]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                style={[styles.textInput, isDark && styles.textInputDark]}
                placeholder={`Paste or type your text here...

You can paste content from:
• ChatGPT conversations
• Articles and blog posts
• Notes and documents
• Any text content

Long press to paste from clipboard`}
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                value={text}
                onChangeText={setText}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
                autoCorrect={true}
                scrollEnabled={true}
              />

              <View style={[styles.scrollToHowToUse, isDark && styles.scrollToHowToUseDark]}>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={isDark ? '#93C5FD' : '#2563EB'}
                />
                <Text style={[styles.scrollToHowToUseText, isDark && styles.scrollToHowToUseTextDark]}>
                  Scroll down to see “How to use”
                </Text>
              </View>

              <View style={[styles.textStats, isDark && styles.textStatsDark]}>
                <Text style={[styles.statsText, isDark && styles.statsTextDark]}>
                  {text.length.toLocaleString()} characters
                  {text.trim() && ` • ~${Math.ceil(text.trim().split(/\s+/).length)} words`}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.instructionsSection}>
            <View style={[styles.instructionCard, isDark && styles.instructionCardDark]}>
              <Ionicons name="information-circle" size={24} color={isDark ? '#60A5FA' : '#2563EB'} />
              <View style={styles.instructionContent}>
                <Text style={[styles.instructionTitle, isDark && styles.instructionTitleDark]}>How to use:</Text>
                <Text style={[styles.instructionText, isDark && styles.instructionTextDark]}>
                  1. Paste or type your text in the text area above{'\n'}
                  2. Optionally add a title to identify your document{'\n'}
                  3. Tap "Start Reading" to begin{'\n'}
                  4. Read paragraph by paragraph with progress tracking{'\n'}
                  5. Your progress will be saved automatically
                </Text>
              </View>
            </View>
          </View>

          {documents.length > 0 && (
            <View style={styles.savedDocsSection}>
              <Text style={[styles.savedDocsTitle, isDark && styles.savedDocsTitleDark]}>
                Saved Text Documents
              </Text>
              {documents.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={[styles.savedDocItem, isDark && styles.savedDocItemDark]}
                  onPress={() => {
                    console.log('[TextInput] Opening saved document:', doc.title);
                    setSavedFileUri(doc.uri);
                    setSavedFileName(`${doc.title || 'Text Document'}.txt`);
                    setIsReading(true);
                  }}
                >
                  <View style={styles.savedDocTextContainer}>
                    <Text
                      style={[styles.savedDocTitle, isDark && styles.savedDocTitleDark]}
                      numberOfLines={1}
                    >
                      {doc.title || 'Untitled document'}
                    </Text>
                    <Text
                      style={[styles.savedDocMeta, isDark && styles.savedDocMetaDark]}
                      numberOfLines={1}
                    >
                      {doc.wordCount.toLocaleString()} words •{' '}
                      {new Date(doc.createdAt).toLocaleString()}
                    </Text>
                  </View>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={isDark ? '#9CA3AF' : '#6B7280'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, isDark && styles.footerDark]}>
          <View style={[styles.glassContainer, isDark && styles.glassContainerDark]}>
            <TouchableOpacity
              style={[
                styles.startButton,
                (!text.trim() || isLoading) && styles.startButtonDisabled,
              ]}
              onPress={() => {
                console.log('[TextInput] ===== BUTTON PRESSED =====');
                console.log('[TextInput] Button press handler called');
                console.log('[TextInput] Current state - text length:', text.length);
                console.log('[TextInput] Current state - isLoading:', isLoading);
                console.log('[TextInput] Current state - isReading:', isReading);
                
                if (!text.trim()) {
                  console.log('[TextInput] Text is empty, showing alert');
                  Alert.alert('Empty Text', 'Please enter or paste some text to read.');
                  return;
                }
                
                if (isLoading) {
                  console.log('[TextInput] Already loading, ignoring press');
                  return;
                }
                
                console.log('[TextInput] Calling handleStartReading...');
                handleStartReading().catch((error) => {
                  console.error('[TextInput] Unhandled error in handleStartReading:', error);
                  setIsLoading(false);
                  Alert.alert('Error', `An error occurred: ${error.message || 'Unknown error'}`);
                });
              }}
              disabled={!text.trim() || isLoading}
              activeOpacity={0.8}
              accessibilityLabel="Start Reading"
              accessibilityRole="button"
            >
              {isLoading ? (
                <>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.startButtonText}>Saving...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="book" size={24} color="#ffffff" />
                  <Text style={styles.startButtonText}>Start Reading</Text>
                </>
              )}
            </TouchableOpacity>
            {!text.trim() && (
              <Text style={[styles.hintText, isDark && styles.hintTextDark]}>
                Enter or paste text above to enable reading
              </Text>
            )}
            {text.trim() && !isLoading && (
              <Text style={[styles.hintText, isDark && styles.hintTextDark]}>
                Ready to read {Math.ceil(text.trim().split(/\s+/).length)} words
              </Text>
            )}
          </View>
        </View>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 29,
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.95)',
    borderBottomColor: '#374151',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTextContainer: {
    flex: 1,
  },
  themeToggle: {
    padding: 8,
    marginLeft: 12,
    borderRadius: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  titleDark: {
    color: '#F9FAFB',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  subtitleDark: {
    color: '#9CA3AF',
  },
  content: {
    flex: 1,
  },
  inputSection: {
    padding: 24,
  },
  titleInputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  labelDark: {
    color: '#D1D5DB',
  },
  titleInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  titleInputDark: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
    color: '#F9FAFB',
  },
  textInputContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    overflow: 'hidden',
  },
  textInputContainerDark: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  textInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  textInputHeaderDark: {
    borderBottomColor: '#374151',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  iconButtonTextDark: {
    color: '#60A5FA',
  },
  textInput: {
    minHeight: 300,
    maxHeight: 400,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    fontFamily: 'System',
  },
  textInputDark: {
    color: '#F9FAFB',
    backgroundColor: '#1F2937',
  },
  textStats: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  textStatsDark: {
    borderTopColor: '#374151',
    backgroundColor: '#111827',
  },
  statsText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statsTextDark: {
    color: '#9CA3AF',
  },
  scrollToHowToUse: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: -90,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  scrollToHowToUseDark: {
    backgroundColor: 'rgba(17, 24, 39, 0.6)',
    borderColor: 'rgba(96, 165, 250, 0.25)',
  },
  scrollToHowToUseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  scrollToHowToUseTextDark: {
    color: '#E0F2FE',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  instructionsSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  savedDocsSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
  },
  savedDocsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  savedDocsTitleDark: {
    color: '#F9FAFB',
  },
  savedDocItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginTop: 4,
  },
  savedDocItemDark: {
    backgroundColor: '#1F2937',
  },
  savedDocTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  savedDocTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  savedDocTitleDark: {
    color: '#F9FAFB',
  },
  savedDocMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  savedDocMetaDark: {
    color: '#9CA3AF',
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  instructionCardDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#1E40AF',
  },
  instructionContent: {
    flex: 1,
    marginLeft: 12,
  },
  instructionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
  },
  instructionTitleDark: {
    color: '#60A5FA',
  },
  instructionText: {
    fontSize: 13,
    color: '#1E3A8A',
    lineHeight: 20,
  },
  instructionTextDark: {
    color: '#93C5FD',
  },
  footer: {
    padding: 24,
    backgroundColor: 'transparent',
  },
  footerDark: {
    backgroundColor: 'transparent',
  },
  glassContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  glassContainerDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.7)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  startButtonDisabled: {
    backgroundColor: 'rgba(156, 163, 175, 0.4)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    opacity: 0.6,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  hintText: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  hintTextDark: {
    color: '#E5E7EB',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

