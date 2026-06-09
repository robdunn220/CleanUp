import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import type { CleanupEvent } from '../../types';

function toDateStr(iso: string) {
  return iso.slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date().toISOString()));

  const fetchMyEvents = useCallback(async () => {
    if (!user) return;

    const now = new Date().toISOString();

    // Get event IDs the user is attending
    const { data: attendeeRows } = await supabase
      .from('event_attendees')
      .select('event_id')
      .eq('user_id', user.id);

    const attendingIds = (attendeeRows ?? []).map((r: any) => r.event_id);

    const [createdRes, joinedRes] = await Promise.all([
      supabase.from('events').select('*').eq('created_by', user.id).gte('date', now).order('date', { ascending: true }),
      attendingIds.length > 0
        ? supabase.from('events').select('*').in('id', attendingIds).gte('date', now).order('date', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const all = [...(createdRes.data ?? []), ...((joinedRes as any).data ?? [])];
    const seen = new Set<string>();
    const deduped = all.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    deduped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setEvents(deduped as CleanupEvent[]);
  }, [user]);

  useEffect(() => {
    fetchMyEvents().finally(() => setLoading(false));
  }, [fetchMyEvents]);

  const markedDates: Record<string, any> = {};
  events.forEach((e) => {
    const d = toDateStr(e.date);
    markedDates[d] = {
      marked: true,
      dotColor: '#5CB85C',
      ...(d === selectedDate ? { selected: true, selectedColor: '#5CB85C' } : {}),
    };
  });
  if (!markedDates[selectedDate]) {
    markedDates[selectedDate] = { selected: true, selectedColor: '#5CB85C' };
  }

  const dayEvents = events.filter((e) => toDateStr(e.date) === selectedDate);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5CB85C" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.header}>My Calendar</Text>

      <Calendar
        onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
        markedDates={markedDates}
        theme={{
          todayTextColor: '#5CB85C',
          arrowColor: '#5CB85C',
          selectedDayBackgroundColor: '#5CB85C',
          dotColor: '#5CB85C',
          textDayFontWeight: '500',
          textMonthFontWeight: '700',
          textDayHeaderFontWeight: '600',
        }}
        style={styles.calendar}
      />

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {dayEvents.length > 0
            ? `${dayEvents.length} event${dayEvents.length > 1 ? 's' : ''} on this day`
            : 'No events on this day'}
        </Text>
      </View>

      <FlatList
        data={dayEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/events/${item.id}` as any)}>
            <View style={styles.timeCol}>
              <Text style={styles.time}>{formatTime(item.date)}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardLocation}>📍 {item.location_name}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No cleanups on this day. Join or create events to see them here.
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
  calendar: { borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  listHeader: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  timeCol: { width: 60, marginRight: 12 },
  time: { fontSize: 13, fontWeight: '700', color: '#5CB85C' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  cardLocation: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  empty: { padding: 24 },
  emptyText: { color: '#8E8E93', fontSize: 14, textAlign: 'center' },
});
