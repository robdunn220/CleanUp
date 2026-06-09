import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import { Avatar } from '../../components/Avatar';
import type { CleanupEvent, Profile, AttendeeRow } from '../../types';

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
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [isAttending, setIsAttending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    async function load() {
      const [eventRes, attendeesRes] = await Promise.all([
        supabase.from('events').select('*, profiles!created_by(*)').eq('id', id).single(),
        supabase
          .from('event_attendees')
          .select('user_id, muted, profiles(id, username, avatar_url)')
          .eq('event_id', id),
      ]);

      if (eventRes.data) {
        setEvent(eventRes.data as any);
        setOrganizer((eventRes.data as any).profiles ?? null);
      }

      if (attendeesRes.data) {
        const rows: AttendeeRow[] = attendeesRes.data
          .filter((r: any) => r.profiles)
          .map((r: any) => ({ profile: r.profiles as Profile, muted: !!r.muted }));
        setAttendees(rows);
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
        setAttendees((a) => a.filter((r) => r.profile.id !== user.id));
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
        if (data) setAttendees((a) => [...a, { profile: data as Profile, muted: false }]);
      }
    }
    setJoining(false);
  }

  // Organizer-only: silence an attendee in the event chat (server enforces it via RLS).
  async function toggleMute(attendee: AttendeeRow) {
    if (!event) return;
    const next = !attendee.muted;
    // Optimistic update.
    setAttendees((a) =>
      a.map((r) => (r.profile.id === attendee.profile.id ? { ...r, muted: next } : r)),
    );
    const { error } = await supabase
      .from('event_attendees')
      .update({ muted: next })
      .eq('event_id', event.id)
      .eq('user_id', attendee.profile.id);
    if (error) {
      Alert.alert('Error', error.message);
      // Roll back on failure.
      setAttendees((a) =>
        a.map((r) => (r.profile.id === attendee.profile.id ? { ...r, muted: attendee.muted } : r)),
      );
    }
  }

  // Organizer-only: remove an attendee from the event entirely.
  function removeAttendee(attendee: AttendeeRow) {
    if (!event) return;
    Alert.alert(
      'Remove attendee',
      `Remove ${attendee.profile.username} from this event? They can rejoin unless the event is full.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const prev = attendees;
            setAttendees((a) => a.filter((r) => r.profile.id !== attendee.profile.id));
            const { error } = await supabase
              .from('event_attendees')
              .delete()
              .eq('event_id', event.id)
              .eq('user_id', attendee.profile.id);
            if (error) {
              Alert.alert('Error', error.message);
              setAttendees(prev);
            }
          },
        },
      ],
    );
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
        <ActivityIndicator size="large" color="#5CB85C" />
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
          <MetaRow ionicon="calendar" label="Date & Time" value={formatDate(event.date)} />
          <MetaRow ionicon="location" label="Location" value={event.location_name} />
          {organizer && <MetaRow ionicon="person" label="Organizer" value={organizer.username} />}
          {event.max_attendees && (
            <MetaRow
              ionicon="people"
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

            {isOrganizer ? (
              <View style={styles.manageList}>
                {attendees.map(({ profile, muted }) => {
                  const attendee = { profile, muted };
                  const isSelf = profile.id === user?.id;
                  return (
                    <View key={profile.id} style={styles.manageRow}>
                      <Avatar url={profile.avatar_url} username={profile.username} size={32} />
                      <Text style={styles.manageName} numberOfLines={1}>
                        {profile.username}
                        {muted ? ' 🔇' : ''}
                      </Text>
                      {!isSelf && (
                        <View style={styles.manageActions}>
                          <TouchableOpacity
                            style={[styles.manageBtn, muted ? styles.unmuteBtn : styles.muteBtn]}
                            onPress={() => toggleMute(attendee)}
                          >
                            <Text style={muted ? styles.unmuteBtnText : styles.muteBtnText}>
                              {muted ? 'Unmute' : 'Mute'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.manageBtn, styles.removeBtn]}
                            onPress={() => removeAttendee(attendee)}
                          >
                            <Text style={styles.removeBtnText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.attendeeList}>
                {attendees.map(({ profile, muted }) => (
                  <View key={profile.id} style={styles.attendeeChip}>
                    <Avatar url={profile.avatar_url} username={profile.username} size={24} />
                    <Text style={styles.attendeeName}>
                      {profile.username}
                      {muted ? ' 🔇' : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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

function MetaRow({
  icon,
  ionicon,
  label,
  value,
}: {
  icon?: string;
  ionicon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      {ionicon ? (
        <Ionicons name={ionicon} size={19} color="#5CB85C" style={styles.metaIcon} />
      ) : (
        <Text style={styles.metaIcon}>{icon}</Text>
      )}
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
  backText: { fontSize: 17, color: '#5CB85C', fontWeight: '600' },
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
  attendeeName: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  manageList: { gap: 10 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manageName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  manageActions: { flexDirection: 'row', gap: 8 },
  manageBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  muteBtn: { backgroundColor: '#F2F2F7' },
  muteBtnText: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  unmuteBtn: { backgroundColor: '#E8F5E9' },
  unmuteBtnText: { fontSize: 13, fontWeight: '600', color: '#5CB85C' },
  removeBtn: { backgroundColor: '#FFF0F0' },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: '#FF3B30' },
  footer: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    paddingBottom: 28, borderTopWidth: 1, borderTopColor: '#E5E5EA', gap: 10,
  },
  footerBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  chatBtn: { backgroundColor: '#F2F2F7' },
  chatBtnText: { color: '#1C1C1E', fontWeight: '700', fontSize: 16 },
  joinBtn: { backgroundColor: '#5CB85C' },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  leaveBtn: { backgroundColor: '#FFF0F0' },
  leaveBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
});
