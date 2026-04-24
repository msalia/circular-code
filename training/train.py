#!/usr/bin/env python3
"""
Train a YOLOv8 circular code detector and export to TensorFlow.js.

Usage:
    python training/train.py
    python training/train.py --epochs 50
    python training/train.py --dataset ./dataset --output ./models/circular_code
    python training/train.py --resume runs/train/circular_code/weights/best.pt
"""

import argparse
import os
import shutil
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

# macOS sandbox blocks POSIX semaphores, which Python's ThreadPool requires.
# Replace ThreadPool in ultralytics' dataset module with a sequential fallback.
import contextlib

class _SequentialPool:
    """Drop-in replacement for ThreadPool that runs tasks sequentially."""
    def __init__(self, *args, **kwargs):
        pass
    def imap(self, func=None, iterable=None, **kwargs):
        return map(func, iterable)
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass

import ultralytics.data.dataset
ultralytics.data.dataset.ThreadPool = _SequentialPool

import ultralytics.data.base
ultralytics.data.base.ThreadPool = _SequentialPool

from ultralytics import YOLO

EPOCHS = 40
BATCH_SIZE = 32
IMAGE_SIZE = 320


def main():
    parser = argparse.ArgumentParser(description="Train circular code detector")
    parser.add_argument("--dataset", default="./dataset", help="Dataset directory")
    parser.add_argument(
        "--output", default="./models/circular_code", help="TF.js model output"
    )
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument(
        "--resume", type=str, default=None, help="Resume from a YOLO .pt checkpoint"
    )
    parser.add_argument(
        "--base-model",
        type=str,
        default="./models/yolov8n-obb.pt",
        help="Base YOLO OBB model (default: yolov8n-obb.pt)",
    )
    args = parser.parse_args()

    data_yaml = os.path.join(args.dataset, "data.yaml")
    if not os.path.exists(data_yaml):
        print(f"Error: {data_yaml} not found. Run generate-dataset first.")
        return

    if args.resume:
        print(f"Resuming from {args.resume}")
        model = YOLO(args.resume)
    else:
        print(f"Loading base model: {args.base_model}")
        model = YOLO(args.base_model)

    print(f"\nTraining on {data_yaml} for {args.epochs} epochs at {IMAGE_SIZE}x{IMAGE_SIZE}...")
    model.train(
        data=data_yaml,
        epochs=args.epochs,
        imgsz=IMAGE_SIZE,
        batch=args.batch_size,
        device="mps",
        workers=0,
        project="runs/train",
        name="circular_code",
        exist_ok=True,
    )

    best_pt = os.path.join("runs", "obb", "runs", "train", "circular_code", "weights", "best.pt")
    if not os.path.exists(best_pt):
        print(f"Error: {best_pt} not found after training.")
        return

    print(f"\nBest model: {best_pt}")
    print("Exporting to TensorFlow.js...")

    best_model = YOLO(best_pt)
    export_path = best_model.export(format="tfjs", imgsz=IMAGE_SIZE)

    os.makedirs(args.output, exist_ok=True)
    tfjs_dir = export_path if os.path.isdir(export_path) else os.path.dirname(export_path)
    for f in os.listdir(tfjs_dir):
        if f.endswith((".json", ".bin")):
            src = os.path.join(tfjs_dir, f)
            dst = os.path.join(args.output, f)
            shutil.copy2(src, dst)
            size = os.path.getsize(dst)
            print(f"  {f} ({size:,} bytes)")

    print(f"\nDone! TF.js model exported to {args.output}/")


if __name__ == "__main__":
    main()
