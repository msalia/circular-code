import { describe, it, expect } from "vitest";
import { encode } from "@/core/encoder";
import { getRingWidth, getSegmentsForRing, isDataRing } from "@/core/layout";
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
    const { rings } = code;
    const innerRingRadius = getRingWidth(rings, 300);
    const pathRadii = [...svg.matchAll(/A (\d+\.?\d*) /g)].map((m) => parseFloat(m[1]));
    expect(pathRadii).not.toContain(innerRingRadius);
  });

  it("renders paths for each data ring", () => {
    const { rings } = code;
    const svg = renderSVG(code, { size: 300 });
    const primaryGroup = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    const secondaryGroup = svg.split('stroke="#d0d0d0"')[1]?.split("</g>")[0] || "";
    const allPaths = (primaryGroup.match(/<path/g) || []).length + (secondaryGroup.match(/<path/g) || []).length;
    let dataRingCount = 0;
    for (let r = 0; r < rings; r++) if (isDataRing(r)) dataRingCount++;
    expect(allPaths).toBeGreaterThanOrEqual(dataRingCount);
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

  it("renders both primary and secondary arcs for mixed data", () => {
    const svg = renderSVG(code, { size: 300 });
    const secondaryGroup = svg.split('stroke="#d0d0d0"')[1]?.split("</g>")[0] || "";
    const primaryGroup = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    expect(secondaryGroup).toContain("<path");
    expect(primaryGroup).toContain("<path");
  });

  it("all-zero bits produce only secondary arcs, no primary", () => {
    const allZeros = { bits: new Array(200).fill(0), rings: 5, segmentsPerRing: 48 };
    const svg = renderSVG(allZeros, { size: 300 });
    const secondaryGroup = svg.split('stroke="#d0d0d0"')[1]?.split("</g>")[0] || "";
    const primaryGroup = svg.split('stroke="#000000"')[1]?.split("</g>")[0] || "";
    expect(secondaryGroup).toContain("<path");
    expect((primaryGroup.match(/<path/g) || []).length).toBe(0);
  });

  it("secondary is suppressed when set to none", () => {
    const svg = renderSVG(code, { secondary: "none" });
    expect(svg).toContain('stroke="none"');
  });

  describe("orientation ring", () => {
    it("renders 3 orientation arc paths", () => {
      const svg = renderSVG(code, { size: 300 });
      const groups = svg.split('<g stroke="#000000"');
      const orientationGroup = groups[groups.length - 1].split("</g>")[0];
      const pathCount = (orientationGroup.match(/<path/g) || []).length;
      expect(pathCount).toBe(3);
    });

    it("orientation arcs use the primary color", () => {
      const svg = renderSVG(code, { size: 300, primary: "#ff0000" });
      const groups = svg.split('<g stroke="#ff0000"');
      expect(groups.length).toBeGreaterThanOrEqual(3);
    });

    it("orientation arcs are at a larger radius than data rings", () => {
      const svg = renderSVG(code, { size: 300 });
      const { rings } = code;
      const allRadii = [...svg.matchAll(/A (\d+\.?\d*) \1/g)].map((m) => parseFloat(m[1]));
      const maxDataRadius = (rings) * getRingWidth(rings, 300);
      const orientationRadii = allRadii.filter((r) => r > maxDataRadius);
      expect(orientationRadii.length).toBe(3);
    });

    it("orientation ring is present for all ring counts", () => {
      for (const rings of [3, 4, 5, 6]) {
        const c = encode("test", { rings, segmentsPerRing: 48 });
        const svg = renderSVG(c, { size: 300 });
        const groups = svg.split('<g stroke="#000000"');
        const lastGroup = groups[groups.length - 1].split("</g>")[0];
        expect((lastGroup.match(/<path/g) || []).length).toBe(3);
      }
    });
  });
});
