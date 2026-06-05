import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Web uses localStorage — SecureStore is native-only
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
