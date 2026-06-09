import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Modal, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import { Avatar } from '../../components/Avatar';
import type { Message, CleanupEvent } from '../../types';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function ChatScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<CleanupEvent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load event info and message history
  useEffect(() => {
    async function load() {
      const [eventRes, msgRes, attendeeRes] = await Promise.all([
        supabase.from('events').select('title').eq('id', eventId).single(),
        supabase
          .from('messages')
          .select('*, profiles(id, username, avatar_url)')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true }),
        user
          ? supabase
              .from('event_attendees')
              .select('muted')
              .eq('event_id', eventId)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (eventRes.data) setEvent(eventRes.data as any);
      if (msgRes.data) setMessages(msgRes.data as Message[]);
      setMuted(!!(attendeeRes as any).data?.muted);
      setLoading(false);
    }
    load();
  }, [eventId, user?.id]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${eventId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `event_id=eq.${eventId}` },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newMsg.user_id)
            .single();
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: (profile ?? undefined) as any }];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  function openReport(msg: Message) {
    setReportNote('');
    setReportTarget(msg);
  }

  async function submitReport() {
    if (!reportTarget || !user) return;
    setReporting(true);
    const { error } = await supabase.from('reports').insert({
      event_id: eventId,
      reporter_id: user.id,
      reported_user_id: reportTarget.user_id,
      message_id: reportTarget.id,
      message_content: reportTarget.content,
      note: reportNote.trim() || null,
    });
    setReporting(false);
    if (error) {
      Alert.alert('Could not submit report', error.message);
      return;
    }
    setReportTarget(null);
    setReportNote('');
    Alert.alert('Report submitted', 'Thanks for flagging this. The organizer team will review it.');
  }

  async function sendMessage() {
    if (!text.trim() || !user) return;
    setSending(true);
    const { error } = await supabase
      .from('messages')
      .insert({ event_id: eventId, user_id: user.id, content: text.trim() });
    if (!error) setText('');
    setSending(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5CB85C" />
      </View>
    );
  }

  // Group messages by date for headers
  const items: Array<{ type: 'header'; date: string } | { type: 'message'; data: Message }> = [];
  let lastDate = '';
  messages.forEach((m) => {
    const dateStr = m.created_at.slice(0, 10);
    if (dateStr !== lastDate) {
      items.push({ type: 'header', date: m.created_at });
      lastDate = dateStr;
    }
    items.push({ type: 'message', data: m });
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.navCenter}>
          <Text style={styles.navTitle} numberOfLines={1}>{event?.title ?? 'Chat'}</Text>
          <Text style={styles.navSubtitle}>Event Chat</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(item, i) =>
          item.type === 'header' ? `header-${item.date}` : item.data.id
        }
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{formatDateHeader(item.date)}</Text>
              </View>
            );
          }
          const msg = item.data;
          const isMe = msg.user_id === user?.id;
          const sender = msg.profiles as any;
          if (isMe) {
            return (
              <View style={[styles.bubble, styles.bubbleMe]}>
                <Text style={[styles.messageText, styles.messageTextMe]}>{msg.content}</Text>
                <Text style={[styles.timestamp, styles.timestampMe]}>{formatTime(msg.created_at)}</Text>
              </View>
            );
          }
          return (
            <View style={styles.messageRowThem}>
              <TouchableOpacity onPress={() => openReport(msg)} accessibilityLabel={`Report ${sender?.username ?? 'user'}`}>
                <Avatar url={sender?.avatar_url} username={sender?.username ?? ''} size={28} />
              </TouchableOpacity>
              <View style={[styles.bubble, styles.bubbleThem]}>
                <Text style={styles.senderName}>{sender?.username ?? 'Unknown'}</Text>
                <Text style={styles.messageText}>{msg.content}</Text>
                <Text style={styles.timestamp}>{formatTime(msg.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>🌱</Text>
            <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {muted ? (
        <View style={styles.mutedBar}>
          <Text style={styles.mutedText}>🔇 You've been muted by the organizer.</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={!!reportTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setReportTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Report {(reportTarget?.profiles as any)?.username ?? 'user'}
            </Text>

            <Text style={styles.modalLabel}>Reported message</Text>
            <View style={styles.reportedMsg}>
              <Text style={styles.reportedMsgText}>{reportTarget?.content}</Text>
            </View>

            <Text style={styles.modalLabel}>Additional details (optional)</Text>
            <TextInput
              style={styles.reportInput}
              value={reportNote}
              onChangeText={setReportNote}
              placeholder="Tell us what's wrong…"
              multiline
              maxLength={1000}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setReportTarget(null)}
                disabled={reporting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSubmit, reporting && styles.modalBtnDisabled]}
                onPress={submitReport}
                disabled={reporting}
              >
                {reporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit report</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
  backText: { fontSize: 17, color: '#5CB85C', fontWeight: '600', width: 60 },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', maxWidth: 200 },
  navSubtitle: { fontSize: 12, color: '#8E8E93' },
  messageList: { padding: 12, gap: 6, paddingBottom: 8 },
  dateHeader: { alignItems: 'center', marginVertical: 8 },
  dateHeaderText: {
    fontSize: 12, fontWeight: '600', color: '#8E8E93',
    backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  messageRowThem: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginVertical: 2,
  },
  bubble: {
    maxWidth: '72%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
  },
  bubbleMe: {
    alignSelf: 'flex-end', backgroundColor: '#5CB85C',
    borderBottomRightRadius: 4, marginVertical: 2,
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  senderName: { fontSize: 12, fontWeight: '700', color: '#5CB85C', marginBottom: 3 },
  messageText: { fontSize: 15, color: '#1C1C1E', lineHeight: 21 },
  messageTextMe: { color: '#fff' },
  timestamp: { fontSize: 11, color: '#8E8E93', marginTop: 3, textAlign: 'right' },
  timestampMe: { color: 'rgba(255,255,255,0.7)' },
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 40, marginBottom: 10 },
  emptyChatText: { color: '#8E8E93', fontSize: 15 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 26,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA',
  },
  textInput: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1C1C1E',
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#5CB85C',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#C7C7CC' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  mutedBar: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 30,
    borderTopWidth: 1, borderTopColor: '#E5E5EA', alignItems: 'center',
  },
  mutedText: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', paddingHorizontal: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1C1C1E', marginBottom: 14 },
  modalLabel: {
    fontSize: 12, fontWeight: '700', color: '#8E8E93',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
  },
  reportedMsg: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 12, marginBottom: 16,
    borderLeftWidth: 3, borderLeftColor: '#5CB85C',
  },
  reportedMsgText: { fontSize: 14, color: '#1C1C1E', lineHeight: 20 },
  reportInput: {
    backgroundColor: '#F2F2F7', borderRadius: 12, padding: 12, fontSize: 15,
    color: '#1C1C1E', minHeight: 70, textAlignVertical: 'top', marginBottom: 18,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnDisabled: { opacity: 0.6 },
  modalCancel: { backgroundColor: '#F2F2F7' },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  modalSubmit: { backgroundColor: '#FF3B30' },
  modalSubmitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
