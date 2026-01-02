# Type Generation Guide

## Current Setup

TypeScript types for Supabase are now configured in [src/types/supabase.ts](src/types/supabase.ts) and the Supabase client is fully typed.

## Type Safety Benefits

With typed Supabase client, you get:

```typescript
// ✅ Autocomplete for table names
const { data } = await supabase.from('profiles')... // 'profiles' is autocompleted

// ✅ Autocomplete for column names
const { data } = await supabase
  .from('profiles')
  .select('id, email, full_name') // column names are autocompleted

// ✅ Type checking for inserts/updates
const { data } = await supabase
  .from('profiles')
  .insert({
    id: 'uuid',
    email: 'test@example.com',
    full_name: 'John Doe',
    // TypeScript will error if you add invalid fields
  })

// ✅ Typed query results
const { data } = await supabase.from('profiles').select('*')
// data is typed as Profile[] | null
```

## Updating Types

When you add new tables or modify your database schema, regenerate the types:

### Option 1: Supabase CLI (Recommended)

```bash
# Install Supabase CLI globally
npm install -g supabase

# Login to Supabase (one time)
supabase login

# Generate types
supabase gen types typescript --project-id hoxwpjxfcrborwufydxl > src/types/supabase.ts
```

### Option 2: Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/hoxwpjxfcrborwufydxl/api
2. Scroll to "Generating Types" section
3. Click the "TypeScript" tab
4. Copy the generated code
5. Replace the contents of `src/types/supabase.ts`

### Option 3: Add to package.json scripts

Add this to your `package.json`:

```json
{
  "scripts": {
    "types:generate": "supabase gen types typescript --project-id hoxwpjxfcrborwufydxl > src/types/supabase.ts"
  }
}
```

Then run:
```bash
npm run types:generate
```

## Using Types in Your Code

### Import Database Types

```typescript
import type { Database, Profile, ProfileInsert, ProfileUpdate } from '../types/supabase';
```

### Use in Components

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/supabase';

function ProfileComponent() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .single();

      setProfile(data); // TypeScript knows this is Profile | null
    }

    fetchProfile();
  }, []);

  return (
    <div>
      <p>{profile?.full_name}</p> {/* Autocomplete works! */}
    </div>
  );
}
```

### Type-Safe Inserts

```typescript
import type { ProfileInsert } from '../types/supabase';

const newProfile: ProfileInsert = {
  id: userId,
  email: 'user@example.com',
  full_name: 'John Doe',
  // TypeScript will error if you forget required fields or add wrong types
};

const { data, error } = await supabase
  .from('profiles')
  .insert(newProfile);
```

### Type-Safe Updates

```typescript
import type { ProfileUpdate } from '../types/supabase';

const updates: ProfileUpdate = {
  full_name: 'Jane Doe',
  avatar_url: 'https://example.com/avatar.jpg',
};

const { data, error } = await supabase
  .from('profiles')
  .update(updates)
  .eq('id', userId);
```

## Helper Types

The following helper types are exported from `src/types/supabase.ts`:

- `Profile` - Row type for profiles table
- `ProfileInsert` - Insert type for profiles table
- `ProfileUpdate` - Update type for profiles table

Add more helper types as you create new tables:

```typescript
// In src/types/supabase.ts
export type YourTable = Database['public']['Tables']['your_table']['Row']
export type YourTableInsert = Database['public']['Tables']['your_table']['Insert']
export type YourTableUpdate = Database['public']['Tables']['your_table']['Update']
```

## When to Regenerate Types

Regenerate types whenever you:

- Create new tables
- Add/remove columns
- Change column types
- Add/modify enums
- Create new functions or views

## Troubleshooting

### Issue: Types don't match database

**Solution**: Regenerate types using one of the methods above

### Issue: Supabase CLI not found

**Solution**:
```bash
npm install -g supabase
# or
npx supabase gen types typescript --project-id hoxwpjxfcrborwufydxl
```

### Issue: Import errors after renaming supabase.js to supabase.ts

**Solution**: Your IDE should auto-update imports, but if not, manually update:
```typescript
// Old
import { supabase } from '../lib/supabase.js';

// New
import { supabase } from '../lib/supabase';
```

## Example: Adding a New Table

1. Create the table in Supabase (via SQL Editor or Dashboard)

```sql
create table posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  content text,
  created_at timestamptz default now()
);
```

2. Regenerate types:

```bash
supabase gen types typescript --project-id hoxwpjxfcrborwufydxl > src/types/supabase.ts
```

3. Add helper types to `src/types/supabase.ts`:

```typescript
export type Post = Database['public']['Tables']['posts']['Row']
export type PostInsert = Database['public']['Tables']['posts']['Insert']
export type PostUpdate = Database['public']['Tables']['posts']['Update']
```

4. Use in your code:

```typescript
import type { Post } from '../types/supabase';

const { data: posts } = await supabase
  .from('posts')
  .select('*');
// posts is typed as Post[] | null
```

## Best Practices

1. **Always regenerate types after schema changes** - Keep types in sync with database
2. **Use helper types** - Create convenient exports for commonly used types
3. **Type your state** - Use generated types for useState, useEffect, etc.
4. **Don't manually edit generated types** - They should be auto-generated only
5. **Commit types to git** - Keep types in version control

## Resources

- [Supabase TypeScript Guide](https://supabase.com/docs/guides/api/generating-types)
- [Supabase CLI Docs](https://supabase.com/docs/guides/cli)
