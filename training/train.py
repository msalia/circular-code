#!/usr/bin/env python3
"""
Train the circular code detector on Metal GPU, export to TensorFlow.js format.

Usage:
    python training/train.py                    # defaults
    python training/train.py --epochs 50        # override epochs
    python training/train.py --dataset ./dataset --output ./models/circular_code
"""

import argparse
import json
import os
import ssl

import numpy as np
import sys

ssl._create_default_https_context = ssl._create_unverified_context

import tensorflow as tf
from PIL import Image

# Allow importing sibling modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

IMAGE_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 40
LEARNING_RATE = 1e-3


def check_gpu():
    gpus = tf.config.list_physical_devices("GPU")
    if gpus:
        print(f"GPU detected: {gpus[0].name}")
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    else:
        print("No GPU found — training on CPU (will be slower)")


def load_dataset(dataset_dir: str):
    manifest_path = os.path.join(dataset_dir, "manifest.json")
    with open(manifest_path) as f:
        manifest = json.load(f)

    total = manifest["total"]
    images = np.zeros((total, IMAGE_SIZE, IMAGE_SIZE, 3), dtype=np.float32)
    labels = np.zeros((total, 7), dtype=np.float32)

    print(f"Loading {total} samples at {IMAGE_SIZE}x{IMAGE_SIZE}...")
    for i in range(total):
        img_path = os.path.join(dataset_dir, "images", f"{i}.png")
        lbl_path = os.path.join(dataset_dir, "labels", f"{i}.txt")

        img = Image.open(img_path).convert("RGB").resize((IMAGE_SIZE, IMAGE_SIZE))
        images[i] = np.array(img, dtype=np.float32) / 255.0

        with open(lbl_path) as f:
            labels[i] = list(map(float, f.read().strip().split()))

        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{total}")

    # Shuffle
    idx = np.random.permutation(total)
    images = images[idx]
    labels = labels[idx]

    # Split
    val_count = int(total * 0.15)
    return (
        images[val_count:],
        labels[val_count:],
        images[:val_count],
        labels[:val_count],
    )


def build_model():
    backbone = tf.keras.applications.MobileNetV2(
        input_shape=(IMAGE_SIZE, IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    backbone.trainable = False

    inputs = tf.keras.Input(shape=(IMAGE_SIZE, IMAGE_SIZE, 3))
    x = tf.keras.applications.mobilenet_v2.preprocess_input(inputs)
    x = backbone(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    outputs = tf.keras.layers.Dense(7)(x)

    return tf.keras.Model(inputs, outputs)


def combined_loss(y_true, y_pred):
    # Classification: sigmoid cross-entropy on first column
    cls_true = y_true[:, 0:1]
    cls_pred = y_pred[:, 0:1]
    cls_loss = tf.reduce_mean(
        tf.nn.sigmoid_cross_entropy_with_logits(labels=cls_true, logits=cls_pred)
    )

    # Bounding box: MSE on columns 1-4, masked by class
    bbox_true = y_true[:, 1:5]
    bbox_pred = y_pred[:, 1:5]
    mask = y_true[:, 0]
    bbox_loss = tf.reduce_mean(
        tf.reduce_sum(tf.square(bbox_true - bbox_pred), axis=-1) * mask
    )

    # Angle: MSE on columns 5-6 (sin, cos), masked
    angle_true = y_true[:, 5:7]
    angle_pred = y_pred[:, 5:7]
    angle_loss = tf.reduce_mean(
        tf.reduce_sum(tf.square(angle_true - angle_pred), axis=-1) * mask
    )

    return cls_loss + 2.0 * bbox_loss + 1.0 * angle_loss


def export_to_tfjs(keras_model_path: str, output_dir: str):
    """Convert saved Keras model to TensorFlow.js LayersModel format."""
    import tensorflowjs as tfjs

    model = tf.keras.models.load_model(
        keras_model_path, custom_objects={"combined_loss": combined_loss}
    )
    tfjs.converters.save_keras_model(model, output_dir)
    print(f"TF.js model exported to {output_dir}/")


def main():
    parser = argparse.ArgumentParser(description="Train circular code detector")
    parser.add_argument("--dataset", default="./dataset", help="Dataset directory")
    parser.add_argument(
        "--output", default="./models/circular_code", help="TF.js model output"
    )
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--lr", type=float, default=LEARNING_RATE)
    parser.add_argument("--resume", type=str, default=None, help="Resume from a saved Keras model")
    args = parser.parse_args()

    check_gpu()

    train_x, train_y, val_x, val_y = load_dataset(args.dataset)
    print(f"Train: {len(train_x)}, Val: {len(val_x)}\n")

    if args.resume:
        print(f"Resuming from {args.resume}")
        model = tf.keras.models.load_model(
            args.resume, custom_objects={"combined_loss": combined_loss}
        )
    else:
        model = build_model()
    model.summary()

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.lr),
        loss=combined_loss,
    )

    keras_path = os.path.join(args.output, "keras_model.keras")
    os.makedirs(args.output, exist_ok=True)

    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(
            keras_path, monitor="val_loss", save_best_only=True, verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=5, verbose=1
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=10, restore_best_weights=True, verbose=1
        ),
    ]

    # Phase 1: train head with frozen backbone
    if not args.resume:
        print("Phase 1: Training head (backbone frozen)...")
        model.fit(
            train_x,
            train_y,
            validation_data=(val_x, val_y),
            epochs=args.epochs // 2,
            batch_size=args.batch_size,
            shuffle=True,
            callbacks=callbacks,
        )

    # Phase 2: fine-tune top layers of backbone
    print("\nPhase 2: Fine-tuning backbone...")
    backbone = None
    for layer in model.layers:
        if hasattr(layer, 'layers') and len(layer.layers) > 10:
            backbone = layer
            break
    if backbone is None:
        print("Warning: could not find backbone, skipping fine-tuning")
    else:
        backbone.trainable = True
        for layer in backbone.layers[:-30]:
            layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.lr / 10),
        loss=combined_loss,
    )

    model.fit(
        train_x,
        train_y,
        validation_data=(val_x, val_y),
        epochs=args.epochs,
        initial_epoch=args.epochs // 2,
        batch_size=args.batch_size,
        shuffle=True,
        callbacks=callbacks,
    )

    model.save(keras_path)
    print(f"\nKeras model saved to {keras_path}")

    # Export to TF.js
    print("Converting to TensorFlow.js format...")
    try:
        import tensorflowjs as tfjs
        from export_tfjs import patch_model_json

        tfjs.converters.save_keras_model(model, args.output)
        patch_model_json(os.path.join(args.output, "model.json"))

        if os.path.exists(keras_path):
            os.remove(keras_path)
        print("\nDone!")
    except Exception as e:
        print(f"\nTF.js export failed: {e}")
        print(f"You can export manually with:")
        print(f"  tensorflowjs_converter --input_format=keras '{keras_path}' '{args.output}'")


if __name__ == "__main__":
    main()
