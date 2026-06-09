import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/auth';

export default function CreateEventScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationName, setLocationName] = useState('');
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD
  const [showCalendar, setShowCalendar] = useState(false);
  const [time, setTime] = useState('');
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [maxAttendees, setMaxAttendees] = useState('');
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  function displayDate() {
    if (!selectedDate) return '';
    const [y, m, d] = selectedDate.split('-');
    return `${m}/${d}/${y}`;
  }

  function handleTimeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setTime(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  }

  async function handleCreate() {
    setSubmitted(true);

    const missing: string[] = [];
    if (!title.trim()) missing.push('Event Title');
    if (!locationName.trim()) missing.push('Location Name');
    if (!selectedDate) missing.push('Date');
    if (!time.trim()) missing.push('Time');

    if (missing.length > 0) {
      Alert.alert('Missing fields', `Please fill in: ${missing.join(', ')}`);
      return;
    }

    const parts = time.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] ?? '0', 10);

    if (isNaN(hours) || isNaN(minutes) || hours < 1 || hours > 12 || minutes > 59) {
      Alert.alert('Invalid time', 'Please enter a valid time (e.g. 09:30).');
      return;
    }
    if (ampm === 'AM' && hours === 12) hours = 0;
    if (ampm === 'PM' && hours !== 12) hours += 12;

    const dateTimeStr = `${selectedDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    const parsedDate = new Date(dateTimeStr);

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
        <Label text="Event Title" required hasError={submitted && !title.trim()} />
        <TextInput
          style={[styles.input, submitted && !title.trim() && styles.inputError]}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. River Bank Cleanup"
        />

        <Label text="Description" />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="What should participants bring? What's the plan?"
          multiline
          numberOfLines={4}
        />

        <Label text="Location Name" required hasError={submitted && !locationName.trim()} />
        <TextInput
          style={[styles.input, submitted && !locationName.trim() && styles.inputError]}
          value={locationName}
          onChangeText={setLocationName}
          placeholder="e.g. Riverside Park, Main St entrance"
        />

        <Label text="Date" required hasError={submitted && !selectedDate} />
        <TouchableOpacity
          style={[styles.input, submitted && !selectedDate && styles.inputError]}
          onPress={() => setShowCalendar(true)}
          activeOpacity={0.7}
        >
          <Text style={selectedDate ? styles.inputText : styles.inputPlaceholder}>
            {selectedDate ? displayDate() : 'Select a date'}
          </Text>
        </TouchableOpacity>

        <Label text="Time" required hasError={submitted && !time.trim()} />
        <View style={styles.timeRow}>
          <TextInput
            style={[styles.input, styles.timeInput, submitted && !time.trim() && styles.inputError]}
            value={time}
            onChangeText={handleTimeChange}
            placeholder="12:00"
            keyboardType="number-pad"
            maxLength={5}
          />
          <View style={styles.ampmRow}>
            {(['AM', 'PM'] as const).map((val) => (
              <TouchableOpacity
                key={val}
                style={[styles.ampmBtn, ampm === val && styles.ampmBtnActive]}
                onPress={() => setAmpm(val)}
              >
                <Text style={[styles.ampmText, ampm === val && styles.ampmTextActive]}>{val}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

      <Modal visible={showCalendar} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCalendar(false)}>
          <View style={styles.calendarCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.calendarTitle}>Select Date</Text>
            <Calendar
              minDate={today}
              onDayPress={(day) => {
                setSelectedDate(day.dateString);
                setShowCalendar(false);
              }}
              markedDates={selectedDate ? { [selectedDate]: { selected: true, selectedColor: '#5CB85C' } } : {}}
              theme={{
                selectedDayBackgroundColor: '#5CB85C',
                todayTextColor: '#5CB85C',
                arrowColor: '#5CB85C',
              }}
            />
            <TouchableOpacity style={styles.calendarCancel} onPress={() => setShowCalendar(false)}>
              <Text style={styles.calendarCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Label({ text, required, hasError }: { text: string; required?: boolean; hasError?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required && <Text style={hasError ? styles.starError : styles.starNormal}> *</Text>}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  backText: { fontSize: 17, color: '#5CB85C', fontWeight: '600', width: 70 },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  content: { padding: 16, gap: 4, paddingBottom: 40 },
  label: {
    fontSize: 13, fontWeight: '600', color: '#8E8E93',
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: '#1C1C1E', borderWidth: 1, borderColor: '#E5E5EA',
  },
  inputText: { fontSize: 16, color: '#1C1C1E' },
  inputPlaceholder: { fontSize: 16, color: '#C7C7CC' },
  inputError: { borderColor: '#FF3B30' },
  starNormal: { color: '#8E8E93' },
  starError: { color: '#FF3B30' },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeInput: { flex: 1 },
  ampmRow: { flexDirection: 'row', gap: 6 },
  ampmBtn: {
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA',
  },
  ampmBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#5CB85C' },
  ampmText: { fontSize: 15, fontWeight: '600', color: '#8E8E93' },
  ampmTextActive: { color: '#5CB85C' },
  row: { flexDirection: 'row', gap: 10 },
  locationToggle: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  toggleBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA',
  },
  toggleBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#5CB85C' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  toggleTextActive: { color: '#5CB85C' },
  createBtn: {
    backgroundColor: '#5CB85C', borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', marginTop: 16,
  },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  calendarCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  calendarTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 8, textAlign: 'center' },
  calendarCancel: { marginTop: 8, alignItems: 'center', paddingVertical: 12 },
  calendarCancelText: { color: '#5CB85C', fontSize: 16, fontWeight: '600' },
});
