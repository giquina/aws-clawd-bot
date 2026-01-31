#!/bin/bash
# Llama AI Setup Script
# Downloads and initializes Llama 3.2 model

echo "🤖 Setting up Llama AI..."
echo ""

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "📦 Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
else
    echo "✅ Ollama already installed"
fi

# Pull Llama 3.2 1B model (smallest, fastest)
echo ""
echo "📥 Downloading Llama 3.2 model (this takes 2-5 minutes)..."
ollama pull llama3.2:1b

# Verify model is available
echo ""
echo "🔍 Verifying installation..."
ollama list

echo ""
echo "✅ Llama AI setup complete!"
echo ""
echo "You can test it with:"
echo "  ollama run llama3.2:1b \"Hello, how are you?\""
echo ""
