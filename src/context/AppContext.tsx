import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { PickerDetails } from '../screens/PickerDetailsScreen';
import { storageService } from '../services/storageService';
import { getUserDetails } from '../services/firebaseService';
import { initializeNotifications } from '../services/notificationService';
import { isProfileComplete } from '../utils/profileValidation';

interface AppContextType {
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  isLoading: boolean;
  setPhoneNumber: (phone: string) => void;
  setPickerDetails: (details: PickerDetails | null) => void;
  onLoginSuccess: (phone: string) => Promise<void>;
  onLogout: () => Promise<void>;
  refreshHome: number;
  triggerHomeRefresh: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pickerDetails, setPickerDetails] = useState<PickerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshHome, setRefreshHome] = useState(0);

  // Check for existing login on app start
  useEffect(() => {
    checkExistingLogin();
  }, []);

  // Initialize notifications when user is logged in
  useEffect(() => {
    if (phoneNumber) {
      initializeNotifications(
        phoneNumber,
        (notification) => {
          console.log('📬 Notification received:', notification);
          setRefreshHome((prev) => prev + 1);
        },
        (response) => {
          console.log('👆 Notification tapped:', response);
          // Note: Navigation handling from notification interaction 
          // might be better handled in RootNavigator or via specific listener
          // For now we just refresh home
          setRefreshHome((prev) => prev + 1);
        }
      ).catch((error) => {
        console.warn('Failed to initialize notifications:', error);
      });
    }
  }, [phoneNumber]);

  const checkExistingLogin = async () => {
    try {
      setIsLoading(true);
      const userData = await storageService.getUserData();

      if (userData && userData.isLoggedIn && userData.phoneNumber) {
        setPhoneNumber(userData.phoneNumber);

        // Check Firebase (source of truth)
        try {
          const firebaseData = await getUserDetails(userData.phoneNumber);
          if (firebaseData.success && firebaseData.data) {
            await storageService.savePickerDetails(firebaseData.data);
            setPickerDetails(firebaseData.data);
          } else {
            // User not in Firebase - clear local
            await storageService.clearAllData();
            setPhoneNumber('');
            setPickerDetails(null);
          }
        } catch (firebaseError) {
          console.warn('Firebase fetch error:', firebaseError);
          // Fallback to local
          if (userData.pickerDetails) {
            setPickerDetails(userData.pickerDetails);
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing login:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onLoginSuccess = async (phone: string) => {
    setPhoneNumber(phone);
    await storageService.savePhoneNumber(phone);
    await storageService.saveLoginState(true);

    try {
      const firebaseData = await getUserDetails(phone);
      if (firebaseData.success && firebaseData.data) {
        setPickerDetails(firebaseData.data);
        await storageService.savePickerDetails(firebaseData.data);
      } else {
        // User needs to complete profile
        setPickerDetails(null);
      }
    } catch (error) {
      console.error('Firebase error during login:', error);
    }
  };

  const onLogout = async () => {
    await storageService.clearAllData();
    setPhoneNumber('');
    setPickerDetails(null);
  };

  const triggerHomeRefresh = () => {
    setRefreshHome((prev) => prev + 1);
  };

  return (
    <AppContext.Provider
      value={{
        phoneNumber,
        pickerDetails,
        isLoading,
        setPhoneNumber,
        setPickerDetails,
        onLoginSuccess,
        onLogout,
        refreshHome,
        triggerHomeRefresh
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};
