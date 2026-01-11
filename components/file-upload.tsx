import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { saveFile, isReadableFormat, formatFileSize, getFileType } from '@/utils/fileUtils';

export interface UploadedFile {
  uri: string;
  name: string;
}

interface FileUploadProps {
  onFileUploaded?: (file: UploadedFile) => void;
}

export default function FileUpload({ onFileUploaded }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);

  const pickDocument = async () => {
    try {
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

      let finalUri = file.uri;
      let uploadSuccess = false;
      
      try {
        console.log('[FileUpload] Saving file to storage...');
        finalUri = await saveFile(file.uri, file.name);
        console.log('[FileUpload] File saved successfully, final URI:', finalUri);
        uploadSuccess = true;
      } catch (saveError: any) {
        console.error('[FileUpload] Error in saveFile:', saveError);
        console.error('[FileUpload] Error details:', {
          message: saveError?.message,
          stack: saveError?.stack,
        });
        
        // Always try to save metadata, even if file copy failed
        // This ensures the file appears in the list
        try {
          console.log('[FileUpload] Attempting to save metadata as fallback...');
          const { addFileToList } = await import('@/utils/fileStorage');
          const { getFileType } = await import('@/utils/fileUtils');
          const fileInfo = {
            id: `${Date.now()}-${file.name}`,
            name: file.name,
            uri: file.uri, // Use original URI
            type: getFileType(file.name),
            size: file.size || 0,
            uploadDate: new Date(),
          };
          await addFileToList(fileInfo);
          console.log('[FileUpload] Metadata saved successfully');
          uploadSuccess = true;
          finalUri = file.uri;
        } catch (metadataError: any) {
          console.error('[FileUpload] Failed to save metadata:', metadataError);
          // Still continue - file might work with original URI
          finalUri = file.uri;
          console.warn('[FileUpload] Using original URI, metadata save failed');
        }
      }

      // Notify parent component about the uploaded file
      if (onFileUploaded) {
        console.log('[FileUpload] Calling onFileUploaded callback');
        onFileUploaded({ uri: finalUri, name: file.name });
      }

      if (uploadSuccess) {
        Alert.alert('Success', `File "${file.name}" uploaded successfully!`);
      } else {
        Alert.alert(
          'Partial Success', 
          `File "${file.name}" is ready to read, but may not persist after app restart.`
        );
      }
      
      setUploading(false);
    } catch (error: any) {
      console.error('[FileUpload] Error in document picker:', error);
      console.error('[FileUpload] Error stack:', error?.stack);
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
      <Text style={styles.hint}>Any file format is accepted and saved for reading.</Text>
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
