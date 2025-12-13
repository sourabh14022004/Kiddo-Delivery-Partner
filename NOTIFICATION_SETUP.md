# Push Notification Setup Guide

This guide explains how to set up push notifications for the Kiddo Delivery Partner app.

## Overview

The notification system sends push notifications to all delivery partners when a new order is listed on Shopify. Notifications include order details like order number, total price, and delivery address.

## How It Works

1. **Token Registration**: When a delivery partner logs into the app, their device registers for push notifications and stores the Expo push token in Firestore.

2. **Order Detection**: When a new order appears on Shopify, one of these methods detects it:
   - **Automatic Sync**: When the app syncs orders (e.g., on HomeScreen load), new orders trigger notifications
   - **Cloud Function**: A scheduled Firebase Cloud Function checks for new orders every 5 minutes
   - **Shopify Webhook**: Shopify sends a webhook when a new order is created

3. **Notification Sending**: The system sends push notifications to all registered delivery partner devices using Expo Push Notification service.

## Setup Instructions

### 1. App Configuration (Already Done)

The app is already configured with:
- ✅ `expo-notifications` package installed
- ✅ Notification permissions in `app.json`
- ✅ Notification service (`src/services/notificationService.ts`)
- ✅ Integration in `App.tsx` and `orderService.ts`

### 2. Firebase Cloud Functions (Optional but Recommended)

For automatic order detection without requiring users to open the app:

#### Install Firebase CLI
```bash
npm install -g firebase-tools
```

#### Login to Firebase
```bash
firebase login
```

#### Initialize Functions
```bash
cd functions
npm install
```

#### Deploy Functions
```bash
firebase deploy --only functions
```

This will deploy:
- `checkNewOrders`: Runs every 5 minutes to check for new orders
- `shopifyOrderWebhook`: Handles Shopify webhooks for order creation

### 3. Shopify Webhook Setup (Recommended)

For real-time notifications when orders are created:

1. Go to Shopify Admin → Settings → Notifications
2. Click "Create webhook"
3. Configure:
   - **Event**: Order creation
   - **Format**: JSON
   - **URL**: `https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/shopifyOrderWebhook`
     - Replace `YOUR_REGION` and `YOUR_PROJECT` with your Firebase project details
     - You can find the exact URL after deploying the cloud function
4. Click "Save webhook"

### 4. Environment Variables (For Cloud Functions)

If deploying cloud functions, set these in Firebase:

```bash
firebase functions:config:set shopify.store_domain="your-store.myshopify.com"
firebase functions:config:set shopify.api_key="your-api-key"
```

Then update `functions/index.js` to use:
```javascript
const SHOPIFY_STORE_DOMAIN = functions.config().shopify.store_domain;
const SHOPIFY_ADMIN_API_KEY = functions.config().shopify.api_key;
```

## Testing Notifications

### Test on Device

1. Build and run the app on a physical device (push notifications don't work on simulators)
2. Log in as a delivery partner
3. Grant notification permissions when prompted
4. Create a test order on Shopify
5. You should receive a push notification within a few minutes (or immediately if using webhooks)

### Manual Test

You can manually trigger a notification by calling the `sendNewOrderNotification` function:

```javascript
import { sendNewOrderNotification } from './src/services/notificationService';

await sendNewOrderNotification({
  orderId: 'gid://shopify/Order/123456',
  orderName: 'Order #1234',
  totalPrice: '99.99',
  currencyCode: 'USD',
  shippingAddress: {
    city: 'New York',
    address1: '123 Main St',
  },
});
```

## Notification Flow

```
New Order on Shopify
        ↓
[Option 1: Webhook] → shopifyOrderWebhook → Send Notifications
        ↓
[Option 2: Scheduled] → checkNewOrders (every 5 min) → Send Notifications
        ↓
[Option 3: App Sync] → syncShopifyOrderToFirestore → Send Notifications
        ↓
All Delivery Partners Receive Push Notification
```

## Troubleshooting

### Notifications Not Received

1. **Check Permissions**: Ensure notification permissions are granted
2. **Check Token**: Verify token is saved in Firestore (`notificationTokens` collection)
3. **Check Device**: Push notifications only work on physical devices, not simulators
4. **Check Expo Project ID**: Ensure the project ID in `app.json` matches your Expo project
5. **Check Network**: Ensure device has internet connection

### Cloud Functions Not Working

1. **Check Logs**: `firebase functions:log`
2. **Check Billing**: Cloud Functions require Firebase Blaze plan
3. **Check Permissions**: Ensure service account has proper permissions

### Webhook Not Working

1. **Check URL**: Verify webhook URL is correct
2. **Check Logs**: Check Firebase Functions logs for errors
3. **Test Manually**: Use a tool like Postman to test the webhook endpoint

## Security Notes

- In production, add HMAC verification for Shopify webhooks
- Store API keys in environment variables, not in code
- Use Firebase Security Rules to protect token collection
- Consider rate limiting for notification sending

## Next Steps

1. Deploy cloud functions for automatic order detection
2. Set up Shopify webhook for real-time notifications
3. Test notifications on physical devices
4. Monitor notification delivery rates
5. Add notification preferences (users can opt in/out)

