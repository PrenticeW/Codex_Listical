# Supabase Auth Setup Guide

This guide will help you set up Supabase authentication for the Codex Listical application.

## Overview

The application now has full Supabase Auth integration with the following features:

- User signup with email confirmation
- User login
- Password reset flow
- Protected routes
- User profile management
- Automatic profile creation on signup
- Logout functionality

## Prerequisites

1. A Supabase project (create one at https://supabase.com if you don't have one)
2. Node.js and npm installed
3. The project's `.env.local` file configured

## Step 1: Configure Environment Variables

Make sure your `.env.local` file has the correct Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_APP_ENV=development
VITE_APP_URL=http://localhost:5173
VITE_ENABLE_REGISTRATION=true
VITE_ENABLE_SOCIAL_AUTH=false
VITE_USE_MOCK_AUTH=false
VITE_STORAGE_MODE=localStorage
```

### How to get your Supabase credentials:

1. Go to your Supabase project dashboard
2. Navigate to Settings > API
3. Copy the "Project URL" to `VITE_SUPABASE_URL`
4. Copy the "anon public" key to `VITE_SUPABASE_ANON_KEY`

## Step 2: Run Database Migration

The application requires a `profiles` table to store user information. Run the migration in your Supabase project:

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy the contents of `supabase/migrations/001_create_profiles_table.sql`
5. Paste into the SQL editor
6. Click "Run" to execute the migration

### Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push
```

### What the migration does:

- Creates a `profiles` table linked to `auth.users`
- Sets up Row Level Security (RLS) policies
- Creates triggers for automatic profile creation on signup
- Creates indexes for better performance
- Sets proper permissions

## Step 3: Configure Email Templates (Optional)

To customize the emails Supabase sends for auth flows:

1. Go to Authentication > Email Templates in your Supabase dashboard
2. Customize the following templates:
   - **Confirm signup**: Sent when users sign up
   - **Reset password**: Sent when users request password reset
   - **Magic Link**: Sent for passwordless login (if you enable it)

### Important: Update Email Redirect URLs

Make sure your email templates use the correct redirect URLs:

- **Confirm signup**: `{{ .ConfirmationURL }}` should redirect to your app
- **Reset password**: Should redirect to `{{ .SiteURL }}/reset-password`

You can set the Site URL in Authentication > URL Configuration:
- Site URL: `http://localhost:5173` (development) or your production URL
- Redirect URLs: Add `http://localhost:5173/**` and your production URLs

## Step 4: Configure Authentication Settings

### Email Auth Settings

1. Go to Authentication > Settings
2. Under "Email Auth", make sure:
   - "Enable Email Signup" is ON
   - "Confirm email" is ON (recommended for production)
   - "Secure email change" is ON (recommended)

### Email Rate Limits

Consider adjusting rate limits to prevent abuse:
- Go to Authentication > Rate Limits
- Set appropriate limits for your use case

## Step 5: Test the Authentication Flow

### 1. Start the development server

```bash
npm run dev
```

### 2. Test Sign Up

1. Navigate to `http://localhost:5173/signup`
2. Enter an email and password
3. Check your email for the confirmation link
4. Click the link to confirm your email

**Note**: In development, if email confirmation is enabled, you can also check the Supabase dashboard under Authentication > Users to manually confirm users.

### 3. Test Login

1. Navigate to `http://localhost:5173/login`
2. Enter your credentials
3. You should be redirected to the home page

### 4. Test Forgot Password

1. Navigate to `http://localhost:5173/forgot-password`
2. Enter your email
3. Check your email for the reset link
4. Click the link (should go to `/reset-password`)
5. Enter a new password

### 5. Test Logout

1. While logged in, click the logout icon in the navigation bar
2. You should be redirected to the login page

### 6. Test Protected Routes

1. While logged out, try to access `http://localhost:5173/`
2. You should be automatically redirected to `/login`

## Implementation Details

### Auth Context

The `AuthContext` ([src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx)) manages authentication state:

- `user`: Current user object from Supabase
- `session`: Current session object
- `isAuthenticated`: Boolean flag
- `isLoading`: Loading state
- `login(email, password)`: Sign in method
- `signup(email, password)`: Sign up method
- `logout()`: Sign out method
- `resetPassword(email)`: Request password reset
- `updatePassword(newPassword)`: Update password

### User Context

The `UserContext` ([src/contexts/UserContext.jsx](src/contexts/UserContext.jsx)) manages user profile data:

- `profile`: User profile from database
- `preferences`: User preferences
- `updateProfile(updates)`: Update profile method
- `updatePreferences(updates)`: Update preferences method

### Route Protection

- **ProtectedRoute** ([src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx)): Wraps routes that require authentication
- **PublicRoute** ([src/components/PublicRoute.jsx](src/components/PublicRoute.jsx)): Wraps routes that should only be accessible when logged out (login, signup)

### Pages

- [LoginPage.jsx](src/pages/LoginPage.jsx): User login form
- [SignupPage.jsx](src/pages/SignupPage.jsx): User registration form
- [ForgotPasswordPage.jsx](src/pages/ForgotPasswordPage.jsx): Request password reset
- [ResetPasswordPage.jsx](src/pages/ResetPasswordPage.jsx): Set new password

## Troubleshooting

### Issue: Email confirmation not working

**Solution**:
- Check that your Supabase project has email confirmation enabled
- In development, you can disable email confirmation or manually confirm users in the Supabase dashboard
- Check spam folder for confirmation emails

### Issue: Redirect URLs not working

**Solution**:
- Make sure your redirect URLs are added in Authentication > URL Configuration
- Use `http://localhost:5173/**` for development
- Add your production domain for production

### Issue: "Invalid login credentials" error

**Solution**:
- Make sure the user's email is confirmed
- Check that the password meets requirements (minimum 6 characters)
- Verify the user exists in Authentication > Users

### Issue: Profile not created automatically

**Solution**:
- Check that the migration ran successfully
- Verify the trigger `on_auth_user_created` exists in your database
- Check the Supabase logs for errors

### Issue: RLS policy blocking access

**Solution**:
- Make sure the user is authenticated
- Verify RLS policies are correctly set up
- Check the SQL Editor > Policies tab for your profiles table

## Security Best Practices

1. **Never commit `.env.local`** - This file contains sensitive credentials
2. **Enable email confirmation** in production
3. **Set appropriate rate limits** to prevent abuse
4. **Use HTTPS** in production
5. **Keep Supabase dependencies updated**
6. **Monitor auth logs** in Supabase dashboard

## Advanced Features (Optional)

### Social Authentication

To add OAuth providers (Google, GitHub, etc.):

1. Go to Authentication > Providers
2. Enable the providers you want
3. Configure OAuth credentials for each provider
4. Update `AuthContext` to include social login methods

### Multi-Factor Authentication (MFA)

Supabase supports MFA. To enable:

1. Go to Authentication > Settings
2. Enable MFA
3. Update your client code to handle MFA flow

### Custom Claims and Roles

You can add custom claims to JWT tokens for role-based access control:

1. Create a database function to add claims
2. Use hooks to populate claims on login
3. Access claims via `user.app_metadata` or `user.user_metadata`

## Next Steps

Now that authentication is set up, you can:

1. Customize the UI/styling of auth pages
2. Add user profile editing functionality
3. Implement role-based access control
4. Add social authentication
5. Set up email templates with your branding
6. Configure production environment variables

## Support

For issues with:
- **Supabase**: Check [Supabase Documentation](https://supabase.com/docs) or [Supabase Discord](https://discord.supabase.com)
- **This implementation**: Check the code comments or create an issue in the repository

## File Reference

### Core Auth Files
- [src/lib/supabase.js](src/lib/supabase.js) - Supabase client initialization
- [src/contexts/AuthContext.jsx](src/contexts/AuthContext.jsx) - Authentication state management
- [src/contexts/UserContext.jsx](src/contexts/UserContext.jsx) - User profile management

### Route Guards
- [src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx) - Protected route wrapper
- [src/components/PublicRoute.jsx](src/components/PublicRoute.jsx) - Public route wrapper

### Pages
- [src/pages/LoginPage.jsx](src/pages/LoginPage.jsx) - Login page
- [src/pages/SignupPage.jsx](src/pages/SignupPage.jsx) - Signup page
- [src/pages/ForgotPasswordPage.jsx](src/pages/ForgotPasswordPage.jsx) - Forgot password page
- [src/pages/ResetPasswordPage.jsx](src/pages/ResetPasswordPage.jsx) - Reset password page

### Routes
- [src/routes/index.jsx](src/routes/index.jsx) - Route configuration

### Database
- [supabase/migrations/001_create_profiles_table.sql](supabase/migrations/001_create_profiles_table.sql) - Profiles table migration
