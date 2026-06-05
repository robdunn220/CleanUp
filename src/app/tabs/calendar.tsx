import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import type { CleanupEvent } from '../../types';

const RADIUS_KM = 80;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toDateStr(iso: string) {
  return iso.slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date().toISOString()));
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
    })();
  }, []);

  const fetchEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (!data) return;

    const nearby = location
      ? data.filter((e) => haversineKm(location.lat, location.lon, e.latitude, e.longitude) <= RADIUS_KM)
      : data;

    setEvents(nearby as CleanupEvent[]);
  }, [location]);

  useEffect(() => {
    fetchEvents().finally(() => setLoading(false));
  }, [fetchEvents]);

  const markedDates: Record<string, any> = {};
  events.forEach((e) => {
    const d = toDateStr(e.date);
    markedDates[d] = {
      marked: true,
      dotColor: '#208AEF',
      ...(d === selectedDate ? { selected: true, selectedColor: '#208AEF' } : {}),
    };
  });
  if (!markedDates[selectedDate]) {
    markedDates[selectedDate] = { selected: true, selectedColor: '#208AEF' };
  }

  const dayEvents = events.filter((e) => toDateStr(e.date) === selectedDate);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.header}>Calendar</Text>

      <Calendar
        onDayPress={(day: { dateString: string }) => setSelectedDate(day.dateString)}
        markedDates={markedDates}
        theme={{
          todayTextColor: '#208AEF',
          arrowColor: '#208AEF',
          selectedDayBackgroundColor: '#208AEF',
          dotColor: '#208AEF',
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
            <Text style={styles.emptyText}>No cleanups scheduled. Tap + Create on the Events tab to add one!</Text>
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
  time: { fontSize: 13, fontWeight: '700', color: '#208AEF' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  cardLocation: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  empty: { padding: 24 },
  emptyText: { color: '#8E8E93', fontSize: 14, textAlign: 'center' },
});
