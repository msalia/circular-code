import type { ConsensusResult, ScanResult } from "../types";

export class MultiFrameConsensus {
  private buffer: ScanResult[] = [];
  private readonly bufferSize: number;
  private readonly requiredAgreement: number;

  constructor(bufferSize = 7, requiredAgreement = 3) {
    this.bufferSize = bufferSize;
    this.requiredAgreement = requiredAgreement;
  }

  push(result: ScanResult): ConsensusResult | null {
    this.buffer.push(result);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }

    return this.evaluate();
  }

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
      if (
        count > bestCount ||
        (count === bestCount && totalScore > bestScore)
      ) {
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

  reset(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}
