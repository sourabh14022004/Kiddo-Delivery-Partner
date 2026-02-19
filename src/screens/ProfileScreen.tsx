import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { theme } from "../config/theme";
import { useAppContext } from "../context/AppContext";
import { RootStackParamList } from "../navigation/RootNavigator";

type ProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ProfileScreen: React.FC = () => {
  const { phoneNumber, pickerDetails, onLogout } = useAppContext();
  const navigation = useNavigation<ProfileScreenNavigationProp>();

  const userName = pickerDetails?.fullName || "Delivery Partner";
  const userPhone = phoneNumber || "No phone number";

  const [imageError, setImageError] = useState(false);

  // Reset error when photo changes
  useEffect(() => {
    setImageError(false);
  }, [pickerDetails?.profilePhoto]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={[]}>
        {/* HEADER - Fixed */}
        <View style={styles.header} />

        {/* PROFILE CARD - Fixed */}
        <View style={styles.profileSection}>
          {pickerDetails?.profilePhoto && !imageError ? (
            <Image
              source={{ uri: pickerDetails.profilePhoto }}
              style={styles.profileImage}
              onError={(e) => {
                console.log('Profile image load error:', e.nativeEvent.error);
                setImageError(true);
              }}
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
        </View>

        {/* SETTINGS - Fixed */}
        <View style={styles.settingsSection}>
          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="person-outline"
              label="Edit Profile"
              onPress={() => navigation.navigate('EditProfile', { phoneNumber, pickerDetails })}
            />
          </View>

          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="headset-outline"
              label="Help & Support"
              onPress={() => navigation.navigate('HelpSupport')}
            />
          </View>

          <View style={styles.settingsItemContainer}>
            <SettingsItem
              icon="settings-outline"
              label="Setting"
              onPress={() => navigation.navigate('Settings')}
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
      </SafeAreaView>
    </View>
  );
};

/* ---------------- REUSABLE ITEM ---------------- */

const SettingsItem = ({
  icon,
  label,
  onPress,
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
    backgroundColor: "#111",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#111",
  },
  header: {
    backgroundColor: "#111",
    paddingTop: 45,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  profileSection: {
    backgroundColor: "#111",
    borderColor: "black",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomWidth: 2,
    width: "100%",
    alignSelf: "stretch",
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: "#fff",
    marginBottom: 12,
  },
  profileImagePlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  profileImageText: {
    fontSize: 40,
    fontWeight: "700",
    color: "#fff",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  profileEmail: {
    fontSize: 14,
    color: "#B5B5B5",
    marginTop: 4,
  },
  settingsSection: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: 15,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 16,
  },
  settingsItemContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.success,
    marginBottom: 12,
    overflow: "hidden",
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  settingsIcon: {
    marginRight: 14,
  },
  settingsText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#111",
  },
  logoutText: {
    color: "#E53935",
    fontWeight: "600",
  },
});

export default ProfileScreen;
