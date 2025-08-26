const fs = require("fs")
const path = require("path")

// Funzione per copiare i file
function copyDirectory(src, dest) {
    // Verifica se la cartella di destinazione esiste, altrimenti creala
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true })
    }

    // Leggi i file nella cartella sorgente
    const files = fs.readdirSync(src)

    // Copia ogni file
    files.forEach(file => {
        const srcFile = path.join(src, file)
        const destFile = path.join(dest, file)

        fs.copyFileSync(srcFile, destFile)
        console.log(`Copied: ${srcFile} -> ${destFile}`)
    })
}

function copyFile(src, dest) {
    // Verifica se la cartella di destinazione esiste, altrimenti creala
    fs.copyFileSync(src, dest)
    console.log(`Copied: ${src} -> ${dest}`)
}

function postBuild() {
    console.log("Runing Postbuild script")
    copyFile(path.join(__dirname, "pnpm-lock.yaml"), path.join(__dirname, "dist", "pnpm-lock.yaml"))
    copyDirectory(path.join(__dirname, "src", "templates/emails"), path.join(__dirname, "dist", "src/templates/emails"))
    console.log("Postbuild script done")
}

postBuild()
