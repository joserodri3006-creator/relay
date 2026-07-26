import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/web",
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": process.env.API_TARGET ?? "http://localhost:3001" } }
});
