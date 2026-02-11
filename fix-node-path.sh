#!/bin/bash

# Fix Node.js path issue for iOS build
# This script creates a symlink from the old Node.js path to the actual location

echo "Fixing Node.js path issue..."
echo ""

# Check if Node.js exists at the expected location
if [ ! -f "/opt/homebrew/bin/node" ]; then
    echo "Error: Node.js not found at /opt/homebrew/bin/node"
    echo "Please check your Node.js installation."
    exit 1
fi

# Create directory structure if it doesn't exist
echo "Creating directory structure..."
sudo mkdir -p /opt/homebrew/Cellar/node/24.6.0/bin

# Create symlink
echo "Creating symlink..."
sudo ln -sf /opt/homebrew/bin/node /opt/homebrew/Cellar/node/24.6.0/bin/node

# Verify the symlink was created
if [ -L "/opt/homebrew/Cellar/node/24.6.0/bin/node" ]; then
    echo "✓ Symlink created successfully!"
    echo ""
    echo "You can now rebuild your iOS project in Xcode."
else
    echo "✗ Failed to create symlink. Please run with sudo."
    exit 1
fi

