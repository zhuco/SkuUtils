import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["clawdbotweb.site", "www.clawdbotweb.site"],
    host: "0.0.0.0",
    port: 4173
  },
  preview: {
    allowedHosts: ["clawdbotweb.site", "www.clawdbotweb.site"],
    host: "0.0.0.0",
    port: 4173
  }
});
