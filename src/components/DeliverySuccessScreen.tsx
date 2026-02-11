import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../config/theme';

interface DeliverySuccessScreenProps {
  onContinue: () => void;
}

const DeliverySuccessScreen: React.FC<DeliverySuccessScreenProps> = ({
  onContinue,
}) => {
  // Animation values
  const circleScale = useRef(new Animated.Value(0)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const ring1Scale = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0)).current;
  const ring3Scale = useRef(new Animated.Value(0)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Animate rings first (glow effect)
    Animated.parallel([
      Animated.timing(ring1Scale, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(ring2Scale, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(ring3Scale, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(ringOpacity, {
        toValue: 0.4,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate circle appearance with bounce
    Animated.sequence([
      Animated.parallel([
        Animated.spring(circleScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(circleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Animate checkmark with bounce
      Animated.spring(checkmarkScale, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      // Animate text content
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Animate button
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      
      {/* Background gradient effects */}
      <View style={styles.backgroundGradientLeft} />
      <View style={styles.backgroundGradientRight} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Delivery Complete</Text>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Success Circle with Glow Effect - Center */}
        <Animated.View 
          style={[
            styles.successCircleContainer,
            {
              opacity: circleOpacity,
            },
          ]}
        >
          {/* Outer glow rings */}
          <Animated.View
            style={[
              styles.glowRing,
              styles.glowRing1,
              {
                opacity: ringOpacity,
                transform: [{ scale: ring1Scale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.glowRing,
              styles.glowRing2,
              {
                opacity: ringOpacity,
                transform: [{ scale: ring2Scale }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.glowRing,
              styles.glowRing3,
              {
                opacity: ringOpacity,
                transform: [{ scale: ring3Scale }],
              },
            ]}
          />
          
          {/* Main success circle */}
          <Animated.View 
            style={[
              styles.successCircle,
              {
                transform: [{ scale: circleScale }],
              },
            ]}
          >
            <LinearGradient
              colors={['#4CAF50', '#45A049', '#3D8F42']}
              style={styles.circleGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Animated.Text 
                style={[
                  styles.successCheckmark,
                  {
                    transform: [{ scale: checkmarkScale }],
                  },
                ]}
              >
                ✓
              </Animated.Text>
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* Delivery Status Text */}
        <Animated.View 
          style={[
            styles.statusTextContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={styles.deliveryTime}>
            Order successfully delivered!
          </Text>
          <Text style={styles.statusMessage}>
            Your order has been delivered to the customer.
          </Text>
        </Animated.View>

        {/* Continue Button */}
        <Animated.View
          style={{
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          }}
        >
          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinue}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#4CAF50', '#45A049']}
              style={styles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundGradientLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 100,
    height: '100%',
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  backgroundGradientRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 100,
    height: '100%',
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    ...theme.typography.h2,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 28,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
  successCircleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    position: 'relative',
    width: 240,
    height: 240,
    alignSelf: 'center',
  },
  glowRing: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
  },
  glowRing1: {
    width: 160,
    height: 160,
    top: 40,
    left: 40,
  },
  glowRing2: {
    width: 200,
    height: 200,
    top: 20,
    left: 20,
  },
  glowRing3: {
    width: 240,
    height: 240,
    top: 0,
    left: 0,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
    position: 'absolute',
    top: 60,
    left: 60,
    zIndex: 10,
  },
  circleGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successCheckmark: {
    color: '#FFFFFF',
    fontSize: 72,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statusTextContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  deliveryTime: {
    ...theme.typography.h2,
    color: '#FFFFFF',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 24,
    letterSpacing: 0.3,
  },
  statusMessage: {
    ...theme.typography.body,
    color: '#FFFFFF',
    opacity: 0.8,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: theme.spacing.xl,
  },
  continueButton: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonGradient: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  continueButtonText: {
    ...theme.typography.button,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

export default DeliverySuccessScreen;
