import {
  BASE_URL,
  OTP_API_BASE_URL,
  OTP_API_KEY,
  OTP_CLIENT_ID,
  OTP_SENDER_ID,
  OTP_MESSAGE_TEMPLATE,
} from '../config/config';

export interface SendOTPResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface VerifyOTPResponse {
  success: boolean;
  message?: string;
  error?: string;
  token?: string;
}

// Temporary in-memory storage for OTP (for development/testing only)
// In production, OTP should be verified on the backend
interface StoredOTP {
  phoneNumber: string;
  otp: string;
  timestamp: number;
  expiresAt: number;
}

const otpStorage: Map<string, StoredOTP> = new Map();
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Clear OTP storage for a phone number (called after successful login)
 */
export const clearOTPStorage = (phoneNumber: string): void => {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length === 10) {
    otpStorage.delete(cleanPhone);
    console.log('✅ OTP storage cleared for:', cleanPhone);
  }
};

/**
 * Send OTP to the given phone number
 */
export const sendOTP = async (phoneNumber: string): Promise<SendOTPResponse> => {
  try {
    // Clean phone number (remove spaces, dashes, etc.) - should be 10 digits
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    console.log('sendOTP received phoneNumber:', phoneNumber);
    console.log('sendOTP cleaned phone:', cleanPhone);
    console.log('sendOTP phone length:', cleanPhone.length);

    // Validate phone number length
    if (!cleanPhone || cleanPhone.length !== 10) {
      console.error('Invalid phone number length:', cleanPhone.length, 'Phone:', cleanPhone);
      return {
        success: false,
        error: `Phone number must be exactly 10 digits. Received: ${cleanPhone.length} digits`,
      };
    }

    // Format phone number with country code for SMS API (91XXXXXXXXXX)
    const phoneWithCountryCode = `91${cleanPhone}`;

    // Try backend API first, then fallback to direct SMS API
    let apiUrl = `${BASE_URL}/auth/send-otp`; // Backend API endpoint
    let requestBody: any = {
      phoneNumber: phoneWithCountryCode,
    };

    // If backend is not available, use direct SMS API
    // NOTE: If you're getting "Invalid ApiCredentials" error, try:
    // 1. Verify your API credentials in the config file
    // 2. Check if your SMS provider account is active
    // 3. Set useDirectSMS to false to use backend API instead (recommended)
    const useDirectSMS = true; // Set to false to use backend API (more secure)

    if (useDirectSMS) {
      // Generate a 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP temporarily for client-side verification (development only)
      const now = Date.now();
      otpStorage.set(cleanPhone, {
        phoneNumber: cleanPhone,
        otp: otp,
        timestamp: now,
        expiresAt: now + OTP_EXPIRY_TIME,
      });
      console.log('📱 OTP generated and stored (for testing):', otp);
      console.log('💡 Note: In production, OTP should be verified on backend');

      // Replace {otp} placeholder in message template
      const message = OTP_MESSAGE_TEMPLATE.replace('{otp}', otp);

      // Try credentials in both query parameters AND body (some APIs require both)
      const queryParams = new URLSearchParams({
        ApiKey: OTP_API_KEY,
        ClientId: OTP_CLIENT_ID,
      });

      apiUrl = `${OTP_API_BASE_URL}/SendSMS?${queryParams.toString()}`;

      // Request body with credentials and message details
      requestBody = {
        ApiKey: OTP_API_KEY,
        ClientId: OTP_CLIENT_ID,
        MobileNumbers: phoneWithCountryCode, // Format: 91XXXXXXXXXX
        Message: message,
        SenderId: OTP_SENDER_ID,
      };

      console.log('Sending OTP to:', phoneWithCountryCode);
      console.log('API URL:', apiUrl);
      console.log('Request Body:', JSON.stringify(requestBody, null, 2));

      // Try credentials in headers as well (some APIs require all three)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'ApiKey': OTP_API_KEY,
        'ClientId': OTP_CLIENT_ID,
      };

      console.log('Request Headers:', JSON.stringify(headers, null, 2));
      console.log('API Key (first 10 chars):', OTP_API_KEY.substring(0, 10) + '...');
      console.log('Client ID:', OTP_CLIENT_ID);

      // Try to send SMS, but don't fail if network is unavailable
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody),
        });

        console.log('OTP API Response Status:', response.status);
        console.log('OTP API Response Headers:', JSON.stringify([...response.headers.entries()]));

        let data: any;
        let textResponse: string = '';

        try {
          textResponse = await response.text();
          console.log('OTP API Response Text (raw):', textResponse);

          // Try to parse as JSON
          if (textResponse) {
            try {
              data = JSON.parse(textResponse);
              console.log('OTP API Response Data (parsed):', JSON.stringify(data, null, 2));
            } catch (parseError) {
              console.log('Response is not JSON, treating as text');
              data = { message: textResponse };
            }
          }
        } catch (error) {
          console.error('Error reading response:', error);
        }

        // Check response status
        if (response.ok || response.status === 200) {
          // Check various success indicators
          const isSuccess =
            data?.success === true ||
            data?.status === 'success' ||
            data?.Status === 'success' ||
            data?.StatusCode === '200' ||
            data?.statusCode === 200 ||
            (data?.message && !data?.error) ||
            textResponse.toLowerCase().includes('success') ||
            textResponse.toLowerCase().includes('sent');

          if (isSuccess) {
            console.log('✅ OTP sent successfully via SMS!');
            return {
              success: true,
              message: 'OTP sent successfully to your phone',
            };
          } else {
            console.warn('⚠️ SMS API returned non-success response, but OTP is available locally');
          }
        } else {
          console.warn('⚠️ SMS API returned error status, but OTP is available locally');
        }
      } catch (networkError: any) {
        console.warn('⚠️ Network error sending SMS (this is normal on simulator):', networkError.message);
        console.log('📱 OTP is still available for local verification');
      }

      // Even if SMS fails, OTP was generated and stored locally
      // This allows the app to work on simulators and in development
      console.log('✅ OTP generated successfully (available for verification)');
      return {
        success: true,
        message: 'OTP generated successfully. Check console for OTP (development mode)',
      };
    }

    console.log('Sending OTP to:', phoneWithCountryCode);
    console.log('API URL:', apiUrl);
    console.log('Request Body:', JSON.stringify(requestBody, null, 2));

    // Try credentials in headers as well (some APIs require all three)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    console.log('Request Headers:', JSON.stringify(headers, null, 2));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
    });

    console.log('OTP API Response Status:', response.status);
    console.log('OTP API Response Headers:', JSON.stringify([...response.headers.entries()]));

    let data: any;
    let textResponse: string = '';

    try {
      textResponse = await response.text();
      console.log('OTP API Response Text (raw):', textResponse);

      // Try to parse as JSON
      if (textResponse) {
        try {
          data = JSON.parse(textResponse);
          console.log('OTP API Response Data (parsed):', JSON.stringify(data, null, 2));
        } catch (parseError) {
          console.log('Response is not JSON, treating as text');
          data = { message: textResponse };
        }
      }
    } catch (error) {
      console.error('Error reading response:', error);
      return {
        success: false,
        error: `Failed to read API response: ${error}`,
      };
    }

    // Check response status
    if (response.ok || response.status === 200) {
      // Check various success indicators
      const isSuccess =
        data?.success === true ||
        data?.status === 'success' ||
        data?.Status === 'success' ||
        data?.StatusCode === '200' ||
        data?.statusCode === 200 ||
        (data?.message && !data?.error) ||
        textResponse.toLowerCase().includes('success') ||
        textResponse.toLowerCase().includes('sent');

      if (isSuccess) {
        console.log('✅ OTP sent successfully!');
        return {
          success: true,
          message: data?.message || data?.Message || 'OTP sent successfully',
        };
      } else {
        const errorMsg = data?.message || data?.Message || data?.error || data?.Error || textResponse || 'Failed to send OTP';
        console.error('❌ OTP send failed:', errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }
    } else {
      const errorMsg = data?.message || data?.Message || data?.error || data?.Error || textResponse || `HTTP ${response.status}: ${response.statusText}`;
      console.error('❌ OTP API Error:', response.status, errorMsg);
      return {
        success: false,
        error: `Failed to send OTP: ${errorMsg}`,
      };
    }
  } catch (error: any) {
    console.error('Error sending OTP:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please try again.',
    };
  }
};

