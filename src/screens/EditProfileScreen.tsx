import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { saveUserDetails, uploadProfileImage } from '../services/firebaseService';
import { storageService } from '../services/storageService';
import { theme } from '../config/theme';
import { useAppContext } from '../context/AppContext';
import { PickerDetails } from './PickerDetailsScreen';

const EditProfileScreen: React.FC = () => {
  const { phoneNumber, pickerDetails, setPickerDetails } = useAppContext();
  const navigation = useNavigation();

  const [fullName, setFullName] = useState(pickerDetails?.fullName || '');
  const [age, setAge] = useState(pickerDetails?.age || '');
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(
    pickerDetails?.profilePhoto
  );
  const [loading, setLoading] = useState(false);

  // Track original values to detect changes
  const originalFullName = pickerDetails?.fullName || '';
  const originalAge = pickerDetails?.age || '';
  const originalProfilePhoto = pickerDetails?.profilePhoto;

  useEffect(() => {
    if (pickerDetails) {
      setFullName(pickerDetails.fullName || '');
      setAge(pickerDetails.age || '');
      setProfilePhoto(pickerDetails.profilePhoto);
    }
  }, [pickerDetails]);

  // Check if any field has changed
  const hasChanges =
    fullName.trim() !== originalFullName ||
    age.trim() !== originalAge ||
    profilePhoto !== originalProfilePhoto;

  const requestImagePermission = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Sorry, we need camera roll permissions to upload your profile photo!'
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestImagePermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setProfilePhoto(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const handleSave = async (exitAfterSave?: boolean) => {
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Please enter your full name');
      return;
    }

    setLoading(true);

    let photoUrl = profilePhoto;
    // Upload photo if changed and it's a local file
    if (profilePhoto && profilePhoto !== originalProfilePhoto) {
      try {
        const uploadResult = await uploadProfileImage(phoneNumber, profilePhoto);
        if (uploadResult.success && uploadResult.downloadUrl) {
          photoUrl = uploadResult.downloadUrl;
        } else {
          Alert.alert(
            'Image Upload Failed',
            `Could not upload profile photo: ${uploadResult.error}\n\nPlease check your internet connection.`
          );
          photoUrl = originalProfilePhoto;
        }
      } catch (error) {
        console.error('Error uploading photo:', error);
        photoUrl = originalProfilePhoto;
      }
    }

    const details: PickerDetails = {
      fullName: fullName.trim(),
      phoneNumber,
      ...(age.trim() && { age: age.trim() }),
      ...(photoUrl && { profilePhoto: photoUrl }),
    };

    try {
      const result = await saveUserDetails(phoneNumber, details);

      // Always update local storage and context
      await storageService.savePickerDetails(details);
      setPickerDetails(details);

      if (result.success) {
        if (exitAfterSave) {
          Alert.alert('Success', 'Profile updated successfully!', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          Alert.alert('Success', 'Profile updated successfully!');
        }
      } else {
        Alert.alert('Warning', 'Saved locally but failed to sync to server');
        if (exitAfterSave) navigation.goBack();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleBackPress = () => {
    if (!hasChanges) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Unsaved changes',
      'You have unsaved changes. Save before leaving?',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Discard & Leave',
          style: 'destructive',
          onPress: () => navigation.goBack(),
        },
        {
          text: 'Save & Leave',
          onPress: () => handleSave(true),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={handleBackPress} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Edit Profile</Text>
        {hasChanges ? (
          <TouchableOpacity
            style={styles.headerSaveButton}
            onPress={() => handleSave()}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={theme.colors.success} />
            ) : (
              <Text style={styles.headerSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Photo Section */}
        <View style={styles.profilePhotoSection}>
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={pickImage}
            activeOpacity={0.7}
          >
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.profileImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={40} color="#999" />
                <Text style={styles.photoPlaceholderLabel}>Tap to upload</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.editPhotoBadge}
              onPress={pickImage}
              activeOpacity={0.7}
            >
              <Ionicons name="pencil" size={16} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Full Name */}
          <View style={styles.section}>
            <Text style={styles.label}>
              Full Name <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your full name"
              placeholderTextColor="#999"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* Phone Number (Read-only) */}
          <View style={styles.section}>
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.readOnlyInput}>
              <Text style={styles.readOnlyText}>{phoneNumber}</Text>
              <Ionicons name="lock-closed" size={16} color="rgba(255,255,255,0.5)" />
            </View>
          </View>

          {/* Age */}
          <View style={styles.section}>
            <Text style={styles.label}>Age</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your age"
              placeholderTextColor="#999"
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              maxLength={3}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDark,
  },
  header: {
    backgroundColor: theme.colors.backgroundDark,
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  headerSaveButton: {
    minWidth: 56,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  headerSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.success,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingTop: 8,
  },
  profilePhotoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: 20,
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  required: {
    color: '#E53935',
  },
  photoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: theme.colors.success,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D0D0D0',
    borderStyle: 'dashed',
  },
  photoPlaceholderLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  editPhotoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  input: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.textLight,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  readOnlyInput: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  readOnlyText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
});

export default EditProfileScreen;
