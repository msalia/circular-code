import { useEffect, useRef, useState } from "react";
import { processFrame } from "@/scan";
import { loadModel, isModelLoaded } from "@/ml/detector";
import { MultiFrameConsensus } from "@/scan/consensus";
import type { ConsensusResult, ScanOptions } from "@/types";

export function useCircularScanner(options: ScanOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let running = true;
    const consensus = new MultiFrameConsensus(
      options.consensusSize ?? 7,
      options.consensusRequired ?? 3,
    );

    async function start() {
      if (options.modelUrl && !isModelLoaded()) {
        await loadModel(options.modelUrl);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (!videoRef.current || !running) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setScanning(true);
      loop();
    }

    function loop() {
      if (!running || !videoRef.current) return;

      try {
        const scanResult = processFrame(videoRef.current, {
          rings: options.rings,
          segmentsPerRing: options.segmentsPerRing,
          eccBytes: options.eccBytes,
          minFrameScore: options.minFrameScore,
        });

        if (scanResult) {
          const consensusResult = consensus.push(scanResult);
          if (consensusResult) {
            setResult(consensusResult);
            setScanning(false);
            return;
          }
        }
      } catch {
        // skip bad frame
      }

      requestAnimationFrame(loop);
    }

    start();

    return () => {
      running = false;
      setScanning(false);
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return { videoRef, result, scanning };
}
