import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Same-origin in dev exactly like production, where FastAPI serves the built
// SPA — cookies just work and CORS never enters the picture.
const proxy = { "/api": "http://localhost:8000" }

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { proxy },
  preview: { proxy },
})
