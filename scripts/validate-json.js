// scripts/validate-json.js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";


function readJson(p) {
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function validateFile({ ajv, schemaPath, dataPath, label }) {
  const schema = readJson(schemaPath);
  const data = readJson(dataPath);

  const validate = ajv.compile(schema);
  const ok = validate(data);

  if (!ok) {
    console.error(`\n❌ Validation failed: ${label}`);
    console.error(`Schema: ${schemaPath}`);
    console.error(`Data:   ${dataPath}\n`);
    console.error(validate.errors);
    process.exitCode = 1;
    return false;
  }

  console.log(`✅ Valid: ${label}`);
  return true;
}

const root = process.cwd();
const ajv = new Ajv2020({ allErrors: true, strict: false });


const ok1 = validateFile({
  ajv,
  schemaPath: path.join(root, "schema", "events.schema.json"),
  dataPath: path.join(root, "events.json"),
  label: "events.json"
});

const ok2 = validateFile({
  ajv,
  schemaPath: path.join(root, "schema", "fighters.schema.json"),
  dataPath: path.join(root, "fighters.json"),
  label: "fighters.json"
});

if (ok1 && ok2) {
  console.log("\n✅ All JSON files passed schema validation.\n");
} else {
  console.error("\n❌ Fix the JSON output before committing. Your site will thank you.\n");
  process.exit(1);
}
