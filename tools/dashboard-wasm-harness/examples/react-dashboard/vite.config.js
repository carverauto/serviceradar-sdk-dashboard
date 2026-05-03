import {defineConfig} from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"
import {fileURLToPath} from "node:url"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      react: path.join(rootDir, "node_modules/react"),
      "react-dom/client": path.join(rootDir, "node_modules/react-dom/client"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    lib: {
      entry: "src/main.jsx",
      formats: ["es"],
      fileName: () => "renderer.js",
    },
    rollupOptions: {
      output: {
        entryFileNames: "renderer.js",
        chunkFileNames: "renderer-[hash].js",
        assetFileNames: "renderer-[hash][extname]",
      },
    },
  },
})
