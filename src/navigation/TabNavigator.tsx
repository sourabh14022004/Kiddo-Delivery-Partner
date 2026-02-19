import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CustomTabBar from '../components/CustomTabBar';

export type TabParamList = {
  Home: undefined;
  Orders: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const TabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={({ state, descriptors, navigation }) => {
        const tabs = state.routes.map((route) => {
          let icon = '';
          switch (route.name) {
            case 'Home':
              icon = '🏠';
              break;
            case 'Orders':
              icon = '📦';
              break;
            case 'Profile':
              icon = '👤';
              break;
          }
          return {
            name: route.name,
            icon,
            label: (descriptors[route.key].options.tabBarLabel as string) || route.name,
          };
        });

        return (
          <CustomTabBar
            tabs={tabs}
            activeTab={state.routes[state.index].name}
            onTabPress={(name) => navigation.navigate(name)}
          />
        );
      }}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ tabBarLabel: 'Orders' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
};

// Simple icon component for tabs
const TabIcon: React.FC<{ icon: string; color: string; size: number }> = ({
  icon,
}) => {
  return <Text style={{ fontSize: 24 }}>{icon}</Text>;
};

export default TabNavigator;
