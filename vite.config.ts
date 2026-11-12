import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Con el servidor corriendo en local (cd server && npm run dev): VITE_API=1 npm run dev
  server: { proxy: { "/api": "http://localhost:3000" } },
  test: { environment: "node", exclude: ["**/node_modules/**", "server/**"] },
} as any);
