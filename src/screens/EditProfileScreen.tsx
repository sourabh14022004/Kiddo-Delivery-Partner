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
import { saveUserDetails } from '../services/firebaseService';
import { PickerDetails } from './PickerDetailsScreen';
import { storageService } from '../services/storageService';
import { theme } from '../config/theme';

interface EditProfileScreenProps {
  phoneNumber: string;
  pickerDetails: PickerDetails | null;
  onBack: () => void;
  onSave: (details: PickerDetails) => void;
}

const EditProfileScreen: React.FC<EditProfileScreenProps> = ({
  phoneNumber,
  pickerDetails,
  onBack,
  onSave,
}) => {
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

  const handleSave = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Please enter your full name');
      return;
    }

    const details: PickerDetails = {
      fullName: fullName.trim(),
      phoneNumber,
      ...(age.trim() && { age: age.trim() }),
      ...(profilePhoto && { profilePhoto }),
    };

    setLoading(true);

    try {
      // Save to Firebase
      const result = await saveUserDetails(phoneNumber, details);

      if (result.success) {
        // Save to local storage
        await storageService.savePickerDetails(details);
        // Call onSave callback to update parent state
        onSave(details);
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Error', result.error || 'Failed to update profile');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          hasChanges && { paddingBottom: 100},
        ]}
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
              <Ionicons name="lock-closed" size={16} color="#999" />
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

      {/* Bottom Action Buttons - Only show when changes are made */}
      {hasChanges && (
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.discardButton}
            onPress={() => {
              setFullName(originalFullName);
              setAge(originalAge);
              setProfilePhoto(originalProfilePhoto);
            }}
            disabled={loading}
          >
            <Text style={styles.discardButtonText}>Discard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveButtonBottom}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonTextBottom}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
    paddingHorizontal: 20,
    paddingTop: 45,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  placeholder: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  profilePhotoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
    paddingBottom: 24,
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
    color: '#111',
    marginBottom: 12,
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
    color: '#666',
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 30,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  discardButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  discardButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
  saveButtonBottom: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonTextBottom: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default EditProfileScreen;
