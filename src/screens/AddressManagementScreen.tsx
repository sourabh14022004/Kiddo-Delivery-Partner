import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../config/theme';

interface AddressManagementScreenProps {
  onBack: () => void;
}

const AddressManagementScreen: React.FC<AddressManagementScreenProps> = ({ onBack }) => {
  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Address Management</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.contentContainer}>
          <Text style={styles.sectionTitle}>Saved Addresses</Text>
          <Text style={styles.placeholderText}>
            Address management functionality coming soon...
          </Text>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textLight,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 14,
    color: theme.colors.textLight,
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 40,
  },
});

export default AddressManagementScreen;

