import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { app, storage } from '../config/FirebaseConifg';
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

/**
 * Upload profile image to Firebase Storage
 * Returns the download URL
 */
export const uploadProfileImage = async (
  userId: string,
  uri: string
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> => {
  try {
    // strict check for valid string URI
    if (!uri || typeof uri !== 'string') {
      return { success: false, error: 'Invalid file URI' };
    }

    // 1. Create a blob from the URI using XMLHttpRequest (more reliable in RN)
    const blob: Blob = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.error('XHR Error:', e);
        reject(new TypeError("Network request failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });

    // 2. Create a reference to the file in Firebase Storage
    // Path: profile_photos/{userId}/profile.jpg
    const filename = `profile_photos/${userId}/profile_${Date.now()}.jpg`;
    const storageRef = ref(storage, filename);

    // 3. Upload the file
    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          console.error('Upload failed:', error);
          // @ts-ignore
          blob.close(); // Clean up blob
          resolve({ success: false, error: error.message });
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('File available at', downloadURL);
            // @ts-ignore
            blob.close(); // Clean up blob
            resolve({ success: true, downloadUrl: downloadURL });
          } catch (error: any) {
            console.error('Error getting download URL:', error);
            // @ts-ignore
            blob.close();
            resolve({ success: false, error: error.message });
          }
        }
      );
    });

  } catch (error: any) {
    console.error('Error uploading image:', error);
    return { success: false, error: error.message };
  }
};
