#!/usr/bin/env python3
"""
Train a multi-head circular code detector with orientation and corner prediction.

Model outputs 15 values:
  - presence:    1 sigmoid  (is there a code?)
  - geometry:    3 values   (cx, cy, radius, normalized 0-1)
  - corners:     8 values   (4 keypoints for homography, normalized 0-1)
  - orientation: 2 values   (sin, cos of orientation ring angle)
  - reflection:  1 sigmoid  (is the code mirror-reflected?)

Usage:
    python training/train.py
    python training/train.py --epochs 80
    python training/train.py --dataset ./dataset --output ./models/circular_code
"""

import argparse
import glob
import os
import shutil

import numpy as np
import tensorflow as tf
from tensorflow import keras


IMAGE_SIZE = 320
LABEL_COUNT = 15
EPOCHS = 80
BATCH_SIZE = 32
LEARNING_RATE = 1e-3


def load_dataset(dataset_dir: str, split: str):
    image_dir = os.path.join(dataset_dir, "images", split)
    label_dir = os.path.join(dataset_dir, "labels", split)

    image_paths = sorted(glob.glob(os.path.join(image_dir, "*.png")))
    images = []
    labels = []

    for img_path in image_paths:
        basename = os.path.splitext(os.path.basename(img_path))[0]
        label_path = os.path.join(label_dir, f"{basename}.txt")
        if not os.path.exists(label_path):
            continue

        with open(label_path) as f:
            values = list(map(float, f.read().strip().split()))

        if len(values) != LABEL_COUNT:
            continue

        images.append(img_path)
        labels.append(values)

    return images, np.array(labels, dtype=np.float32)


