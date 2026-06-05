import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import type { CleanupEvent, Profile } from '../../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<CleanupEvent | null>(null);
  const [organizer, setOrganizer] = useState<Profile | null>(null);
  const [attendees, setAttendees] = useState<Profile[]>([]);
  const [isAttending, setIsAttending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function load() {
      const [eventRes, attendeesRes] = await Promise.all([
        supabase.from('events').select('*, profiles(*)').eq('id', id).single(),
        supabase
          .from('event_attendees')
          .select('user_id, profiles(id, username)')
          .eq('event_id', id),
      ]);

      if (eventRes.data) {
        setEvent(eventRes.data as any);
        setOrganizer((eventRes.data as any).profiles ?? null);
      }

      if (attendeesRes.data) {
        const profiles = attendeesRes.data.map((r: any) => r.profiles).filter(Boolean);
        setAttendees(profiles);
        setIsAttending(attendeesRes.data.some((r: any) => r.user_id === user?.id));
      }

      setLoading(false);
    }
    load();
  }, [id, user?.id]);

  const isOrganizer = event?.created_by === user?.id;

  async function toggleAttendance() {
    if (!user || !event) return;
    setJoining(true);
    if (isAttending) {
      const { error } = await supabase
        .from('event_attendees')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', user.id);
      if (error) Alert.alert('Error', error.message);
      else {
        setIsAttending(false);
        setAttendees((a) => a.filter((p) => p.id !== user.id));
      }
    } else {
      const { error } = await supabase
        .from('event_attendees')
        .insert({ event_id: event.id, user_id: user.id });
      if (error) Alert.alert('Error', error.message);
      else {
        setIsAttending(true);
        // Fetch current user profile to add to attendees list
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) setAttendees((a) => [...a, data as Profile]);
      }
    }
    setJoining(false);
  }

  async function deleteEvent() {
    Alert.alert('Delete Event', 'This will permanently delete the event and all its chats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('events').delete().eq('id', id);
          router.replace('/tabs' as any);
        },
      },
    ]);
  }

  if (loading || !event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        {isOrganizer && (
          <TouchableOpacity onPress={deleteEvent}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{event.title}</Text>

        <View style={styles.metaCard}>
          <MetaRow icon="📅" label="Date & Time" value={formatDate(event.date)} />
          <MetaRow icon="📍" label="Location" value={event.location_name} />
          {organizer && <MetaRow icon="👤" label="Organizer" value={organizer.username} />}
          {event.max_attendees && (
            <MetaRow
              icon="👥"
              label="Capacity"
              value={`${attendees.length} / ${event.max_attendees} spots filled`}
            />
          )}
        </View>

        {event.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this event</Text>
            <Text style={styles.description}>{event.description}</Text>
          </View>
        ) : null}

        {attendees.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attendees ({attendees.length})</Text>
            <View style={styles.attendeeList}>
              {attendees.map((p) => (
                <View key={p.id} style={styles.attendeeChip}>
                  <Text style={styles.attendeeInitial}>{p.username.charAt(0).toUpperCase()}</Text>
                  <Text style={styles.attendeeName}>{p.username}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {(isAttending || isOrganizer) && (
          <TouchableOpacity
            style={[styles.footerBtn, styles.chatBtn]}
            onPress={() => router.push(`/chat/${event.id}` as any)}
          >
            <Text style={styles.chatBtnText}>💬 Open Chat</Text>
          </TouchableOpacity>
        )}

        {!isOrganizer && (
          <TouchableOpacity
            style={[
              styles.footerBtn,
              isAttending ? styles.leaveBtn : styles.joinBtn,
              joining && styles.btnDisabled,
            ]}
            onPress={toggleAttendance}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator color={isAttending ? '#FF3B30' : '#fff'} />
            ) : (
              <Text style={isAttending ? styles.leaveBtnText : styles.joinBtnText}>
                {isAttending ? 'Leave Event' : 'Join Event'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaIcon}>{icon}</Text>
      <View>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  backBtn: {},
  backText: { fontSize: 17, color: '#208AEF', fontWeight: '600' },
  deleteText: { fontSize: 15, color: '#FF3B30', fontWeight: '600' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', color: '#1C1C1E', lineHeight: 32 },
  metaCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  metaIcon: { fontSize: 20, marginTop: 2 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 15, color: '#1C1C1E', fontWeight: '500', marginTop: 2 },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  description: { fontSize: 15, color: '#1C1C1E', lineHeight: 22 },
  attendeeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attendeeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F2F2F7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  attendeeInitial: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: '#208AEF',
    color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 24,
  },
  attendeeName: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  footer: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: 28, borderTopWidth: 1, borderTopColor: '#E5E5EA', gap: 10,
  },
  footerBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  chatBtn: { backgroundColor: '#F2F2F7' },
  chatBtnText: { color: '#1C1C1E', fontWeight: '700', fontSize: 16 },
  joinBtn: { backgroundColor: '#208AEF' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  leaveBtn: { backgroundColor: '#FFF0F0' },
  leaveBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
});
