const { copyFileSync, mkdirSync } = require("node:fs");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..");

function copy(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log("copied", dest);
}

copy(
  join(root, "nodes/SalanorAegis/salanor.svg"),
  join(root, "dist/nodes/SalanorAegis/salanor.svg"),
);
