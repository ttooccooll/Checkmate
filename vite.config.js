import { defineConfig } from "vite";

// Static files that must keep their runtime URLs (assets/, npcDialog.json)
// live in public/. The api/ directory is deployed by Vercel separately and
// is untouched by this build.
export default defineConfig({
  server: {
    port: 8347,
  },
});
