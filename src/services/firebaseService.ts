import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../config/FirebaseConifg';
import { PickerDetails } from '../screens/PickerDetailsScreen';

const db = getFirestore(app);

export interface FirebaseUserData extends PickerDetails {
  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
}

const COLLECTION_NAME = 'deliveryPartners';

/**
 * Save or update user details in Firestore
 * Uses phone number as the document ID for easy lookup
 */
export const saveUserDetails = async (
  phoneNumber: string,
  userDetails: PickerDetails
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Clean phone number to use as document ID (remove + and spaces)
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    
    const userRef = doc(db, COLLECTION_NAME, cleanPhoneNumber);
    
    const userData: FirebaseUserData = {
      ...userDetails,
      phoneNumber: cleanPhoneNumber, // Store cleaned phone number
      updatedAt: serverTimestamp(),
    };

    // Check if user already exists
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // Update existing user
      await updateDoc(userRef, userData);
      console.log('✅ User details updated in Firebase:', cleanPhoneNumber);
    } else {
      // Create new user
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      console.log('✅ New user created in Firebase:', cleanPhoneNumber);
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Error saving user details to Firebase:', error);
    return {
      success: false,
      error: error.message || 'Failed to save user details',
    };
  }
};

/**
 * Get user details from Firestore
 */
export const getUserDetails = async (
  phoneNumber: string
): Promise<{ success: boolean; data?: FirebaseUserData; error?: string }> => {
  try {
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const userRef = doc(db, COLLECTION_NAME, cleanPhoneNumber);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data() as FirebaseUserData;
      console.log('✅ User details retrieved from Firebase:', cleanPhoneNumber);
      return { success: true, data: userData };
    } else {
      console.log('ℹ️ User not found in Firebase:', cleanPhoneNumber);
      return { success: false, error: 'User not found' };
    }
  } catch (error: any) {
    console.error('❌ Error getting user details from Firebase:', error);
    return {
      success: false,
      error: error.message || 'Failed to get user details',
    };
  }
};

/**
 * Update last login timestamp
 * Uses setDoc with merge to create document if it doesn't exist
 */
export const updateLastLogin = async (
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const userRef = doc(db, COLLECTION_NAME, cleanPhoneNumber);
    
    // Use setDoc with merge: true to create document if it doesn't exist
    // This prevents "No document to update" errors
    await setDoc(
      userRef,
      {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('✅ Last login updated:', cleanPhoneNumber);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error updating last login:', error);
    return {
      success: false,
      error: error.message || 'Failed to update last login',
    };
  }
};

/**
 * Check if user exists in Firebase
 */
export const checkUserExists = async (
  phoneNumber: string
): Promise<boolean> => {
  try {
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '');
    const userRef = doc(db, COLLECTION_NAME, cleanPhoneNumber);
    const userDoc = await getDoc(userRef);
    return userDoc.exists();
  } catch (error) {
    console.error('❌ Error checking if user exists:', error);
    return false;
  }
};

