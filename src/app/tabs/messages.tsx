import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import type { CleanupEvent } from '../../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMyEvents = useCallback(async () => {
    if (!user) return;

    // Events user created OR joined
    const [created, joined] = await Promise.all([
      supabase.from('events').select('*').eq('created_by', user.id).order('date', { ascending: false }),
      supabase
        .from('event_attendees')
        .select('event_id, events(*)')
        .eq('user_id', user.id),
    ]);

    const createdEvents: CleanupEvent[] = created.data ?? [];
    const joinedEvents: CleanupEvent[] = (joined.data ?? [])
      .map((row: any) => row.events)
      .filter(Boolean);

    // Merge, deduplicate by id
    const all = [...createdEvents, ...joinedEvents];
    const unique = Array.from(new Map(all.map((e) => [e.id, e])).values());
    unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setEvents(unique);
  }, [user]);

  useEffect(() => {
    fetchMyEvents().finally(() => setLoading(false));
  }, [fetchMyEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMyEvents();
    setRefreshing(false);
  }, [fetchMyEvents]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5CB85C" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.header}>Messages</Text>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5CB85C" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/chat/${item.id}` as any)}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{item.title.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardDate}>📅 {formatDate(item.date)}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No chats yet.</Text>
            <Text style={styles.emptySubtext}>
              Join or create a cleanup event to start chatting with participants.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    fontSize: 26, fontWeight: '800', color: '#1C1C1E',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarPlaceholder: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#5CB85C', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 3 },
  cardDate: { fontSize: 13, color: '#8E8E93' },
  chevron: { fontSize: 22, color: '#C7C7CC', marginLeft: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 6, textAlign: 'center' },
});