/**
 * Verify OTP
 * Note: This is a placeholder. In a real app, you'd verify with your backend
 */
export const verifyOTP = async (
  phoneNumber: string,
  otp: string
): Promise<VerifyOTPResponse> => {
  try {
    // Clean phone number - should be 10 digits
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    if (cleanPhone.length !== 10) {
      return {
        success: false,
        error: 'Invalid phone number',
      };
    }

    // Format phone number with country code (91XXXXXXXXXX)
    const phoneWithCountryCode = `91${cleanPhone}`;

    console.log('Verifying OTP for:', phoneWithCountryCode);

    // Use backend API for verification (recommended)
    // If backend is not available, fallback to client-side verification (development only)
    const useBackendAPI = false; // Set to true when backend is ready
    const useClientSideVerification = true; // Temporary solution for development

    let apiUrl: string;
    let requestBody: any;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (useBackendAPI) {
      // Use your backend API for OTP verification
      apiUrl = `${BASE_URL}/auth/verify-otp`;
      requestBody = {
        phoneNumber: phoneWithCountryCode,
        otp: otp,
      };
    } else {
      // Try SMS provider's verify endpoint with credentials as query parameters
      const queryParams = new URLSearchParams({
        ApiKey: OTP_API_KEY,
        ClientId: OTP_CLIENT_ID,
      });

      apiUrl = `${OTP_API_BASE_URL}/VerifyOTP?${queryParams.toString()}`;
      requestBody = {
        MobileNumber: phoneWithCountryCode,
        OTP: otp,
      };
    }

    // Try client-side verification first (for development/testing)
    if (useClientSideVerification) {
      const storedOTP = otpStorage.get(cleanPhone);

      if (!storedOTP) {
        console.error('❌ No OTP found for this phone number');
        return {
          success: false,
          error: 'OTP not found. Please request a new OTP.',
        };
      }

      // Check if OTP has expired
      if (Date.now() > storedOTP.expiresAt) {
        otpStorage.delete(cleanPhone);
        console.error('❌ OTP has expired');
        return {
          success: false,
          error: 'OTP has expired. Please request a new OTP.',
        };
      }

      // Verify OTP
      if (storedOTP.otp === otp) {
        // Remove OTP after successful verification
        otpStorage.delete(cleanPhone);
        console.log('✅ OTP verified successfully (client-side)');
        return {
          success: true,
          message: 'OTP verified successfully',
          token: 'dev-token-' + Date.now(), // Temporary token for development
        };
      } else {
        console.error('❌ Invalid OTP');
        return {
          success: false,
          error: 'Invalid OTP. Please try again.',
        };
      }
    }

    console.log('Verify OTP API URL:', apiUrl);
    console.log('Verify OTP Request Body:', JSON.stringify(requestBody, null, 2));

    let response;
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkError: any) {
      console.error('Network error:', networkError);
      // If network fails and we have stored OTP, try client-side verification as fallback
      if (useClientSideVerification) {
        const storedOTP = otpStorage.get(cleanPhone);
        if (storedOTP && storedOTP.otp === otp && Date.now() <= storedOTP.expiresAt) {
          otpStorage.delete(cleanPhone);
          return {
            success: true,
            message: 'OTP verified successfully (fallback)',
            token: 'dev-token-' + Date.now(),
          };
        }
      }
      return {
        success: false,
        error: 'Network error. Please check your connection and try again.',
      };
    }

    console.log('Verify OTP Response Status:', response.status);

    let data: any;
    let textResponse: string = '';

    try {
      // Read response as text first (can only be read once)
      textResponse = await response.text();
      console.log('Verify OTP Response Text (raw):', textResponse);

      // Try to parse as JSON
      if (textResponse) {
        try {
          data = JSON.parse(textResponse);
          console.log('Verify OTP Response Data (parsed):', JSON.stringify(data, null, 2));
        } catch (parseError) {
          console.log('Response is not JSON, treating as text');
          data = { message: textResponse };
        }
      }
    } catch (error) {
      console.error('Error reading response:', error);
      return {
        success: false,
        error: `Failed to read API response: ${error}`,
      };
    }

    // Check response status
    if (response.ok || response.status === 200) {
      // Check various success indicators
      const isVerified =
        data?.verified === true ||
        data?.success === true ||
        data?.status === 'success' ||
        data?.Status === 'success' ||
        data?.StatusCode === '200' ||
        data?.statusCode === 200 ||
        textResponse.toLowerCase().includes('success') ||
        textResponse.toLowerCase().includes('verified');

      if (isVerified) {
        console.log('✅ OTP verified successfully!');
        return {
          success: true,
          message: 'OTP verified successfully',
          token: data?.token || data?.Token, // If your API returns a token
        };
      } else {
        const errorMsg = data?.message || data?.Message || data?.error || data?.Error || textResponse || 'Invalid OTP';
        console.error('❌ OTP verification failed:', errorMsg);
        return {
          success: false,
          error: errorMsg,
        };
      }
    } else {
      const errorMsg = data?.message || data?.Message || data?.error || data?.Error || textResponse || `HTTP ${response.status}: ${response.statusText}`;
      console.error('❌ OTP Verification API Error:', response.status, errorMsg);
      return {
        success: false,
        error: `Failed to verify OTP: ${errorMsg}`,
      };
    }
  } catch (error: any) {
    console.error('Error verifying OTP:', error);
    return {
      success: false,
      error: error.message || 'Network error. Please try again.',
    };
  }
};

