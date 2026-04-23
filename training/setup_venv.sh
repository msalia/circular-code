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

echo "Installing core dependencies..."
$PIP --upgrade pip
$PIP -r "$SCRIPT_DIR/requirements.txt"

# Install tensorflowjs without tensorflow_decision_forests (causes protobuf
# version conflict). Use --no-deps to skip it, install needed deps manually,
# then patch the hard import to make it optional.
echo "Installing tensorflowjs (without tensorflow_decision_forests)..."
$PIP --no-deps tensorflowjs
$PIP tensorflow-hub "tf-keras>=2.19,<2.20" flax jax jaxlib six "packaging~=23.1" importlib_resources

echo "Patching tensorflowjs..."
PATCH_TARGET=$(find "$VENV_DIR" -path "*/tensorflowjs/converters/tf_saved_model_conversion_v2.py" 2>/dev/null | head -1)
if [ -n "$PATCH_TARGET" ] && grep -q "^import tensorflow_decision_forests" "$PATCH_TARGET"; then
  python3 - "$PATCH_TARGET" <<'PYEOF'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
src = p.read_text()
src = src.replace(
    "import tensorflow_decision_forests",
    "try:\n    import tensorflow_decision_forests\nexcept ImportError:\n    tensorflow_decision_forests = None",
    1
)
p.write_text(src)
PYEOF
  echo "  Patched $(basename "$PATCH_TARGET")"
else
  echo "  No patch needed"
fi

echo ""
echo "Verifying imports..."
python -c "import tensorflow as tf; print(f'  tensorflow {tf.__version__}')"
python -c "import tensorflowjs; print(f'  tensorflowjs {tensorflowjs.__version__}')"
python -c "from PIL import Image; print('  Pillow OK')"

echo ""
echo "Setup complete. Activate with:"
echo "  source $VENV_DIR/bin/activate"
