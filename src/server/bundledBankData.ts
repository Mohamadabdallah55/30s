import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

export function readBundledBank(name: 'thirty_seconds_question_bank' | 'thirty_30s_sports_religion_addon' | 'thirty_30s_gap_fill_addon'): unknown {
  const filename = resolve(process.cwd(), 'data', 'imports', name + '.json.gz');
  return JSON.parse(gunzipSync(readFileSync(filename)).toString('utf8'));
}
