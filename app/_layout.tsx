import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import '../global.css';

import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/auth-modal';
import { configureGoogleSignIn } from '@/utils/firebaseAuth';

// Component to load Google Fonts for web
function WebFontLoader() {
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Check if fonts are already loaded
      if (document.querySelector('link[href*="fonts.googleapis.com"]')) {
        return;
      }
      
      const link1 = document.createElement('link');
      link1.rel = 'preconnect';
      link1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(link1);
      
      const link2 = document.createElement('link');
      link2.rel = 'preconnect';
      link2.href = 'https://fonts.gstatic.com';
      link2.crossOrigin = 'anonymous';
      document.head.appendChild(link2);
      
      const link3 = document.createElement('link');
      link3.rel = 'stylesheet';
      link3.href = 'https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&family=Lora:wght@400;500;600;700&display=swap';
      document.head.appendChild(link3);
    }
  }, []);
  
  return null;
}

function RootLayoutNav() {
  const { theme } = useTheme();
  const { firebaseUser, authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    configureGoogleSignIn().catch(() => {});
  }, []);

  useEffect(() => {
    if (authLoading) return;
    setShowAuth(!firebaseUser);
  }, [authLoading, firebaseUser]);

  return (
    <NavigationThemeProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>

      {/* Global auth gate: require sign-in on app open, until sign out */}
      <AuthModal
        visible={showAuth}
        forceAuth
        onClose={() => setShowAuth(false)}
        onAuthed={() => setShowAuth(false)}
      />

      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WebFontLoader />
        <RootLayoutNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
