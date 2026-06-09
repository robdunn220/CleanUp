import { Image } from 'expo-image';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  url?: string | null;
  username: string;
  size: number;
};

export function Avatar({ url, username, size }: Props) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
        {(username || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#5CB85C', justifyContent: 'center', alignItems: 'center' },
  initial: { color: '#fff', fontWeight: '800' },
});
