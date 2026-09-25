import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// base 设为相对路径，便于直接部署到 GitHub Pages 子路径
export default defineConfig({
  plugins: [vue()],
  base: "./",
  build: { outDir: "dist", assetsInlineLimit: 4096 }
});