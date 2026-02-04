#!/bin/bash
# Claude Code CLI Installation Script for EC2
# Installs Claude Code CLI to /opt/claude-code/ with system-wide symlink

set -e

INSTALL_DIR="/opt/claude-code"
BIN_LINK="/usr/local/bin/claude-code"
DOWNLOAD_URL="https://...claude-code-cli...tar.gz"  # TODO: Replace with actual Claude Code CLI download URL

echo "📦 Installing Claude Code CLI..."
echo ""

# Check if already installed
if [ -f "$BIN_LINK" ]; then
    echo "✓ Claude Code CLI already installed at $BIN_LINK"
    claude-code --version
    echo ""
    read -p "Reinstall? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
fi

# Create install directory
echo "📁 Creating installation directory..."
sudo mkdir -p "$INSTALL_DIR"

# Download and extract
echo "⬇️  Downloading Claude Code CLI..."
echo "URL: $DOWNLOAD_URL"
curl -fsSL "$DOWNLOAD_URL" | sudo tar xz -C "$INSTALL_DIR" --strip-components=1

# Create symlink
echo "🔗 Creating system-wide symlink..."
sudo ln -sf "$INSTALL_DIR/bin/claude-code" "$BIN_LINK"

# Make executable
sudo chmod +x "$INSTALL_DIR/bin/claude-code"

# Verify installation
echo ""
echo "✅ Installation complete!"
echo ""
echo "Verifying installation..."
if command -v claude-code &> /dev/null; then
    claude-code --version
    echo ""
    echo "Claude Code CLI is ready to use."
    echo "API key will be read from ANTHROPIC_API_KEY environment variable."
else
    echo "❌ Installation failed - claude-code command not found"
    exit 1
fi
