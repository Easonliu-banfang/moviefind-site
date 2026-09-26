import { createApp } from "vue";
import App from "./App.vue";

// 注册 Service Worker：缓存站点图标，离线可用
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createApp(App).mount("#app");