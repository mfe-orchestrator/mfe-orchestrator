import { defineConfig } from "vite"
import react from "@vitejs/plugin-react-swc"
import path from "path"

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
