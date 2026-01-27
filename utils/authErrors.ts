type FriendlyAuthMessageContext =
  | 'signIn'
  | 'signUp'
  | 'resetPassword'
  | 'googleSignIn'
  | 'unknown';

/**
 * Maps Firebase Auth / Google sign-in errors to user-friendly messages.
 * Never surface raw Firebase error codes to the UI.
 */
export function getFriendlyAuthErrorMessage(err: unknown, ctx: FriendlyAuthMessageContext): string {
  const code = (err as any)?.code as string | undefined;
  const message = (err as any)?.message as string | undefined;

  // Firebase Auth (most common)
  if (code) {
    if (ctx === 'signUp') {
      if (code === 'auth/email-already-in-use') return 'An account already exists. Please sign in instead.';
      if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
      if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
    }

    if (ctx === 'signIn') {
      if (code === 'auth/user-not-found') return 'No account found. If new user, please Sign Up first.';
      if (code === 'auth/wrong-password') return 'Incorrect password. Please try again.';
      if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
      // Newer Firebase SDKs often throw a generic "invalid-credential" for wrong password OR unknown user.
      if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')
        return 'Invalid email or password. If new user, please Sign Up first.';
      if (code === 'auth/too-many-requests')
        return 'Too many attempts. Please wait a moment and try again.';
    }

    if (ctx === 'resetPassword') {
      // Never reveal account existence.
      if (code === 'auth/user-not-found') return 'Password reset link sent. Please check your inbox or spam folder.';
      if (code === 'auth/invalid-email') return 'Please enter a valid email address.';
    }

    if (ctx === 'googleSignIn') {
      if (code === 'auth/account-exists-with-different-credential')
        return 'This email is already linked to a different sign-in method. Please sign in with email and password.';
      if (code === 'auth/network-request-failed') return 'Network issue. Please try again.';
    }
  }

  // Google Sign-In library messages
  if (ctx === 'googleSignIn') {
    if (typeof message === 'string') {
      if (message.toLowerCase().includes('cancel')) return 'Sign-in cancelled';
      if (message.toLowerCase().includes('network')) return 'Network issue. Please try again.';
    }
    return 'Something went wrong. Please try again.';
  }

  // Fallbacks
  if (ctx === 'resetPassword') {
    return 'Password reset link sent. Please check your inbox or spam folder.';
  }
  if (ctx === 'signUp') return 'Unable to create account. Please try again.';
  if (ctx === 'signIn') return 'Invalid email or password. If new user, please Sign Up first.';
  return 'Something went wrong. Please try again.';
}

