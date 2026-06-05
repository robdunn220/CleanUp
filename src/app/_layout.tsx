import { useEffect } from 'react';
import { ActivityIndicator, View, Linking } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../contexts/auth';
import { supabase } from '../lib/supabase';

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Handle email confirmation deep links (cleanup://...)
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    };

    Linking.getInitialURL().then((url) => { if (url) handleUrl({ url }); });
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading) return;
    const segs = segments as string[];
    const inLogin = segs[0] === 'login';
    const inTabs = segs[0] === 'tabs';
    if (!session && !inLogin) {
      router.replace('/login' as any);
    } else if (session && (inLogin || segs[0] === undefined)) {
      router.replace('/tabs' as any);
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#208AEF' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
