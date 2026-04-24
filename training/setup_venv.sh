#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
PIP="pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "Installing dependencies..."
$PIP --upgrade pip
$PIP -r "$SCRIPT_DIR/requirements.txt"

echo ""
echo "Verifying imports..."
python -c "from ultralytics import YOLO; print(f'  ultralytics {__import__(\"ultralytics\").__version__}')"
python -c "from PIL import Image; print('  Pillow OK')"

echo ""
echo "Setup complete. Activate with:"
echo "  source $VENV_DIR/bin/activate"
