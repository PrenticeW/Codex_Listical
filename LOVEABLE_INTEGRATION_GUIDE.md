# Loveable Integration Guide

This document outlines the work completed to prepare Codex Listical for Loveable integration and what remains to be done.

## ✅ Phase 1: COMPLETED - Critical Infrastructure

### 1. Centralized Storage Service ✅
**Location:** `src/lib/storageService.js`

**What was done:**
- Created abstraction layer over localStorage
- Added comprehensive error handling (quota exceeded, parse errors)
- Implemented user-scoped storage keys (`user:{userId}:{key}`)
- Added `global` parameter for system-wide data
- All direct localStorage calls have been removed from codebase

**Key Functions:**
```javascript
// User-scoped storage (default)
storage.setJSON('planner-data', data)
// → stores as: "user:123:planner-data"

// Global storage (for system settings)
storage.setJSON('app-version', '1.0', true)
// → stores as: "app-version"

// Set current user
storage.setCurrentUserId(user.id)
```

**Benefits for Loveable:**
- Easy migration from localStorage to Supabase
- User data isolation built-in
- Quota management and error handling
- Single point to add authentication checks

### 2. Authentication Context ✅
**Location:** `src/contexts/AuthContext.jsx`

**What was done:**
- Created skeleton AuthContext with standard auth methods
- Mock implementation for local development
- Clear TODO comments for Supabase integration points

**Provides:**
```javascript
const {
  user,              // Current user object
  session,           // Current session
  isAuthenticated,   // Boolean auth state
  isLoading,         // Loading state
  login,             // Login function
  signup,            // Signup function
  logout,            // Logout function
  resetPassword      // Password reset
} = useAuth()
```

**Integration Points for Loveable:**
- Replace mock auth with `supabase.auth.signInWithPassword()`
- Replace session check with `supabase.auth.getSession()`
- Add OAuth providers if needed
- Implement token refresh logic

### 3. User Context ✅
**Location:** `src/contexts/UserContext.jsx`

**What was done:**
- Created UserContext for user-specific data
- Profile and preferences management
- User ID accessor for scoping
- Migration status tracking

**Provides:**
```javascript
const {
  profile,            // User profile data
  preferences,        // User preferences
  userId,             // Current user ID
  updateProfile,      // Update profile function
  updatePreferences,  // Update preferences function
  needsUserMigration  // Migration status check
} = useUser()
```

**Integration Points for Loveable:**
- Replace with Supabase `profiles` table query
- Add real-time subscriptions for profile updates
- Implement preferences sync across devices

### 4. React Router Installed ✅
**Package:** `react-router-dom@6.30.2`

**Status:** Installed but not yet configured in App.jsx

**Next Steps:**
- Replace custom routing with React Router
- Create route configuration
- Add protected routes
- Add auth redirects

### 5. Environment Configuration ✅
**Files Created:**
- `.env.example` - Template with all required variables
- Updated `.gitignore` - Excludes .env files

**Environment Variables Defined:**
```bash
# Required for Loveable
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Application config
VITE_APP_ENV
VITE_APP_URL
VITE_DEBUG_MODE

# Feature flags
VITE_ENABLE_REGISTRATION
VITE_ENABLE_SOCIAL_AUTH
VITE_STORAGE_MODE

# Performance
VITE_MAX_PLANNER_ROWS
VITE_AUTOSAVE_DEBOUNCE
VITE_STORAGE_WARNING_THRESHOLD
```

---

## ✅ Phase 1.5: COMPLETED - Migration Refactor

### Migration Now User-Specific
**Location:** `src/components/Layout.jsx:14-30`

**Solution Implemented:**
- Migration check moved to Layout component (runs per-user)
- Checks `needsUserMigration()` from UserContext
- Shows loading state during migration check
- Migration logic ready for implementation when needed

**What Changed:**
1. Removed app-blocking migration from App.jsx
2. Created Layout component that wraps all protected routes
3. Migration check now happens after authentication
4. Provides UI feedback during migration check
5. Ready for background migration implementation

---

## ✅ CRITICAL TASKS - ALL COMPLETED

### 1. React Router Configuration ✅
**Status:** COMPLETE

**What was done:**
- Created [src/routes/index.jsx](src/routes/index.jsx) with full route configuration
- Created [src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx) - guards authenticated routes
- Created [src/components/PublicRoute.jsx](src/components/PublicRoute.jsx) - guards login/signup routes
- Created [src/components/Layout.jsx](src/components/Layout.jsx) - wraps all protected routes with YearProvider
- Replaced custom navigation in [src/App.jsx](src/App.jsx) with RouterProvider
- All routes properly configured with authentication guards

### 2. User-Specific Migration ✅
**Status:** COMPLETE

**What was done:**
- Removed app-blocking migration from App.jsx
- Added migration check to Layout component (user-specific)
- Migration now happens after authentication
- Ready for background implementation when needed

### 3. AuthContext Storage User ID ✅
**Status:** COMPLETE

**What was done:**
- Added `setCurrentUserId()` import to [src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx)
- Set user ID on login (line 102)
- Set user ID on signup (line 135)
- Clear user ID on logout (line 162)
- Set user ID on auth initialization (line 68)

### 4. Login/Signup Pages ✅
**Status:** COMPLETE

