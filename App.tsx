import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import PhoneLoginScreen from './src/screens/PhoneLoginScreen';
import PickerDetailsScreen, {
  PickerDetails,
} from './src/screens/PickerDetailsScreen';
import HomeScreen from './src/screens/HomeScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import OrderDetailsScreen from './src/screens/OrderDetailsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import AddressManagementScreen from './src/screens/AddressManagementScreen';
import HelpSupportScreen from './src/screens/HelpSupportScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import CustomTabBar from './src/components/CustomTabBar';
import LoadingScreen from './src/components/LoadingScreen';
import { storageService } from './src/services/storageService';
import { getUserDetails } from './src/services/firebaseService';
import { initializeNotifications } from './src/services/notificationService';

type AppState = 'loading' | 'login' | 'pickerDetails' | 'home' | 'orderDetails' | 'editProfile' | 'addressManagement' | 'helpSupport' | 'settings';
type TabName = 'Home' | 'Orders' | 'Profile';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pickerDetails, setPickerDetails] = useState<PickerDetails | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<TabName>('Home');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<string | null>(null);
  const [homeScreenRefreshKey, setHomeScreenRefreshKey] = useState(0);

  // Check for existing login on app start
  useEffect(() => {
    checkExistingLogin();
  }, []);

  // Initialize notifications when user is logged in
  useEffect(() => {
    if (phoneNumber && appState === 'home') {
      // Initialize notifications (register token and set up listeners)
      initializeNotifications(
        phoneNumber,
        // Handle notification received while app is foregrounded
        (notification) => {
          console.log('📬 Notification received:', notification);
          // Refresh HomeScreen to show new orders
          setHomeScreenRefreshKey((prev) => prev + 1);
          // Switch to Home tab if not already there
          setActiveTab((currentTab) => {
            if (currentTab !== 'Home') {
              return 'Home';
            }
            return currentTab;
          });
        },
        // Handle notification tapped
        (response) => {
          console.log('👆 Notification tapped:', response);
          const orderId = response.notification.request.content.data?.orderId;
          if (orderId) {
            // Navigate to order details
            setSelectedOrderForDetails(orderId);
            setAppState('orderDetails');
          } else {
            // If no order ID, just switch to Home tab
            setActiveTab('Home');
            setHomeScreenRefreshKey((prev) => prev + 1);
          }
        }
      ).catch((error) => {
        console.warn('Failed to initialize notifications:', error);
      });
    }
  }, [phoneNumber, appState]);

  const checkExistingLogin = async () => {
    try {
      const userData = await storageService.getUserData();
      
      if (userData && userData.isLoggedIn && userData.phoneNumber) {
        setPhoneNumber(userData.phoneNumber);
        
        let userPickerDetails: PickerDetails | null = null;
        
        // Try to get latest data from Firebase (optional, non-blocking)
        try {
          const firebaseData = await getUserDetails(userData.phoneNumber);
          if (firebaseData.success && firebaseData.data) {
            // Use Firebase data if available (more up-to-date)
            userPickerDetails = firebaseData.data;
            // Also update local storage with Firebase data
            await storageService.savePickerDetails(firebaseData.data);
          } else if (userData.pickerDetails) {
            // Fallback to local storage data
            userPickerDetails = userData.pickerDetails;
          }
        } catch (firebaseError) {
          console.warn('Could not fetch from Firebase, using local data:', firebaseError);
          // Use local storage data if Firebase fails
          if (userData.pickerDetails) {
            userPickerDetails = userData.pickerDetails;
          }
        }
        
        // Set picker details state
        if (userPickerDetails) {
          setPickerDetails(userPickerDetails);
        }
        
        // Determine which screen to show
        if (userPickerDetails) {
          // User has completed profile
          setAppState('home');
        } else {
          // User is logged in but hasn't completed profile
          setAppState('pickerDetails');
        }
      } else {
        // No existing login
        setAppState('login');
      }
    } catch (error) {
      console.error('Error checking existing login:', error);
      setAppState('login');
    }
  };

  const handleLoginSuccess = async (phone: string) => {
    setPhoneNumber(phone);
    // Save login state
    await storageService.savePhoneNumber(phone);
    await storageService.saveLoginState(true);
    
    // First check Firebase for existing user profile
    try {
      const firebaseData = await getUserDetails(phone);
      if (firebaseData.success && firebaseData.data && firebaseData.data.fullName) {
        // User exists in Firebase with complete profile, skip profile form
        setPickerDetails(firebaseData.data);
        // Also save to local storage for offline access
        await storageService.savePickerDetails(firebaseData.data);
        setAppState('home');
        return;
      }
    } catch (error) {
      console.warn('Could not fetch from Firebase, checking local storage:', error);
    }
    
    // Fallback to local storage check
    const existingDetails = await storageService.getPickerDetails();
    if (existingDetails && existingDetails.fullName) {
      setPickerDetails(existingDetails);
      setAppState('home');
    } else {
      // No profile found in Firebase or local storage, show profile form
      setAppState('pickerDetails');
    }
  };

  const handlePickerDetailsSubmit = async (details: PickerDetails) => {
    setPickerDetails(details);
    // Save picker details
    await storageService.savePickerDetails(details);
    setAppState('home');
  };

  const handleLogout = async () => {
    // Clear all stored data
    await storageService.clearAllData();
    setAppState('login');
    setPhoneNumber('');
    setPickerDetails(null);
    setSelectedOrderId(null);
  };

  const handleOrderSelect = (orderId: string) => {
    // When order is selected from Home screen, switch to Orders tab
    setSelectedOrderId(orderId);
    setActiveTab('Orders');
  };

  const handleOrderPicked = (orderId: string) => {
    // When "Pick This Order" is clicked from Home:
    // 1. Set the selected order for Orders screen
    setSelectedOrderId(orderId);
    // 2. Switch to Orders tab to show the picked order
    setActiveTab('Orders');
    // 3. Navigate to Order Details after a brief delay
    setTimeout(() => {
      setSelectedOrderForDetails(orderId);
      setAppState('orderDetails');
    }, 500);
  };

  const handleViewOrderDetails = (orderId: string) => {
    // Navigate to Order Details Screen
    setSelectedOrderForDetails(orderId);
    setAppState('orderDetails');
  };

  const handleBackFromOrderDetails = () => {
    setSelectedOrderForDetails(null);
    setAppState('home');
    // Keep the Orders tab active
  };

  const handleBackFromProfileScreen = () => {
    setAppState('home');
    setActiveTab('Profile');
  };

  // Show loading screen while checking for existing login
  if (appState === 'loading') {
    return (
      <SafeAreaProvider>
        <LoadingScreen message="Loading..." fullScreen />
      </SafeAreaProvider>
    );
  }

  const tabs = [
    { name: 'Home', icon: '🏠', label: 'Home' },
    { name: 'Orders', icon: '📦', label: 'Orders' },
    { name: 'Profile', icon: '👤', label: 'Profile' },
  ];

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'Home':
        return (
          <HomeScreen 
            key={homeScreenRefreshKey}
            phoneNumber={phoneNumber} 
            pickerDetails={pickerDetails}
            onOrderSelect={handleOrderSelect}
            onOrderPicked={handleOrderPicked}
            onViewOrderDetails={handleViewOrderDetails}
          />
        );
      case 'Orders':
        return (
          <OrdersScreen
            phoneNumber={phoneNumber}
            onOrderPicked={handleOrderPicked}
            selectedOrderId={selectedOrderId}
            onViewOrderDetails={handleViewOrderDetails}
          />
        );
      case 'Profile':
        return (
          <ProfileScreen
            phoneNumber={phoneNumber}
            pickerDetails={pickerDetails}
            onLogout={handleLogout}
            onNavigateToEditProfile={() => setAppState('editProfile')}
            onNavigateToHelpSupport={() => setAppState('helpSupport')}
            onNavigateToSettings={() => setAppState('settings')}
          />
        );
      default:
        return (
          <HomeScreen phoneNumber={phoneNumber} pickerDetails={pickerDetails} />
        );
    }
  };

  return (
    <SafeAreaProvider>
      {appState === 'login' && (
        <PhoneLoginScreen onLoginSuccess={handleLoginSuccess} />
      )}
      {appState === 'pickerDetails' && (
        <PickerDetailsScreen
          phoneNumber={phoneNumber}
          onSubmit={handlePickerDetailsSubmit}
        />
      )}
      {appState === 'home' && (
        <View style={styles.homeContainer}>
          {renderActiveScreen()}
          <CustomTabBar
            tabs={tabs}
            activeTab={activeTab}
            onTabPress={(tabName) => setActiveTab(tabName as TabName)}
          />
        </View>
      )}
      {appState === 'orderDetails' && selectedOrderForDetails && (
        <OrderDetailsScreen
          orderId={selectedOrderForDetails}
          phoneNumber={phoneNumber}
          onBack={handleBackFromOrderDetails}
        />
      )}
      {appState === 'editProfile' && (
        <EditProfileScreen 
          phoneNumber={phoneNumber}
          pickerDetails={pickerDetails}
          onBack={handleBackFromProfileScreen}
          onSave={async (details) => {
            setPickerDetails(details);
            await storageService.savePickerDetails(details);
            handleBackFromProfileScreen();
          }}
        />
      )}
      {appState === 'addressManagement' && (
        <AddressManagementScreen onBack={handleBackFromProfileScreen} />
      )}
      {appState === 'helpSupport' && (
        <HelpSupportScreen onBack={handleBackFromProfileScreen} />
      )}
      {appState === 'settings' && (
        <SettingsScreen onBack={handleBackFromProfileScreen} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  homeContainer: {
    flex: 1,
  },
});
