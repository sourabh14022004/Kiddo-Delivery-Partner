import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { theme } from "../config/theme";
import { storageService } from "../services/storageService";
import Constants from "expo-constants";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const APP_NAME = Constants.expoConfig?.name ?? "Kiddo Delivery Partner";

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    storageService.getNotificationsEnabled().then(setNotificationsEnabled);
  }, []);

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await storageService.setNotificationsEnabled(value);
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear order cache",
      "This will clear cached order data. Orders will load fresh from the server next time. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await storageService.clearCachedOrders();
            Alert.alert("Done", "Order cache cleared.");
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* Header - title centered */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Settings
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>App Settings</Text>

        <View style={styles.settingsCard}>
          <View style={styles.settingRow}>
            <Ionicons
              name="notifications-outline"
              size={22}
              color={theme.colors.success}
              style={styles.settingIcon}
            />
            <Text style={styles.settingLabel}>Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: "#ccc", true: theme.colors.success }}
              thumbColor="#fff"
              style={
                Platform.OS === "android"
                  ? { transform: [{ scaleX: 1.2 }, { scaleY: 1.2 }] }
                  : undefined
              }
            />
          </View>
          <View style={styles.rowDivider} />
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleClearCache}
            activeOpacity={0.7}
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color={theme.colors.success}
              style={styles.settingIcon}
            />
            <Text style={styles.settingLabel}>Clear order cache</Text>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={theme.colors.success}
            />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, styles.aboutSectionTitle]}>
          About
        </Text>
        <View style={styles.settingsCard}>
          <View style={[styles.settingRow, styles.aboutRow]}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color={theme.colors.success}
              style={styles.settingIcon}
            />
            <View style={styles.aboutContent}>
              <Text style={styles.aboutAppName}>{APP_NAME}</Text>
              <Text style={styles.versionText}>Version {APP_VERSION}</Text>
            </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E5E5",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textLight,
    marginBottom: 16,
    marginLeft: 4,
  },
  aboutSectionTitle: {
    marginTop: 28,
  },
  settingsCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#fff",
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginLeft: 50,
  },
  aboutRow: {
    paddingVertical: 16,
  },
  aboutContent: {
    flex: 1,
  },
  aboutAppName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  versionText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
});

export default SettingsScreen;
