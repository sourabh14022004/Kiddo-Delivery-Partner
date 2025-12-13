import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../config/theme';

interface DeliverySuccessScreenProps {
  onContinue: () => void;
}

const DeliverySuccessScreen: React.FC<DeliverySuccessScreenProps> = ({
  onContinue,
}) => {
  // Progress stages - all completed for success screen
  const progressStages = [
    { icon: '📄', label: 'Order Placed', completed: true },
    { icon: '👨‍🍳', label: 'Preparing', completed: true },
    { icon: '🚴', label: 'Out for Delivery', completed: true },
    { icon: '✓', label: 'Delivered', completed: true },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery Complete</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Map Section */}
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            {/* Map background - light gray/white to contrast with dark theme */}
            <View style={styles.mapContent}>
              {/* Route line */}
              <View style={styles.routeLine} />
              
              {/* Origin marker (warehouse) */}
              <View style={[styles.marker, styles.originMarker]}>
                <Text style={styles.markerIcon}>🏠</Text>
              </View>
              
              {/* Destination marker (customer) */}
              <View style={[styles.marker, styles.destinationMarker]}>
                <Text style={styles.markerIcon}>📍</Text>
              </View>
              
              {/* Success checkmark overlay */}
              <View style={styles.successOverlay}>
                <View style={styles.successBadge}>
                  <Text style={styles.successCheckmark}>✓</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Delivery Status Card */}
        <View style={styles.statusCard}>
          <Text style={styles.deliveryTime}>
            Order successfully delivered!
          </Text>
          <Text style={styles.statusMessage}>
            Your order has been delivered to the customer.
          </Text>
        </View>

        {/* Progress Tracker */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTracker}>
            {progressStages.map((stage, index) => (
              <React.Fragment key={index}>
                <View style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressIcon,
                      stage.completed && styles.progressIconCompleted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.progressIconText,
                        stage.completed && styles.progressIconTextCompleted,
                      ]}
                    >
                      {stage.icon}
                    </Text>
                  </View>
                </View>
                {index < progressStages.length - 1 && (
                  <View
                    style={[
                      styles.progressConnector,
                      stage.completed && styles.progressConnectorCompleted,
                    ]}
                  />
                )}
              </React.Fragment>
            ))}
          </View>
          <View style={styles.progressLabels}>
            {progressStages.map((stage, index) => (
              <Text
                key={index}
                style={[
                  styles.progressLabel,
                  stage.completed && styles.progressLabelCompleted,
                ]}
              >
                {stage.label}
              </Text>
            ))}
          </View>
        </View>

        {/* Continue Button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={onContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.backgroundDark,
  },
  headerTitle: {
    ...theme.typography.h2,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  mapContainer: {
    height: 300,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundLight,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E8E8E8',
  },
  mapContent: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F5F5F5',
  },
  routeLine: {
    position: 'absolute',
    left: '20%',
    top: '30%',
    width: '60%',
    height: 4,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: '25deg' }],
  },
  marker: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.textLight,
  },
  originMarker: {
    left: '15%',
    top: '25%',
  },
  destinationMarker: {
    right: '15%',
    bottom: '25%',
  },
  markerIcon: {
    fontSize: 20,
  },
  successOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
  },
  successBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: theme.colors.textLight,
  },
  successCheckmark: {
    color: theme.colors.textLight,
    fontSize: 32,
    fontWeight: 'bold',
  },
  statusCard: {
    backgroundColor: theme.colors.backgroundDark,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  deliveryTime: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    marginBottom: theme.spacing.sm,
  },
  statusMessage: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    opacity: 0.8,
  },
  progressContainer: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  progressTracker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  progressItem: {
    alignItems: 'center',
    zIndex: 2,
  },
  progressIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333333',
  },
  progressIconCompleted: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  progressIconText: {
    fontSize: 20,
    opacity: 0.5,
  },
  progressIconTextCompleted: {
    opacity: 1,
  },
  progressConnector: {
    flex: 1,
    height: 2,
    backgroundColor: '#333333',
    marginHorizontal: theme.spacing.xs,
    marginTop: -24,
  },
  progressConnectorCompleted: {
    backgroundColor: theme.colors.success,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  progressLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.5,
    textAlign: 'center',
    flex: 1,
  },
  progressLabelCompleted: {
    opacity: 1,
    color: theme.colors.success,
  },
  continueButton: {
    backgroundColor: theme.colors.success,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  continueButtonText: {
    ...theme.typography.button,
    color: theme.colors.textLight,
    fontSize: 18,
  },
});

export default DeliverySuccessScreen;
