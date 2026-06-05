import { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
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
  const flatListRef = useRef<FlatList>(null);

  // Load event info and message history
  useEffect(() => {
    async function load() {
      const [eventRes, msgRes] = await Promise.all([
        supabase.from('events').select('title').eq('id', eventId).single(),
        supabase
          .from('messages')
          .select('*, profiles(id, username)')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true }),
      ]);
      if (eventRes.data) setEvent(eventRes.data as any);
      if (msgRes.data) setMessages(msgRes.data as Message[]);
      setLoading(false);
    }
    load();
  }, [eventId]);

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
        <ActivityIndicator size="large" color="#208AEF" />
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
          return (
            <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
              {!isMe && (
                <Text style={styles.senderName}>{(msg.profiles as any)?.username ?? 'Unknown'}</Text>
              )}
              <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{msg.content}</Text>
              <Text style={[styles.timestamp, isMe && styles.timestampMe]}>{formatTime(msg.created_at)}</Text>
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
  backText: { fontSize: 17, color: '#208AEF', fontWeight: '600', width: 60 },
  navCenter: { flex: 1, alignItems: 'center' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', maxWidth: 200 },
  navSubtitle: { fontSize: 12, color: '#8E8E93' },
  messageList: { padding: 12, gap: 6, paddingBottom: 8 },
  dateHeader: { alignItems: 'center', marginVertical: 8 },
  dateHeaderText: {
    fontSize: 12, fontWeight: '600', color: '#8E8E93',
    backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, marginVertical: 2,
  },
  bubbleMe: {
    alignSelf: 'flex-end', backgroundColor: '#208AEF',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    alignSelf: 'flex-start', backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  senderName: { fontSize: 12, fontWeight: '700', color: '#208AEF', marginBottom: 3 },
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
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#208AEF',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#C7C7CC' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
