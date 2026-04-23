import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const taxPath = path.join(__dirname, "../artifacts/storehub/src/data/taxData.ts");
const s = fs.readFileSync(taxPath, "utf8");
// us("AL","Alabama", 0.04, 0.0510, 0.0018, max, ...
const re = /us\("([A-Z]{2})",[^,]+,\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)/g;
const m = {};
let x;
while ((x = re.exec(s))) {
  const sum = parseFloat(x[2]) + parseFloat(x[3]) + parseFloat(x[4]);
  m[x[1]] = Number(sum.toFixed(5));
}
const outTs = path.join(__dirname, "../artifacts/api-server/src/data/usStateSalesTaxAvg.ts");
const body = JSON.stringify(m, null, 2);
const ts = `/** Auto-generated from taxData via scripts/extract-us-tax-rates.mjs — combined avg state+county+city */\nexport const US_STATE_SALES_TAX_AVG: Record<string, number> = ${body};\n`;
fs.mkdirSync(path.dirname(outTs), { recursive: true });
fs.writeFileSync(outTs, ts);
console.log("Wrote", outTs, Object.keys(m).length, "states");
