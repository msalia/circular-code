import { describe, it, expect } from "vitest";
import { MultiFrameConsensus } from "@/scan/consensus";
import type { ScanResult } from "@/types";

function makeScanResult(data: string, overall = 0.8): ScanResult {
  return {
    data,
    confidence: 0.9,
    frameScore: { sharpness: 100, contrast: 50, overall },
  };
}

describe("MultiFrameConsensus", () => {
  it("returns null with insufficient frames", () => {
    const c = new MultiFrameConsensus(5, 3);
    expect(c.push(makeScanResult("hello"))).toBeNull();
    expect(c.push(makeScanResult("hello"))).toBeNull();
  });

  it("returns consensus when threshold met", () => {
    const c = new MultiFrameConsensus(5, 3);
    c.push(makeScanResult("hello"));
    c.push(makeScanResult("hello"));
    const result = c.push(makeScanResult("hello"));
    expect(result).not.toBeNull();
    expect(result!.data).toBe("hello");
    expect(result!.agreement).toBeCloseTo(1);
  });

  it("picks majority over noise", () => {
    const c = new MultiFrameConsensus(7, 3);
    c.push(makeScanResult("noise1"));
    c.push(makeScanResult("hello"));
    c.push(makeScanResult("noise2"));
    c.push(makeScanResult("hello"));
    const result = c.push(makeScanResult("hello"));
    expect(result).not.toBeNull();
    expect(result!.data).toBe("hello");
  });

  it("uses score to break ties", () => {
    const c = new MultiFrameConsensus(6, 3);
    c.push(makeScanResult("a", 0.5));
    c.push(makeScanResult("b", 0.9));
    c.push(makeScanResult("a", 0.5));
    c.push(makeScanResult("b", 0.9));
    c.push(makeScanResult("a", 0.5));
    const result = c.push(makeScanResult("b", 0.9));

    expect(result).not.toBeNull();
    expect(result!.data).toBe("b");
  });

  it("evicts old frames from buffer", () => {
    const c = new MultiFrameConsensus(3, 2);
    c.push(makeScanResult("old"));
    c.push(makeScanResult("old"));
    c.push(makeScanResult("new"));
    c.push(makeScanResult("new"));
    const result = c.push(makeScanResult("new"));
    expect(result).not.toBeNull();
    expect(result!.data).toBe("new");
  });

  it("reset clears buffer", () => {
    const c = new MultiFrameConsensus(5, 3);
    c.push(makeScanResult("hello"));
    c.push(makeScanResult("hello"));
    c.reset();
    expect(c.size).toBe(0);
    expect(c.push(makeScanResult("hello"))).toBeNull();
  });
});
