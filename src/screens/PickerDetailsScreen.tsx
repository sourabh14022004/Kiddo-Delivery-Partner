import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { saveUserDetails } from '../services/firebaseService';

interface PickerDetailsScreenProps {
  phoneNumber: string;
  onSubmit: (details: PickerDetails) => void;
}

export interface PickerDetails {
  fullName: string;
  phoneNumber: string;
  age?: string;
  gender?: string;
  profilePhoto?: string;
}

const PickerDetailsScreen: React.FC<PickerDetailsScreenProps> = ({
  phoneNumber,
  onSubmit,
}) => {
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<string>('');
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Please enter your full name');
      return;
    }

    const details: PickerDetails = {
      fullName: fullName.trim(),
      phoneNumber,
      ...(age.trim() && { age: age.trim() }),
      ...(gender && { gender }),
      ...(profilePhoto && { profilePhoto }),
    };

    setLoading(true);
    
    try {
      // Save to Firebase
      const result = await saveUserDetails(phoneNumber, details);
      
      if (result.success) {
        // Successfully saved to Firebase, proceed with submission
        onSubmit(details);
      } else {
        // Firebase save failed, but still proceed (offline support)
        console.warn('Firebase save failed, but proceeding:', result.error);
        Alert.alert(
          'Warning',
          'Failed to save to server, but your data will be saved locally. Please check your internet connection.',
          [
            {
              text: 'Continue',
              onPress: () => onSubmit(details),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('Error in handleSubmit:', error);
      // Even if Firebase fails, allow user to continue
      Alert.alert(
        'Warning',
        'Failed to save to server, but your data will be saved locally.',
        [
          {
            text: 'Continue',
            onPress: () => onSubmit(details),
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>
            Please fill in your details to continue
          </Text>
        </View>

        {/* Profile Photo Upload */}
        <View style={styles.section}>
          <Text style={styles.label}>Profile Photo (Optional)</Text>
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={pickImage}
            activeOpacity={0.7}
          >
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.profileImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderText}>📷</Text>
                <Text style={styles.photoPlaceholderLabel}>Tap to upload</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

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

        {/* Phone Number (Pre-filled) */}
        <View style={styles.section}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, styles.disabledInput]}
            value={phoneNumber}
            editable={false}
            placeholderTextColor="#999"
          />
        </View>

        {/* Age (Optional) */}
        <View style={styles.section}>
          <Text style={styles.label}>Age (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your age"
            placeholderTextColor="#999"
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>

        {/* Gender (Optional) */}
        <View style={styles.section}>
          <Text style={styles.label}>Gender (Optional)</Text>
          <View style={styles.genderContainer}>
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'Male' && styles.genderButtonActive,
              ]}
              onPress={() => setGender('Male')}
            >
              <Text
                style={[
                  styles.genderButtonText,
                  gender === 'Male' && styles.genderButtonTextActive,
                ]}
              >
                Male
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'Female' && styles.genderButtonActive,
              ]}
              onPress={() => setGender('Female')}
            >
              <Text
                style={[
                  styles.genderButtonText,
                  gender === 'Female' && styles.genderButtonTextActive,
                ]}
              >
                Female
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.genderButton,
                gender === 'Other' && styles.genderButtonActive,
              ]}
              onPress={() => setGender('Other')}
            >
              <Text
                style={[
                  styles.genderButtonText,
                  gender === 'Other' && styles.genderButtonTextActive,
                ]}
              >
                Other
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading ? styles.submitButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF3B30',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#666',
  },
  photoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  photoPlaceholderText: {
    fontSize: 40,
    marginBottom: 8,
  },
  photoPlaceholderLabel: {
    fontSize: 12,
    color: '#666',
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  genderButtonActive: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  genderButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  genderButtonTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PickerDetailsScreen;

