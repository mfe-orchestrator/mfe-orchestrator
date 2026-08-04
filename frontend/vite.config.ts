import react from "@vitejs/plugin-react-swc"
import { readFileSync } from "fs"
import path from "path"
import { defineConfig } from "vite"

const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))

// Changes at every build: appended to the assets loaded at runtime (translations) to bust the browser cache
const buildId = `${packageJson.version}.${Date.now().toString(36)}`

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    define: {
        "import.meta.env.VITE_APP_BUILD_ID": JSON.stringify(buildId)
    },
    server: {
        host: "::",
        proxy: {
            "/api/": {
                target: "http://localhost:3000/",
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, "")
            }
        }
    },
    plugins: [react()].filter(Boolean),
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src")
        }
    }
}))
