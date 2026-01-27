import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, SafeAreaView, StyleSheet, AppState, ActivityIndicator, ImageBackground } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ParentDashboard from '@/components/parent-dashboard';
import PersonalDashboard from '@/components/personal-dashboard';
import { useAuth } from '@/contexts/AuthContext';

const dashboardBackground = require('@/assets/images/dashboard.png');

export default function ExploreScreen() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const { userDoc, authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    setLoading(false);
  }, [authLoading]);

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      setRefreshKey(prev => prev + 1);
    }, [])
  );

  useEffect(() => {
    // Refresh when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        setRefreshKey(prev => prev + 1);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (loading) {
    return (
      <ImageBackground source={dashboardBackground} style={styles.backgroundImage} resizeMode="cover">
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  return (
    <ImageBackground source={dashboardBackground} style={styles.backgroundImage} resizeMode="cover">
      <SafeAreaView style={styles.container}>
        {userDoc?.role === 'parent' ? (
          <ParentDashboard refreshKey={refreshKey} />
        ) : (
          <PersonalDashboard refreshKey={refreshKey} />
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    margin: 24,
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
