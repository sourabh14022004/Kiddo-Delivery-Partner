import { Platform } from 'react-native';

export const BASE_URL = 'http://localhost:3000/api';

export const SOCKET_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const GOOGLE_MAP_API = 'AIzaSyCr4X4_HW-Fv1-5tC5rSf5iV840WAsVca4';

export const BRANCH_ID = '68bf2d273845635d9b08f182';

// Shopify Configuration
export const SHOPIFY_STORE_DOMAIN = 'kiddo-quick-baby-joy-m4bpo.myshopify.com';

export const SHOPIFY_STOREFRONT_ACCESS_TOKEN =
  '6ac11171e7698f6a3e940bb8d329d58a';

// Shopify Admin API Configuration (for Try & Buy and Order Creation)
// Support multiple API keys for rate limit handling
export const SHOPIFY_ADMIN_API_KEYS = [
  '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'
];

export const SHOPIFY_ADMIN_API_VERSION = '2025-10';

export const SHOPIFY_ADMIN_API_RATE_LIMIT = {
  requestsPerSecond: 2,
  bucketSize: 40,
  retryAfter: 500, // ms to wait before retry
};

// Feature flag to switch between Shopify and backend API
export const USE_SHOPIFY = true; // Set to false to use the original backend API

// Flits Configuration
export const FLITS_USER_ID = ''; // Add your Flits User ID
export const FLITS_TOKEN = ''; // Add your Flits Token
export const FLITS_BASE_URL = 'https://app.getflits.com/api/1';
export const FLITS_SIGN_IN_ACTION_URL = ''; // Optional: For app download rewards
export const FLITS_SIGN_IN_ACTION_KEY = ''; // Optional: For app download rewards
export const USE_FLITS = false; // Set to true to enable Flits integration

// Dark Store Configuration
export const DARK_STORE_LOCATION = {
  latitude: 28.540546501290788,
  longitude: 77.37018854503113,
};

// Warehouse Configuration
export const WAREHOUSE_ADDRESS = 'Kiddo Warehouse, Sector 4';

export const MAX_SERVICE_TIME_MINUTES = 45; // Maximum travel time in minutes from dark store

// OTP Configuration
export const OTP_API_BASE_URL = 'https://sms.shinenetcore.in/api/v2';
export const OTP_SENDER_ID = 'SNCOTP';
export const OTP_API_KEY = '3Ri5Du6T3fbCAfWs9L5gUfOSn4pbofa/DjZucAqwplo=';
export const OTP_CLIENT_ID = 'b00a4a12-c1f3-420f-ae2c-e69988212928';
export const OTP_MESSAGE_TEMPLATE = 'One time OTP From Kiddo Delivery Partner App {otp} to login or activate your profile apsops SNC';
export const OTP_EXPIRY_MINUTES = 5; // OTP expiration time in minutes
export const OTP_USE_ANDROID_HASH = false; // Set to false if SMS provider has issues with hash format

// Searchanise Configuration
export const SEARCHANISE_API_KEY = '3t1p4w8L3G';
export const SEARCHANISE_BASE_URL = 'https://searchserverapi1.com';

