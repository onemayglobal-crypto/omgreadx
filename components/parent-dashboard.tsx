import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { listenDashboardSummary, type DashboardSummary } from '@/utils/firestoreDashboard';
import { listenUserDocuments, type UserDocument } from '@/utils/firestoreDocuments';
import { listenUserProgress } from '@/utils/firestoreProgress';

interface DashboardStats {
  totalFiles: number;
  totalSessions: number;
  totalWordsRead: number;
  totalReadingTime: number;
  averageCompletion: number;
  incompleteSessions: number;
  todayProgress: number;
  filesUploadedToday: number;
  filesCompletedToday: number;
}

interface ParentDashboardProps {
  refreshKey?: number;
}

export default function ParentDashboard({ refreshKey }: ParentDashboardProps) {
  const { theme, toggleTheme } = useTheme();
  const { uid } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [docCount, setDocCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [uploadedTodayCount, setUploadedTodayCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [recentDocs, setRecentDocs] = useState<Array<{ id: string; data: UserDocument }>>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    totalSessions: 0,
    totalWordsRead: 0,
    totalReadingTime: 0,
    averageCompletion: 0,
    incompleteSessions: 0,
    todayProgress: 0,
    filesUploadedToday: 0,
    filesCompletedToday: 0,
  });
  const [loading, setLoading] = useState(true);
  
  const isDark = theme === 'dark';

  const isSameDay = (a: Date, b: Date) => {
    const da = new Date(a);
    const db = new Date(b);
    da.setHours(0, 0, 0, 0);
    db.setHours(0, 0, 0, 0);
    return da.getTime() === db.getTime();
  };

  const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.toMillis === 'function') return new Date(value.toMillis());
    if (value instanceof Date) return value;
    return null;
  };

  const formatDuration = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${String(r).padStart(2, '0')}s`;
  };

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    const unsubSummary = listenDashboardSummary(uid, setSummary);
    const unsubDocs = listenUserDocuments(uid, (docs) => {
      setDocCount(docs.length);
      setRecentDocs(docs.slice(0, 5));
      const today = new Date();
      const uploadedToday = docs.filter((d) => {
        const created = toDate((d.data as any).createdAt);
        return created ? isSameDay(created, today) : false;
      }).length;
      setUploadedTodayCount(uploadedToday);
    });
    const unsubProgress = listenUserProgress(uid, (items) => {
      setCompletedCount(items.filter((p) => p.data.completed).length);
      const today = new Date();
      const completedToday = items.filter((p) => {
        if (!p.data.completed) return false;
        const lastRead = toDate((p.data as any).lastReadAt);
        return lastRead ? isSameDay(lastRead, today) : false;
      }).length;
      setCompletedTodayCount(completedToday);
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
    const todayProgress =
      uploadedTodayCount > 0 ? Math.round((completedTodayCount / uploadedTodayCount) * 100) : 0;
    setStats({
      totalFiles: summary?.filesUploaded ?? docCount,
      totalSessions: summary?.readingSessions ?? 0,
      totalWordsRead: summary?.wordsRead ?? 0,
      totalReadingTime: summary?.totalReadingTimeSec ?? 0,
      averageCompletion: avg,
      incompleteSessions: Math.max(0, docCount - completedCount),
      todayProgress,
      filesUploadedToday: uploadedTodayCount,
      filesCompletedToday: completedTodayCount,
    });
  }, [summary, docCount, completedCount, uploadedTodayCount, completedTodayCount]);

  const handleResetToday = async () => {
    Alert.alert('Not available', 'Reset is not enabled for cloud sync yet.');
  };

  const loadDashboardData = async () => {
    try {
      // Realtime listener updates state; keep for pull-to-refresh compatibility.
      const avg = docCount > 0 ? Math.round((completedCount / docCount) * 100) : 0;
      const todayProgress =
        uploadedTodayCount > 0 ? Math.round((completedTodayCount / uploadedTodayCount) * 100) : 0;
      setStats({
        totalFiles: summary?.filesUploaded ?? docCount,
        totalSessions: summary?.readingSessions ?? 0,
        totalWordsRead: summary?.wordsRead ?? 0,
        totalReadingTime: summary?.totalReadingTimeSec ?? 0,
        averageCompletion: avg,
        incompleteSessions: Math.max(0, docCount - completedCount),
        todayProgress,
        filesUploadedToday: uploadedTodayCount,
        filesCompletedToday: completedTodayCount,
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
            <Ionicons name="shield-checkmark" size={32} color={isDark ? "#60A5FA" : "#2563EB"} />
            <Text style={[styles.headerTitle, isDark && styles.headerTitleDark]}>Parent Dashboard</Text>
          </View>
          <View style={styles.headerRight}>
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
        <Text style={[styles.headerSubtitle, isDark && styles.headerSubtitleDark]}>
          Monitor your child's reading progress
        </Text>
      </View>

      {/* Statistics Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardPrimary, isDark && styles.statCardDark]}>
          <Ionicons name="document-text" size={32} color={isDark ? "#60A5FA" : "#2563EB"} />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalFiles}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Files Uploaded</Text>
        </View>

        <View style={[styles.statCard, styles.statCardSuccess, isDark && styles.statCardDark]}>
          <Ionicons name="book" size={32} color="#10B981" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalSessions}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Today's Reading Session</Text>
        </View>

        <View style={[styles.statCard, styles.statCardInfo, isDark && styles.statCardDark]}>
          <Ionicons name="text" size={32} color="#8B5CF6" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>{stats.totalWordsRead.toLocaleString()}</Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Today's Words Read</Text>
        </View>

        <View style={[styles.statCard, styles.statCardWarning, isDark && styles.statCardDark]}>
          <Ionicons name="time" size={32} color="#F59E0B" />
          <Text style={[styles.statValue, isDark && styles.statValueDark]}>
            {formatDuration(stats.totalReadingTime)}
          </Text>
          <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Today's Reading Time</Text>
        </View>
      </View>

      {/* Today's Progress */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Today's Progress</Text>
        <View style={[styles.progressCard, isDark && styles.progressCardDark]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, isDark && styles.progressLabelDark]}>Files Completed Today</Text>
            <Text style={styles.progressPercentage}>{stats.todayProgress}%</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${stats.todayProgress}%` },
              ]}
            />
          </View>
          <View style={styles.progressFooter}>
            <View style={styles.progressItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={[styles.progressItemText, isDark && styles.progressItemTextDark]}>
                {stats.filesCompletedToday} Completed
              </Text>
            </View>
            <View style={styles.progressItem}>
              <Ionicons name="document-text" size={20} color={isDark ? "#60A5FA" : "#2563EB"} />
              <Text style={[styles.progressItemText, isDark && styles.progressItemTextDark]}>
                {stats.filesUploadedToday} Uploaded Today
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Progress Overview */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Overall Progress</Text>
        <View style={[styles.progressCard, isDark && styles.progressCardDark]}>
          <View style={styles.progressHeader}>
            <Text style={[
              styles.progressLabel, 
              isDark && styles.progressLabelDark
            ]}>Average Completion Rate</Text>
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
          <View style={styles.progressFooter}>
            <View style={styles.progressItem}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={[styles.progressItemText, isDark && styles.progressItemTextDark]}>
                {stats.totalSessions - stats.incompleteSessions} Complete
              </Text>
            </View>
            <View style={styles.progressItem}>
              <Ionicons name="close-circle" size={20} color="#EF4444" />
              <Text style={[styles.progressItemText, isDark && styles.progressItemTextDark]}>
                {stats.incompleteSessions} Incomplete
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Recent Files */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Uploaded Files</Text>
        {recentDocs.length === 0 ? (
          <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
            <Ionicons name="document-outline" size={48} color={isDark ? "#6B7280" : "#9CA3AF"} />
            <Text style={[styles.emptyStateText, isDark && styles.emptyStateTextDark]}>No files uploaded yet</Text>
            <Text style={[styles.emptyStateSubtext, isDark && styles.emptyStateSubtextDark]}>
              Files will appear here once uploaded
            </Text>
          </View>
        ) : (
          <View style={[styles.fileList, isDark && styles.fileListDark]}>
            {recentDocs.map((doc) => (
              <View key={doc.id} style={[styles.fileItem, isDark && styles.fileItemDark]}>
                <Ionicons name="document-text-outline" size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, isDark && styles.fileNameDark]} numberOfLines={1}>
                    {doc.data.title || doc.data.name}
                  </Text>
                  <Text style={[styles.fileMeta, isDark && styles.fileMetaDark]}>
                    {doc.data.type.toUpperCase()} • {doc.data.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Reading Sessions (Cloud Summary) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>Reading Summary</Text>
        <View style={[styles.fileList, isDark && styles.fileListDark]}>
          <View style={[styles.fileItem, isDark && styles.fileItemDark]}>
            <Ionicons name="time-outline" size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, isDark && styles.fileNameDark]}>Reading sessions</Text>
              <Text style={[styles.fileMeta, isDark && styles.fileMetaDark]}>{stats.totalSessions}</Text>
            </View>
          </View>
          <View style={[styles.fileItem, isDark && styles.fileItemDark]}>
            <Ionicons name="text-outline" size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, isDark && styles.fileNameDark]}>Words read</Text>
              <Text style={[styles.fileMeta, isDark && styles.fileMetaDark]}>{stats.totalWordsRead.toLocaleString()}</Text>
            </View>
          </View>
          <View style={[styles.fileItem, isDark && styles.fileItemDark]}>
            <Ionicons name="stopwatch-outline" size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            <View style={styles.fileInfo}>
              <Text style={[styles.fileName, isDark && styles.fileNameDark]}>Reading time</Text>
              <Text style={[styles.fileMeta, isDark && styles.fileMetaDark]}>{formatDuration(stats.totalReadingTime)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Key Features */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>How It Works</Text>
        <View style={styles.featuresList}>
          <View style={[styles.featureItem, isDark && styles.featureItemDark]}>
            <View style={styles.featureIcon}>
              <Ionicons name="lock-closed" size={24} color={isDark ? "#60A5FA" : "#2563EB"} />
            </View>
            <View style={styles.featureContent}>
              <Text style={[styles.featureTitle, isDark && styles.featureTitleDark]}>No Skipping</Text>
              <Text style={[styles.featureDescription, isDark && styles.featureDescriptionDark]}>
                Students must read each paragraph completely before moving to the next
              </Text>
            </View>
          </View>

          <View style={[styles.featureItem, isDark && styles.featureItemDark]}>
            <View style={[styles.featureIcon, styles.featureIconSuccess]}>
              <Ionicons name="checkmark-done-circle" size={24} color="#10B981" />
            </View>
            <View style={styles.featureContent}>
              <Text style={[styles.featureTitle, isDark && styles.featureTitleDark]}>Progress Tracking</Text>
              <Text style={[styles.featureDescription, isDark && styles.featureDescriptionDark]}>
                Monitor completion status, reading time, and word counts
              </Text>
            </View>
          </View>

          <View style={[styles.featureItem, isDark && styles.featureItemDark]}>
            <View style={[styles.featureIcon, styles.featureIconWarning]}>
              <Ionicons name="alert-circle" size={24} color="#EF4444" />
            </View>
            <View style={styles.featureContent}>
              <Text style={[styles.featureTitle, isDark && styles.featureTitleDark]}>Incomplete Detection</Text>
              <Text style={[styles.featureDescription, isDark && styles.featureDescriptionDark]}>
                Instantly see if any paragraphs were skipped or left incomplete
              </Text>
            </View>
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
  headerRight: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  resetButtonDark: {
    backgroundColor: '#1E3A5F',
    borderColor: '#3B82F6',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  resetButtonTextDark: {
    color: '#60A5FA',
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
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressItemText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  progressItemTextDark: {
    color: '#9CA3AF',
  },
  emptyState: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  emptyStateDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  emptyStateTextDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  },
  emptyStateSubtext: {
    fontSize: 15,
    color: '#374151',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  emptyStateSubtextDark: {
    color: '#E5E7EB',
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  fileList: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  fileListDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  fileItemDark: {
    borderBottomColor: '#374151',
  },
  fileInfo: {
    flex: 1,
    marginLeft: 12,
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
  fileMeta: {
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
    fontWeight: '600',
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
  fileMetaDark: {
    color: '#E5E7EB',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  moreFilesText: {
    fontSize: 14,
    color: '#2563EB',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  featuresList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
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
  featureItemDark: {
    backgroundColor: 'rgba(31, 41, 55, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureIconSuccess: {
    backgroundColor: '#D1FAE5',
  },
  featureIconWarning: {
    backgroundColor: '#FEE2E2',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  featureTitleDark: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  featureDescription: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
    fontWeight: '600',
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
  featureDescriptionDark: {
    color: '#E5E7EB',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