def make_tf_dataset(image_paths: list, labels: np.ndarray, batch_size: int, shuffle: bool):
    def parse_fn(img_path, label):
        img = tf.io.read_file(img_path)
        img = tf.image.decode_png(img, channels=3)
        img = tf.image.resize(img, [IMAGE_SIZE, IMAGE_SIZE])
        img = tf.cast(img, tf.float32) / 255.0
        return img, {
            "presence": label[0:1],
            "geometry": label[1:4],
            "corners": label[4:12],
            "orientation": label[12:14],
            "reflection": label[14:15],
        }

    ds = tf.data.Dataset.from_tensor_slices((image_paths, labels))
    if shuffle:
        ds = ds.shuffle(len(image_paths))
    ds = ds.map(parse_fn, num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.batch(batch_size)
    ds = ds.prefetch(tf.data.AUTOTUNE)
    return ds


def build_model():
    backbone = keras.applications.MobileNetV2(
        input_shape=(IMAGE_SIZE, IMAGE_SIZE, 3),
        include_top=False,
        weights="imagenet",
    )
    backbone.trainable = False

    x = backbone.output
    x = keras.layers.GlobalAveragePooling2D()(x)
    shared = keras.layers.Dense(256, activation="relu")(x)
    shared = keras.layers.Dropout(0.3)(shared)

    presence = keras.layers.Dense(64, activation="relu")(shared)
    presence = keras.layers.Dense(1, activation="sigmoid", name="presence")(presence)

    geometry = keras.layers.Dense(128, activation="relu")(shared)
    geometry = keras.layers.Dense(3, activation="sigmoid", name="geometry")(geometry)

    corners = keras.layers.Dense(128, activation="relu")(shared)
    corners = keras.layers.Dense(64, activation="relu")(corners)
    corners = keras.layers.Dense(8, activation="sigmoid", name="corners")(corners)

    orientation = keras.layers.Dense(64, activation="relu")(shared)
    orientation = keras.layers.Dense(2, activation="tanh", name="orientation")(orientation)

    reflection = keras.layers.Dense(64, activation="relu")(shared)
    reflection = keras.layers.Dense(1, activation="sigmoid", name="reflection")(reflection)

    model = keras.Model(
        inputs=backbone.input,
        outputs={
            "presence": presence,
            "geometry": geometry,
            "corners": corners,
            "orientation": orientation,
            "reflection": reflection,
        },
    )
    return model


def masked_mse(y_true_full):
    """Returns a loss that zeros out geometry/corner/orientation loss when no code is present."""
    def loss_fn(y_true, y_pred):
        mask = tf.cast(y_true_full[:, 0:1] > 0.5, tf.float32)
        se = tf.square(y_true - y_pred)
        return tf.reduce_mean(se * mask)
    return loss_fn


class MaskedLoss(keras.losses.Loss):
    """MSE loss masked by presence flag, passed at compile time via dataset."""
    def __init__(self, name="masked_mse"):
        super().__init__(name=name)

    def call(self, y_true, y_pred):
        return tf.reduce_mean(tf.square(y_true - y_pred))


def main():
    parser = argparse.ArgumentParser(description="Train circular code detector")
    parser.add_argument("--dataset", default="./dataset", help="Dataset directory")
    parser.add_argument("--output", default="./models/circular_code", help="TF.js model output")
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--lr", type=float, default=LEARNING_RATE)
    parser.add_argument("--fine-tune-at", type=int, default=100,
                        help="Unfreeze backbone layers from this index onward for fine-tuning phase")
    args = parser.parse_args()

    print("Loading dataset...")
    train_paths, train_labels = load_dataset(args.dataset, "train")
    val_paths, val_labels = load_dataset(args.dataset, "val")
    print(f"  Train: {len(train_paths)}, Val: {len(val_paths)}")

    if len(train_paths) == 0:
        print("Error: no training data found. Run generate-dataset first.")
        return

    train_ds = make_tf_dataset(train_paths, train_labels, args.batch_size, shuffle=True)
    val_ds = make_tf_dataset(val_paths, val_labels, args.batch_size, shuffle=False)

    print("Building model...")
    model = build_model()

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=args.lr),
        loss={
            "presence": keras.losses.BinaryCrossentropy(),
            "geometry": keras.losses.MeanSquaredError(),
            "corners": keras.losses.MeanSquaredError(),
            "orientation": keras.losses.MeanSquaredError(),
            "reflection": keras.losses.BinaryCrossentropy(),
        },
        loss_weights={
            "presence": 5.0,
            "geometry": 2.0,
            "corners": 3.0,
            "orientation": 1.0,
            "reflection": 3.0,
        },
        metrics={
            "presence": ["accuracy"],
            "geometry": ["mae"],
            "corners": ["mae"],
            "orientation": ["mae"],
            "reflection": ["accuracy"],
        },
    )

    model.summary()

    frozen_epochs = max(args.epochs // 3, 10)
    print(f"\nPhase 1: Training with frozen backbone for {frozen_epochs} epochs...")
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=frozen_epochs,
        callbacks=[
            keras.callbacks.ReduceLROnPlateau(patience=5, factor=0.5, min_lr=1e-6),
            keras.callbacks.EarlyStopping(patience=15, restore_best_weights=True),
        ],
    )

    print(f"\nPhase 2: Fine-tuning backbone from layer {args.fine_tune_at}...")
    backbone = model.layers[1] if hasattr(model.layers[1], 'layers') else None
    if backbone is None:
        for layer in model.layers:
            if hasattr(layer, 'layers') and len(layer.layers) > 50:
                backbone = layer
                break

    if backbone:
        backbone.trainable = True
        for layer in backbone.layers[:args.fine_tune_at]:
            layer.trainable = False
        print(f"  Unfroze {sum(1 for l in backbone.layers if l.trainable)} backbone layers")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=args.lr / 10),
        loss={
            "presence": keras.losses.BinaryCrossentropy(),
            "geometry": keras.losses.MeanSquaredError(),
            "corners": keras.losses.MeanSquaredError(),
            "orientation": keras.losses.MeanSquaredError(),
            "reflection": keras.losses.BinaryCrossentropy(),
        },
        loss_weights={
            "presence": 5.0,
            "geometry": 2.0,
            "corners": 3.0,
            "orientation": 1.0,
            "reflection": 3.0,
        },
        metrics={
            "presence": ["accuracy"],
            "geometry": ["mae"],
            "corners": ["mae"],
            "orientation": ["mae"],
            "reflection": ["accuracy"],
        },
    )

    fine_tune_epochs = args.epochs - frozen_epochs
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        initial_epoch=frozen_epochs,
        callbacks=[
            keras.callbacks.ReduceLROnPlateau(patience=5, factor=0.5, min_lr=1e-7),
            keras.callbacks.EarlyStopping(patience=15, restore_best_weights=True),
        ],
    )

    saved_model_dir = os.path.join(args.output, "saved_model")
    model.save(saved_model_dir)
    print(f"\nSaved Keras model to {saved_model_dir}")

    print("Exporting to TensorFlow.js...")
    try:
        import tensorflowjs as tfjs
        os.makedirs(args.output, exist_ok=True)
        tfjs.converters.save_keras_model(model, args.output)
        print(f"TF.js model exported to {args.output}/")
        for f in sorted(os.listdir(args.output)):
            if f.endswith((".json", ".bin")):
                size = os.path.getsize(os.path.join(args.output, f))
                print(f"  {f} ({size:,} bytes)")
    except ImportError:
        print("tensorflowjs not installed. Run: pip install tensorflowjs")
        print(f"Then convert manually: tensorflowjs_converter --input_format=tf_saved_model {saved_model_dir} {args.output}")

    print("\nDone!")


if __name__ == "__main__":
    main()
