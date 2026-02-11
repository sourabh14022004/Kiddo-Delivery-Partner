# Firebase Setup Guide

## Firestore Security Rules

Firestore security rules have been created to fix the "Missing or insufficient permissions" errors. These rules need to be deployed to your Firebase project.

## Deploying Firestore Rules

### Option 1: Using Firebase CLI (Recommended)

1. **Install Firebase CLI** (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase** (if not already initialized):
   ```bash
   firebase init firestore
   ```
   - Select your Firebase project: `kiddo-delivery-partners`
   - Use existing `firestore.rules` file
   - Use existing `firestore.indexes.json` file

4. **Deploy Firestore Rules**:
   ```bash
   firebase deploy --only firestore:rules
   ```

### Option 2: Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `kiddo-delivery-partners`
3. Navigate to **Firestore Database** → **Rules** tab
4. Copy the contents of `firestore.rules` file
5. Paste into the rules editor
6. Click **Publish**

## Current Rules Configuration

The current rules allow:
- ✅ Read/write access to `deliveryPartners` collection
- ✅ Read/write access to `notificationTokens` collection
- ✅ Read/write access to `orders` collection
- ✅ Read/write access to `notifications` collection

**Note**: These rules are permissive for development. For production, consider adding authentication-based restrictions.

## Production Security Recommendations

For production, update the rules to require authentication:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /deliveryPartners/{phoneNumber} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                      request.resource.data.phoneNumber == phoneNumber;
    }
    
    match /notificationTokens/{phoneNumber} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                      request.resource.data.phoneNumber == phoneNumber;
    }
    
    match /orders/{orderId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    match /notifications/{notificationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## Troubleshooting

### Still Getting Permission Errors?

1. **Verify rules are deployed**: Check Firebase Console → Firestore → Rules
2. **Check Firebase project**: Ensure you're using the correct project (`kiddo-delivery-partners`)
3. **Clear app cache**: Restart the app after deploying rules
4. **Check Firebase config**: Verify `src/config/FirebaseConifg.tsx` has correct project ID

### Testing Rules Locally

You can test rules locally using Firebase Emulator:

```bash
firebase emulators:start --only firestore
```

Then update your app to use the emulator (for testing only).
