import { invoke, isTauri } from '@tauri-apps/api/core';

let desktopApiBaseUrlPromise;

export async function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Navegador: Vite envía /api al backend mediante el proxy.
  if (!isTauri()) {
    return `/api${normalizedPath}`;
  }

  // Escritorio: Rust devuelve la URL del backend iniciado por Tauri.
  if (!desktopApiBaseUrlPromise) {
    desktopApiBaseUrlPromise = invoke('backend_base_url').catch((error) => {
      desktopApiBaseUrlPromise = undefined;
      throw error;
    });
  }

  const baseUrl = await desktopApiBaseUrlPromise;
  return `${baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
}
