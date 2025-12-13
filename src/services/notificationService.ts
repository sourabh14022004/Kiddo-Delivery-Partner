import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getFirestore, collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/FirebaseConifg';

const TOKENS_COLLECTION = 'notificationTokens';
const NOTIFICATIONS_COLLECTION = 'notifications';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions and get Expo push token
 */
export const registerForPushNotifications = async (): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> => {
  try {
    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return {
        success: false,
        error: 'Permission not granted for notifications',
      };
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '63a4d033-e63e-40e4-93b4-91a91bcd6917', // From app.json
    });

    console.log('✅ Expo push token obtained:', tokenData.data);
    return {
      success: true,
      token: tokenData.data,
    };
  } catch (error: any) {
    console.error('❌ Error registering for push notifications:', error);
    return {
      success: false,
      error: error.message || 'Failed to register for notifications',
    };
  }
};

/**
 * Save notification token to Firestore for a delivery partner
 */
export const saveNotificationToken = async (
  phoneNumber: string,
  token: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const tokenRef = doc(db, TOKENS_COLLECTION, cleanPhoneNumber);

    await setDoc(
      tokenRef,
      {
        phoneNumber: cleanPhoneNumber,
        token,
        platform: Platform.OS,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('✅ Notification token saved for:', cleanPhoneNumber);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error saving notification token:', error);
    return {
      success: false,
      error: error.message || 'Failed to save notification token',
    };
  }
};

/**
 * Get all notification tokens for all delivery partners
 */
export const getAllNotificationTokens = async (): Promise<{
  success: boolean;
  tokens?: Array<{ phoneNumber: string; token: string; platform: string }>;
  error?: string;
}> => {
  try {
    const tokensRef = collection(db, TOKENS_COLLECTION);
    const querySnapshot = await getDocs(tokensRef);

    const tokens: Array<{ phoneNumber: string; token: string; platform: string }> = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      tokens.push({
        phoneNumber: data.phoneNumber,
        token: data.token,
        platform: data.platform || 'unknown',
      });
    });

    console.log(`✅ Retrieved ${tokens.length} notification tokens`);
    return {
      success: true,
      tokens,
    };
  } catch (error: any) {
    console.error('❌ Error getting notification tokens:', error);
    return {
      success: false,
      error: error.message || 'Failed to get notification tokens',
    };
  }
};

/**
 * Send a notification to all delivery partners about a new order
 * This function should be called from a backend/cloud function when a new order is detected
 */
export const sendNewOrderNotification = async (
  orderDetails: {
    orderId: string;
    orderName: string;
    totalPrice: string;
    currencyCode: string;
    shippingAddress: {
      city?: string;
      address1?: string;
    };
  }
): Promise<{ success: boolean; sentCount?: number; error?: string }> => {
  try {
    // Get all notification tokens
    const tokensResult = await getAllNotificationTokens();
    
    if (!tokensResult.success || !tokensResult.tokens || tokensResult.tokens.length === 0) {
      console.warn('No notification tokens found');
      return {
        success: true,
        sentCount: 0,
      };
    }

    // Prepare notification message
    const address = orderDetails.shippingAddress.city || orderDetails.shippingAddress.address1 || 'Location';
    const title = '📦 New Order Available!';
    const body = `${orderDetails.orderName} - ${orderDetails.totalPrice} ${orderDetails.currencyCode} to ${address}`;

    // Send notifications using Expo Push Notification API
    // Note: In production, this should be done from a backend server
    // For now, we'll use the Expo Push API directly (not recommended for production)
    const messages = tokensResult.tokens.map((tokenData) => ({
      to: tokenData.token,
      sound: 'default',
      title,
      body,
      data: {
        orderId: orderDetails.orderId,
        orderName: orderDetails.orderName,
        type: 'new_order',
      },
      badge: 1,
    }));

    // Send to Expo Push Notification service
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send notifications:', errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    const sentCount = Array.isArray(result.data) ? result.data.length : 0;

    // Save notification record to Firestore
    const notificationRef = doc(db, NOTIFICATIONS_COLLECTION);
    await setDoc(notificationRef, {
      orderId: orderDetails.orderId,
      orderName: orderDetails.orderName,
      sentAt: serverTimestamp(),
      sentCount,
      totalTokens: tokensResult.tokens.length,
    });

    console.log(`✅ Sent ${sentCount} notifications about new order ${orderDetails.orderId}`);
    return {
      success: true,
      sentCount,
    };
  } catch (error: any) {
    console.error('❌ Error sending notifications:', error);
    return {
      success: false,
      error: error.message || 'Failed to send notifications',
    };
  }
};

/**
 * Set up notification listeners
 */
export const setupNotificationListeners = (
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) => {
  // Listener for notifications received while app is foregrounded
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log('📬 Notification received:', notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Listener for when user taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('👆 Notification tapped:', response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  // Return cleanup function
  return () => {
    Notifications.removeNotificationSubscription(receivedListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
};

/**
 * Initialize notifications for a user (register token and set up listeners)
 */
export const initializeNotifications = async (
  phoneNumber: string,
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Register for push notifications
    const tokenResult = await registerForPushNotifications();
    
    if (!tokenResult.success || !tokenResult.token) {
      return {
        success: false,
        error: tokenResult.error || 'Failed to get notification token',
      };
    }

    // Save token to Firestore
    const saveResult = await saveNotificationToken(phoneNumber, tokenResult.token);
    
    if (!saveResult.success) {
      console.warn('Failed to save notification token:', saveResult.error);
      // Continue anyway - token registration is still successful
    }

    // Set up notification listeners
    setupNotificationListeners(onNotificationReceived, onNotificationTapped);

    console.log('✅ Notifications initialized successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error initializing notifications:', error);
    return {
      success: false,
      error: error.message || 'Failed to initialize notifications',
    };
  }
};

