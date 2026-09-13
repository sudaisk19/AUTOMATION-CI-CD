import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseStringPromise } from 'xml2js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TESTDATA_DIR = path.resolve(__dirname, '../testdata');

/**
 * Dynamically read JSON or XML test data from testdata/.
 * @param {string} name - filename without extension (e.g. 'users')
 * @param {'json'|'xml'} [format='json']
 */
export async function readTestData(name, format = 'json') {
  const ext = format === 'xml' ? '.xml' : '.json';
  const filePath = path.join(TESTDATA_DIR, `${name}${ext}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`readTestData: file not found — ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');

  if (format === 'xml') {
    return parseStringPromise(raw, { explicitArray: false, mergeAttrs: true });
  }

  return JSON.parse(raw);
}

/** Synchronous JSON test data read for use in test bodies. */
export function loadTestData(name) {
  const filePath = path.join(TESTDATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`loadTestData: file not found — ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function listTestData() {
  return fs
    .readdirSync(TESTDATA_DIR)
    .filter((f) => f.endsWith('.json') || f.endsWith('.xml'))
    .map((f) => path.basename(f, path.extname(f)));
}

/** @deprecated Use loadTestData */
export function loadFixture(name) {
  return loadTestData(name);
}

/** @deprecated Use readTestData */
export function readFixture(name, format = 'json') {
  return readTestData(name, format);
}
