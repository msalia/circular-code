const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "..", "dist");
const SRC_ALIAS = "@/";

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

function rewriteFile(filePath) {
  let content = fs.readFileSync(filePath, "utf-8");
  const fileDir = path.dirname(filePath);
  const srcDir = path.join(DIST, "src");

  const pattern = /require\("@\/([^"]+)"\)|from "@\/([^"]+)"/g;
  let changed = false;

  content = content.replace(pattern, (match, reqPath, fromPath) => {
    const target = reqPath || fromPath;
    const absTarget = path.join(srcDir, target);
    let rel = path.relative(fileDir, absTarget);
    if (!rel.startsWith(".")) rel = "./" + rel;

    changed = true;
    if (reqPath) return `require("${rel}")`;
    return `from "${rel}"`;
  });

  if (changed) {
    fs.writeFileSync(filePath, content);
  }
}

const files = walk(DIST);
let count = 0;
for (const f of files) {
  const before = fs.readFileSync(f, "utf-8");
  rewriteFile(f);
  if (fs.readFileSync(f, "utf-8") !== before) count++;
}
console.log(`Resolved @/ aliases in ${count} files`);
