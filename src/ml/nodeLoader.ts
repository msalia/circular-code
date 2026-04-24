import * as tf from "@tensorflow/tfjs";

export async function loadModelFromDisk(
  modelJsonPath: string,
): Promise<tf.GraphModel | tf.LayersModel> {
  const fs = await import("fs");
  const path = await import("path");

  const raw = fs.readFileSync(modelJsonPath, "utf-8");
  const modelJSON = JSON.parse(raw);
  const dir = path.dirname(modelJsonPath);

  const manifest = modelJSON.weightsManifest[0];
  const shardPaths: string[] = manifest.paths;
  const buffers = shardPaths.map((p: string) => fs.readFileSync(path.join(dir, p)));

  const totalBytes = buffers.reduce((sum: number, b: Buffer) => sum + b.byteLength, 0);
  const weightData = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(weightData);
  let offset = 0;
  for (const buf of buffers) {
    view.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
    offset += buf.byteLength;
  }

  const weightSpecs = manifest.weights as tf.io.WeightsManifestEntry[];

  if (modelJSON.format === "graph-model" || modelJSON.modelTopology?.node) {
    return await tf.loadGraphModel(
      tf.io.fromMemory(modelJSON.modelTopology, weightSpecs, weightData),
    );
  } else {
    return await tf.loadLayersModel(
      tf.io.fromMemory({
        modelTopology: modelJSON.modelTopology,
        weightSpecs,
        weightData,
      }),
    );
  }
}
