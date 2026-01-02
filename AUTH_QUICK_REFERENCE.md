# Supabase Auth - Quick Reference

## Setup (First Time Only)

### 1. Environment Variables
```bash
# Update .env.local
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 2. Run Database Migration
Copy and run `supabase/migrations/001_create_profiles_table.sql` in Supabase SQL Editor.

### 3. Configure Supabase
- **Authentication > URL Configuration**
  - Site URL: `http://localhost:5173`
  - Redirect URLs: `http://localhost:5173/**`

- **Authentication > Email Templates**
  - Confirm signup redirect: `{{ .ConfirmationURL }}`
  - Reset password redirect: `{{ .SiteURL }}/reset-password`

---

## Common Auth Operations

### Using AuthContext

```javascript
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const {
    user,              // Current user object
    session,           // Current session
    isAuthenticated,   // Boolean: is user logged in?
    isLoading,         // Boolean: auth operation in progress?
    login,             // Function: sign in
    signup,            // Function: sign up
    logout,            // Function: sign out
    resetPassword,     // Function: request password reset
    updatePassword,    // Function: update password
  } = useAuth();

  // Your component logic
}
```

### Sign Up

```javascript
const { user, error } = await signup('user@example.com', 'password123');

if (error) {
  console.error('Signup failed:', error.message);
} else {
  console.log('Signup successful!', user);
}
```

### Login

```javascript
const { user, error } = await login('user@example.com', 'password123');

if (error) {
  console.error('Login failed:', error.message);
} else {
  console.log('Login successful!', user);
}
```

### Logout

```javascript
const { error } = await logout();

if (error) {
  console.error('Logout failed:', error.message);
} else {
  console.log('Logout successful!');
}
```

### Request Password Reset

```javascript
const { error } = await resetPassword('user@example.com');

if (error) {
  console.error('Reset request failed:', error.message);
} else {
  console.log('Password reset email sent!');
}
```

### Update Password

```javascript
const { error } = await updatePassword('newPassword123');

if (error) {
  console.error('Password update failed:', error.message);
} else {
  console.log('Password updated successfully!');
}
```

---

## Using UserContext

### Access User Profile

```javascript
import { useUser } from '../contexts/UserContext';

function ProfileComponent() {
  const {
    profile,           // User profile object
    preferences,       // User preferences
    userId,            // Current user ID
    isLoading,         // Boolean: loading profile?
    error,             // Error object if any
    updateProfile,     // Function: update profile
    updatePreferences, // Function: update preferences
  } = useUser();

  return (
    <div>
      <p>Name: {profile?.full_name || 'Not set'}</p>
      <p>Email: {profile?.email}</p>
    </div>
  );
}
```

### Update Profile

```javascript
const { data, error } = await updateProfile({
  full_name: 'John Doe',
  avatar_url: 'https://example.com/avatar.jpg',
});

if (error) {
  console.error('Profile update failed:', error.message);
} else {
  console.log('Profile updated!', data);
}
```

### Update Preferences

```javascript
const { data, error } = await updatePreferences({
  theme: 'dark',
  notifications_enabled: true,
});
```

---

## Route Protection

### Protect a Route

```javascript
import ProtectedRoute from '../components/ProtectedRoute';

// Redirects to /login if not authenticated
<Route path="/dashboard" element={
  <ProtectedRoute>
    <Dashboard />
  </ProtectedRoute>
} />
```

### Public Route (Login/Signup Only)

```javascript
import PublicRoute from '../components/PublicRoute';

// Redirects to / if already authenticated
<Route path="/login" element={
  <PublicRoute>
    <LoginPage />
  </PublicRoute>
} />
```

---

## Auth State Checking

### Conditional Rendering Based on Auth

```javascript
function MyComponent() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in</div>;
  }

  return <div>Welcome, {user.email}!</div>;
}
```

### Get Current User Info

```javascript
const { user } = useAuth();

// User properties (when authenticated):
user.id              // Unique user ID (UUID)
user.email           // User's email
user.created_at      // Account creation date
user.email_confirmed_at  // Email confirmation date
user.user_metadata   // Custom user metadata
user.app_metadata    // App-specific metadata
```

---

## Error Handling

### Common Errors

```javascript
const { user, error } = await login(email, password);

if (error) {
  switch (error.message) {
    case 'Invalid login credentials':
      // Wrong email or password
      break;
    case 'Email not confirmed':
      // User hasn't confirmed their email
      break;
    case 'User already registered':
      // Email already exists
      break;
    default:
      // Other errors
      console.error(error.message);
  }
}
```

### Handle Auth Errors in UI

```javascript
function LoginForm() {
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const { error: loginError } = await login(email, password);

    if (loginError) {
      setError(loginError.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="error">{error}</div>}
      {/* form fields */}
    </form>
  );
}
```

---

## Routes

| Route | Purpose | Protection |
|-------|---------|------------|
| `/login` | User login | Public only |
| `/signup` | User registration | Public only |
| `/forgot-password` | Request password reset | Public only |
| `/reset-password` | Set new password | Open (token-based) |
| `/` | Home/System page | Protected |
| `/staging` | Goal page | Protected |
| `/tactics` | Plan page | Protected |

---

## Development Tips

### Disable Email Confirmation (Dev Only)

In Supabase Dashboard:
1. Go to Authentication > Settings
2. Under "Email Auth"
3. Toggle OFF "Confirm email"

**Note**: Re-enable for production!

### Manually Confirm Users

1. Go to Authentication > Users in Supabase Dashboard
2. Find the user
3. Click the three dots menu
4. Select "Confirm email"

### Check Auth State in Console

```javascript
// Add to any component
import { supabase } from '../lib/supabase';

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    console.log('Current session:', session);
  });
}, []);
```

### Monitor Auth Changes

```javascript
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      console.log('Auth event:', event, session);
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

---

## Testing Checklist

```
[ ] Sign up new user
[ ] Confirm email (or disable confirmation in dev)
[ ] Log in
[ ] Access protected route
[ ] Log out
[ ] Try to access protected route (should redirect to login)
[ ] Try to access login while authenticated (should redirect to home)
[ ] Request password reset
[ ] Check email for reset link
[ ] Click reset link
[ ] Set new password
[ ] Log in with new password
[ ] Check profile created in database
```

---

## Useful Supabase CLI Commands

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Pull latest database schema
supabase db pull

# Push migrations to database
supabase db push

# Reset database (WARNING: deletes all data)
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > src/types/supabase.ts
```

---

## Database Queries

### Check Profiles Table

```sql
-- View all profiles
SELECT * FROM profiles;

-- View specific user profile
SELECT * FROM profiles WHERE id = 'user-uuid-here';

-- Count total users
SELECT COUNT(*) FROM profiles;
```

### Check Auth Users

```sql
-- View all auth users
SELECT * FROM auth.users;

-- Check if email is confirmed
SELECT email, email_confirmed_at
FROM auth.users
WHERE email = 'user@example.com';
```

---

## Additional Resources

- **Full Setup Guide**: [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md)
- **Implementation Summary**: [AUTH_IMPLEMENTATION_SUMMARY.md](AUTH_IMPLEMENTATION_SUMMARY.md)
- **Supabase Docs**: https://supabase.com/docs/guides/auth
- **Supabase Dashboard**: https://supabase.com/dashboard
