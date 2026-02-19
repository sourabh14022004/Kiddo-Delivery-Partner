import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../config/theme';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const HelpSupportScreen: React.FC = () => {
  const navigation = useNavigation();
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const faqs: FAQItem[] = [
    {
      id: '1',
      question: 'How do I pick an order?',
      answer: 'On the Home screen, browse available orders and tap "Pick This Order" on any order you want to deliver. Make sure your profile is complete before picking orders.',
    },
    {
      id: '2',
      question: 'Why can\'t I pick orders?',
      answer: 'You need to complete your profile first. Go to Profile → Edit Profile and fill in all required fields including your full name.',
    },
    {
      id: '3',
      question: 'How do I update my profile?',
      answer: 'Go to the Profile tab, tap "Edit Profile", make your changes, and tap "Save" in the top right corner.',
    },
    {
      id: '4',
      question: 'What if I can\'t see any orders?',
      answer: 'Make sure you have a stable internet connection. Pull down on the Home screen to refresh. If no orders appear, there might not be any available orders at the moment.',
    },
    {
      id: '5',
      question: 'How do I track my deliveries?',
      answer: 'Go to the Orders tab to see all your active and completed deliveries. Tap on any order to see detailed information.',
    },
    {
      id: '6',
      question: 'Can I cancel an order after picking it?',
      answer: 'Please contact support immediately if you need to cancel an order. Use the contact options below.',
    },
  ];

  const toggleFAQ = (id: string) => {
    setExpandedFAQ(expandedFAQ === id ? null : id);
  };

  const handleCall = () => {
    Linking.openURL('tel:+911234567890').catch(() => {
      Alert.alert('Error', 'Unable to make phone call');
    });
  };

  const handleEmail = () => {
    Linking.openURL('mailto:support@kiddo.com').catch(() => {
      Alert.alert('Error', 'Unable to open email client');
    });
  };

  const handleWhatsApp = () => {
    Linking.openURL('whatsapp://send?phone=911234567890').catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed');
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Help & Support</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Contact Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>

          <TouchableOpacity style={styles.contactCard} onPress={handleCall}>
            <View style={styles.contactIconContainer}>
              <Ionicons name="call" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Call Us</Text>
              <Text style={styles.contactSubtitle}>+91 123 456 7890</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleWhatsApp}>
            <View style={styles.contactIconContainer}>
              <Ionicons name="logo-whatsapp" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>WhatsApp</Text>
              <Text style={styles.contactSubtitle}>Chat with us</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactCard} onPress={handleEmail}>
            <View style={styles.contactIconContainer}>
              <Ionicons name="mail" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>Email</Text>
              <Text style={styles.contactSubtitle}>support@kiddo.com</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </View>

        {/* FAQs Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

          {faqs.map((faq) => (
            <TouchableOpacity
              key={faq.id}
              style={styles.faqCard}
              onPress={() => toggleFAQ(faq.id)}
              activeOpacity={0.7}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Ionicons
                  name={expandedFAQ === faq.id ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="rgba(255,255,255,0.5)"
                />
              </View>
              {expandedFAQ === faq.id && (
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Common Issues Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Common Issues</Text>

          <View style={styles.issueCard}>
            <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
            <View style={styles.issueContent}>
              <Text style={styles.issueTitle}>Login Issues</Text>
              <Text style={styles.issueText}>
                Make sure you're entering the correct phone number and OTP. Check your network connection.
              </Text>
            </View>
          </View>

          <View style={styles.issueCard}>
            <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
            <View style={styles.issueContent}>
              <Text style={styles.issueTitle}>Orders Not Loading</Text>
              <Text style={styles.issueText}>
                Pull down to refresh the orders list. Ensure you have a stable internet connection.
              </Text>
            </View>
          </View>

          <View style={styles.issueCard}>
            <Ionicons name="alert-circle" size={20} color={theme.colors.warning} />
            <View style={styles.issueContent}>
              <Text style={styles.issueTitle}>Profile Update Failed</Text>
              <Text style={styles.issueText}>
                Check your internet connection and try again. Make sure all required fields are filled.
              </Text>
            </View>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Kiddo Delivery Partner</Text>
          <Text style={styles.appInfoText}>Version 1.0.0</Text>
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
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 45,
    bottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textLight,
    marginBottom: 16,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  contactIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(76,175,80,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textLight,
    marginBottom: 2,
  },
  contactSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  faqCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textLight,
    marginRight: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 12,
    lineHeight: 20,
  },
  issueCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  issueContent: {
    flex: 1,
    marginLeft: 12,
  },
  issueTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  issueText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 18,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  appInfoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
});

export default HelpSupportScreen;
