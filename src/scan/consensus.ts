import type { ConsensusResult, ScanResult } from "@/types";

/** Accumulates scan results across frames and returns a result when consensus is reached. */
export class MultiFrameConsensus {
  private buffer: ScanResult[] = [];
  private readonly bufferSize: number;
  private readonly requiredAgreement: number;

  constructor(bufferSize = 7, requiredAgreement = 3) {
    this.bufferSize = bufferSize;
    this.requiredAgreement = requiredAgreement;
  }

  /** Adds a scan result and returns consensus if agreement threshold is met. */
  push(result: ScanResult): ConsensusResult | null {
    this.buffer.push(result);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    return this.evaluate();
  }

  /** Checks the current buffer for consensus without adding a new result. */
  evaluate(): ConsensusResult | null {
    const counts = new Map<string, { count: number; totalScore: number }>();

    for (const entry of this.buffer) {
      const existing = counts.get(entry.data) ?? { count: 0, totalScore: 0 };
      existing.count++;
      existing.totalScore += entry.frameScore.overall;
      counts.set(entry.data, existing);
    }

    let bestData: string | null = null;
    let bestCount = 0;
    let bestScore = 0;

    for (const [data, { count, totalScore }] of counts) {
      if (count > bestCount || (count === bestCount && totalScore > bestScore)) {
        bestData = data;
        bestCount = count;
        bestScore = totalScore;
      }
    }

    if (bestData !== null && bestCount >= this.requiredAgreement) {
      return {
        data: bestData,
        agreement: bestCount / this.buffer.length,
        frameCount: this.buffer.length,
      };
    }

    return null;
  }

  /** Clears all buffered scan results. */
  reset(): void {
    this.buffer = [];
  }

  /** Returns the number of results currently in the buffer. */
  get size(): number {
    return this.buffer.length;
  }
}
