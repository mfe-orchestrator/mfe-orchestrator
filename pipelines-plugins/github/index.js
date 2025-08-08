import core from '@actions/core';
import fetch from 'node-fetch';
import fs from 'fs';
import AdmZip from 'adm-zip';
import path from 'path';

async function run() {
  try {
    const apikey = core.getInput('apikey');
    const microSlug = core.getInput('microfrontend-slug');
    const domain = core.getInput('domain').replace(/\/$/, ''); // rimuove trailing slash
    const filePath = core.getInput('file-path');
    const version = core.getInput('version');

    // 1. Crea zip
    const zip = new AdmZip();
    zip.addLocalFolder(filePath);
    const zipPath = path.join(process.cwd(), `${microSlug}-${version}.zip`);
    zip.writeZip(zipPath);
    core.info(`Zipped folder: ${zipPath}`);

    // 2. Upload
    const url = `${domain}/microfrontends/by-slug/${microSlug}/upload/${version}`;
    core.info(`Uploading to ${url}...`);

    const stats = fs.statSync(zipPath);
    const fileStream = fs.createReadStream(zipPath);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apikey}`,
        'Content-Length': stats.size
      },
      body: fileStream
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed: ${response.status} ${text}`);
    }

    core.info(`Upload completed: ${await response.text()}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
