import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/HomeScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { AppProvider, useAppContext } from '../context/AppContext';
import { PickerDetails } from '../screens/PickerDetailsScreen';

export type TabParamList = {
  Home: undefined;
  Orders: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

// Screens that use context
const HomeScreenWithContext = () => {
  const { phoneNumber, pickerDetails } = useAppContext();
  return <HomeScreen phoneNumber={phoneNumber} pickerDetails={pickerDetails} />;
};

const ProfileScreenWithContext = () => {
  const { phoneNumber, pickerDetails, onLogout } = useAppContext();
  return (
    <ProfileScreen
      phoneNumber={phoneNumber}
      pickerDetails={pickerDetails}
      onLogout={onLogout}
    />
  );
};

interface TabNavigatorProps {
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  onLogout: () => void;
}

const TabNavigatorContent: React.FC = () => {

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreenWithContext}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon="🏠" color={color} size={size} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarLabel: 'Orders',
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon="📦" color={color} size={size} />
          ),
        }}
      />
      
      <Tab.Screen
        name="Profile"
        component={ProfileScreenWithContext}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <TabIcon icon="👤" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const TabNavigator: React.FC<TabNavigatorProps> = ({
  phoneNumber,
  pickerDetails,
  onLogout,
}) => {
  return (
    <AppProvider
      phoneNumber={phoneNumber}
      pickerDetails={pickerDetails}
      onLogout={onLogout}
    >
      <TabNavigatorContent />
    </AppProvider>
  );
};

// Simple icon component for tabs
const TabIcon: React.FC<{ icon: string; color: string; size: number }> = ({
  icon,
}) => {
  return <Text style={{ fontSize: 24 }}>{icon}</Text>;
};

export default TabNavigator;

