#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

echo "Activating venv and installing dependencies..."
source "$VENV_DIR/bin/activate"

# Use --trusted-host to work around SSL certificate issues
pip install --upgrade pip \
  --trusted-host pypi.org \
  --trusted-host files.pythonhosted.org

pip install -r "$SCRIPT_DIR/requirements.txt" \
  --trusted-host pypi.org \
  --trusted-host files.pythonhosted.org

# tensorflowjs pulls in tensorflow_decision_forests which causes a protobuf
# version conflict (gencode 6.x vs runtime 5.x). We don't need it — uninstall
# and patch the hard import so tensorflowjs still loads.
echo ""
echo "Patching tensorflowjs to remove tensorflow_decision_forests dependency..."
pip uninstall -y tensorflow_decision_forests yggdrasil_decision_forests 2>/dev/null || true

TFJS_SITE="$VENV_DIR/lib/python*/site-packages/tensorflowjs/converters"
for f in $TFJS_SITE/tf_saved_model_conversion_v2.py; do
  if [ -f "$f" ] && grep -q "^import tensorflow_decision_forests" "$f"; then
    sed -i.bak 's/^import tensorflow_decision_forests$/try:\
    import tensorflow_decision_forests\
except ImportError:\
    tensorflow_decision_forests = None/' "$f"
    rm -f "$f.bak"
    echo "  Patched $(basename "$f")"
  fi
done

# Verify the setup works
echo ""
echo "Verifying imports..."
python -c "import tensorflow as tf; print(f'  tensorflow {tf.__version__}')"
python -c "import tensorflowjs; print(f'  tensorflowjs {tensorflowjs.__version__}')"
python -c "from PIL import Image; print('  Pillow OK')"

echo ""
echo "Setup complete. Activate with:"
echo "  source $VENV_DIR/bin/activate"
