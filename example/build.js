const { build } = require("esbuild");
const path = require("path");

build({
  entryPoints: [path.join(__dirname, "app.ts")],
  bundle: true,
  outfile: path.join(__dirname, "app.js"),
  format: "iife",
  platform: "browser",
  target: "es2020",
  alias: {
    "@": path.resolve(__dirname, "..", "src"),
  },
  sourcemap: true,
}).then(() => {
  console.log("Built example/app.js");
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
