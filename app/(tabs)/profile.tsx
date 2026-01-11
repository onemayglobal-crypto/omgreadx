import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { getUserProfile, saveUserProfile, pickImage, UserProfile, ProfileType } from '@/utils/profileStorage';

const dashboardBackground = require('@/assets/images/dashboard.png');

export default function ProfileScreen() {
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | undefined>(undefined);
  const [profileType, setProfileType] = useState<ProfileType | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const isDark = theme === 'dark';

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      const savedProfile = await getUserProfile();
      if (savedProfile) {
        setProfile(savedProfile);
        setDisplayName(savedProfile.displayName);
        setAvatarUri(savedProfile.avatarUri);
        setProfileType(savedProfile.profileType);
        setIsEditing(false);
      } else {
        setIsEditing(true); // If no profile exists, show edit mode
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }

    try {
      setIsSaving(true);
      const now = new Date();
      if (!profileType) {
        Alert.alert('Error', 'Please select whether this is Personal or For Child');
        return;
      }

      const updatedProfile: UserProfile = {
        displayName: displayName.trim(),
        avatarUri: avatarUri,
        profileType: profileType,
        createdAt: profile?.createdAt || now,
        updatedAt: now,
      };
      
      await saveUserProfile(updatedProfile);
      setProfile(updatedProfile);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const uri = await pickImage();
      if (uri) {
        setAvatarUri(uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleRemoveImage = () => {
    setAvatarUri(undefined);
  };

  if (isLoading) {
    return (
      <ImageBackground source={dashboardBackground} style={styles.backgroundImage} resizeMode="cover">
        <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={isDark ? "#60A5FA" : "#2563EB"} />
            <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>Loading profile...</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={dashboardBackground} style={styles.backgroundImage} resizeMode="cover">
      <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.header, isDark && styles.headerDark]}>
          <View style={styles.headerTop}>
            <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Profile</Text>
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

        {/* Profile Content */}
        <View style={styles.profileContent}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={isEditing ? handlePickImage : undefined}
              disabled={!isEditing}
            >
              <View style={[styles.avatarContainer, isDark && styles.avatarContainerDark, !isEditing && styles.avatarContainerNonEditable]}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, isDark && styles.avatarPlaceholderDark]}>
                    <Ionicons name="person" size={64} color={isDark ? '#9CA3AF' : '#6B7280'} />
                  </View>
                )}
                {isEditing && (
                  <View style={[styles.avatarEditOverlay, isDark && styles.avatarEditOverlayDark]}>
                    <Ionicons name="camera" size={24} color="#ffffff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
            {isEditing && avatarUri && (
              <TouchableOpacity
                style={[styles.removeImageButton, isDark && styles.removeImageButtonDark]}
                onPress={handleRemoveImage}
              >
                <Ionicons name="trash-outline" size={16} color={isDark ? '#EF4444' : '#DC2626'} />
                <Text style={[styles.removeImageText, isDark && styles.removeImageTextDark]}>Remove Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Display Name Section */}
          <View style={styles.nameSection}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Display Name / Username</Text>
            {isEditing ? (
              <TextInput
                style={[styles.nameInput, isDark && styles.nameInputDark]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter your name"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                autoFocus={!profile}
              />
            ) : (
              <View style={[styles.nameDisplay, isDark && styles.nameDisplayDark]}>
                <Text style={[styles.nameText, isDark && styles.nameTextDark]}>
                  {displayName || 'No name set'}
                </Text>
              </View>
            )}
          </View>

          {/* Profile Type Section */}
          <View style={styles.profileTypeSection}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Profile Type</Text>
            <Text style={[styles.subLabel, isDark && styles.subLabelDark]}>
              Is this account for personal use or to monitor a child's reading?
            </Text>
            {isEditing ? (
              <View style={styles.profileTypeOptions}>
                <TouchableOpacity
                  style={[
                    styles.profileTypeOption,
                    profileType === 'personal' && styles.profileTypeOptionSelected,
                    isDark && styles.profileTypeOptionDark,
                    profileType === 'personal' && isDark && styles.profileTypeOptionSelectedDark,
                  ]}
                  onPress={() => setProfileType('personal')}
                >
                  <Ionicons 
                    name="person" 
                    size={24} 
                    color={profileType === 'personal' ? '#ffffff' : (isDark ? '#9CA3AF' : '#6B7280')} 
                  />
                  <Text style={[
                    styles.profileTypeOptionText,
                    profileType === 'personal' && styles.profileTypeOptionTextSelected,
                    isDark && styles.profileTypeOptionTextDark,
                    profileType === 'personal' && isDark && styles.profileTypeOptionTextSelectedDark,
                  ]}>
                    Personal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.profileTypeOption,
                    profileType === 'child' && styles.profileTypeOptionSelected,
                    isDark && styles.profileTypeOptionDark,
                    profileType === 'child' && isDark && styles.profileTypeOptionSelectedDark,
                  ]}
                  onPress={() => setProfileType('child')}
                >
                  <Ionicons 
                    name="people" 
                    size={24} 
                    color={profileType === 'child' ? '#ffffff' : (isDark ? '#9CA3AF' : '#6B7280')} 
                  />
                  <Text style={[
                    styles.profileTypeOptionText,
                    profileType === 'child' && styles.profileTypeOptionTextSelected,
                    isDark && styles.profileTypeOptionTextDark,
                    profileType === 'child' && isDark && styles.profileTypeOptionTextSelectedDark,
                  ]}>
                    For Child
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.profileTypeDisplay, isDark && styles.profileTypeDisplayDark]}>
                <Ionicons 
                  name={profileType === 'child' ? 'people' : 'person'} 
                  size={20} 
                  color={isDark ? '#60A5FA' : '#2563EB'} 
                />
                <Text style={[styles.profileTypeDisplayText, isDark && styles.profileTypeDisplayTextDark]}>
                  {profileType === 'child' ? 'For Child (Parent Dashboard)' : 'Personal (Dashboard)'}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          {isEditing ? (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.saveButton, isDark && styles.saveButtonDark]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                    <Text style={styles.saveButtonText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
              {profile && (
                <TouchableOpacity
                  style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
                  onPress={() => {
                    setDisplayName(profile.displayName);
                    setAvatarUri(profile.avatarUri);
                    setProfileType(profile.profileType);
                    setIsEditing(false);
                  }}
                >
                  <Text style={[styles.cancelButtonText, isDark && styles.cancelButtonTextDark]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.editButton, isDark && styles.editButtonDark]}
              onPress={() => setIsEditing(true)}
            >
              <Ionicons name="pencil" size={20} color={isDark ? '#60A5FA' : '#2563EB'} />
              <Text style={[styles.editButtonText, isDark && styles.editButtonTextDark]}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  loadingTextDark: {
    color: '#9CA3AF',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 24,
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitleDark: {
    color: '#F9FAFB',
  },
  themeToggle: {
    padding: 8,
    borderRadius: 8,
  },
  profileContent: {
    padding: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarContainerDark: {
    backgroundColor: '#374151',
  },
  avatarContainerNonEditable: {
    opacity: 1,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  avatarPlaceholderDark: {
    backgroundColor: '#4B5563',
  },
  avatarEditOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 60,
  },
  avatarEditOverlayDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  removeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  removeImageButtonDark: {
    // Same styles
  },
  removeImageText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
  },
  removeImageTextDark: {
    color: '#EF4444',
  },
  nameSection: {
    marginBottom: 32,
  },
  profileTypeSection: {
    marginBottom: 32,
  },
  subLabel: {
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 12,
    marginTop: 4,
    fontWeight: '800',
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subLabelDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  profileTypeOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  profileTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  profileTypeOptionDark: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  profileTypeOptionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  profileTypeOptionSelectedDark: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  profileTypeOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  profileTypeOptionTextDark: {
    color: '#9CA3AF',
  },
  profileTypeOptionTextSelected: {
    color: '#ffffff',
  },
  profileTypeOptionTextSelectedDark: {
    color: '#ffffff',
  },
  profileTypeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  profileTypeDisplayDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: '#374151',
  },
  profileTypeDisplayText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  profileTypeDisplayTextDark: {
    color: '#F9FAFB',
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  labelDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  nameInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#111827',
  },
  nameInputDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: '#374151',
    color: '#F9FAFB',
  },
  nameDisplay: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
  },
  nameDisplayDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: '#374151',
  },
  nameText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  nameTextDark: {
    color: '#F9FAFB',
  },
  buttonContainer: {
    gap: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDark: {
    backgroundColor: '#3B82F6',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  cancelButtonDark: {
    backgroundColor: '#374151',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonTextDark: {
    color: '#9CA3AF',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: '#DBEAFE',
  },
  editButtonDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#3B82F6',
  },
  editButtonText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '600',
  },
  editButtonTextDark: {
    color: '#60A5FA',
  },
});

