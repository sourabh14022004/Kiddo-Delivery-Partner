import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PickerDetails } from './PickerDetailsScreen';
import { theme } from '../config/theme';

interface ProfileScreenProps {
  phoneNumber?: string;
  pickerDetails?: PickerDetails | null;
  onLogout?: () => void;
  onNavigateToEditProfile?: () => void;
  onNavigateToHelpSupport?: () => void;
  onNavigateToSettings?: () => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({
  phoneNumber,
  pickerDetails,
  onLogout,
  onNavigateToEditProfile,
  onNavigateToHelpSupport,
  onNavigateToSettings,
}) => {
  const userName = pickerDetails?.fullName || 'Delivery Partner';
  const userPhone = phoneNumber || 'No phone number';

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* HEADER - Fixed */}
      <View style={styles.header} />

      {/* PROFILE CARD - Fixed */}
      <View style={styles.profileSection}>
        {pickerDetails?.profilePhoto ? (
          <Image
            source={{ uri: pickerDetails.profilePhoto }}
            style={styles.profileImage}
          />
        ) : (
          <View style={styles.profileImagePlaceholder}>
            <Text style={styles.profileImageText}>
              {userName[0]?.toUpperCase()}
            </Text>
          </View>
        )}

        <Text style={styles.profileName}>{userName}</Text>
        <Text style={styles.profileEmail}>{userPhone}</Text>

        {/* QUICK ACTIONS */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionButton}>
            <Ionicons
              name="notifications-outline"
              size={22}
              color="#fff"
            />
            <Text style={styles.quickActionText}>Notification</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionButton}>
            <Ionicons name="gift-outline" size={22} color="#fff" />
            <Text style={styles.quickActionText}>Voucher</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionButton}>
            <Ionicons name="time-outline" size={22} color="#fff" />
            <Text style={styles.quickActionText}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SETTINGS - Scrollable */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingsSection}>
          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="person-outline"
              label="Edit Profile"
              onPress={onNavigateToEditProfile}
            />
          </View>
          
          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="headset-outline"
              label="Help & Support"
              onPress={onNavigateToHelpSupport}
            />
          </View>
          
          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="settings-outline"
              label="Setting"
              onPress={onNavigateToSettings}
            />
          </View>

          <View style={styles.settingsItemContainer}>
            <TouchableOpacity style={styles.settingsItem} onPress={onLogout}>
              <Ionicons
                name="log-out-outline"
                size={22}
                color="#E53935"
                style={styles.settingsIcon}
              />
              <Text style={[styles.settingsText, styles.logoutText]}>
                Log out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

/* ---------------- REUSABLE ITEM ---------------- */

const SettingsItem = ({ 
  icon, 
  label, 
  onPress 
}: { 
  icon: any; 
  label: string; 
  onPress?: () => void;
}) => (
  <TouchableOpacity style={styles.settingsItem} onPress={onPress}>
    <Ionicons
      name={icon}
      size={22}
      color={theme.colors.success}
      style={styles.settingsIcon}
    />
    <Text style={styles.settingsText}>{label}</Text>
    <Ionicons name="chevron-forward" size={20} color={theme.colors.success} />
  </TouchableOpacity>
);

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  header: {
    backgroundColor: '#111',
    paddingHorizontal: 20,
    paddingTop: 45,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    paddingTop: 8,
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileSection: {
    backgroundColor: '#111',
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.success,
  },

  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 12,
  },

  profileImagePlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#2B2B2B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  profileImageText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },

  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },

  profileEmail: {
    fontSize: 14,
    color: '#B5B5B5',
    marginTop: 4,
  },

  quickActions: {
    flexDirection: 'row',
    marginTop: 24,
    paddingHorizontal: 16,
    gap: 12,
  },

  quickActionButton: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.success,
  },

  quickActionText: {
    fontSize: 12,
    color: '#EAEAEA',
    marginTop: 6,
    fontWeight: '600',
  },

  settingsSection: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 15,
    paddingTop: 12,
    paddingBottom: 30,
    paddingHorizontal: 16,
  },

  settingsItemContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.success,
    marginBottom: 12,
    overflow: 'hidden',
  },

  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  settingsIcon: {
    marginRight: 14,
  },

  settingsText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },

  logoutText: {
    color: '#E53935',
    fontWeight: '600',
  },
});

export default ProfileScreen;
