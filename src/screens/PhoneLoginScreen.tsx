import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { sendOTP, verifyOTP } from '../services/otpService';
import { storageService } from '../services/storageService';
import { updateLastLogin } from '../services/firebaseService';

type LoginStep = 'phone' | 'otp';

interface PhoneLoginScreenProps {
  onLoginSuccess?: (phoneNumber: string) => void;
}

const PhoneLoginScreen: React.FC<PhoneLoginScreenProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<LoginStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const otpInputRefs = useRef<(TextInput | null)[]>([]);
  const phoneInputRef = useRef<TextInput | null>(null);
  const [rawPhoneNumber, setRawPhoneNumber] = useState(''); // Store raw digits only
  const previousDigitsRef = useRef('');
  const keyboardHeight = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  // Format phone number for display
  const formatPhoneNumber = (digits: string) => {
    if (digits.length === 0) {
      return '';
    }
    
    if (digits.length <= 5) {
      return `+91 ${digits}`;
    } else {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
  };

  const handlePhoneChange = (text: string) => {
    // Extract only digits from the input
    const digitsOnly = text.replace(/\D/g, '');
    
    // Limit to 10 digits
    const limitedDigits = digitsOnly.slice(0, 10);
    
    // Only update if digits actually changed (prevents unnecessary re-renders)
    if (limitedDigits === previousDigitsRef.current) {
      return;
    }
    
    previousDigitsRef.current = limitedDigits;
    
    // Store raw digits
    setRawPhoneNumber(limitedDigits);
    
    // Format for display
    const formatted = formatPhoneNumber(limitedDigits);
    setPhoneNumber(formatted);
  };

  const handleSendOTP = async () => {
    // Validate phone number (should have 10 digits)
    if (!rawPhoneNumber || rawPhoneNumber.length !== 10) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit phone number');
      return;
    }

    console.log('Sending OTP - rawPhoneNumber:', rawPhoneNumber);
    setLoading(true);
    // Send only the 10-digit phone number (not the formatted one with +91)
    const response = await sendOTP(rawPhoneNumber);
    setLoading(false);

    if (response.success) {
      setStep('otp');
      // Start resend timer (60 seconds)
      setResendTimer(60);
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Show detailed error message
      const errorMessage = response.error || 'Failed to send OTP. Please try again.';
      console.error('OTP Send Error:', errorMessage);
      Alert.alert('Error', errorMessage, [
        { text: 'OK' },
        { text: 'Check Console', onPress: () => console.log('Check console for details') },
      ]);
    }
  };

  const handleOTPChange = (text: string, index: number) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '');
    
    if (cleaned.length > 1) {
      // Handle paste
      const pastedOTP = cleaned.slice(0, 6).split('');
      const newOtp = [...otp];
      pastedOTP.forEach((digit, i) => {
        if (index + i < 6) {
          newOtp[index + i] = digit;
        }
      });
      setOtp(newOtp);
      
      // Focus on the last filled input or next empty
      const nextIndex = Math.min(index + pastedOTP.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
    } else {
      const newOtp = [...otp];
      newOtp[index] = cleaned;
      setOtp(newOtp);

      // Auto-focus next input
      if (cleaned && index < 5) {
        otpInputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleOTPKeyPress = (e: any, index: number) => {
    // Handle backspace
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOTP = useCallback(async () => {
    const otpString = otp.join('');
    
    if (otpString.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the complete 6-digit OTP');
      return;
    }

    // Prevent multiple verification attempts
    if (loading) {
      return;
    }

    setLoading(true);
    // Dismiss keyboard before verification
    Keyboard.dismiss();
    
    // Verify with the raw 10-digit phone number
    const response = await verifyOTP(rawPhoneNumber, otpString);
    setLoading(false);

    if (response.success) {
      // Navigate to home screen
      const formattedPhone = phoneNumber || `+91 ${rawPhoneNumber}`;
      
      // Save auth token if available
      if (response.token) {
        await storageService.saveAuthToken(response.token);
      }
      
      // Update last login in Firebase (non-blocking)
      updateLastLogin(formattedPhone).catch((error) => {
        console.warn('Failed to update last login in Firebase:', error);
      });
      
      // Call the onLoginSuccess callback
      if (onLoginSuccess) {
        onLoginSuccess(formattedPhone);
      }
      
      console.log('Login successful, token:', response.token);
    } else {
      Alert.alert('Error', response.error || 'Invalid OTP. Please try again.');
      // Clear OTP inputs
      setOtp(['', '', '', '', '', '']);
      // Small delay before refocusing
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    }
  }, [otp, loading, rawPhoneNumber, phoneNumber, onLoginSuccess]);

  // Auto-verify OTP when all 6 digits are entered
  useEffect(() => {
    const otpString = otp.join('');
    if (otpString.length === 6 && step === 'otp' && !loading) {
      // Small delay to ensure the last digit is properly set and provide smooth UX
      const verifyTimer = setTimeout(() => {
        handleVerifyOTP();
      }, 300); // 300ms delay for better UX

      return () => clearTimeout(verifyTimer);
    }
  }, [otp.join(''), step, loading, handleVerifyOTP]);

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    
    setLoading(true);
    // Resend OTP with the raw 10-digit phone number
    const response = await sendOTP(rawPhoneNumber);
    setLoading(false);

    if (response.success) {
      setResendTimer(60);
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      Alert.alert('Success', 'OTP resent successfully');
    } else {
      Alert.alert('Error', response.error || 'Failed to resend OTP');
    }
  };

  // Handle keyboard show/hide with smooth animation
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const keyboardWillShow = Keyboard.addListener(showEvent, (event) => {
      const keyboardHeightValue = event.endCoordinates.height;
      const duration = Platform.OS === 'ios' ? (event.duration || 300) : 300;
      
      Animated.parallel([
        Animated.timing(keyboardHeight, {
          toValue: keyboardHeightValue,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(contentTranslateY, {
          toValue: -Math.min(keyboardHeightValue * 0.05, 20), // Move content up very slightly, max 20px
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    });

    const keyboardWillHide = Keyboard.addListener(hideEvent, (event) => {
      const duration = Platform.OS === 'ios' ? (event.duration || 300) : 300;
      
      Animated.parallel([
        Animated.timing(keyboardHeight, {
          toValue: 0,
          duration,
          useNativeDriver: false,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <Animated.View
        style={[
          styles.animatedContainer,
          {
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardDismissMode="interactive"
        >
          <View style={styles.content}>
          {/* Logo/Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Kiddo Delivery</Text>
            <Text style={styles.subtitle}>
              {step === 'phone' ? 'Enter your phone number' : 'Enter OTP'}
            </Text>
          </View>

          {step === 'phone' ? (
            <View style={styles.phoneContainer}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.phoneInputWrapper}>
                  <Text style={styles.phonePrefix}>+91</Text>
                  <TextInput
                    ref={phoneInputRef}
                    style={styles.phoneInput}
                    placeholder="12345 67890"
                    placeholderTextColor="#9CA3AF"
                    value={
                      rawPhoneNumber.length === 0
                        ? ''
                        : rawPhoneNumber.length <= 5
                        ? rawPhoneNumber
                        : `${rawPhoneNumber.slice(0, 5)} ${rawPhoneNumber.slice(5)}`
                    }
                    onChangeText={(text) => {
                      // Extract only digits
                      const digitsOnly = text.replace(/\D/g, '').slice(0, 10);
                      
                      // Always update to ensure state is in sync
                      setRawPhoneNumber(digitsOnly);
                      const formatted = formatPhoneNumber(digitsOnly);
                      setPhoneNumber(formatted);
                      previousDigitsRef.current = digitsOnly;
                    }}
                    keyboardType="phone-pad"
                    maxLength={12} // 12345 67890 (with space)
                    autoFocus
                    returnKeyType="done"
                    textContentType="telephoneNumber"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.button, loading ? styles.buttonDisabled : null]}
                onPress={handleSendOTP}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send OTP</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.otpContainer}>
              <Text style={styles.otpLabel}>Enter the 6-digit OTP sent to</Text>
              <Text style={styles.phoneDisplay}>{phoneNumber}</Text>

              <View style={styles.otpInputContainer}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => {
                      otpInputRefs.current[index] = ref;
                    }}
                    style={[
                      styles.otpInput,
                      digit ? styles.otpInputFilled : null,
                      loading ? styles.otpInputVerifying : null,
                    ]}
                    value={digit}
                    onChangeText={(text) => handleOTPChange(text, index)}
                    onKeyPress={(e) => handleOTPKeyPress(e, index)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    editable={!loading}
                  />
                ))}
              </View>

              {loading ? (
                <View style={[styles.button, styles.buttonDisabled]}>
                  <ActivityIndicator color="#fff" />
                  <Text style={[styles.buttonText, { marginLeft: 8 }]}>Verifying...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.button, otp.join('').length === 6 ? null : styles.buttonDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={otp.join('').length !== 6}
                >
                  <Text style={styles.buttonText}>Verify OTP</Text>
                </TouchableOpacity>
              )}

              <View style={styles.resendContainer}>
                <Text style={styles.resendText}>Didn't receive OTP? </Text>
                <TouchableOpacity
                  onPress={handleResendOTP}
                  disabled={resendTimer > 0 || loading}
                >
                  <Text
                    style={[
                      styles.resendLink,
                      (resendTimer > 0 || loading) ? styles.resendLinkDisabled : null,
                    ]}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.changeNumberButton}
                onPress={() => {
                  setStep('phone');
                  setOtp(['', '', '', '', '', '']);
                  setResendTimer(0);
                  setRawPhoneNumber('');
                  setPhoneNumber('');
                }}
              >
                <Text style={styles.changeNumberText}>Change Phone Number</Text>
              </TouchableOpacity>
            </View>
          )}
          </View>
        </ScrollView>
      </Animated.View>
      
      {/* Animated spacer for keyboard */}
      <Animated.View
        style={[
          styles.keyboardSpacer,
          {
            height: keyboardHeight,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  animatedContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
    paddingTop: 40, // Extra padding at top for future image
  },
  keyboardSpacer: {
    width: '100%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  phoneContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  phonePrefix: {
    paddingLeft: 16,
    paddingRight: 8,
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
    padding: 16,
    paddingLeft: 8,
    fontSize: 16,
    backgroundColor: 'transparent',
    color: '#000',
  },
  button: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  otpContainer: {
    width: '100%',
  },
  otpLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  phoneDisplay: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 32,
  },
  otpInputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: '#000',
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    backgroundColor: '#fff',
    color: '#000',
  },
  otpInputFilled: {
    borderColor: '#22C55E',
    backgroundColor: '#fff',
  },
  otpInputVerifying: {
    opacity: 0.6,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  resendText: {
    fontSize: 14,
    color: '#666',
  },
  resendLink: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '600',
  },
  resendLinkDisabled: {
    color: '#999',
  },
  changeNumberButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  changeNumberText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
});

export default PhoneLoginScreen;

