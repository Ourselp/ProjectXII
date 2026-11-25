// extract/raw_data/ (AssetStudio -m extract of Content/Data) -> extract/data/<Table>.json, plus extract/data/i18n_fr.json
const fs = require('fs'), { readFile } = require('./unityread'), { readI18n } = require('./i18n');
const [client] = process.argv.slice(2);
fs.mkdirSync('extract/data', { recursive: true });
for (const d of fs.readdirSync('extract/raw_data')) for (const f of fs.readdirSync('extract/raw_data/' + d)) {
  if (f.endsWith('.resS')) continue;
  for (const o of readFile(`extract/raw_data/${d}/${f}`)) {
    if (o.value.$warning) console.warn(o.name, o.value.$warning);
    fs.writeFileSync(`extract/data/${o.name}.json`, JSON.stringify(o.value));
  }
}
fs.writeFileSync('extract/data/i18n_fr.json', JSON.stringify(readI18n(`${client}/Content/I18n/fr.bin`)));
console.log(fs.readdirSync('extract/data').length, 'files');
