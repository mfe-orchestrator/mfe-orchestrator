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
                target: "http://127.0.0.1:3000/",
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, "")
            },
            // OAuth discovery for MCP clients: served at the origin root, path kept as is
            "/.well-known/oauth-protected-resource": {
                target: "http://127.0.0.1:3000/",
                changeOrigin: true
            },
            "/.well-known/oauth-authorization-server": {
                target: "http://127.0.0.1:3000/",
                changeOrigin: true
            },
            "/.well-known/openid-configuration": {
                target: "http://127.0.0.1:3000/",
                changeOrigin: true
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
