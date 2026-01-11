import * as FileSystem from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ProfileType = 'personal' | 'child';

export interface UserProfile {
  displayName: string;
  avatarUri?: string;
  profileType?: ProfileType; // 'personal' or 'child'
  createdAt: Date;
  updatedAt: Date;
}

const PROFILE_STORAGE_KEY = 'user_profile';

const getProfileFilePath = (): string => {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    return '';
  }
  return `${baseDir}user_profile.json`;
};

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  try {
    console.log('Saving user profile:', profile);
    const profileJson = JSON.stringify(profile);
    
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(PROFILE_STORAGE_KEY, profileJson);
      console.log('User profile saved to AsyncStorage (web)');
    } else {
      const filePath = getProfileFilePath();
      if (!filePath) {
        console.warn('Cannot save user profile: no storage path available');
        await AsyncStorage.setItem(PROFILE_STORAGE_KEY, profileJson);
        console.log('User profile saved to AsyncStorage (fallback)');
        return;
      }
      console.log('Writing profile to:', filePath);
      await FileSystem.writeAsStringAsync(filePath, profileJson);
      console.log('User profile saved successfully');
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
};

export const getUserProfile = async (): Promise<UserProfile | null> => {
  try {
    if (Platform.OS === 'web') {
      const profileJson = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        console.log('Loaded user profile from AsyncStorage (web)');
        return {
          ...profile,
          createdAt: new Date(profile.createdAt),
          updatedAt: new Date(profile.updatedAt),
        };
      }
      return null;
    } else {
      const filePath = getProfileFilePath();
      if (!filePath) {
        console.log('No storage path available for user profile, trying AsyncStorage...');
        const profileJson = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
        if (profileJson) {
          const profile = JSON.parse(profileJson);
          console.log('Loaded user profile from AsyncStorage (fallback)');
          return {
            ...profile,
            createdAt: new Date(profile.createdAt),
            updatedAt: new Date(profile.updatedAt),
          };
        }
        return null;
      }
      
      console.log('Loading user profile from:', filePath);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        console.log('User profile file does not exist yet');
        return null;
      }
      
      const profileJson = await FileSystem.readAsStringAsync(filePath);
      if (profileJson) {
        const profile = JSON.parse(profileJson);
        console.log('Loaded user profile');
        return {
          ...profile,
          createdAt: new Date(profile.createdAt),
          updatedAt: new Date(profile.updatedAt),
        };
      }
      return null;
    }
  } catch (error) {
    console.error('Error loading user profile:', error);
    return null;
  }
};

export const pickImage = async (): Promise<string | null> => {
  try {
    // Dynamically import expo-image-picker
    const ImagePicker = await import('expo-image-picker');
    
    // Request photo library permissions (not camera)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Permission', 
        'We need access to your photo library to set your profile picture. You can skip this if you don\'t want to upload a photo.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => {
            // On iOS, this will open app settings
            if (Platform.OS === 'ios') {
              // Linking.openSettings() would be needed, but we'll just return null
            }
          }}
        ]
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      return result.assets[0].uri;
    }
    return null;
  } catch (error) {
    console.error('Error picking image:', error);
    Alert.alert('Error', 'Image picker is not available. You can continue without a profile picture.');
    return null;
  }
};

