import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  sendResetPasswordEmail,
  signInEmailPassword,
  signInWithGoogle,
  signUpEmailPassword,
} from '@/utils/firebaseAuth';

type Mode = 'signIn' | 'signUp' | 'forgot';

export default function AuthModal({
  visible,
  onClose,
  onAuthed,
  forceAuth = false,
}: {
  visible: boolean;
  onClose: () => void;
  onAuthed: (user?: unknown) => void;
  forceAuth?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const title = useMemo(() => {
    if (mode === 'signUp') return 'Sign Up';
    if (mode === 'forgot') return 'Forgot Password';
    return 'Sign In';
  }, [mode]);

  const close = () => {
    if (forceAuth) return;
    setMode('signIn');
    setBusy(false);
    setShowPassword(false);
    setShowConfirm(false);
    onClose();
  };

  const handleGoogle = () => {
    (async () => {
      try {
        setBusy(true);
        await signInWithGoogle();
        Alert.alert('Signed in', 'You are signed in.');
        onAuthed({});
        close();
      } catch (e: any) {
        Alert.alert('Sign-in', e?.message || 'Something went wrong. Please try again.');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleSubmit = async () => {
    try {
      setBusy(true);
      if (mode === 'signIn') {
        await signInEmailPassword({ email, password });
        Alert.alert('Signed in', 'You are signed in.');
        onAuthed({});
        close();
        return;
      }
      if (mode === 'signUp') {
        if (password !== confirm) {
          throw new Error('Passwords do not match.');
        }
        await signUpEmailPassword({ displayName: name, email, password });
        Alert.alert('Signed in', 'Your account is created and you are signed in.');
        onAuthed({});
        close();
        return;
      }
    } catch (e: any) {
      Alert.alert(mode === 'signUp' ? 'Sign Up' : 'Sign In', e?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    try {
      setBusy(true);
      await sendResetPasswordEmail(resetEmail);
      Alert.alert(
        'Reset link sent',
        'Password reset link sent. Please check your inbox or spam folder.'
      );
      setMode('signIn');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to send reset link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable style={styles.overlay} onPress={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {!forceAuth && (
                <TouchableOpacity onPress={close} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color="#D1D5DB" />
                </TouchableOpacity>
              )}
            </View>

            {mode !== 'forgot' && (
              <View style={styles.segment}>
                <TouchableOpacity
                  onPress={() => setMode('signIn')}
                  style={[styles.segmentBtn, mode === 'signIn' && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, mode === 'signIn' && styles.segmentTextActive]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode('signUp')}
                  style={[styles.segmentBtn, mode === 'signUp' && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, mode === 'signUp' && styles.segmentTextActive]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === 'signUp' && (
              <>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  placeholderTextColor="#6B7280"
                  style={styles.input}
                  autoCapitalize="words"
                />
              </>
            )}

            {mode === 'forgot' && (
              <>
                <Text style={styles.helper}>
                  Enter your email address and we’ll send you a link to reset your password.
                </Text>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#6B7280"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  onPress={handleReset}
                  disabled={busy}
                  style={[styles.primaryBtn, busy && styles.disabled]}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send Reset Link</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMode('signIn')} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Back to Sign In</Text>
                </TouchableOpacity>
              </>
            )}

            {mode !== 'forgot' && (
              <>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter your email"
                  placeholderTextColor="#6B7280"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />

                <View style={styles.passwordRow}>
                  <View style={styles.passwordHeader}>
                    <Text style={styles.label}>Password</Text>
                    {mode === 'signIn' && (
                      <TouchableOpacity onPress={() => setMode('forgot')}>
                        <Text style={styles.forgot}>Forgot Password?</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter your password"
                      placeholderTextColor="#6B7280"
                      style={[styles.input, styles.passwordInput]}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(v => !v)}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </View>

                {mode === 'signUp' && (
                  <>
                    <Text style={styles.label}>Confirm Password</Text>
                    <View style={styles.passwordInputWrap}>
                      <TextInput
                        value={confirm}
                        onChangeText={setConfirm}
                        placeholder="Confirm your password"
                        placeholderTextColor="#6B7280"
                        style={[styles.input, styles.passwordInput]}
                        secureTextEntry={!showConfirm}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={styles.eyeBtn}
                        onPress={() => setShowConfirm(v => !v)}
                        accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={busy}
                  style={[styles.primaryBtn, busy && styles.disabled]}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>{mode === 'signUp' ? 'Sign Up' : 'Sign In'}</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>OR</Text>
                  <View style={styles.orLine} />
                </View>

                <TouchableOpacity onPress={handleGoogle} style={styles.googleBtn}>
                  <Image
                    source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                    style={styles.googleLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Blue‑violet accent color (used for Sign In/Up + Forgot Password)
  // Feel free to tweak to your preferred shade.
  // (kept in one place so the modal stays consistent)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 16,
    justifyContent: 'center',
  },
  kav: {
    width: '100%',
  },
  card: {
    backgroundColor: '#2B2B2B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#F3F4F6',
    fontSize: 28,
    fontWeight: '800',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#6366F1',
  },
  segmentText: {
    color: '#9CA3AF',
    fontWeight: '700',
    fontSize: 14,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  label: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10,
  },
  helper: {
    color: '#9CA3AF',
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F9FAFB',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  passwordRow: {
    marginTop: 6,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgot: {
    color: '#6366F1',
    fontWeight: '700',
  },
  passwordInputWrap: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 46,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 4,
  },
  primaryBtn: {
    backgroundColor: '#6366F1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  disabled: {
    opacity: 0.8,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  orText: {
    color: '#9CA3AF',
    fontWeight: '800',
  },
  googleBtn: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 18,
    height: 18,
  },
  googleText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  linkBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  linkText: {
    color: '#9CA3AF',
    fontWeight: '800',
  },
});

