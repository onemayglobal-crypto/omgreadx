import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { FileInfo, getAllFiles, deleteFile, formatFileSize } from '@/utils/fileUtils';
import FileViewer from './file-viewer';
import ReadingViewer from './reading-viewer';

interface FileListProps {
  refreshKey?: number;
}

export default function FileList({ refreshKey }: FileListProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [readingMode, setReadingMode] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [refreshKey]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const fileList = await getAllFiles();
      setFiles(fileList);
    } catch (error) {
      console.error('Error loading files:', error);
      Alert.alert('Error', 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (file: FileInfo) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFile(file.uri);
              await loadFiles();
              Alert.alert('Success', 'File deleted successfully.');
            } catch (error) {
              console.error('Error deleting file:', error);
              Alert.alert('Error', 'Failed to delete file.');
            }
          },
        },
      ]
    );
  };

  const handleDownload = async (file: FileInfo) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/octet-stream',
        dialogTitle: `Download ${file.name}`,
      });
    } catch (error) {
      console.error('Error sharing file:', error);
      Alert.alert('Error', 'Failed to download file.');
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'PDF':
        return 'document-text-outline';
      case 'EPUB':
        return 'book-outline';
      case 'Text':
      case 'Markdown':
        return 'document-outline';
      case 'Word':
        return 'document-text-outline';
      case 'Image':
        return 'image-outline';
      case 'HTML':
        return 'code-outline';
      default:
        return 'document-outline';
    }
  };

  const renderFileItem = ({ item }: { item: FileInfo }) => (
    <TouchableOpacity
      onPress={() => setSelectedFile(item)}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-3 shadow-sm border border-gray-200 dark:border-gray-700"
    >
      <View className="flex-row items-center space-x-4">
        <View className="bg-blue-100 dark:bg-blue-900 rounded-lg p-3">
          <Ionicons
            name={getFileIcon(item.type) as any}
            size={24}
            color="#3B82F6"
          />
        </View>
        <View className="flex-1">
          <Text className="text-gray-900 dark:text-gray-100 font-semibold text-base" numberOfLines={1}>
            {item.name}
          </Text>
          <View className="flex-row items-center space-x-3 mt-1">
            <Text className="text-gray-500 dark:text-gray-400 text-sm">{item.type}</Text>
            <Text className="text-gray-400 dark:text-gray-500 text-sm">•</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-sm">{formatFileSize(item.size)}</Text>
          </View>
        </View>
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={() => handleDownload(item)}
            className="bg-green-100 dark:bg-green-900 rounded-lg p-2"
          >
            <Ionicons name="download-outline" size={20} color="#10B981" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            className="bg-red-100 dark:bg-red-900 rounded-lg p-2"
          >
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="mt-4 text-gray-600 dark:text-gray-400">Loading files...</Text>
      </View>
    );
  }

  if (selectedFile) {
    // Show reading mode for text-based files
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    // Accept any file format for reading
    const isReadableFile = true;
    
    if (readingMode && isReadableFile) {
      return (
        <ReadingViewer
          fileUri={selectedFile.uri}
          filename={selectedFile.name}
          onClose={() => {
            setReadingMode(false);
            setSelectedFile(null);
          }}
          onComplete={(stats) => {
            Alert.alert(
              'Reading Complete!',
              `You've completed reading!\n\n` +
              `Paragraphs: ${stats.completedParagraphs}/${stats.totalParagraphs}\n` +
              `Words: ${stats.totalWords}\n` +
              `Time: ${Math.ceil(stats.readingTime / 60)} Min\n` +
              `Completion: ${stats.completionPercentage}%`
            );
          }}
        />
      );
    }
    
    return (
      <View className="flex-1">
        <View className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-row items-center justify-between">
          <Text className="text-gray-900 dark:text-gray-100 font-semibold text-lg" numberOfLines={1}>
            {selectedFile.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isReadableFile && (
              <TouchableOpacity
                onPress={() => setReadingMode(true)}
                style={{
                  backgroundColor: '#2563EB',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="book" size={18} color="#ffffff" />
                <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>
                  Read
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                setReadingMode(false);
                setSelectedFile(null);
              }}
              className="bg-gray-100 dark:bg-gray-700 rounded-lg p-2"
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>
        <FileViewer
          fileUri={selectedFile.uri}
          filename={selectedFile.name}
          onClose={() => {
            setReadingMode(false);
            setSelectedFile(null);
          }}
        />
      </View>
    );
  }

  if (files.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <Ionicons name="document-outline" size={64} color="#9CA3AF" />
        <Text className="mt-4 text-gray-600 dark:text-gray-400 text-center text-lg font-semibold">
          No files uploaded yet
        </Text>
        <Text className="mt-2 text-gray-500 dark:text-gray-500 text-center">
          Upload a file to get started
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <FlatList
        data={files}
        renderItem={renderFileItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshing={loading}
        onRefresh={loadFiles}
      />
    </View>
  );
}

