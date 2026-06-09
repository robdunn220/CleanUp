import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#5CB85C' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}