**Pages created:**
- [src/pages/LoginPage.jsx](src/pages/LoginPage.jsx) - Full login form with error handling
- [src/pages/SignupPage.jsx](src/pages/SignupPage.jsx) - Full signup form with password validation
- Both pages styled with Tailwind CSS
- Both pages integrated with React Router and AuthContext

---

## 🟢 RECOMMENDED - Should Do Before Production

### 1. Error Boundaries
**Add error boundaries around:**
- Main App component
- Each route
- YearProvider
- AuthProvider
- UserProvider

### 2. Loading States
**Add loading UI for:**
- Auth initialization
- User data loading
- Migration process
- Route transitions
- Data saves

### 3. Remove Console Logging
**Current:** 37 console.log statements found

**Options:**
1. Replace with proper logging service
2. Conditionally compile out for production
3. Use debug library with environment gates

### 4. Add Basic Tests
**Critical paths to test:**
- Authentication flow
- Storage scoping
- Year switching
- Data persistence

---

## 📝 Loveable Integration Checklist

When handing off to Loveable, ensure:

### Environment Setup
- [ ] `.env.example` is complete
- [ ] `.env` is in `.gitignore`
- [ ] Document all environment variables

### Authentication
- [ ] AuthContext created
- [ ] UserContext created
- [ ] Storage service has user scoping
- [ ] Mock auth works in development

### Routing
- [ ] React Router configured
- [ ] Protected routes implemented
- [ ] Auth redirects working
- [ ] Public routes for login/signup

### Database Schema (For Loveable)
Loveable will need to create these tables:

```sql
-- User profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User metadata (migration status, preferences)
CREATE TABLE user_metadata (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  migration_completed BOOLEAN DEFAULT false,
  migration_completed_at TIMESTAMP,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Eventually: migrate planner data to database
-- For now, it can stay in localStorage until ready
```

### Integration Points

**Replace in AuthContext.jsx:**
```javascript
// Line 48-52: getSession check
const { data: { session } } = await supabase.auth.getSession()

// Line 85: signInWithPassword
const { data, error } = await supabase.auth.signInWithPassword({ email, password })

// Line 114: signUp
const { data, error } = await supabase.auth.signUp({ email, password })

// Line 143: signOut
const { error } = await supabase.auth.signOut()

// Line 156: resetPasswordForEmail
const { error } = await supabase.auth.resetPasswordForEmail(email)
```

**Replace in UserContext.jsx:**
```javascript
// Line 54: fetch profile
const { data: profile, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', authUser.id)
  .single()

// Line 106: update profile
const { data, error } = await supabase
  .from('profiles')
  .update(updates)
  .eq('id', authUser.id)
  .select()
  .single()
```

---

## 🚀 READY FOR LOVEABLE!

1. ✅ Storage service has user scoping
2. ✅ Auth context created
3. ✅ User context created
4. ✅ Environment variables documented
5. ✅ React Router configured
6. ✅ Migration refactored to be user-specific
7. ✅ Login/Signup pages created
8. ✅ Protected routes implemented

**Status:** ALL CRITICAL TASKS COMPLETE - Ready for Loveable integration!

---

## 📞 Questions for Loveable Team

1. **OAuth Providers:** Which social auth providers should be enabled?
2. **Email Verification:** Required for signup or optional?
3. **Data Migration:** Migrate existing localStorage data to Supabase or start fresh?
4. **User Roles:** Need admin/user roles or all users equal?
5. **Billing/Plans:** Any tier system or all users get same features?

---

## 🛠️ Development Workflow

### Running Locally (Before Loveable)
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values
# For local dev, you can use mock auth

# Run development server
npm run dev
```

### Running with Loveable
```bash
# Loveable will provide the Supabase credentials
# Just copy them to .env

VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# Then run normally
npm run dev
```

---

## 📚 Additional Documentation Needed

Before handing to Loveable, document:

1. **User Data Structure** - What data belongs to each user
2. **Sharing Model** - Will users share data? (probably not)
3. **Export/Import** - Do users need to export their data?
4. **Offline Support** - Required or nice-to-have?
5. **Multi-Device Sync** - How should this work?

---

## 🎯 Success Criteria

The handoff to Loveable is ready when:

1. User can sign up with email/password
2. User can log in and see only their data
3. Multiple users can use the app simultaneously without data collision
4. User data persists across sessions
5. Logout clears user-specific data
6. No console errors on auth flow
7. Protected routes redirect to login when not authenticated
8. Public routes redirect to app when authenticated

---

## 📦 Files Created/Modified in This Session

### New Files Created:
- `src/routes/index.jsx` - Route configuration with auth guards
- `src/components/ProtectedRoute.jsx` - Protected route wrapper
- `src/components/PublicRoute.jsx` - Public route wrapper
- `src/components/Layout.jsx` - Layout component with YearProvider
- `src/pages/LoginPage.jsx` - Login page
- `src/pages/SignupPage.jsx` - Signup page

### Files Modified:
- `src/App.jsx` - Completely refactored to use React Router
- `src/contexts/AuthContext.jsx` - Added storage user ID management
- `LOVEABLE_INTEGRATION_GUIDE.md` - Updated with completion status

---

*Last Updated: December 30, 2025*
*Status: ALL CRITICAL TASKS COMPLETE - READY FOR LOVEABLE*
