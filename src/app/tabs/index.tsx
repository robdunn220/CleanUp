import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import type { CleanupEvent } from '../../types';

const MAX_RADIUS_KM = 50 * 1.60934; // 50 miles cap for initial fetch

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
  const mi = km * 0.621371;
  return mi < 0.1 ? `${Math.round(mi * 5280)} ft away` : `${mi.toFixed(1)} mi away`;
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
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date');
  const [radiusMi, setRadiusMi] = useState(50);

  function adjustRadius(delta: number) {
    setRadiusMi((prev) => Math.min(50, Math.max(1, prev + delta)));
  }

  function handleRadiusInput(text: string) {
    const n = parseInt(text, 10);
    if (!isNaN(n)) setRadiusMi(Math.min(50, Math.max(1, n)));
  }

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLocationError(true);
    }, 5000);

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        clearTimeout(timeout);
        setLocationError(true);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          clearTimeout(timeout);
          setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
        }
      } catch {
        if (!cancelled) {
          clearTimeout(timeout);
          setLocationError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles!created_by(id, username), event_attendees(user_id)')
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
      ? enriched.filter((e) => e.distance != null && e.distance <= MAX_RADIUS_KM)
      : enriched;

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

  const sortedEvents = useMemo(() => {
    if (sortBy === 'distance') {
      const radiusKm = radiusMi * 1.60934;
      const filtered = events.filter((e) => e.distance != null && e.distance <= radiusKm);
      return filtered.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    return [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, sortBy, radiusMi]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5CB85C" />
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

      <View style={styles.sortRow}>
        {(['date', 'distance'] as const).map((opt) => {
          const disabled = opt === 'distance' && !location;
          const iconColor = sortBy === opt && !disabled ? '#5CB85C' : '#8E8E93';
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.sortBtn, sortBy === opt && styles.sortBtnActive, disabled && styles.sortBtnDisabled]}
              onPress={() => !disabled && setSortBy(opt)}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <View style={styles.sortBtnInner}>
                <Ionicons name={opt === 'date' ? 'calendar' : 'location'} size={14} color={iconColor} />
                <Text style={[styles.sortBtnText, sortBy === opt && styles.sortBtnTextActive, disabled && styles.sortBtnTextDisabled]}>
                  {opt === 'date' ? 'By Date' : 'By Distance'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {sortBy === 'distance' && location && (
        <View style={styles.radiusRow}>
          <Text style={styles.radiusLabel}>Within</Text>
          <TouchableOpacity style={styles.radiusStepBtn} onPress={() => adjustRadius(-5)}>
            <Text style={styles.radiusStepText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.radiusInput}
            value={String(radiusMi)}
            onChangeText={handleRadiusInput}
            keyboardType="number-pad"
            maxLength={2}
            selectTextOnFocus
          />
          <Text style={styles.radiusMiText}>mi</Text>
          <TouchableOpacity style={styles.radiusStepBtn} onPress={() => adjustRadius(5)}>
            <Text style={styles.radiusStepText}>+</Text>
          </TouchableOpacity>
          <Text style={styles.radiusMax}>(max 50)</Text>
        </View>
      )}

      {locationError && (
        <View style={styles.banner}>
          <Ionicons name="location" size={14} color="#5CB85C" />
          <Text style={styles.bannerText}>Location unavailable — showing all upcoming events</Text>
        </View>
      )}

      <FlatList
        data={sortedEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5CB85C" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/events/${item.id}` as any)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.is_attending && <View style={styles.badge}><Text style={styles.badgeText}>Joined</Text></View>}
            </View>
            <View style={styles.cardMetaRow}>
              <Ionicons name="calendar" size={14} color="#5CB85C" />
              <Text style={styles.cardMeta}>{formatDate(item.date)}</Text>
            </View>
            <View style={styles.cardMetaRow}>
              <Ionicons name="location" size={14} color="#5CB85C" />
              <Text style={styles.cardMeta}>{item.location_name}</Text>
            </View>
            {item.distance != null && (
              <Text style={styles.cardDistance}>{distanceLabel(item.distance)}</Text>
            )}
            {item.event_attendees && (
              <View style={styles.cardAttendeesRow}>
                <Ionicons name="people" size={14} color="#5CB85C" />
                <Text style={styles.cardAttendees}>
                  {item.event_attendees.length} attendee{item.event_attendees.length !== 1 ? 's' : ''}
                </Text>
              </View>
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
  createBtn: { backgroundColor: '#5CB85C', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sortRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  sortBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA',
  },
  sortBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#5CB85C' },
  sortBtnDisabled: { opacity: 0.4 },
  sortBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  sortBtnTextActive: { color: '#5CB85C' },
  sortBtnTextDisabled: { color: '#8E8E93' },
  radiusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  radiusLabel: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginRight: 4 },
  radiusStepBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA',
  },
  radiusStepText: { fontSize: 20, color: '#5CB85C', lineHeight: 24, fontWeight: '600' },
  radiusInput: {
    width: 44, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1C1C1E',
    borderWidth: 1, borderColor: '#5CB85C', borderRadius: 10,
    paddingVertical: 5, backgroundColor: '#fff',
  },
  radiusMiText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  radiusMax: { fontSize: 12, color: '#8E8E93', marginLeft: 4 },
  banner: {
    backgroundColor: '#FFF3CD', padding: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
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
  badge: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#5CB85C', fontSize: 12, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardMeta: { fontSize: 14, color: '#8E8E93' },
  cardDistance: { fontSize: 13, color: '#34C759', marginTop: 4, fontWeight: '600' },
  cardAttendeesRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  cardAttendees: { fontSize: 13, color: '#8E8E93' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
});
