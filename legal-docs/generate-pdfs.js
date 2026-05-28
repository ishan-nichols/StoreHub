import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const docs = [
  { html: "articles-of-organization.html", pdf: "StoreHub-LLC-Articles-of-Organization.pdf" },
  { html: "operating-agreement.html", pdf: "StoreHub-LLC-Operating-Agreement.pdf" },
];

for (const { html, pdf } of docs) {
  const htmlPath = `file://${resolve(__dirname, html)}`;
  const pdfPath = resolve(__dirname, pdf);
  console.log(`Generating ${pdf}...`);
  execSync(
    `chromium --headless=new --no-sandbox --disable-gpu ` +
    `--print-to-pdf="${pdfPath}" ` +
    `--print-to-pdf-no-header ` +
    `"${htmlPath}"`,
    { stdio: "inherit" }
  );
  console.log(`  -> ${pdfPath}`);
}

console.log("Done.");
