import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';
import { Avatar } from '../../components/Avatar';
import type { Profile } from '../../types';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  function pickAvatar() {
    Alert.alert('Profile Photo', 'Choose a source', [
      { text: 'Take Photo', onPress: captureAvatar },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function captureAvatar() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    });
    if (!result.canceled) uploadAvatar(result.assets[0]);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    });
    if (!result.canceled) uploadAvatar(result.assets[0]);
  }

  async function uploadAvatar(asset: ImagePicker.ImagePickerAsset) {
    if (!user) return;
    setUploading(true);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      if (!asset.base64) throw new Error('No image data returned.');

      // React Native cannot create Blobs from ArrayBuffers or fetch data: URIs on Android.
      // Decode base64 → ArrayBuffer manually and upload that directly.
      const binary = atob(asset.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(user.id, bytes.buffer, { contentType: mimeType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(user.id);
      const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile((p) => p ? { ...p, avatar_url: avatarUrl } : p);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message ?? 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  }

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
        <ActivityIndicator size="large" color="#5CB85C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Profile</Text>

      <TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar} disabled={uploading}>
        <Avatar
          url={profile?.avatar_url}
          username={profile?.username ?? user?.email ?? ''}
          size={84}
        />
        <View style={styles.cameraOverlay}>
          {uploading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.cameraIcon}>📷</Text>
          }
        </View>
      </TouchableOpacity>

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
  avatarWrapper: {
    alignSelf: 'center', marginBottom: 20, width: 84, height: 84,
  },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#F2F2F7',
  },
  cameraIcon: { fontSize: 12 },
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
  editBtn: { backgroundColor: '#5CB85C' },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { flex: 1, backgroundColor: '#F2F2F7', marginHorizontal: 0 },
  cancelBtnText: { color: '#1C1C1E', fontWeight: '600', fontSize: 16 },
  saveBtn: { flex: 1, backgroundColor: '#5CB85C', marginHorizontal: 0 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  signOutBtn: { backgroundColor: '#FFF0F0', marginTop: 8 },
  signOutBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
});
