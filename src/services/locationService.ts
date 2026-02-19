import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/FirebaseConifg';
import * as Location from 'expo-location';

const RIDERS_COLLECTION = 'deliveryPartners';

export interface LocationData {
  latitude: number;
  longitude: number;
  updatedAt: any;
}

let locationTrackingInterval: NodeJS.Timeout | null = null;
let isTracking = false;

/**
 * Request location permissions
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return false;
  }
};

/**
 * Get current location
 */
export const getCurrentLocation = async (): Promise<LocationData | null> => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      updatedAt: serverTimestamp(),
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    return null;
  }
};

/**
 * Get current address string (City, Region)
 */
export const getCurrentAddress = async (): Promise<string | null> => {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const address = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (address && address.length > 0) {
      const { city, region, street, name } = address[0];
      // Prefer City, Region. Fallback to other fields if missing.
      const parts = [city, region].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
      
      // Fallback
      return street || name || 'Unknown Location';
    }
    return null;
  } catch (error) {
    console.error('Error getting address:', error);
    return null;
  }
};

/**
 * Start tracking rider location and syncing to Firestore
 */
export const startLocationTracking = async (riderId: string): Promise<boolean> => {
  if (isTracking) {
    console.warn('Location tracking already started');
    return true;
  }

  const hasPermission = await requestLocationPermission();
  if (!hasPermission) {
    console.error('Location permission not granted');
    return false;
  }

  isTracking = true;

  // Update location immediately
  const updateLocation = async () => {
    try {
      const location = await getCurrentLocation();
      if (location) {
        const riderRef = doc(db, RIDERS_COLLECTION, riderId);
        await updateDoc(riderRef, {
          location: {
            lat: location.latitude,
            lng: location.longitude,
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        });
        console.log('Location updated:', location.latitude, location.longitude);
      }
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  // Update immediately
  await updateLocation();

  // Update every 12 seconds (between 10-15 seconds as requested)
  locationTrackingInterval = setInterval(updateLocation, 12000);

  console.log('Location tracking started for rider:', riderId);
  return true;
};

/**
 * Stop tracking rider location
 */
export const stopLocationTracking = (): void => {
  if (locationTrackingInterval) {
    clearInterval(locationTrackingInterval);
    locationTrackingInterval = null;
  }
  isTracking = false;
  console.log('Location tracking stopped');
};

/**
 * Check if location tracking is active
 */
export const isLocationTrackingActive = (): boolean => {
  return isTracking;
};
