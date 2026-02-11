import AsyncStorage from '@react-native-async-storage/async-storage';
import { PickerDetails } from '../screens/PickerDetailsScreen';

const STORAGE_KEYS = {
  PHONE_NUMBER: '@kiddo:phoneNumber',
  PICKER_DETAILS: '@kiddo:pickerDetails',
  IS_LOGGED_IN: '@kiddo:isLoggedIn',
  AUTH_TOKEN: '@kiddo:authToken',
  CACHED_ORDERS: '@kiddo:cachedOrders',
  CACHED_ORDERS_TIMESTAMP: '@kiddo:cachedOrdersTimestamp',
  NOTIFICATIONS_ENABLED: '@kiddo:notificationsEnabled',
};

export interface StoredUserData {
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  isLoggedIn: boolean;
  authToken?: string;
}

export const storageService = {
  // Save phone number
  savePhoneNumber: async (phoneNumber: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.PHONE_NUMBER, phoneNumber);
    } catch (error) {
      console.error('Error saving phone number:', error);
    }
  },

  // Get phone number
  getPhoneNumber: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.PHONE_NUMBER);
    } catch (error) {
      console.error('Error getting phone number:', error);
      return null;
    }
  },

  // Save picker details
  savePickerDetails: async (details: PickerDetails): Promise<void> => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.PICKER_DETAILS,
        JSON.stringify(details)
      );
    } catch (error) {
      console.error('Error saving picker details:', error);
    }
  },

  // Get picker details
  getPickerDetails: async (): Promise<PickerDetails | null> => {
    try {
      const details = await AsyncStorage.getItem(STORAGE_KEYS.PICKER_DETAILS);
      return details ? JSON.parse(details) : null;
    } catch (error) {
      console.error('Error getting picker details:', error);
      return null;
    }
  },

  // Save login state
  saveLoginState: async (isLoggedIn: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.IS_LOGGED_IN,
        JSON.stringify(isLoggedIn)
      );
    } catch (error) {
      console.error('Error saving login state:', error);
    }
  },

  // Get login state
  getLoginState: async (): Promise<boolean> => {
    try {
      const isLoggedIn = await AsyncStorage.getItem(STORAGE_KEYS.IS_LOGGED_IN);
      return isLoggedIn ? JSON.parse(isLoggedIn) : false;
    } catch (error) {
      console.error('Error getting login state:', error);
      return false;
    }
  },

  // Save auth token
  saveAuthToken: async (token: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    } catch (error) {
      console.error('Error saving auth token:', error);
    }
  },

  // Get auth token
  getAuthToken: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  },

  // Get all user data
  getUserData: async (): Promise<StoredUserData | null> => {
    try {
      const [phoneNumber, pickerDetails, isLoggedIn, authToken] =
        await Promise.all([
          storageService.getPhoneNumber(),
          storageService.getPickerDetails(),
          storageService.getLoginState(),
          storageService.getAuthToken(),
        ]);

      if (!phoneNumber || !isLoggedIn) {
        return null;
      }

      return {
        phoneNumber,
        pickerDetails,
        isLoggedIn,
        authToken: authToken || undefined,
      };
    } catch (error) {
      console.error('Error getting user data:', error);
      return null;
    }
  },

  // Clear all user data (logout)
  clearAllData: async (): Promise<void> => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.PHONE_NUMBER,
        STORAGE_KEYS.PICKER_DETAILS,
        STORAGE_KEYS.IS_LOGGED_IN,
        STORAGE_KEYS.AUTH_TOKEN,
        STORAGE_KEYS.CACHED_ORDERS,
        STORAGE_KEYS.CACHED_ORDERS_TIMESTAMP,
      ]);
    } catch (error) {
      console.error('Error clearing user data:', error);
    }
  },

  // Cache orders for instant loading
  saveCachedOrders: async (orders: any[]): Promise<void> => {
    try {
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.CACHED_ORDERS, JSON.stringify(orders)),
        AsyncStorage.setItem(STORAGE_KEYS.CACHED_ORDERS_TIMESTAMP, Date.now().toString()),
      ]);
    } catch (error) {
      console.error('Error saving cached orders:', error);
    }
  },

  // Get cached orders (returns null if cache is stale or doesn't exist)
  getCachedOrders: async (maxAgeMs: number = 5 * 60 * 1000): Promise<any[] | null> => {
    try {
      const [cachedOrders, timestamp] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CACHED_ORDERS),
        AsyncStorage.getItem(STORAGE_KEYS.CACHED_ORDERS_TIMESTAMP),
      ]);

      if (!cachedOrders || !timestamp) {
        return null;
      }

      const age = Date.now() - parseInt(timestamp, 10);
      if (age > maxAgeMs) {
        // Cache is stale
        return null;
      }

      return JSON.parse(cachedOrders);
    } catch (error) {
      console.error('Error getting cached orders:', error);
      return null;
    }
  },

  // Clear cached orders (e.g., when an order is picked)
  clearCachedOrders: async (): Promise<void> => {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.CACHED_ORDERS,
        STORAGE_KEYS.CACHED_ORDERS_TIMESTAMP,
      ]);
    } catch (error) {
      console.error('Error clearing cached orders:', error);
    }
  },

  // Notifications preference (for settings)
  getNotificationsEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
      return value === null ? true : value === 'true';
    } catch (error) {
      console.error('Error getting notifications preference:', error);
      return true;
    }
  },

  setNotificationsEnabled: async (enabled: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, String(enabled));
    } catch (error) {
      console.error('Error saving notifications preference:', error);
    }
  },
};

