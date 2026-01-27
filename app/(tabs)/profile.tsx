import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { setUserRole, type UserRole } from '@/utils/firestoreUsers';

const dashboardBackground = require('@/assets/images/dashboard.png');

export default function ProfileScreen() {
  const { theme, toggleTheme } = useTheme();
  const { firebaseUser, uid, userDoc, authLoading, signOut } = useAuth();
  const [profileType, setProfileType] = useState<'personal' | 'child' | undefined>(undefined);
  const [savingRole, setSavingRole] = useState(false);
  
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!userDoc?.role) return;
    // Backward-compat: older builds stored "child" for personal mode.
    const role = (userDoc.role as any) === 'child' ? 'personal' : userDoc.role;
    setProfileType(role === 'parent' ? 'child' : 'personal');
  }, [userDoc?.role]);

  const handleSelectProfileType = async (type: 'personal' | 'child') => {
    if (!uid) return;
    const role: UserRole = type === 'child' ? 'parent' : 'personal';
    setProfileType(type);
    try {
      setSavingRole(true);
      await setUserRole(uid, role);
      if (type === 'child') {
        Alert.alert(
          'Parent Dashboard',
          "You can monitor the dashboard for your child's reading progress."
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to update profile type. Please try again.');
    } finally {
      setSavingRole(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    Alert.alert('Signed out', 'You have been signed out.');
  };

  if (authLoading) {
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
          {/* Signed-in view: show only photo + name */}
          {firebaseUser && (
            <>
              <View style={styles.avatarSection}>
                <View style={[styles.avatarContainer, isDark && styles.avatarContainerDark]}>
                  {(userDoc?.photoURL || firebaseUser.photoURL) ? (
                    <Image
                      source={{ uri: (userDoc?.photoURL || firebaseUser.photoURL) as string }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, isDark && styles.avatarPlaceholderDark]}>
                      <Ionicons name="person" size={64} color={isDark ? '#9CA3AF' : '#6B7280'} />
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.nameSection}>
                <Text style={[styles.label, isDark && styles.labelDark]}>Name</Text>
                <View style={[styles.nameDisplay, isDark && styles.nameDisplayDark]}>
                  <Text style={[styles.nameText, isDark && styles.nameTextDark]}>
                    {userDoc?.displayName || firebaseUser.displayName || firebaseUser.email || 'User'}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Profile Type Section */}
          {firebaseUser && (
            <View style={styles.profileTypeSection}>
              <Text style={[styles.label, isDark && styles.labelDark]}>Choose</Text>
              <View style={[styles.typeToggle, isDark && styles.typeToggleDark]}>
                <TouchableOpacity
                  style={[
                    styles.typeToggleBtn,
                    profileType === 'personal' && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => handleSelectProfileType('personal')}
                  disabled={savingRole}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      profileType === 'personal' && styles.typeToggleTextActive,
                    ]}
                  >
                    Personal
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeToggleBtn,
                    profileType === 'child' && styles.typeToggleBtnActive,
                  ]}
                  onPress={() => handleSelectProfileType('child')}
                  disabled={savingRole}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      profileType === 'child' && styles.typeToggleTextActive,
                    ]}
                  >
                    For Child
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          {firebaseUser && (
            <TouchableOpacity
              style={[styles.signOutButton, isDark && styles.signOutButtonDark]}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={18} color={isDark ? '#FCA5A5' : '#DC2626'} />
              <Text style={[styles.signOutText, isDark && styles.signOutTextDark]}>Sign Out</Text>
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
  authCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  authCardDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  authTitle: {
    marginTop: 8,
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  authTitleDark: {
    color: '#FFFFFF',
  },
  authSubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  authSubtitleDark: {
    color: '#E5E7EB',
  },
  authButton: {
    marginTop: 14,
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  authButtonText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 16,
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
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17, 24, 39, 0.08)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  typeToggleDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  typeToggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeToggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  typeToggleText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#6B7280',
  },
  typeToggleTextActive: {
    color: '#111827',
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
  signOutButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  signOutButtonDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
  },
  signOutText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 16,
  },
  signOutTextDark: {
    color: '#FCA5A5',
  },
});

