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
import OrderPreviewScreen from './src/screens/OrderPreviewScreen';
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
import { isProfileComplete } from './src/utils/profileValidation';

type AppState = 'loading' | 'login' | 'pickerDetails' | 'home' | 'orderPreview' | 'orderDetails' | 'editProfile' | 'addressManagement' | 'helpSupport' | 'settings';
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
          const orderId = response.notification.request.content.data?.orderId as string | undefined;
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

        // ✅ PRIORITY 1: Check Firebase database first (source of truth)
        try {
          console.log('Checking Firebase for user profile...');
          const firebaseData = await getUserDetails(userData.phoneNumber);

          if (firebaseData.success && firebaseData.data) {
            console.log('✅ User profile found in Firebase');
            userPickerDetails = firebaseData.data;

            // User exists in Firebase - sync to local storage and navigate to home
            // We assume existing users have completed their profile previously
            console.log('✅ User exists in Firebase, allowing access without strict profile check');
            await storageService.savePickerDetails(firebaseData.data);
            setPickerDetails(userPickerDetails);
            setAppState('home');
            return;
          } else {
            // ⚠️ CRITICAL: User not found in Firebase (deleted or never existed)
            // Clear all local data and force re-login for security
            console.warn('🔒 User not found in Firebase - clearing local cache and forcing logout');
            await storageService.clearAllData();
            setPhoneNumber('');
            setPickerDetails(null);
            setAppState('login');
            return;
          }
        } catch (firebaseError) {
          console.warn('Firebase fetch error:', firebaseError);
          // On Firebase error, we cannot verify user exists
          // For security, we should not allow access with only local cache
          // But we'll allow offline mode for better UX (you can change this)
        }

        // ✅ PRIORITY 2: Fallback to local storage (offline support ONLY)
        // This is only reached if Firebase had an error (network issue, etc.)
        // NOT if user doesn't exist in Firebase (that's handled above)
        if (userData.pickerDetails) {
          console.log('⚠️ Using local storage profile data (offline mode - Firebase unavailable)');
          userPickerDetails = userData.pickerDetails;

          // Validate profile is complete before navigating to home
          if (isProfileComplete(userPickerDetails)) {
            setPickerDetails(userPickerDetails);
            setAppState('home');
          } else {
            // Profile exists but incomplete - show profile form
            setPickerDetails(userPickerDetails);
            setAppState('pickerDetails');
          }
        } else {
          // No profile data anywhere - show profile form
          console.log('No profile data found, showing profile form');
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

    // ✅ ALWAYS check Firebase first - it's the source of truth
    try {
      const firebaseData = await getUserDetails(phone);

      if (firebaseData.success && firebaseData.data) {
        // User exists in Firebase - sync to local storage and navigate to home
        // We assume existing users have completed their profile previously
        console.log('✅ User exists in Firebase, skipping profile completion check');
        setPickerDetails(firebaseData.data);
        await storageService.savePickerDetails(firebaseData.data);
        setAppState('home');
        return;
      } else {
        // User doesn't exist in Firebase - show profile form for first-time setup
        console.log('User not found in Firebase, showing profile form');
        setAppState('pickerDetails');
        return;
      }
    } catch (error) {
      console.error('Firebase error during login:', error);
      // On Firebase error, show profile form (safe fallback)
      // User can create/update profile which will sync to Firebase
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
    // Navigate to Order Preview (product/order details) first
    setSelectedOrderForDetails(orderId);
    setAppState('orderPreview');
  };

  const handleBackFromOrderPreview = () => {
    setSelectedOrderForDetails(null);
    setAppState('home');
  };

  const handleViewOnMap = () => {
    // From preview, go to map/delivery screen
    setAppState('orderDetails');
  };

  const handleBackFromOrderDetails = () => {
    setSelectedOrderForDetails(null);
    setAppState('home');
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
            refreshTrigger={homeScreenRefreshKey}
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
          <HomeScreen
            refreshTrigger={homeScreenRefreshKey}
            phoneNumber={phoneNumber}
            pickerDetails={pickerDetails}
            onViewOrderDetails={handleViewOrderDetails}
          />
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
        <>
          {/* ✅ Safety guard: Redirect to profile if incomplete */}
          {!isProfileComplete(pickerDetails) ? (
            <PickerDetailsScreen
              phoneNumber={phoneNumber}
              onSubmit={handlePickerDetailsSubmit}
            />
          ) : (
            <View style={styles.homeContainer}>
              {renderActiveScreen()}
              <CustomTabBar
                tabs={tabs}
                activeTab={activeTab}
                onTabPress={(tabName) => setActiveTab(tabName as TabName)}
              />
            </View>
          )}
        </>
      )}
      {appState === 'orderPreview' && selectedOrderForDetails && (
        <OrderPreviewScreen
          orderId={selectedOrderForDetails}
          phoneNumber={phoneNumber}
          onBack={handleBackFromOrderPreview}
          onViewOnMap={handleViewOnMap}
          onPickOrder={handleOrderPicked}
        />
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
