#!/usr/bin/env python3
"""
Test the trained circular code detector on a sample of the validation set.

Usage:
    python training/test_model.py
    python training/test_model.py --model runs/pose/runs/train/circular_code/weights/best.pt
    python training/test_model.py --samples 50
"""

import argparse
import os
import random
import ssl

ssl._create_default_https_context = ssl._create_unverified_context

from ultralytics import YOLO

IMAGE_SIZE = 320
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.5


def parse_label(label_path, img_w, img_h):
    """Parse a YOLO pose label file. Returns list of (bbox_xyxy, keypoints)."""
    if not os.path.exists(label_path) or os.path.getsize(label_path) == 0:
        return []
    entries = []
    with open(label_path) as f:
        for line in f:
            parts = list(map(float, line.strip().split()))
            cx, cy, w, h = parts[1], parts[2], parts[3], parts[4]
            x1 = (cx - w / 2) * img_w
            y1 = (cy - h / 2) * img_h
            x2 = (cx + w / 2) * img_w
            y2 = (cy + h / 2) * img_h
            kpts = []
            i = 5
            while i + 2 < len(parts):
                kpts.append((parts[i] * img_w, parts[i + 1] * img_h))
                i += 3
            entries.append(((x1, y1, x2, y2), kpts))
    return entries


def iou(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def main():
    parser = argparse.ArgumentParser(description="Test circular code detector")
    parser.add_argument("--dataset", default="./dataset")
    parser.add_argument("--model", default=None, help="Path to .pt weights")
    parser.add_argument("--samples", type=int, default=30)
    parser.add_argument("--conf", type=float, default=CONF_THRESHOLD)
    args = parser.parse_args()

    if args.model:
        model_path = args.model
    else:
        candidates = [
            "runs/pose/runs/train/circular_code/weights/best.pt",
            "runs/pose/circular_code/weights/best.pt",
            "runs/train/circular_code/weights/best.pt",
        ]
        model_path = next((p for p in candidates if os.path.exists(p)), None)
        if not model_path:
            print("Error: no best.pt found. Pass --model explicitly.")
            return

    print(f"Model: {model_path}")
    model = YOLO(model_path)

    val_img_dir = os.path.join(args.dataset, "images", "val")
    val_lbl_dir = os.path.join(args.dataset, "labels", "val")

    all_images = sorted(f for f in os.listdir(val_img_dir) if f.endswith(".png"))
    positives = [f for f in all_images if os.path.getsize(os.path.join(val_lbl_dir, f.replace(".png", ".txt"))) > 0]
    negatives = [f for f in all_images if f not in set(positives)]

    n_pos = min(args.samples, len(positives))
    n_neg = min(args.samples // 3, len(negatives))
    sample = random.sample(positives, n_pos) + random.sample(negatives, n_neg)
    random.shuffle(sample)

    print(f"Testing {n_pos} positive + {n_neg} negative images (conf={args.conf})\n")

    tp = 0
    fp = 0
    fn = 0
    tn = 0
    kpt_dists = []

    for img_name in sample:
        img_path = os.path.join(val_img_dir, img_name)
        lbl_path = os.path.join(val_lbl_dir, img_name.replace(".png", ".txt"))

        results = model.predict(img_path, imgsz=IMAGE_SIZE, conf=args.conf, verbose=False)
        r = results[0]
        img_h, img_w = r.orig_shape

        gt = parse_label(lbl_path, img_w, img_h)
        pred_boxes = [b.xyxy[0].tolist() for b in r.boxes]
        pred_confs = [b.conf.item() for b in r.boxes]
        pred_kpts = [k.xy[0].tolist() for k in r.keypoints] if r.keypoints is not None else []

        matched_gt = set()
        matched_pred = set()

        for pi, pb in enumerate(pred_boxes):
            best_iou = 0
            best_gi = -1
            for gi, (gb, _) in enumerate(gt):
                if gi in matched_gt:
                    continue
                v = iou(pb, gb)
                if v > best_iou:
                    best_iou = v
                    best_gi = gi
            if best_iou >= IOU_THRESHOLD:
                tp += 1
                matched_gt.add(best_gi)
                matched_pred.add(pi)
                if pi < len(pred_kpts) and gt[best_gi][1]:
                    gt_kpts = gt[best_gi][1]
                    pr_kpts = pred_kpts[pi]
                    for (gx, gy), (px, py) in zip(gt_kpts, pr_kpts):
                        dist = ((gx - px) ** 2 + (gy - py) ** 2) ** 0.5
                        kpt_dists.append(dist)
            else:
                fp += 1

        fn += len(gt) - len(matched_gt)
        if not gt and not pred_boxes:
            tn += 1
        elif not gt and pred_boxes:
            fp += len(pred_boxes)

        status = "OK" if (len(gt) == 0 and len(pred_boxes) == 0) or len(matched_gt) == len(gt) else "MISS" if len(matched_gt) < len(gt) else "FP"
        detail = f"gt={len(gt)} pred={len(pred_boxes)}"
        if pred_confs:
            detail += f" conf={max(pred_confs):.2f}"
        print(f"  {status:4s} {img_name:>12s}  {detail}")

    print(f"\n{'='*50}")
    print(f"Results:")
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    print(f"  TP={tp}  FP={fp}  FN={fn}  TN={tn}")
    print(f"  Precision: {precision:.3f}")
    print(f"  Recall:    {recall:.3f}")
    print(f"  F1:        {f1:.3f}")
    if kpt_dists:
        avg_dist = sum(kpt_dists) / len(kpt_dists)
        max_dist = max(kpt_dists)
        print(f"  Keypoint avg error: {avg_dist:.1f}px  max: {max_dist:.1f}px")
    print()

    if f1 >= 0.9:
        print("PASS - model looks good")
    elif f1 >= 0.7:
        print("WARN - model is okay but could improve (try more epochs)")
    else:
        print("FAIL - model needs more training")


if __name__ == "__main__":
    main()
