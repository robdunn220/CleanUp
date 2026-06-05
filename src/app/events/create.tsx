import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';

export default function CreateEventScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim() || !locationName.trim() || !date.trim() || !time.trim()) {
      Alert.alert('Missing fields', 'Please fill in title, location, date, and time.');
      return;
    }

    const dateTimeStr = `${date.trim()}T${time.trim()}:00`;
    const parsedDate = new Date(dateTimeStr);
    if (isNaN(parsedDate.getTime())) {
      Alert.alert('Invalid date', 'Please use format YYYY-MM-DD for date and HH:MM for time.');
      return;
    }

    if (parsedDate <= new Date()) {
      Alert.alert('Invalid date', 'Event must be in the future.');
      return;
    }

    setLoading(true);

    let latitude: number;
    let longitude: number;

    if (useMyLocation) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Please enable location or enter coordinates manually.');
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      latitude = loc.coords.latitude;
      longitude = loc.coords.longitude;
    } else {
      latitude = parseFloat(manualLat);
      longitude = parseFloat(manualLon);
      if (isNaN(latitude) || isNaN(longitude)) {
        Alert.alert('Invalid coordinates', 'Please enter valid latitude and longitude.');
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      date: parsedDate.toISOString(),
      location_name: locationName.trim(),
      latitude,
      longitude,
      created_by: user!.id,
      max_attendees: maxAttendees ? parseInt(maxAttendees, 10) : null,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Event created!', 'Your cleanup event has been posted.', [
        { text: 'OK', onPress: () => router.replace('/tabs' as any) },
      ]);
    }

    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>New Event</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Label text="Event Title *" />
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="e.g. River Bank Cleanup" />

        <Label text="Description" />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What should participants bring? What's the plan?"
          multiline
          numberOfLines={4}
        />

        <Label text="Location Name *" />
        <TextInput
          style={styles.input}
          value={locationName}
          onChangeText={setLocationName}
          placeholder="e.g. Riverside Park, Main St entrance"
        />

        <Label text="Date * (YYYY-MM-DD)" />
        <TextInput
          style={styles.input}
          value={date}
          onChangeText={setDate}
          placeholder="2026-07-20"
          keyboardType="numbers-and-punctuation"
        />

        <Label text="Time * (HH:MM, 24-hour)" />
        <TextInput
          style={styles.input}
          value={time}
          onChangeText={setTime}
          placeholder="09:00"
          keyboardType="numbers-and-punctuation"
        />

        <Label text="Max Attendees (optional)" />
        <TextInput
          style={styles.input}
          value={maxAttendees}
          onChangeText={setMaxAttendees}
          placeholder="Leave blank for unlimited"
          keyboardType="number-pad"
        />

        <Label text="Event Coordinates" />
        <View style={styles.locationToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, useMyLocation && styles.toggleBtnActive]}
            onPress={() => setUseMyLocation(true)}
          >
            <Text style={[styles.toggleText, useMyLocation && styles.toggleTextActive]}>
              📍 Use my location
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, !useMyLocation && styles.toggleBtnActive]}
            onPress={() => setUseMyLocation(false)}
          >
            <Text style={[styles.toggleText, !useMyLocation && styles.toggleTextActive]}>
              ✏️ Enter manually
            </Text>
          </TouchableOpacity>
        </View>

        {!useMyLocation && (
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={manualLat}
              onChangeText={setManualLat}
              placeholder="Latitude"
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={manualLon}
              onChangeText={setManualLon}
              placeholder="Longitude"
              keyboardType="decimal-pad"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.createBtn, loading && styles.btnDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create Event</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  backText: { fontSize: 17, color: '#208AEF', fontWeight: '600', width: 70 },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  content: { padding: 16, gap: 4, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: '#1C1C1E', borderWidth: 1, borderColor: '#E5E5EA',
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  locationToggle: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  toggleBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA',
  },
  toggleBtnActive: { backgroundColor: '#E6F4FE', borderColor: '#208AEF' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  toggleTextActive: { color: '#208AEF' },
  createBtn: {
    backgroundColor: '#208AEF', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});
