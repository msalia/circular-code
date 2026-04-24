#!/usr/bin/env python3
"""Export a trained Keras model to TensorFlow.js format.

Uses tf-keras (Keras 2) to re-build the model and save as H5,
then converts via tensorflowjs which handles H5 natively.
"""

import argparse
import os
import ssl
import tempfile

ssl._create_default_https_context = ssl._create_unverified_context

import numpy as np
import tensorflow as tf
import tf_keras as keras
import tensorflowjs as tfjs


def build_model_keras2(weights_source):
    """Rebuild the model using tf-keras (Keras 2) for TF.js compatibility."""
    backbone = keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights="imagenet",
    )

    inputs = keras.Input(shape=(224, 224, 3))
    x = backbone(inputs, training=False)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.3)(x)
    x = keras.layers.Dense(128, activation="relu")(x)
    x = keras.layers.Dropout(0.2)(x)
    outputs = keras.layers.Dense(7)(x)
    model = keras.Model(inputs, outputs)

    # Copy weights from the trained Keras 3 model
    for k2_layer, k3_layer in zip(model.layers, weights_source.layers):
        try:
            k2_layer.set_weights(k3_layer.get_weights())
        except Exception:
            pass

    return model


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
    return cls_loss + 2.0 * bbox_loss + 1.0 * angle_loss


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

    print(f"Loading trained model from {args.keras_model}...")
    trained = tf.keras.models.load_model(
        args.keras_model, custom_objects={"combined_loss": combined_loss}
    )
    trained.summary()

    print("\nRebuilding model with tf-keras (Keras 2)...")
    model = build_model_keras2(trained)

    print("\nVerifying weight transfer...")
    test_input = np.random.uniform(0, 1, (1, 224, 224, 3)).astype(np.float32)
    k3_out = trained.predict(test_input, verbose=0)
    k2_out = model.predict(test_input, verbose=0)
    diff = np.max(np.abs(k3_out - k2_out))
    print(f"  Max output difference: {diff:.8f}")
    if diff > 0.01:
        print("  WARNING: outputs differ significantly, weight transfer may be incomplete")

    os.makedirs(args.output, exist_ok=True)

    print("\nExporting to TF.js...")
    tfjs.converters.save_keras_model(model, args.output)

    print(f"\nExported to {args.output}/:")
    for f in sorted(os.listdir(args.output)):
        if f.endswith((".json", ".bin")):
            size = os.path.getsize(os.path.join(args.output, f))
            print(f"  {f} ({size:,} bytes)")

    print("\nDone!")


if __name__ == "__main__":
    main()
