import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';

function TabIcon({ focused, children }: { focused: boolean; children: string }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <View>
        {/* emoji icons — swap for @expo/vector-icons if preferred */}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#208AEF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Events', tabBarIcon: ({ color }) => <TabEmoji emoji="📍" color={color} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: ({ color }) => <TabEmoji emoji="📅" color={color} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: ({ color }) => <TabEmoji emoji="💬" color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabEmoji emoji="👤" color={color} /> }}
      />
    </Tabs>
  );
}

function TabEmoji({ emoji, color }: { emoji: string; color: import('react-native').ColorValue }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 22, opacity: color === '#208AEF' ? 1 : 0.55 }}>{emoji}</Text>;
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    height: 60,
    paddingBottom: 8,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  iconWrap: { padding: 4, borderRadius: 8 },
  iconWrapActive: { backgroundColor: '#E6F4FE' },
});
