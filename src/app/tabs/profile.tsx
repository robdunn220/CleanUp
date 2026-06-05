import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import type { Profile } from '../../types';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          setUsername(data.username ?? '');
          setBio(data.bio ?? '');
        }
        setLoading(false);
      });
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    if (!username.trim()) {
      Alert.alert('Username required', 'Please enter a username.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), bio: bio.trim() || null })
      .eq('id', user.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setProfile((p) => p ? { ...p, username: username.trim(), bio: bio.trim() || null } : p);
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#208AEF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Profile</Text>

      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {(profile?.username ?? user?.email ?? '?').charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.card}>
        <FieldRow label="Username">
          {editing ? (
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : (
            <Text style={styles.fieldValue}>{profile?.username ?? '—'}</Text>
          )}
        </FieldRow>

        <View style={styles.divider} />

        <FieldRow label="Email">
          <Text style={styles.fieldValue}>{user?.email}</Text>
        </FieldRow>

        <View style={styles.divider} />

        <FieldRow label="Bio">
          {editing ? (
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={3}
              placeholder="Tell others a bit about yourself…"
            />
          ) : (
            <Text style={[styles.fieldValue, !profile?.bio && styles.placeholder]}>
              {profile?.bio || 'No bio yet.'}
            </Text>
          )}
        </FieldRow>

        <View style={styles.divider} />

        <FieldRow label="Member since">
          <Text style={styles.fieldValue}>
            {profile ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
          </Text>
        </FieldRow>
      </View>

      {editing ? (
        <View style={styles.row}>
          <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setEditing(false)}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.saveBtn, saving && styles.btnDisabled]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.editBtn]} onPress={() => setEditing(true)}>
          <Text style={styles.editBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.btn, styles.signOutBtn]} onPress={handleSignOut}>
        <Text style={styles.signOutBtnText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingBottom: 40 },
  header: {
    fontSize: 26, fontWeight: '800', color: '#1C1C1E',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 20,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
    marginBottom: 20,
  },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: '#208AEF', alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  fieldContent: {},
  fieldValue: { fontSize: 16, color: '#1C1C1E' },
  placeholder: { color: '#C7C7CC' },
  input: {
    fontSize: 16, color: '#1C1C1E', backgroundColor: '#F2F2F7',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  bioInput: { minHeight: 72, textAlignVertical: 'top' },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginHorizontal: 16 },
  row: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 16 },
  btn: {
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    marginHorizontal: 16, marginTop: 12,
  },
  editBtn: { backgroundColor: '#208AEF' },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#F2F2F7', marginHorizontal: 0 },
  cancelBtnText: { color: '#1C1C1E', fontWeight: '600', fontSize: 16 },
  saveBtn: { flex: 1, backgroundColor: '#208AEF', marginHorizontal: 0 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  signOutBtn: { backgroundColor: '#FFF0F0', marginTop: 8 },
  signOutBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
});
