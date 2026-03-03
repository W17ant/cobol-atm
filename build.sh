#!/bin/bash
# Build script for COBOL ATM System
# Requires: GnuCOBOL (brew install gnucobol)

set -e

echo "=== COBOL ATM Build System ==="
echo ""

# Check for GnuCOBOL
if ! command -v cobc &> /dev/null; then
    echo "ERROR: GnuCOBOL not found."
    echo "Install with: brew install gnucobol"
    exit 1
fi

echo "Compiling SETUP-DATA.cob..."
cobc -x -free SETUP-DATA.cob -o setup-data

echo "Compiling ATM-SYSTEM.cob..."
cobc -x -free ATM-SYSTEM.cob -o atm-system

# Create initial data if ACCOUNTS.DAT doesn't exist
if [ ! -f ACCOUNTS.DAT ]; then
    echo "Creating sample account data..."
    ./setup-data
    echo "Sample data created."
else
    echo "ACCOUNTS.DAT already exists, skipping setup."
fi

echo ""
echo "Build complete!"
echo ""
echo "Sample accounts:"
echo "  Customer: 1000000001 / PIN: 1234 (John Smith, Checking)"
echo "  Customer: 1000000002 / PIN: 5678 (Sarah Jones, Savings)"
echo "  Customer: 1000000003 / PIN: 4321 (Mike Wilson, Checking)"
echo "  Customer: 1000000004 / PIN: 9999 (Emma Brown, LOCKED)"
echo "  Admin:    9999999999 / PIN: 0000"
echo ""

# Set up Python venv and Flask if needed
if command -v python3 &> /dev/null; then
    if [ ! -d venv ]; then
        echo "Setting up Python virtual environment..."
        python3 -m venv venv
    fi
    source venv/bin/activate
    if ! python3 -c "import flask" 2>/dev/null; then
        echo "Installing Flask..."
        pip install flask -q
    fi
    echo "To start the ATM web interface:"
    echo "  source venv/bin/activate"
    echo "  python3 server.py"
    echo ""
    echo "Then open http://localhost:5001 in your browser."
else
    echo "Python3 not found. Install Python to use the web interface."
fi
