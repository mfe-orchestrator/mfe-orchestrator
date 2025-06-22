const fs = require('fs');
const path = require('path');

// Funzione per copiare i file
function copyFiles(src, dest) {
  // Verifica se la cartella di destinazione esiste, altrimenti creala
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Leggi i file nella cartella sorgente
  const files = fs.readdirSync(src);

  // Copia ogni file
  files.forEach(file => {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);

    fs.copyFileSync(srcFile, destFile);
    console.log(`Copied: ${srcFile} -> ${destFile}`);
  });
}

function postBuild() {
  console.log('Runing Postbuild script');
  // copyFiles(
  //   path.join(__dirname, 'src', 'emailTemplates'),
  //   path.join(__dirname, 'dist', 'emailTemplates')
  // );
  console.log('Postbuild script done');
}

postBuild();
