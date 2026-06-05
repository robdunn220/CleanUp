import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#208AEF' }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}
