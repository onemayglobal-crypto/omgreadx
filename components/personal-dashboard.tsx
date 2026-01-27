import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { listenDashboardSummary, type DashboardSummary } from '@/utils/firestoreDashboard';
import { listenUserDocuments } from '@/utils/firestoreDocuments';
import { listenUserProgress } from '@/utils/firestoreProgress';

interface DashboardStats {
  totalFiles: number;
  totalSessions: number;
  totalWordsRead: number;
  totalReadingTime: number;
  averageCompletion: number;
}

interface PersonalDashboardProps {
  refreshKey?: number;
}

export default function PersonalDashboard({ refreshKey }: PersonalDashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const { uid } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    totalSessions: 0,
    totalWordsRead: 0,
    totalReadingTime: 0,
    averageCompletion: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const unsubSummary = listenDashboardSummary(uid, setSummary);
    const unsubDocs = listenUserDocuments(uid, (docs) => setDocCount(docs.length));
    const unsubProgress = listenUserProgress(uid, (items) => {
      setCompletedCount(items.filter((p) => p.data.completed).length);
    });
    setLoading(false);
    return () => {
      unsubSummary();
      unsubDocs();
      unsubProgress();
    };
  }, [refreshKey]);

  useEffect(() => {
    const avg = docCount > 0 ? Math.round((completedCount / docCount) * 100) : 0;
    setStats({
      totalFiles: summary?.filesUploaded ?? docCount,
      totalSessions: summary?.readingSessions ?? 0,
      totalWordsRead: summary?.wordsRead ?? 0,
      totalReadingTime: summary?.totalReadingTimeSec ?? 0,
      averageCompletion: avg,
    });
  }, [summary, docCount, completedCount]);

  const formatDuration = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${String(r).padStart(2, '0')}s`;
  };

  const loadDashboardData = async () => {
    try {
      // Realtime listeners already update state; keep for pull-to-refresh compatibility.
      if (!uid) return;
      const avg = docCount > 0 ? Math.round((completedCount / docCount) * 100) : 0;
      setStats({
        totalFiles: summary?.filesUploaded || docCount,
        totalSessions: summary?.readingSessions || 0,
        totalWordsRead: summary?.wordsRead || 0,
        totalReadingTime: summary?.totalReadingTimeSec || 0,
        averageCompletion: avg,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={loadDashboardData}
          tintColor={isDark ? "#60A5FA" : "#2563EB"}
        />
      }
    >
      {/* Header */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <View style={styles.headerTop}>
          <View style={styles.headerContent}>
            <Ionicons name="stats-chart" size={32} color={isDark ? "#60A5FA" : "#2563EB"} />
            <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Dashboard</Text>
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
        <Text style={[styles.headerSubtitle, isDark && styles.headerSubtitleDark]}>
          Your reading statistics
        </Text>
      </View>

      {/* Statistics Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardPrimary, isDark && styles.statCardDark]}>
          <Ionicons name="document-text" size={32} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalFiles}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Files Uploaded Today</Text>
        </View>

        <View style={[styles.statCard, styles.statCardSuccess, isDark && styles.statCardDark]}>
          <Ionicons name="book" size={32} color="#10B981" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalSessions}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Reading Sessions</Text>
        </View>

        <View style={[styles.statCard, styles.statCardInfo, isDark && styles.statCardDark]}>
          <Ionicons name="text" size={32} color="#8B5CF6" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalWordsRead.toLocaleString()}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Words Read</Text>
        </View>

        <View style={[styles.statCard, styles.statCardWarning, isDark && styles.statCardDark]}>
          <Ionicons name="time" size={32} color="#F59E0B" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>
            {formatDuration(stats.totalReadingTime)}
          </Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Reading Time</Text>
        </View>
      </View>

      {/* Progress Overview */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Overall Progress</Text>
        <View style={[styles.progressCard, isDark && styles.progressCardDark]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, isDark && styles.progressLabelDark]}>Average Completion Rate</Text>
            <Text style={styles.progressPercentage}>{stats.averageCompletion}%</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${stats.averageCompletion}%` },
              ]}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  containerDark: {
    backgroundColor: 'transparent',
  },
  content: {
    paddingBottom: 24,
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
    marginLeft: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerTitleDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  headerSubtitle: {
    fontSize: 17,
    color: '#374151',
    marginTop: 4,
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitleDark: {
    color: '#E5E7EB',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  themeToggle: {
    padding: 8,
    borderRadius: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: '47%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  statCardPrimary: {
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  statCardSuccess: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  statCardInfo: {
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  statCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  statCardDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 12,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statValueDark: {
    color: '#FFFFFF',
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  statLabel: {
    fontSize: 15,
    color: '#374151',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statLabelDark: {
    color: '#E5E7EB',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  sectionTitleDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  progressCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  progressCardDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  progressLabelDark: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 19,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  progressPercentage: {
    fontSize: 26,
    fontWeight: '800',
    color: '#10B981',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
});

