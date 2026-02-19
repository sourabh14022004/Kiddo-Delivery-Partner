import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppContext } from '../context/AppContext';
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import PickerDetailsScreen, { PickerDetails } from '../screens/PickerDetailsScreen';
import TabNavigator from './TabNavigator';
import OrderPreviewScreen from '../screens/OrderPreviewScreen';
import OrderDetailsScreen from '../screens/OrderDetailsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import AddressManagementScreen from '../screens/AddressManagementScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import LoadingScreen from '../components/LoadingScreen';

export type RootStackParamList = {
    Login: undefined;
    PickerDetails: undefined;
    MainTabs: undefined;
    OrderPreview: { orderId: string };
    OrderDetails: { orderId: string };
    EditProfile: undefined;
    AddressManagement: undefined;
    HelpSupport: undefined;
    Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const RootNavigator = () => {
    const { phoneNumber, pickerDetails, isLoading } = useAppContext();

    if (isLoading) {
        return <LoadingScreen message="Loading..." fullScreen />;
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!phoneNumber ? (
                // Auth Stack
                <Stack.Screen name="Login" component={PhoneLoginScreen} />
            ) : !pickerDetails ? (
                // Onboarding Stack
                <Stack.Screen
                    name="PickerDetails"
                    component={PickerDetailsScreen}
                />
            ) : (
                // Main App Stack
                <>
                    <Stack.Screen name="MainTabs" component={TabNavigator} />
                    <Stack.Screen name="OrderPreview" component={OrderPreviewScreen} />
                    <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
                    <Stack.Screen name="EditProfile" component={EditProfileScreen} />
                    <Stack.Screen name="AddressManagement" component={AddressManagementScreen} />
                    <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} />
                </>
            )}
        </Stack.Navigator>
    );
};

export default RootNavigator;
