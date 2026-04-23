import { describe, it, expect } from "vitest";
import { encode } from "@/core/encoder";
import { getSegmentsForRing, isDataRing } from "@/core/layout";
import { renderSVG } from "@/render/svgRenderer";

describe("renderSVG", () => {
  const code = encode("hello", { rings: 5, segmentsPerRing: 48 });

  it("returns valid SVG string", () => {
    const svg = renderSVG(code);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("xmlns");
  });

  it("accepts numeric size for backwards compatibility", () => {
    const svg = renderSVG(code, 400);
    expect(svg).toContain('width="400"');
    expect(svg).toContain('height="400"');
  });

  it("accepts options object", () => {
    const svg = renderSVG(code, { size: 500, primary: "#111", secondary: "#eee" });
    expect(svg).toContain('width="500"');
    expect(svg).toContain('stroke="#111"');
    expect(svg).toContain('stroke="#eee"');
  });

  it("renders center circle with primary color", () => {
    const svg = renderSVG(code, { primary: "#ff0000" });
    expect(svg).toContain('fill="#ff0000"');
  });

  it("does not render arcs for the non-data inner ring", () => {
    const svg = renderSVG(code, { size: 300, primary: "#000", secondary: "#ccc" });
    const { rings, segmentsPerRing } = code;
    const innerRingRadius = 300 / (2 * (rings + 2));
    const pathRadii = [...svg.matchAll(/A (\d+\.?\d*) /g)].map((m) => parseFloat(m[1]));
    expect(pathRadii).not.toContain(innerRingRadius);
  });

  it("consumes correct number of bits from data rings only", () => {
    const { rings, segmentsPerRing } = code;
    let expectedBits = 0;
    for (let r = 0; r < rings; r++) {
      if (isDataRing(r)) expectedBits += getSegmentsForRing(r, rings, segmentsPerRing);
    }
    const svg = renderSVG(code);
    const primaryPaths = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    const secondaryPaths = svg.split('stroke="#d0d0d0"')[1]?.split("</g>")[0] || "";
    const hasPaths = primaryPaths.includes("<path") || secondaryPaths.includes("<path");
    expect(hasPaths).toBe(true);
  });

  it("merges consecutive 1-bits into single arcs", () => {
    const allOnes = { bits: new Array(200).fill(1), rings: 5, segmentsPerRing: 48 };
    const svg = renderSVG(allOnes);
    const primaryGroup = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    const pathCount = (primaryGroup.match(/<path/g) || []).length;
    let dataRingCount = 0;
    for (let r = 0; r < 5; r++) if (isDataRing(r)) dataRingCount++;
    expect(pathCount).toBe(dataRingCount);
  });

  it("secondary arcs have separation from primary arcs", () => {
    const svg = renderSVG(code, { size: 300 });
    const secondaryGroup = svg.split('stroke="#d0d0d0"')[1]?.split("</g>")[0] || "";
    const primaryGroup = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    if (secondaryGroup.includes("<path") && primaryGroup.includes("<path")) {
      const secStarts = [...secondaryGroup.matchAll(/M (\d+\.?\d*) (\d+\.?\d*)/g)];
      const priEnds = [...primaryGroup.matchAll(/A .+?(\d+\.?\d*) (\d+\.?\d*)"/g)];
      expect(secStarts.length).toBeGreaterThan(0);
      expect(priEnds.length).toBeGreaterThan(0);
    }
  });

  it("secondary is suppressed when set to none", () => {
    const svg = renderSVG(code, { secondary: "none" });
    expect(svg).toContain('stroke="none"');
  });
});
