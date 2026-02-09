#!/bin/bash

# CodePilot Local Installation Script
# This script installs the built CodePilot.app to /Applications and removes quarantine attributes

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$PROJECT_ROOT/release"
APP_PATH="$RELEASE_DIR/mac/CodePilot.app"
INSTALL_PATH="/Applications/CodePilot.app"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  CodePilot Local Installation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
  echo -e "${RED}❌ Error: CodePilot.app not found at:${NC}"
  echo -e "   $APP_PATH"
  echo ""
  echo -e "${YELLOW}Please build the app first:${NC}"
  echo -e "   ${BLUE}npm run electron:pack:mac${NC}"
  exit 1
fi

# Get app version
APP_VERSION=$(defaults read "$APP_PATH/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")
echo -e "${BLUE}📦 Found CodePilot v$APP_VERSION${NC}"
echo -e "   Source: $APP_PATH"
echo ""

# Check if app is already installed
if [ -d "$INSTALL_PATH" ]; then
  echo -e "${YELLOW}⚠️  CodePilot is already installed at /Applications${NC}"
  echo -e "${YELLOW}   The existing app will be replaced.${NC}"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Installation cancelled.${NC}"
    exit 0
  fi
  echo ""
  echo -e "${BLUE}🗑️  Removing existing app...${NC}"
  rm -rf "$INSTALL_PATH"
fi

# Copy app to /Applications
echo -e "${BLUE}📋 Copying app to /Applications...${NC}"
cp -R "$APP_PATH" "$INSTALL_PATH"

if [ ! -d "$INSTALL_PATH" ]; then
  echo -e "${RED}❌ Error: Failed to copy app to /Applications${NC}"
  exit 1
fi

echo -e "${GREEN}✅ App copied successfully${NC}"
echo ""

# Remove quarantine attribute
echo -e "${BLUE}🔓 Removing quarantine attribute...${NC}"
echo -e "${YELLOW}   (This requires sudo access)${NC}"
echo ""

if sudo xattr -rd com.apple.quarantine "$INSTALL_PATH" 2>/dev/null; then
  echo -e "${GREEN}✅ Quarantine attribute removed${NC}"
else
  echo -e "${YELLOW}⚠️  Could not remove quarantine attribute${NC}"
  echo -e "${YELLOW}   You may need to manually allow the app on first launch:${NC}"
  echo -e "   ${BLUE}Right-click → Open${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Installation complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}You can now open CodePilot from:${NC}"
echo -e "   • Applications folder"
echo -e "   • Spotlight (⌘ + Space, type 'CodePilot')"
echo -e "   • Launchpad"
echo ""

# Optional: Open the app
read -p "Open CodePilot now? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}🚀 Opening CodePilot...${NC}"
  open "$INSTALL_PATH"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
