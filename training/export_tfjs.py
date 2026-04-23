#!/usr/bin/env python3
"""Export a trained Keras model to TensorFlow.js LayersModel format.

Uses tensorflowjs for conversion, then patches the output for TF.js 4.x compatibility
(Keras 3 topology fields differ from what the JS runtime expects).
"""

import argparse
import json
import os

import tensorflow as tf
import tensorflowjs as tfjs


def combined_loss(y_true, y_pred):
    cls_true = y_true[:, 0:1]
    cls_pred = y_pred[:, 0:1]
    cls_loss = tf.reduce_mean(
        tf.nn.sigmoid_cross_entropy_with_logits(labels=cls_true, logits=cls_pred)
    )
    mask = y_true[:, 0]
    bbox_loss = tf.reduce_mean(
        tf.reduce_sum(tf.square(y_true[:, 1:5] - y_pred[:, 1:5]), axis=-1) * mask
    )
    angle_loss = tf.reduce_mean(
        tf.reduce_sum(tf.square(y_true[:, 5:7] - y_pred[:, 5:7]), axis=-1) * mask
    )
    return cls_loss + 5.0 * bbox_loss + 2.0 * angle_loss


def normalize_dtype(val):
    """Convert Keras 3 dtype objects to plain strings."""
    if isinstance(val, dict) and "config" in val and "name" in val.get("config", {}):
        return val["config"]["name"]
    return val


def patch_layer(layer):
    """Patch a single layer config for TF.js compatibility."""
    cfg = layer.get("config", {})

    # Normalize dtype everywhere
    if "dtype" in cfg:
        cfg["dtype"] = normalize_dtype(cfg["dtype"])

    # InputLayer: batch_shape -> batch_input_shape
    if layer["class_name"] == "InputLayer":
        if "batch_shape" in cfg and "batch_input_shape" not in cfg:
            cfg["batch_input_shape"] = cfg.pop("batch_shape")

    # Conv2D: kernel_size/strides/dilation_rate may need to stay as lists (OK)
    # activation objects -> strings
    if "activation" in cfg and isinstance(cfg["activation"], dict):
        cfg["activation"] = cfg["activation"].get("config", {}).get(
            "activation", cfg["activation"].get("class_name", "linear")
        ).lower()

    layer["config"] = cfg
    return layer


def patch_model_json(model_json_path):
    """Patch the model.json for TF.js 4.x compatibility."""
    with open(model_json_path) as f:
        data = json.load(f)

    topo = data.get("modelTopology", {})
    model_config = topo.get("model_config", topo.get("config", {}))

    if not model_config:
        return

    cfg = model_config.get("config", {})

    # Normalize top-level dtype
    if "dtype" in cfg:
        cfg["dtype"] = normalize_dtype(cfg["dtype"])

    # Patch each layer
    layers = cfg.get("layers", [])
    for layer in layers:
        patch_layer(layer)

    # Strip model name prefix from weight names (e.g. "sequential/conv2d/kernel" -> "conv2d/kernel")
    model_name = cfg.get("name", "")
    prefix = model_name + "/" if model_name else ""
    for manifest_group in data.get("weightsManifest", []):
        for w in manifest_group.get("weights", []):
            if prefix and w["name"].startswith(prefix):
                w["name"] = w["name"][len(prefix) :]

    with open(model_json_path, "w") as f:
        json.dump(data, f)

    print(f"Patched {len(layers)} layers for TF.js compatibility")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--keras-model",
        default="./models/circular_code/keras_model.keras",
    )
    parser.add_argument(
        "--output",
        default="./models/circular_code",
    )
    args = parser.parse_args()

    print(f"Loading {args.keras_model}...")
    model = tf.keras.models.load_model(
        args.keras_model, custom_objects={"combined_loss": combined_loss}
    )
    model.summary()

    os.makedirs(args.output, exist_ok=True)

    print(f"\nStep 1: Export via tensorflowjs...")
    tfjs.converters.save_keras_model(model, args.output)

    print(f"\nStep 2: Patch model.json for TF.js 4.x...")
    model_json_path = os.path.join(args.output, "model.json")
    patch_model_json(model_json_path)

    print(f"\nExported to {args.output}/:")
    for f in sorted(os.listdir(args.output)):
        if f.endswith((".json", ".bin")):
            size = os.path.getsize(os.path.join(args.output, f))
            print(f"  {f} ({size:,} bytes)")

    print("\nDone!")


if __name__ == "__main__":
    main()
