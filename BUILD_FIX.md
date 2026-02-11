# iOS Build Fix - Node.js Path Issue

## Problem
The build is failing because the React Native Dependencies build script is looking for Node.js at:
```
/opt/homebrew/Cellar/node/24.6.0/bin/node
```

But Node.js is actually installed at:
```
/opt/homebrew/bin/node
```

**Error in build log:**
```
Script-46EB2E0001BBF0.sh: line 9: /opt/homebrew/Cellar/node/24.6.0/bin/node: No such file or directory
Command PhaseScriptExecution failed with a nonzero exit code
```

## Quick Fix (Recommended)

Run the provided fix script:
```bash
./fix-node-path.sh
```

This will create the necessary symlink automatically.

## Manual Solution Options

### Option 1: Create a Symlink (Quick Fix)
Create a symlink from the old path to the new path:
```bash
sudo mkdir -p /opt/homebrew/Cellar/node/24.6.0/bin
sudo ln -sf /opt/homebrew/bin/node /opt/homebrew/Cellar/node/24.6.0/bin/node
```

### Option 2: Clean Xcode DerivedData
1. Open Xcode
2. Go to **Product** → **Clean Build Folder** (Shift + Cmd + K)
3. Or manually delete DerivedData:
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData/KiddoDeliveryPartner-*
   ```
4. Rebuild the project

### Option 3: Reinstall Pods
This will regenerate the build scripts with the correct Node path:
```bash
cd ios
rm -rf Pods Podfile.lock
pod install
```

## Additional Issues

### Deployment Target Warning
There's also a warning about the iOS deployment target:
```
The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 11.0, 
but the range of supported deployment target versions is 12.0 to 26.2.99.
```

This can be fixed by updating the Podfile's `post_install` hook to set the minimum deployment target:

```ruby
post_install do |installer|
  react_native_post_install(
    installer,
    config[:reactNativePath],
    :mac_catalyst_enabled => false,
    :ccache_enabled => ccache_enabled?(podfile_properties),
  )
  
  # Fix deployment target warning
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 12.0
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      end
    end
  end
end
```

## After Fixing
1. Clean the build folder in Xcode (Shift + Cmd + K)
2. Rebuild the project
3. The build should complete successfully

