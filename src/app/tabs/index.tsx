import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
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

function distanceLabel(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError(true);
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    })();
  }, []);

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles(id, username), event_attendees(user_id)')
      .gte('date', new Date().toISOString())
      .order('date', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    const enriched = (data as any[]).map((e) => ({
      ...e,
      distance: location ? haversineKm(location.lat, location.lon, e.latitude, e.longitude) : null,
      is_attending: e.event_attendees?.some((a: any) => a.user_id === user?.id),
    }));

    const nearby = location
      ? enriched.filter((e) => e.distance != null && e.distance <= RADIUS_KM)
      : enriched;

    nearby.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    setEvents(nearby);
  }, [location, user?.id]);

  useEffect(() => {
    if (location !== null || locationError) {
      fetchEvents().finally(() => setLoading(false));
    }
  }, [location, locationError, fetchEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEvents();
    setRefreshing(false);
  }, [fetchEvents]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.loadingText}>Finding events near you…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Nearby Events</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/events/create' as any)}>
          <Text style={styles.createBtnText}>+ Create</Text>
        </TouchableOpacity>
      </View>

      {locationError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>📍 Location unavailable — showing all upcoming events</Text>
        </View>
      )}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#208AEF" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/events/${item.id}` as any)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.is_attending && <View style={styles.badge}><Text style={styles.badgeText}>Joined</Text></View>}
            </View>
            <Text style={styles.cardMeta}>📅 {formatDate(item.date)}</Text>
            <Text style={styles.cardMeta}>📍 {item.location_name}</Text>
            {item.distance != null && (
              <Text style={styles.cardDistance}>{distanceLabel(item.distance)}</Text>
            )}
            {item.event_attendees && (
              <Text style={styles.cardAttendees}>
                👥 {item.event_attendees.length} attendee{item.event_attendees.length !== 1 ? 's' : ''}
              </Text>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🌱</Text>
            <Text style={styles.emptyText}>No upcoming events nearby.</Text>
            <Text style={styles.emptySubtext}>Be the first to organize one!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F2F7' },
  loadingText: { marginTop: 12, color: '#8E8E93', fontSize: 15 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  header: { fontSize: 26, fontWeight: '800', color: '#1C1C1E' },
  createBtn: { backgroundColor: '#208AEF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  banner: { backgroundColor: '#FFF3CD', padding: 10, paddingHorizontal: 16 },
  bannerText: { color: '#856404', fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  badge: { backgroundColor: '#E6F4FE', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#208AEF', fontSize: 12, fontWeight: '700' },
  cardMeta: { fontSize: 14, color: '#8E8E93', marginTop: 3 },
  cardDistance: { fontSize: 13, color: '#34C759', marginTop: 4, fontWeight: '600' },
  cardAttendees: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
});
