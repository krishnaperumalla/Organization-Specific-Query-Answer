#!/bin/bash

# OrgQuery Startup Script

echo "🚀 Starting OrgQuery - Organization Document Query System"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "📝 Please create .env file with your Azure OpenAI credentials"
    echo "   You can use .env.example as a template"
    exit 1
fi

# Create directories if they don't exist
mkdir -p uploads
mkdir -p templates
mkdir -p static

echo ""
echo "✅ Setup complete!"
echo ""
echo "🌐 Starting Flask server..."
python app.py