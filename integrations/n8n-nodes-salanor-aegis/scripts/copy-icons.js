const { copyFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..");
const nodeDir = join(root, "nodes/SalanorAegis");
const distDir = join(root, "dist/nodes/SalanorAegis");

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("copied", dest);
}

mkdirSync(distDir, { recursive: true });
copy(join(nodeDir, "salanor.png"), join(distDir, "salanor.png"));
copy(join(nodeDir, "salanor.svg"), join(distDir, "salanor.svg"));
