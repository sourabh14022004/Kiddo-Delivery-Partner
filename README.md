# Kiddo-Delivery-Partner

## Quick Setup

### Firebase Setup
**IMPORTANT**: Before running the app, you need to deploy Firestore security rules to fix permission errors.

See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for detailed instructions.

Quick deploy:
```bash
firebase deploy --only firestore:rules
```

### Shopify API Configuration
The Shopify API key in `src/config/config.ts` may need to be updated if you're seeing "Invalid API key" errors. 

**If you see "The api_client does not have the required permission(s)"** when marking orders fulfilled, your Admin API token is missing fulfillment order scopes. See **[SHOPIFY_SETUP.md](./SHOPIFY_SETUP.md)** for the exact scopes and steps.

To get a new API key:
1. Go to Shopify Admin → Settings → Apps and sales channels → Develop apps
2. Create a new app or use an existing one
3. Configure Admin API access scopes (include fulfillment order scopes — see SHOPIFY_SETUP.md)
4. Install the app and copy the Admin API access token
5. Update `SHOPIFY_ADMIN_API_KEYS` in `src/config/config.ts`

### Android build (Java required)
If `npm run android` fails with **"Unable to locate a Java Runtime"**, install a JDK:

**macOS (Homebrew):**
```bash
brew install openjdk@17
```
The `npm run android` script sets `JAVA_HOME` to Homebrew’s OpenJDK 17 on **Apple Silicon** (`/opt/homebrew`). If you’re on **Intel Mac**, set it in your shell before running:
```bash
export JAVA_HOME="/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
npm run android
```
Or add that `export` to `~/.zshrc` and run `source ~/.zshrc`.

### Running on Android (Metro must be running)
If you see **"Unable to load script"** on the device, the app can’t reach the Metro bundler. Do this:

1. **Start Metro** in one terminal (leave it running):
   ```bash
   npm start
   ```
2. **Launch the app**: press **`a`** in the Metro terminal to open Android, or in a second terminal run:
   ```bash
   npm run android
   ```
3. **Physical device over USB**: forward the Metro port so the device can use `localhost:8081`:
   ```bash
   adb reverse tcp:8081 tcp:8081
   ```
   Then reload the app (shake device → Reload, or press R twice in Metro).

## Known Issues

- **Firebase Permission Errors**: Deploy Firestore rules (see FIREBASE_SETUP.md)
- **Shopify API Errors**: Update API key in config.ts if expired/invalid
- **Shopify "required permission(s)" on fulfillment**: Add fulfillment order scopes (see SHOPIFY_SETUP.md)
- **Android "Unable to locate a Java Runtime"**: Install JDK 17 (see Android build above)
- **Android "Unable to load script"**: Start Metro (`npm start`), then run the app; for USB device run `adb reverse tcp:8081 tcp:8081`