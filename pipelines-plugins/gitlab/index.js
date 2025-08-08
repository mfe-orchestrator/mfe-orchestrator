#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import archiver from 'archiver';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

async function zipFolder(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 }});

    output.on('close', () => resolve());
    archive.on('error', err => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('apikey', { type: 'string', demandOption: true })
    .option('slug', { type: 'string', demandOption: true })
    .option('domain', { type: 'string', demandOption: true })
    .option('path', { type: 'string', demandOption: true })
    .option('version', { type: 'string', demandOption: true })
    .argv;

  const { apikey, slug, domain, path: folderPath, version } = argv;

  if (!fs.existsSync(folderPath)) {
    console.error(`Errore: la cartella "${folderPath}" non esiste`);
    process.exit(1);
  }

  const zipName = `upload_${slug}_${version}.zip`;
  const zipPath = path.resolve(zipName);

  console.log(`Zippando la cartella "${folderPath}" in "${zipName}"...`);
  await zipFolder(folderPath, zipPath);
  console.log(`Zip creato.`);

  const url = `${domain.replace(/\/$/, '')}/microfrontends/by-slug/${slug}/upload/${version}`;

  console.log(`Uploading su ${url}...`);

  const zipBuffer = fs.readFileSync(zipPath);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apikey}`,
      'Content-Type': 'application/zip',
      'Content-Length': zipBuffer.length.toString(),
    },
    body: zipBuffer,
  });

  if (!res.ok) {
    console.error(`Upload fallito: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    process.exit(1);
  }

  console.log('Upload completato con successo!');
  fs.unlinkSync(zipPath);
}

main().catch(err => {
  console.error('Errore:', err);
  process.exit(1);
});
