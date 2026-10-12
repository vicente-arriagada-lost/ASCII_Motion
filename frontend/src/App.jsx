import { getApiUrl } from './api.js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import './App.css';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp|bmp|gif)$/i;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const channel = (value) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function hasValidCharacterColors(content, colorMap) {
  if (typeof content !== 'string' || typeof colorMap !== 'string') return false;
  const glyphCount = Array.from(content).filter((character) => character !== '\n').length;
  return colorMap.length === glyphCount * 6 && /^[0-9a-f]*$/i.test(colorMap);
}

function renderColorizedAscii(content, colorMap) {
  if (!hasValidCharacterColors(content, colorMap)) return content;

  let colorIndex = 0;
  const lines = content.split('\n');

  return lines.map((line, lineIndex) => {
    const glyphs = Array.from(line).map((character, characterIndex) => {
      const color = colorMap.slice(colorIndex * 6, colorIndex * 6 + 6);
      colorIndex += 1;
      return (
        <span key={`${lineIndex}-${characterIndex}`} style={{ color: `#${color}` }}>
          {character}
        </span>
      );
    });

    return (
      <span key={`line-${lineIndex}`}>
        {glyphs}
        {lineIndex < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
}

function escapeHtmlCharacter(character) {
  return character
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderColorizedHtml(content, colorMap) {
  if (!hasValidCharacterColors(content, colorMap)) {
    return Array.from(content, escapeHtmlCharacter).join('');
  }

  let colorIndex = 0;
  return Array.from(content).map((character) => {
    if (character === '\n') return '\n';
    const color = colorMap.slice(colorIndex * 6, colorIndex * 6 + 6);
    colorIndex += 1;
    return `<span style="color:#${color}">${escapeHtmlCharacter(character)}</span>`;
  }).join('');
}

function renderColorizedAnsi(content, colorMap, fallbackColor, backgroundColor) {
  const escape = '\u001b';
  const { r: backgroundR, g: backgroundG, b: backgroundB } = hexToRgb(backgroundColor);
  let result = `${escape}[48;2;${backgroundR};${backgroundG};${backgroundB}m`;

  if (!hasValidCharacterColors(content, colorMap)) {
    const { r, g, b } = hexToRgb(fallbackColor);
    return `${result}${escape}[38;2;${r};${g};${b}m${content}${escape}[0m`;
  }

  let colorIndex = 0;
  for (const character of content) {
    if (character === '\n') {
      result += character;
      continue;
    }
    const hex = colorMap.slice(colorIndex * 6, colorIndex * 6 + 6);
    colorIndex += 1;
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    result += `${escape}[38;2;${red};${green};${blue}m${character}`;
  }

  return `${result}${escape}[0m`;
}

function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

function hsvToHex(hue, saturation, value = 1) {
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  let rgb;

  if (hue < 60) rgb = { r: chroma, g: secondary, b: 0 };
  else if (hue < 120) rgb = { r: secondary, g: chroma, b: 0 };
  else if (hue < 180) rgb = { r: 0, g: chroma, b: secondary };
  else if (hue < 240) rgb = { r: 0, g: secondary, b: chroma };
  else if (hue < 300) rgb = { r: secondary, g: 0, b: chroma };
  else rgb = { r: chroma, g: 0, b: secondary };

  return rgbToHex({
    r: (rgb.r + offset) * 255,
    g: (rgb.g + offset) * 255,
    b: (rgb.b + offset) * 255,
  });
}

function wheelPointForColor(hex) {
  const { hue, saturation } = hexToHsv(hex);
  const angle = ((hue - 90) * Math.PI) / 180;
  const radius = saturation * 47;

  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  };
}

function App() {
  const [view, setView] = useState('home');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(40);
  const [charset, setCharset] = useState('standard');
  const [customCharset, setCustomCharset] = useState('@%#*+=-:. ');
  const [gamma, setGamma] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [brightness, setBrightness] = useState(1);
  const [asciiColor, setAsciiColor] = useState('#d0baff');
  const [backgroundColor, setBackgroundColor] = useState('#0c0c11');
  const [activeWheelTarget, setActiveWheelTarget] = useState('text');
  const [ascii, setAscii] = useState('');
  const [asciiColors, setAsciiColors] = useState('');
  const [preserveImageColors, setPreserveImageColors] = useState(true);
  const [sourceAscii, setSourceAscii] = useState('');
  const [isTextProject, setIsTextProject] = useState(false);
  const [animationFrames, setAnimationFrames] = useState([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [asciiFontSize, setAsciiFontSize] = useState(10);

  const isGifFile = Boolean(file && /\.gif$/i.test(file.name));
  const isTextArt = Boolean(file && /\.txt$/i.test(file.name));
  const isTextComparison = isTextArt && isTextProject;
  const isSingleTextImport = isTextArt && !isTextProject;
  const currentAnimationFrame = animationFrames[currentFrameIndex];
  const displayedAscii = isGifFile
    ? (currentAnimationFrame?.content ?? '')
    : ascii;
  const displayedColors = isGifFile
    ? (currentAnimationFrame?.colors ?? '')
    : asciiColors;
  const activeCharacterColors = preserveImageColors && hasValidCharacterColors(displayedAscii, displayedColors)
    ? displayedColors
    : '';

  const activeWheelColor =
    activeWheelTarget === 'text' ? asciiColor : backgroundColor;
  const activeWheelHsv = hexToHsv(activeWheelColor);
  const wheelPoint = wheelPointForColor(activeWheelColor);

  const fileInput = useRef(null);
  const projectInputRef = useRef(null);
  const asciiPreviewRef = useRef(null);
  const previewUrlRef = useRef('');
  const heightTouchedRef = useRef(false);
  const sourceDimensionsRef = useRef({ width: 0, height: 0 });
  const hasConvertedRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const wheelFrameRef = useRef(0);
  const pendingWheelPointRef = useRef(null);
  const convertImageRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      abortControllerRef.current?.abort();
      if (wheelFrameRef.current) {
        cancelAnimationFrame(wheelFrameRef.current);
      }
      wheelFrameRef.current = 0;
      pendingWheelPointRef.current = null;
    };
  }, []);

  function cancelPendingConversion() {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setPreviewUrl('');
  }

  function updatePreview(selectedFile) {
    clearPreview();
    const url = URL.createObjectURL(selectedFile);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  function resetApp() {
    cancelPendingConversion();
    clearPreview();
    setFile(null);
    setAnimationFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setAscii('');
    setAsciiColors('');
    setPreserveImageColors(true);
    setSourceAscii('');
    setIsTextProject(false);
    setNotice('');
    hasConvertedRef.current = false;
    sourceDimensionsRef.current = { width: 0, height: 0 };
    heightTouchedRef.current = false;

    setWidth(80);
    setHeight(40);
    setCharset('standard');
    setCustomCharset('@%#*+=-:. ');
    setGamma(1);
    setContrast(1);
    setBrightness(1);
    setAsciiColor('#d0baff');
    setBackgroundColor('#0c0c11');
    setActiveWheelTarget('text');
    setView('home');
  }

  function chooseFile(selectedFile) {
    if (!selectedFile) return;

    if (!ACCEPTED_EXTENSIONS.test(selectedFile.name)) {
      setNotice('Formato no compatible. Selecciona PNG, JPG, WEBP, BMP o GIF.');
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setNotice('El archivo supera el límite de 25 MB.');
      return;
    }

    if (selectedFile.size === 0) {
      setNotice('El archivo está vacío.');
      return;
    }

    cancelPendingConversion();
    hasConvertedRef.current = false;
    heightTouchedRef.current = false;
    sourceDimensionsRef.current = { width: 0, height: 0 };

    updatePreview(selectedFile);
    setFile(selectedFile);
    setSourceAscii('');
    setAsciiColors('');
    setPreserveImageColors(true);
    setAnimationFrames([]);
    setIsTextProject(false);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setAscii('');
    setNotice('');
    setView('workspace');
  }

  async function convertImage({ live = false } = {}) {
    if (!file) return;
    if (/\.txt$/i.test(file.name)) {
      setNotice('Este archivo ya contiene arte ASCII. Edita sus caracteres en el panel de texto.');
      return;
    }

    const isGif = /\.gif$/i.test(file.name);

    if (charset === 'custom' && customCharset.length === 0) {
      setNotice('Introduce al menos un carácter para el formato personalizado.');
      return;
    }

    hasConvertedRef.current = true;
    setNotice('');

    const requestId = ++requestIdRef.current;
    abortControllerRef.current?.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('width', String(width));
    formData.append('height', String(height));
    formData.append(
      'charset',
      charset === 'custom' ? customCharset : charset,
    );
    formData.append('gamma', String(gamma));
    formData.append('contrast', String(contrast));
    formData.append('brightness', String(brightness));

    try {
      const apiUrl = await getApiUrl(
        isGif ? '/convert/gif' : '/convert/image',
      );

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'No se pudo convertir el archivo.');
      }

      if (requestId !== requestIdRef.current) return;

      if (isGif) {
        if (!Array.isArray(result.frames) || result.frames.length === 0) {
          throw new Error('La API no devolvió fotogramas GIF válidos.');
        }

        if (!result.frames.every((frame) =>
          typeof frame.content === 'string'
          && frame.content.length > 0
          && Number.isFinite(frame.duration_ms)
          && frame.duration_ms >= 0
        )) {
          throw new Error('La respuesta contiene fotogramas GIF inválidos.');
        }

        setAnimationFrames(result.frames);
        setCurrentFrameIndex(0);
        setIsPlaying(result.frames.length > 1);
        setAscii(result.frames[0].content);
        setAsciiColors('');
      } else {
        setAnimationFrames([]);
        setCurrentFrameIndex(0);
        setIsPlaying(false);
        setAscii(result.content);
        setAsciiColors(typeof result.colors === 'string' ? result.colors : '');
      }
    } catch (error) {
      if (error.name !== 'AbortError' && requestId === requestIdRef.current) {
        setNotice(
          error instanceof TypeError
            ? 'No se pudo conectar con la API local. Comprueba que FastAPI esté ejecutándose.'
            : error.message || 'Ocurrió un error durante la conversión.',
        );

        if (!live) setAscii('');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    convertImageRef.current = convertImage;
  });

  // Convierte automáticamente cada imagen/GIF recién seleccionado.
  // Los proyectos ya importados conservan su resultado y no se recalculan aquí.
  useEffect(() => {
    if (!file || /\.txt$/i.test(file.name) || hasConvertedRef.current) return undefined;

    const timer = window.setTimeout(() => {
      convertImageRef.current?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [file]);

  // Los cambios de ajustes vuelven a convertir el archivo seleccionado.
  useEffect(() => {
    if (!hasConvertedRef.current || !file || /\.txt$/i.test(file.name)) return undefined;

    const timer = window.setTimeout(() => {
      convertImageRef.current?.({ live: true });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    file,
    width,
    height,
    charset,
    customCharset,
    gamma,
    contrast,
    brightness,
  ]);

  // Reproduce los fotogramas respetando la duración devuelta por el motor.
  useEffect(() => {
    if (!isGifFile || !isPlaying || animationFrames.length < 2) {
      return undefined;
    }

    const currentFrame = animationFrames[currentFrameIndex];
    const duration = Math.max(
      20,
      Number(currentFrame?.duration_ms ?? 100),
    );

    const timer = window.setTimeout(() => {
      setCurrentFrameIndex(
        (index) => (index + 1) % animationFrames.length,
      );
    }, duration);

    return () => window.clearTimeout(timer);
  }, [isGifFile, isPlaying, animationFrames, currentFrameIndex]);

  // Ajustar el arte ASCII al espacio real del panel.
  useEffect(() => {
    const container = asciiPreviewRef.current;
    if (!container || !displayedAscii) return undefined;

    const updateFontSize = () => {
      const availableWidth = Math.max(1, container.clientWidth - 28);
      const availableHeight = Math.max(1, container.clientHeight - 28);
      const lines = displayedAscii.split('\n');
      const rows = Math.max(1, lines.length);
      const columns = Math.max(
        1,
        ...lines.map((line) => line.length),
      );

      // Reserva espacio para cada carácter y cada línea.
      const widthFit = availableWidth / (columns * 0.62);
      const heightFit = availableHeight / (rows * 1.1);
      const nextSize = Math.min(14, widthFit, heightFit);

      // El tamaño mínimo permite mostrar también imágenes muy grandes.
      const safeSize = Math.max(0.5, nextSize);

      setAsciiFontSize((current) =>
        Math.abs(current - safeSize) > 0.05 ? safeSize : current
      );
    };

    updateFontSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateFontSize);
      return () => window.removeEventListener('resize', updateFontSize);
    }

    const observer = new ResizeObserver(updateFontSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [displayedAscii]);

  function stepGifFrame(delta) {
    if (animationFrames.length < 2) return;

    setIsPlaying(false);
    setCurrentFrameIndex(
      (index) => (index + delta + animationFrames.length) % animationFrames.length,
    );
  }

  function downloadTextFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function bytesToBase64(bytes) {
    const chunks = [];
    const chunkSize = 0x8000;

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(
        String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
      );
    }

    return btoa(chunks.join(''));
  }

  async function saveExportFile({
    content,
    filename,
    mimeType,
    companionContent = null,
    companionFilename = null,
    companionSuffix = null,
  }) {
    // En navegador se conserva la descarga web. En Tauri se usa un selector
    // nativo y Rust confirma la escritura real antes de informar éxito.
    if (!isTauri()) {
      if (content instanceof Blob) downloadBlobFile(content, filename);
      else downloadTextFile(content, filename, mimeType);

      if (companionContent !== null && companionFilename) {
        downloadTextFile(
          companionContent,
          companionFilename,
          'application/json;charset=utf-8',
        );
      }

      return { saved: true, browser: true, path: null };
    }

    const contentBytes = content instanceof Blob
      ? new Uint8Array(await content.arrayBuffer())
      : new TextEncoder().encode(content);
    const companionBytes = companionContent === null
      ? null
      : new TextEncoder().encode(companionContent);
    const extension = filename.includes('.')
      ? filename.split('.').pop().toLowerCase()
      : '';

    let path;
    try {
      path = await invoke('save_export_file', {
        suggestedName: filename,
        extension,
        contentBase64: bytesToBase64(contentBytes),
        companionBase64: companionBytes === null
          ? null
          : bytesToBase64(companionBytes),
        companionSuffix,
      });
    } catch (error) {
      throw new Error(
        typeof error === 'string'
          ? error
          : error?.message || 'No se pudo guardar el archivo seleccionado.',
      );
    }

    if (!path) return { saved: false, canceled: true, browser: false, path: null };
    return { saved: true, browser: false, path };
  }

  function getExportBaseName() {
    const original = file?.name || 'ascii-motion';
    const base = original
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_');

    return base || 'ascii-motion';
  }

  async function copyAscii() {
    if (!displayedAscii) return;

    try {
      await navigator.clipboard.writeText(displayedAscii);
      setNotice('Arte ASCII copiado al portapapeles.');
    } catch {
      setNotice(
        'No se pudo copiar automáticamente. Selecciona el arte ASCII y cópialo manualmente.',
      );
    }
  }

  async function exportAscii(format) {
    if (!displayedAscii) {
      setNotice('Primero convierte una imagen o un GIF.');
      setExportModalOpen(false);
      return;
    }

    const baseName = getExportBaseName();
    const content = displayedAscii;
    const foreground = hexToRgb(asciiColor);
    const background = hexToRgb(backgroundColor);
    let filename;
    let mimeType;
    let payload;

    try {
      if (format === 'txt') {
        filename = `${baseName}.txt`;
        mimeType = 'text/plain;charset=utf-8';
        payload = content;
      } else if (format === 'json') {
        filename = `${baseName}.json`;
        mimeType = 'application/json;charset=utf-8';
        payload = JSON.stringify({
          format: 'ASCII Motion Export',
          version: 1,
          exportedAt: new Date().toISOString(),
          sourceFile: file?.name ?? null,
          sourceAscii: isTextArt ? sourceAscii : undefined,
          colors: activeCharacterColors || undefined,
          settings: {
            width,
            height,
            charsetMode: charset,
            characters: charset === 'custom' ? customCharset : charset,
            gamma,
            contrast,
            brightness,
            textColor: asciiColor,
            backgroundColor,
            asciiFontSize,
            preserveImageColors,
          },
          content,
          animation: isGifFile
            ? {
                frames: animationFrames,
                currentFrameIndex,
              }
            : null,
        }, null, 2);
      } else if (format === 'html') {
        filename = `${baseName}.html`;
        mimeType = 'text/html;charset=utf-8';

        const title = (file?.name || 'ASCII Motion')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        payload = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;padding:24px;display:grid;place-items:center;background:${backgroundColor};color:${asciiColor}}
pre{max-width:100%;max-height:calc(100vh - 48px);margin:0;overflow:auto;white-space:pre;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:${Math.max(0.5, Math.min(14, asciiFontSize))}px;line-height:1.1;text-align:center}
</style>
</head>
<body><pre>${renderColorizedHtml(content, activeCharacterColors)}</pre></body>
</html>`;
      } else if (format === 'ansi') {
        filename = `${baseName}.ansi`;
        mimeType = 'text/plain;charset=utf-8';

        payload = renderColorizedAnsi(
          content,
          activeCharacterColors,
          asciiColor,
          backgroundColor,
        );
      } else {
        throw new Error('Formato de exportación no reconocido.');
      }

      const result = await saveExportFile({ content: payload, filename, mimeType });
      if (!result.saved) {
        setNotice('Exportación cancelada. No se guardó ningún archivo.');
        return;
      }

      setExportModalOpen(false);
      setNotice(
        result.browser
          ? `Descarga iniciada: ${filename}.`
          : `Archivo guardado correctamente en: ${result.path}`,
      );
    } catch (error) {
      setNotice(error.message || 'No se pudo exportar el arte ASCII.');
    }
  }

  function readFileAsDataUrl(sourceFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('No se pudo leer la imagen original.'));
      };

      reader.onerror = () =>
        reject(reader.error || new Error('Error leyendo la imagen original.'));

      reader.readAsDataURL(sourceFile);
    });
  }

  async function buildProjectPayload() {
    if (!file) {
      throw new Error('No hay un archivo seleccionado para guardar.');
    }

    if (isTextArt) {
      return {
        format: 'ASCII Motion Text Project',
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceName: file.name,
        sourceAscii,
        settings: {
          width,
          height,
          charset,
          customCharset,
          gamma,
          contrast,
          brightness,
          asciiColor,
          backgroundColor,
          asciiFontSize,
          preserveImageColors,
        },
        output: {
          ascii,
          colors: asciiColors,
          frames: [],
          currentFrameIndex: 0,
        },
      };
    }

    const dataUrl = await readFileAsDataUrl(file);

    return {
      format: 'ASCII Motion Project',
      version: 1,
      exportedAt: new Date().toISOString(),
      sourceImage: {
        name: file.name,
        type: file.type || 'application/octet-stream',
        dataUrl,
      },
      settings: {
        width,
        height,
        charset,
        customCharset,
        gamma,
        contrast,
        brightness,
        asciiColor,
        backgroundColor,
        preserveImageColors,
      },
      output: {
        ascii,
        colors: asciiColors,
        frames: animationFrames,
        currentFrameIndex,
      },
    };
  }

  async function exportProject() {
    if (!file) return;

    try {
      const project = await buildProjectPayload();
      const filename = `${getExportBaseName()}.asciimotion.json`;

      const result = await saveExportFile({
        content: JSON.stringify(project, null, 2),
        filename,
        mimeType: 'application/json;charset=utf-8',
      });
      if (!result.saved) {
        setNotice('Exportación cancelada. No se guardó ningún archivo.');
        return;
      }

      setNotice(
        result.browser
          ? `Descarga iniciada: ${filename}.`
          : `Proyecto guardado correctamente en: ${result.path}`, 
      );
    } catch (error) {
      setNotice(error.message || 'No se pudo exportar el proyecto.');
    }
  }

  async function exportAnimatedGif() {
    if (!file || !isGifFile || animationFrames.length === 0) {
      setNotice('Selecciona y convierte un GIF antes de exportar la animación.');
      return;
    }

    setLoading(true);
    setNotice('');

    try {
      const project = await buildProjectPayload();
      const formData = new FormData();
      formData.append('project_json', JSON.stringify(project));
      formData.append('foreground', asciiColor);
      formData.append('background', backgroundColor);
      formData.append(
        'font_size',
        String(Math.round(Math.max(8, Math.min(16, asciiFontSize)))),
      );

      const apiUrl = await getApiUrl('/export/gif');
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let message = 'No se pudo generar el GIF animado.';
        try {
          const errorResult = await response.json();
          if (typeof errorResult.detail === 'string') {
            message = errorResult.detail;
          }
        } catch {
          // Mantener el mensaje genérico si la respuesta no es JSON.
        }
        throw new Error(message);
      }

      const gifBlob = await response.blob();
      if (gifBlob.size === 0) {
        throw new Error('El servidor devolvió un GIF vacío.');
      }

      const baseName = getExportBaseName();
      const result = await saveExportFile({
        content: gifBlob,
        filename: `${baseName}.gif`,
        mimeType: 'image/gif',
        companionContent: JSON.stringify(project, null, 2),
        companionFilename: `${baseName}.asciimotion.json`,
        companionSuffix: '.asciimotion.json',
      });

      if (!result.saved) {
        setNotice('Exportación cancelada. No se guardó ningún archivo.');
        return;
      }

      setExportModalOpen(false);
      setNotice(
        result.browser
          ? `Descargas iniciadas: ${baseName}.gif y ${baseName}.asciimotion.json.`
          : `GIF y proyecto editable guardados en la carpeta seleccionada. GIF: ${result.path}`,
      );
    } catch (error) {
      setNotice(error.message || 'No se pudo exportar la animación.');
    } finally {
      setLoading(false);
    }
  }

  function restoreTextArt(content, sourceName, settings = {}, projectOptions = {}) {
    if (typeof content !== 'string') {
      throw new Error('El archivo no contiene texto ASCII válido.');
    }

    // Se normalizan los saltos de línea, pero jamás se aplica trim(): la
    // indentación y los espacios a la derecha forman parte del dibujo.
    const preservedContent = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!preservedContent.length) {
      throw new Error('El archivo de texto está vacío.');
    }

    const safeSourceName = typeof sourceName === 'string'
      ? sourceName.split(/[\\/]/).pop() || 'ascii-art'
      : 'ascii-art';
    const restoredName = /\.txt$/i.test(safeSourceName)
      ? safeSourceName
      : `${safeSourceName.replace(/(?:\.asciimotion)?\.json$/i, '').replace(/\.[^.]+$/, '') || 'ascii-art'}.txt`;
    const restoredFile = new File([preservedContent], restoredName, {
      type: 'text/plain;charset=utf-8',
    });
    const originalContent = typeof projectOptions.sourceAscii === 'string'
      ? projectOptions.sourceAscii.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      : preservedContent;

    if (restoredFile.size > 10 * 1024 * 1024) {
      throw new Error('El arte ASCII supera el límite de 10 MB.');
    }

    const boundedNumber = (value, fallback, min, max) => {
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.min(max, Math.max(min, number))
        : fallback;
    };
    const validColor = (value, fallback) =>
      typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
        ? value
        : fallback;
    const validModes = ['standard', 'blocks', 'dense', 'simple', 'custom'];

    cancelPendingConversion();
    clearPreview();
    setFile(restoredFile);
    setSourceAscii(originalContent);
    setIsTextProject(projectOptions.isProject === true);
    setAnimationFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setAscii(preservedContent);
    setAsciiColors(typeof projectOptions.colors === 'string' ? projectOptions.colors : '');
    setPreserveImageColors(projectOptions.preserveImageColors === true);
    setWidth(Math.round(boundedNumber(settings.width, 80, 10, 300)));
    setHeight(Math.round(boundedNumber(settings.height, 40, 1, 300)));
    heightTouchedRef.current = true;
    sourceDimensionsRef.current = { width: 0, height: 0 };
    setCharset(validModes.includes(settings.charset) ? settings.charset : 'standard');
    setCustomCharset(
      typeof settings.customCharset === 'string' && settings.customCharset.length > 0
        ? settings.customCharset.slice(0, 128)
        : '@%#*+=-:. ',
    );
    setGamma(boundedNumber(settings.gamma, 1, 0.1, 3));
    setContrast(boundedNumber(settings.contrast, 1, 0.1, 3));
    setBrightness(boundedNumber(settings.brightness, 1, 0.1, 3));
    setAsciiColor(validColor(settings.asciiColor ?? settings.textColor, '#d0baff'));
    setBackgroundColor(validColor(settings.backgroundColor, '#0c0c11'));
    setAsciiFontSize(boundedNumber(settings.asciiFontSize, 10, 1, 24));
    hasConvertedRef.current = true;
    setExportModalOpen(false);
    setNotice('Arte ASCII importado. Puedes editar los caracteres y los colores en el espacio de trabajo.');
    setView('workspace');
  }

  async function importPlainTextFile(textFile) {
    try {
      if (textFile.size > 10 * 1024 * 1024) {
        throw new Error('El arte ASCII supera el límite de 10 MB.');
      }
      const content = await textFile.text();
      restoreTextArt(content, textFile.name);
    } catch (error) {
      setNotice(error.message || 'No se pudo importar el archivo de texto.');
    }
  }

  async function importProjectFile(projectFile) {
    if (!projectFile) return;

    try {
      if (projectFile.size > 60 * 1024 * 1024) {
        throw new Error('El proyecto supera el límite de 60 MB.');
      }

      const project = JSON.parse(await projectFile.text());

      if (
        project?.format === 'ASCII Motion Text Project' &&
        project?.version === 1 &&
        typeof project?.output?.ascii === 'string'
      ) {
        restoreTextArt(
          project.output.ascii,
          project.sourceName || projectFile.name,
          project.settings || {},
          {
            sourceAscii: typeof project.sourceAscii === 'string'
              ? project.sourceAscii
              : project.output.ascii,
            colors: project.output.colors,
            preserveImageColors: project.settings?.preserveImageColors === true,
            isProject: true,
          },
        );
        return;
      }

      if (
        project?.format === 'ASCII Motion Export' &&
        project?.version === 1 &&
        typeof project?.content === 'string'
      ) {
        restoreTextArt(
          project.content,
          project.sourceFile || projectFile.name,
          {
            ...project.settings,
            charset: project.settings?.charset ?? project.settings?.charsetMode,
            customCharset: project.settings?.customCharset ?? (
              project.settings?.charsetMode === 'custom'
                ? project.settings?.characters
                : undefined
            ),
            asciiColor: project.settings?.textColor ?? project.settings?.asciiColor,
          },
          {
            sourceAscii: typeof project.sourceAscii === 'string'
              ? project.sourceAscii
              : project.content,
            colors: project.colors,
            preserveImageColors: project.settings?.preserveImageColors === true,
            isProject: true,
          },
        );
        return;
      }

      if (
        project?.format !== 'ASCII Motion Project' ||
        project?.version !== 1
      ) {
        throw new Error(
          'El archivo no es un proyecto compatible de ASCII Motion.',
        );
      }

      const source = project.sourceImage;

      if (
        !source ||
        typeof source.name !== 'string' ||
        typeof source.dataUrl !== 'string'
      ) {
        throw new Error('El proyecto no contiene una imagen original válida.');
      }

      const dataMatch =
        /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(source.dataUrl);

      if (!dataMatch) {
        throw new Error('La imagen guardada dentro del proyecto no es válida.');
      }

      const binary = atob(dataMatch[2].replace(/\s/g, ''));
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const restoredFile = new File(
        [bytes],
        source.name,
        { type: source.type || dataMatch[1] || 'application/octet-stream' },
      );

      if (restoredFile.size > MAX_FILE_SIZE) {
        throw new Error('La imagen original supera el límite de 25 MB.');
      }

      if (!ACCEPTED_EXTENSIONS.test(restoredFile.name)) {
        throw new Error('La extensión de la imagen original no es compatible.');
      }

      const settings = project.settings || {};
      const output = project.output || {};

      const boundedNumber = (value, fallback, min, max) => {
        const number = Number(value);
        return Number.isFinite(number)
          ? Math.min(max, Math.max(min, number))
          : fallback;
      };

      const validModes = [
        'standard',
        'blocks',
        'dense',
        'simple',
        'custom',
      ];

      const restoredCharset = validModes.includes(settings.charset)
        ? settings.charset
        : 'standard';

      const validColor = (value, fallback) =>
        typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
          ? value
          : fallback;

      const savedAscii =
        typeof output.ascii === 'string' ? output.ascii : '';

      const restoredFrames = Array.isArray(output.frames)
        ? output.frames
            .filter(
              (frame) =>
                frame &&
                typeof frame.content === 'string' &&
                frame.content.length > 0 &&
                Number.isFinite(Number(frame.duration_ms)) &&
                Number(frame.duration_ms) >= 0,
            )
            .map((frame) => ({
              content: frame.content,
              duration_ms: Math.trunc(Number(frame.duration_ms)),
              colors: typeof frame.colors === 'string' ? frame.colors : undefined,
            }))
        : [];

      const finalFrames =
        /\.gif$/i.test(restoredFile.name) &&
        restoredFrames.length === 0 &&
        savedAscii
          ? [{ content: savedAscii, duration_ms: 100 }]
          : restoredFrames;

      requestIdRef.current += 1;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);

      clearPreview();
      const imageUrl = URL.createObjectURL(restoredFile);
      previewUrlRef.current = imageUrl;
      setPreviewUrl(imageUrl);
      setFile(restoredFile);
      setSourceAscii('');
      setIsTextProject(false);
      setAsciiColors(typeof output.colors === 'string' ? output.colors : '');
      setPreserveImageColors(settings.preserveImageColors !== false);

      setWidth(Math.round(boundedNumber(settings.width, 80, 10, 300)));
      setHeight(Math.round(boundedNumber(settings.height, 40, 1, 300)));
      heightTouchedRef.current = true;

      setCharset(restoredCharset);
      setCustomCharset(
        typeof settings.customCharset === 'string' &&
        settings.customCharset.length > 0
          ? settings.customCharset.slice(0, 128)
          : '@%#*+=-:. ',
      );

      setGamma(boundedNumber(settings.gamma, 1, 0.1, 3));
      setContrast(boundedNumber(settings.contrast, 1, 0.1, 3));
      setBrightness(boundedNumber(settings.brightness, 1, 0.1, 3));
      setAsciiColor(validColor(settings.asciiColor, '#d0baff'));
      setBackgroundColor(validColor(settings.backgroundColor, '#0c0c11'));

      setAnimationFrames(finalFrames);
      setCurrentFrameIndex(
        Math.round(
          boundedNumber(
            output.currentFrameIndex,
            0,
            0,
            Math.max(0, finalFrames.length - 1),
          ),
        ),
      );
      setIsPlaying(false);
      setAscii(savedAscii || finalFrames[0]?.content || '');
      hasConvertedRef.current = Boolean(savedAscii || finalFrames.length);
      setExportModalOpen(false);
      setNotice('Proyecto importado correctamente.');
      setView('workspace');
    } catch (error) {
      setNotice(
        error instanceof SyntaxError
          ? 'El archivo seleccionado no contiene JSON válido.'
          : error.message || 'No se pudo importar el proyecto.',
      );
    }
  }

  async function importProjectOrGif(selectedFile) {
    if (!selectedFile) return;

    if (/\.txt$/i.test(selectedFile.name)) {
      await importPlainTextFile(selectedFile);
      return;
    }

    if (!/\.gif$/i.test(selectedFile.name)) {
      await importProjectFile(selectedFile);
      return;
    }

    setNotice('Buscando el proyecto de ASCII Motion dentro del GIF…');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const apiUrl = await getApiUrl('/project/gif-metadata');
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.detail || 'No se pudieron leer los metadatos del GIF.',
        );
      }

      if (!result.project) {
        setNotice(
          'Este GIF no contiene un proyecto de ASCII Motion incrustado. ' +
          'Para convertirlo, vuelve a la pantalla de creación y selecciónalo como GIF.',
        );
        return;
      }

      const baseName =
        selectedFile.name.replace(/\.[^.]+$/, '') || 'ascii-motion';
      const projectFile = new File(
        [JSON.stringify(result.project)],
        `${baseName}.asciimotion.json`,
        { type: 'application/json' },
      );

      await importProjectFile(projectFile);
    } catch (error) {
      setNotice(
        error instanceof TypeError
          ? 'No se pudo conectar con la API local. Comprueba que esté ejecutándose.'
          : error.message || 'No se pudo importar el GIF.',
      );
    }
  }

  useEffect(() => {
    if (!exportModalOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setExportModalOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [exportModalOpen]);

  function applyActiveWheelColor(color) {
    if (activeWheelTarget === 'text') setAsciiColor(color);
    else setBackgroundColor(color);
  }

  function updateColorIntensity(value) {
    applyActiveWheelColor(
      hsvToHex(
        activeWheelHsv.hue,
        activeWheelHsv.saturation,
        Number(value),
      ),
    );
  }

  function updateColorFromWheel(event) {
    const rect = event.currentTarget.getBoundingClientRect();

    // Guardar solo las coordenadas más recientes.
    pendingWheelPointRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      target: activeWheelTarget,
      value: activeWheelHsv.value,
    };

    // Como máximo una actualización por fotograma.
    if (wheelFrameRef.current) return;

    wheelFrameRef.current = requestAnimationFrame(() => {
      wheelFrameRef.current = 0;
      const point = pendingWheelPointRef.current;
      pendingWheelPointRef.current = null;
      if (!point) return;

      const radius = Math.min(point.width, point.height) / 2;
      if (!radius) return;

      let dx = point.clientX - point.left - point.width / 2;
      let dy = point.clientY - point.top - point.height / 2;
      const distance = Math.hypot(dx, dy);

      if (distance > radius) {
        dx = (dx / distance) * radius;
        dy = (dy / distance) * radius;
      }

      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
      const saturation = Math.min(1, distance / radius);
      const color = hsvToHex(hue, saturation, point.value);

      // El destino queda fijado al iniciar esta actualización.
      if (point.target === 'text') setAsciiColor(color);
      else setBackgroundColor(color);
    });
  }

  function handleWheelKeyDown(event) {
    const directions = {
      ArrowLeft: [-0.06, 0],
      ArrowRight: [0.06, 0],
      ArrowUp: [0, -0.06],
      ArrowDown: [0, 0.06],
    };

    const direction = directions[event.key];
    if (!direction) return;

    event.preventDefault();

    let x = (wheelPoint.x - 50) / 47 + direction[0];
    let y = (wheelPoint.y - 50) / 47 + direction[1];
    const distance = Math.hypot(x, y);

    if (distance > 1) {
      x /= distance;
      y /= distance;
    }

    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360;
    const saturation = Math.min(1, Math.hypot(x, y));

    applyActiveWheelColor(
      hsvToHex(hue, saturation, activeWheelHsv.value),
    );
  }

  function resetTone() {
    setGamma(1);
    setContrast(1);
    setBrightness(1);
  }

  function resetDimensions() {
    const source = sourceDimensionsRef.current;
    const baseWidth = 80;
    const baseHeight =
      source.width > 0 && source.height > 0
        ? Math.round((baseWidth * source.height) / source.width * 0.5)
        : 40;

    heightTouchedRef.current = true;
    setWidth(baseWidth);
    setHeight(Math.min(300, Math.max(1, baseHeight)));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={resetApp}
          aria-label="Volver al inicio"
        >
          <span className="brand-mark">▦</span>
          <span className="brand-name">
            ASCII<span>MOTION</span>
          </span>
        </button>

        <div className="privacy-label">
          <span className="status-dot" />
          PROCESAMIENTO LOCAL
        </div>
      </header>

      {view === 'home' && (
        <section className="home-view">
          <div className="eyebrow">
            <span /> IMAGEN · TEXTO · MOVIMIENTO
          </div>
          <h1>
            Tu imagen.<br />
            <span>Un mundo de caracteres.</span>
          </h1>
          <p className="hero-description">
            Convierte imágenes y GIF en arte ASCII. Ajusta cada detalle
            y descubre una nueva forma de ver tus archivos.
          </p>

          <div className="action-grid">
            <button
              className="action-card primary-card"
              onClick={() => {
                setNotice('');
                setView('convert');
              }}
            >
              <span className="action-icon">▧</span>
              <span className="action-title">Convertir</span>
              <span className="action-description">
                Transforma una imagen o GIF en arte ASCII.
              </span>
              <span className="action-footer">EMPEZAR →</span>
            </button>

            <button
              className="action-card"
              onClick={() => setView('import')}
            >
              <span className="action-icon muted-icon">▱</span>
              <span className="action-title">Importar</span>
              <span className="action-description">
                Recupera un proyecto o una configuración guardada.
              </span>
              <span className="action-footer">ABRIR PROYECTO →</span>
            </button>
          </div>

          <div className="feature-row">
            <div><span className="feature-symbol">01</span> Imágenes y GIF</div>
            <div><span className="feature-symbol">02</span> Controles personalizables</div>
            <div><span className="feature-symbol">03</span> Sin telemetría</div>
          </div>
        </section>
      )}

      {view === 'convert' && (
        <section className="converter-view">
          <button className="back-button" onClick={resetApp}>
            ← Volver al inicio
          </button>

          <div className="section-heading">
            <div className="eyebrow"><span /> NUEVA CONVERSIÓN</div>
            <h1>Elige tu archivo<span className="accent">.</span></h1>
            <p>Selecciona una imagen o un GIF para comenzar a crear.</p>
          </div>

          <button
            className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFile(event.dataTransfer.files?.[0]);
            }}
          >
            <span className="upload-icon">↑</span>
            <strong>Cargar o soltar archivo</strong>
            <span className="dropzone-description">
              Arrastra tu imagen aquí o haz clic para buscarla.
            </span>
            <span className="file-formats">PNG · JPG · WEBP · BMP · GIF</span>
            <span className="browse-button">Seleccionar archivo →</span>
          </button>

          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.bmp,.gif"
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          {notice && <p className="notice" role="alert">{notice}</p>}
          <p className="local-note">◇ Tus archivos se procesan en tu equipo.</p>
        </section>
      )}

      {view === 'workspace' && file && (
        <section className="workspace-view">
          <div className="workspace-top-actions">
            <button
              className="secondary-button workspace-file-button"
              onClick={() => {
                cancelPendingConversion();
                clearPreview();
                setFile(null);
                setSourceAscii('');
                setIsTextProject(false);
    setAnimationFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
                setAscii('');
                setNotice('');
                hasConvertedRef.current = false;
                sourceDimensionsRef.current = { width: 0, height: 0 };
                setView('convert');
              }}
            >
              ↑ Elegir otro archivo
            </button>
            <button
              type="button"
              className="secondary-button workspace-file-button"
              onClick={exportProject}
              disabled={!file || loading}
            >
              Exportar proyecto
            </button>
          </div>

          <div className="workspace-heading">
            <div>
              <div className="eyebrow"><span /> ESPACIO DE TRABAJO</div>
              <h1>Vamos a crear<span className="accent">.</span></h1>
              <p>Archivo: <strong>{file.name}</strong></p>
            </div>
            <span className="file-badge">
              {file.name.split('.').pop().toUpperCase()}
            </span>
          </div>

          <div className={`preview-grid ${isTextComparison ? 'preview-grid-text-project' : isSingleTextImport ? 'preview-grid-text-single' : ''}`}>
            {(!isTextArt || isTextComparison) && (
              <article className="preview-panel">
                <div className="panel-header">
                  <span>{isTextComparison ? '01 / ASCII ORIGINAL' : '01 / ORIGINAL'}</span>
                  <span>{isTextComparison ? 'ARTE ASCII DE ENTRADA' : 'ARCHIVO DE ENTRADA'}</span>
                </div>

                {isTextComparison ? (
                  <div className="ascii-placeholder source-ascii-placeholder" style={{ backgroundColor: '#0c0c11' }}>
                    <pre className="ascii-result" style={{ color: '#d0baff', backgroundColor: '#0c0c11', fontSize: `${asciiFontSize}px`, lineHeight: 1.1 }}>{sourceAscii}</pre>
                  </div>
                ) : (
                  <div className="image-preview">
                <svg className="image-filter-defs" aria-hidden="true">
                  <defs>
                    <filter
                      id="ascii-image-adjustments"
                      colorInterpolationFilters="sRGB"
                    >
                      <feComponentTransfer>
                        <feFuncR
                          type="gamma"
                          amplitude="1"
                          exponent={1 / gamma}
                          offset="0"
                        />
                        <feFuncG
                          type="gamma"
                          amplitude="1"
                          exponent={1 / gamma}
                          offset="0"
                        />
                        <feFuncB
                          type="gamma"
                          amplitude="1"
                          exponent={1 / gamma}
                          offset="0"
                        />
                      </feComponentTransfer>
                      <feComponentTransfer>
                        <feFuncR
                          type="linear"
                          slope={contrast}
                          intercept={(1 - contrast) / 2}
                        />
                        <feFuncG
                          type="linear"
                          slope={contrast}
                          intercept={(1 - contrast) / 2}
                        />
                        <feFuncB
                          type="linear"
                          slope={contrast}
                          intercept={(1 - contrast) / 2}
                        />
                      </feComponentTransfer>
                      <feComponentTransfer>
                        <feFuncR type="linear" slope={brightness} intercept="0" />
                        <feFuncG type="linear" slope={brightness} intercept="0" />
                        <feFuncB type="linear" slope={brightness} intercept="0" />
                      </feComponentTransfer>
                    </filter>
                  </defs>
                </svg>

                {file.type === 'image/gif' && (
                  <span className="gif-badge">GIF</span>
                )}

                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt={`Vista previa de ${file.name}`}
                    style={{ filter: 'url(#ascii-image-adjustments)' }}
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      const originalWidth = image.naturalWidth;
                      const originalHeight = image.naturalHeight;

                      sourceDimensionsRef.current = {
                        width: originalWidth,
                        height: originalHeight,
                      };

                      if (
                        heightTouchedRef.current ||
                        originalWidth <= 0 ||
                        originalHeight <= 0
                      ) {
                        return;
                      }

                      const suggestedHeight = Math.round(
                        (width * originalHeight / originalWidth) * 0.5,
                      );

                      setHeight(Math.min(300, Math.max(1, suggestedHeight)));
                    }}
                  />
                )}
                {isTextArt && (
                  <div className="text-source-note">
                    <strong>Arte ASCII importado</strong>
                    <p>El archivo contiene texto plano. Puedes editar sus caracteres en el panel inferior.</p>
                  </div>
                )}
                  </div>
                )}

                <div className="panel-footer">{isTextComparison ? 'Arte ASCII original' : file.name}</div>

                {!isTextArt && (
                  <div className="preview-reset-actions">
                    <button className="secondary-button" onClick={resetTone}>
                      Restablecer tonos
                    </button>
                    <button className="secondary-button" onClick={resetDimensions}>
                      Restablecer dimensiones
                    </button>
                  </div>
                )}
              </article>
            )}

            <div className={`ascii-preview-column ${isSingleTextImport ? 'ascii-preview-column-single' : ''}`}>
              <article className="preview-panel ascii-preview-panel">
                <div className="panel-header ascii-panel-header">
                  <span>{isTextComparison ? '02 / ASCII EDITADO' : isTextArt ? '01 / ARTE ASCII' : '02 / ASCII'}</span>
                  {!isTextArt && (
                    <label className="inline-format-field" htmlFor="ascii-charset">
                    <span className="visually-hidden">Formato ASCII</span>
                    <select
                      id="ascii-charset"
                      className="format-select inline-format-select"
                      value={charset}
                      onChange={(event) => setCharset(event.target.value)}
                    >
                      <option value="standard">Standard</option>
                      <option value="blocks">Blocks</option>
                      <option value="dense">Dense</option>
                      <option value="simple">Simple</option>
                      <option value="custom">Custom</option>
                    </select>
                    </label>
                  )}
                </div>

                <div
                  ref={asciiPreviewRef}
                  className="ascii-placeholder"
                  style={{ backgroundColor }}
                >
                  {displayedAscii ? (
                    <pre className="ascii-result" style={{ color: asciiColor, backgroundColor, fontSize: `${asciiFontSize}px`, lineHeight: 1.1 }}
                    >{activeCharacterColors
                      ? renderColorizedAscii(displayedAscii, activeCharacterColors)
                      : displayedAscii}</pre>
                  ) : (
                    <div className="empty-result">
                      <span className="action-icon">▦</span>
                      <strong>
                        {loading
                          ? 'Convirtiendo imagen…'
                          : 'Tu resultado aparecerá aquí'}
                      </strong>
                      <p>
                        {loading
                          ? 'El motor Python está procesando el archivo.'
                          : 'Ajusta los controles y pulsa Convertir ASCII.'}
                      </p>
                    </div>
                  )}
                </div>

                {charset === 'custom' && (
                  <div className="custom-charset-in-panel">
                    <label className="format-field" htmlFor="ascii-custom-charset">
                      <span className="control-label">
                        Caracteres personalizados
                        <strong>{customCharset.length} caracteres</strong>
                      </span>
                      <textarea
                        id="ascii-custom-charset"
                        className="charset-input"
                        rows="3"
                        maxLength="128"
                        value={customCharset}
                        onChange={(event) => setCustomCharset(event.target.value)}
                        placeholder="Ej.: @#*+=-:. "
                      />
                      <span className="field-hint">
                        Ordena los caracteres de los tonos oscuros a los claros.
                        Los espacios también cuentan.
                      </span>
                    </label>
                  </div>
                )}

                <div className="panel-footer">
                  {loading && <span className="loading-indicator" />}
                  {loading
                    ? 'Actualizando vista previa…'
                    : displayedAscii
                      ? isTextArt
                        ? 'Arte ASCII importado y editable'
                        : isGifFile
                          ? `Fotograma ${currentFrameIndex + 1} de ${animationFrames.length}`
                          : 'Conversión completada'
                      : 'Esperando conversión'}
                </div>
              </article>
              {isTextArt && (
                <section className="ascii-edit-panel" aria-label="Editar arte ASCII">
                  <div className="ascii-edit-heading">
                    <strong>Editar arte ASCII</strong>
                    <span>{ascii.length.toLocaleString()} caracteres</span>
                  </div>
                  <textarea
                    className="ascii-edit-textarea"
                    aria-label="Contenido editable del arte ASCII"
                    value={ascii}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    wrap="off"
                    style={{ color: asciiColor, backgroundColor, fontSize: `${asciiFontSize}px` }}
                    onChange={(event) => setAscii(event.target.value)}
                  />
                  <p>Los espacios y saltos de línea forman parte del dibujo. No los elimines si quieres conservar su forma.</p>
                </section>
              )}
            </div>
          </div>

          {isGifFile && animationFrames.length > 0 && (
            <section className="gif-player-controls" aria-label="Reproductor GIF">
              <div className="gif-player-heading">
                <strong>Reproducción ASCII</strong>
                <span>
                  Fotograma {currentFrameIndex + 1} / {animationFrames.length}
                  {' · '}
                  {currentAnimationFrame?.duration_ms ?? 0} ms
                </span>
              </div>

              <div className="gif-player-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => stepGifFrame(-1)}
                  disabled={animationFrames.length < 2}
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  className="secondary-button gif-play-button"
                  onClick={() => setIsPlaying((playing) => !playing)}
                  disabled={animationFrames.length < 2}
                >
                  {isPlaying ? 'Ⅱ Pausar' : '▶ Reproducir'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => stepGifFrame(1)}
                  disabled={animationFrames.length < 2}
                >
                  Siguiente →
                </button>
              </div>

              <label className="gif-frame-slider" htmlFor="gif-frame-index">
                <span className="visually-hidden">Seleccionar fotograma</span>
                <input
                  id="gif-frame-index"
                  className="range-control"
                  type="range"
                  min="0"
                  max={Math.max(0, animationFrames.length - 1)}
                  step="1"
                  value={currentFrameIndex}
                  onChange={(event) => {
                    setIsPlaying(false);
                    setCurrentFrameIndex(Number(event.target.value));
                  }}
                  disabled={animationFrames.length < 2}
                />
              </label>
            </section>
          )}

          <section className="settings-panel">
            <div className="settings-heading">
              <div>
                <span className="settings-kicker">AJUSTES DEL EDITOR</span>
                <h2>{isTextArt ? 'Apariencia del arte ASCII' : 'Dimensiones y apariencia'}</h2>
              </div>
              {!isTextArt && <span className="width-value">{width} × {height}</span>}
            </div>

            <div className={`editor-settings-grid ${isTextArt ? 'editor-settings-grid-text' : ''}`}>
              {!isTextArt && (
                <div className="editor-left-controls">
                <div className="settings-section">
                  <h3 className="settings-section-title">Dimensiones de salida</h3>

                  <div className="dimensions-grid">
                    <label className="control-card" htmlFor="ascii-width">
                      <span className="control-label">
                        Ancho <strong>{width} columnas</strong>
                      </span>
                      <input
                        className="range-control"
                        id="ascii-width"
                        type="range"
                        min="10"
                        max="300"
                        step="1"
                        value={width}
                        onChange={(event) => setWidth(Number(event.target.value))}
                      />
                      <span className="slider-ends">
                        <span>10</span><span>300</span>
                      </span>
                    </label>

                    <label className="control-card" htmlFor="ascii-height">
                      <span className="control-label">
                        Alto <strong>{height} filas</strong>
                      </span>
                      <input
                        className="range-control"
                        id="ascii-height"
                        type="range"
                        min="1"
                        max="300"
                        step="1"
                        value={height}
                        onChange={(event) => {
                          heightTouchedRef.current = true;
                          setHeight(Number(event.target.value));
                        }}
                      />
                      <span className="slider-ends">
                        <span>1</span><span>300</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-section-title">Tonos de la imagen</h3>

                  <div className="adjustments-grid">
                    <label className="control-card" htmlFor="ascii-gamma">
                      <span className="control-label">
                        Gamma <strong>{gamma.toFixed(1)}</strong>
                      </span>
                      <input
                        className="range-control"
                        id="ascii-gamma"
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={gamma}
                        onChange={(event) => setGamma(Number(event.target.value))}
                      />
                      <span className="slider-ends">
                        <span>0.1</span><span>3.0</span>
                      </span>
                    </label>

                    <label className="control-card" htmlFor="ascii-contrast">
                      <span className="control-label">
                        Contraste <strong>{contrast.toFixed(1)}</strong>
                      </span>
                      <input
                        className="range-control"
                        id="ascii-contrast"
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={contrast}
                        onChange={(event) => setContrast(Number(event.target.value))}
                      />
                      <span className="slider-ends">
                        <span>0.1</span><span>3.0</span>
                      </span>
                    </label>

                    <label className="control-card" htmlFor="ascii-brightness">
                      <span className="control-label">
                        Brillo <strong>{brightness.toFixed(1)}</strong>
                      </span>
                      <input
                        className="range-control"
                        id="ascii-brightness"
                        type="range"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={brightness}
                        onChange={(event) => setBrightness(Number(event.target.value))}
                      />
                      <span className="slider-ends">
                        <span>0.1</span><span>3.0</span>
                      </span>
                    </label>
                  </div>
                </div>
                </div>
              )}

              <div className="settings-section editor-color-column">
                <h3 className="settings-section-title">Rueda de color</h3>

                {!isTextArt && Boolean(displayedColors) && (
                  <label className="control-card preserve-image-colors-control">
                    <span className="control-label">
                      Conservar colores originales
                      <strong>{preserveImageColors ? 'Activado' : 'Desactivado'}</strong>
                    </span>
                    <input
                      type="checkbox"
                      checked={preserveImageColors}
                      onChange={(event) => setPreserveImageColors(event.target.checked)}
                    />
                    <span className="field-hint">
                      Usa los colores de cada zona de la imagen o elige un color uniforme con la rueda.
                    </span>
                  </label>
                )}

                <div className="color-wheel-layout">
                  <div
                    className="color-wheel"
                    role="slider"
                    aria-label={
                      activeWheelTarget === 'text'
                        ? 'Rueda de color de los caracteres ASCII'
                        : 'Rueda de color del fondo ASCII'
                    }
                    aria-valuetext={activeWheelColor}
                    tabIndex={0}
                    onPointerDown={(event) => {
                      event.currentTarget.setPointerCapture(event.pointerId);
                      updateColorFromWheel(event);
                    }}
                    onPointerMove={(event) => {
                      if (event.buttons === 1) updateColorFromWheel(event);
                    }}
                    onKeyDown={handleWheelKeyDown}
                  >
                    <span
                      className="color-wheel-marker"
                      style={{
                        left: `${wheelPoint.x}%`,
                        top: `${wheelPoint.y}%`,
                      }}
                    />
                  </div>

                  <div className="color-targets" role="group" aria-label="Seleccionar color">
                    <button
                      type="button"
                      className={`color-target ${activeWheelTarget === 'text' ? 'color-target-active' : ''}`}
                      aria-pressed={activeWheelTarget === 'text'}
                      onClick={() => setActiveWheelTarget('text')}
                    >
                      <span
                        className="color-target-dot"
                        style={{ backgroundColor: asciiColor }}
                      />
                      <span className="color-target-info">
                        <strong>Color seleccionado</strong>
                        <code>{asciiColor.toUpperCase()}</code>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`color-target ${activeWheelTarget === 'background' ? 'color-target-active' : ''}`}
                      aria-pressed={activeWheelTarget === 'background'}
                      onClick={() => setActiveWheelTarget('background')}
                    >
                      <span
                        className="color-target-dot"
                        style={{ backgroundColor }}
                      />
                      <span className="color-target-info">
                        <strong>Color de fondo</strong>
                        <code>{backgroundColor.toUpperCase()}</code>
                      </span>
                    </button>
                  </div>
                </div>

                <label className="control-card color-intensity-control" htmlFor="ascii-color-intensity">
                  <span className="control-label">
                    Intensidad del color
                    <strong>{Math.round(activeWheelHsv.value * 100)}%</strong>
                  </span>
                  <input
                    className="range-control"
                    id="ascii-color-intensity"
                    type="range"
                    min="0.02"
                    max="1"
                    step="0.01"
                    value={Math.min(1, Math.max(0.02, activeWheelHsv.value))}
                    onChange={(event) => updateColorIntensity(event.target.value)}
                  />
                  <span className="slider-ends">
                    <span>Oscuro</span>
                    <span>Claro</span>
                  </span>
                </label>

                {isTextArt && (
                  <label className="control-card text-art-size-control" htmlFor="ascii-font-size">
                    <span className="control-label">
                      Tamaño del arte <strong>{asciiFontSize}px</strong>
                    </span>
                    <input
                      className="range-control"
                      id="ascii-font-size"
                      type="range"
                      min="4"
                      max="24"
                      step="1"
                      value={asciiFontSize}
                      onChange={(event) => setAsciiFontSize(Number(event.target.value))}
                    />
                    <span className="slider-ends"><span>4px</span><span>24px</span></span>
                  </label>
                )}

                <p className="field-hint">
                  Selecciona un círculo y utiliza la rueda para editar ese color
                  sin modificar el otro.
                </p>
              </div>
            </div>

            <div className="settings-actions">
              {!isTextArt && (
                <button
                  className="secondary-button"
                  onClick={() => convertImage()}
                  disabled={loading || (charset === 'custom' && !customCharset.length)}
                >
                  {loading ? 'Convirtiendo…' : 'Convertir ASCII'}
                </button>
              )}
              <div className="export-action-group">
                <button
                  type="button"
                  className="secondary-button export-ascii-button"
                  onClick={() => setExportModalOpen(true)}
                  disabled={!displayedAscii || loading}
                >
                  Exportar ASCII
                </button>
                <button
                  type="button"
                  className="copy-icon-button"
                  onClick={copyAscii}
                  disabled={!displayedAscii || loading}
                  aria-label="Copiar arte ASCII"
                  title="Copiar arte ASCII"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
              </div>
            </div>
          </section>

          {exportModalOpen && (
            <div
              className="export-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setExportModalOpen(false);
                }
              }}
            >
              <section
                className="export-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-modal-title"
              >
                <header className="export-modal-header">
                  <div>
                    <span className="settings-kicker">EXPORTACIÓN</span>
                    <h2 id="export-modal-title">Exportar arte ASCII</h2>
                    <p>Elige el formato que mejor se adapte a tu uso.</p>
                  </div>
                  <button
                    type="button"
                    className="export-modal-close"
                    aria-label="Cerrar"
                    onClick={() => setExportModalOpen(false)}
                  >
                    ×
                  </button>
                </header>

                <div className="export-format-grid">
                  <button
                    type="button"
                    className="export-format-option"
                    onClick={() => void exportAscii('txt')}
                  >
                    <span className="export-format-extension">TXT</span>
                    <span className="export-format-name">Texto plano</span>
                    <span className="export-format-description">
                      Ligero, fácil de editar y compartir. No conserva colores.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="export-format-option"
                    onClick={() => void exportAscii('json')}
                  >
                    <span className="export-format-extension">JSON</span>
                    <span className="export-format-name">Datos y ajustes</span>
                    <span className="export-format-description">
                      Guarda el arte, las dimensiones, los colores y metadatos.
                      Incluye los fotogramas cuando el origen es un GIF.
                    </span>
                  </button>

                  {isGifFile && animationFrames.length > 0 && (
                    <button
                      type="button"
                      className="export-format-option"
                      onClick={() => void exportAnimatedGif()}
                      disabled={loading}
                    >
                      <span className="export-format-extension">GIF</span>
                      <span className="export-format-name">Animación ASCII</span>
                      <span className="export-format-description">
                        Exporta la animación con sus colores y tiempos.
                        Descarga también el proyecto editable e incrusta sus metadatos.
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="export-format-option"
                    onClick={() => void exportAscii('html')}
                  >
                    <span className="export-format-extension">HTML</span>
                    <span className="export-format-name">Vista coloreada</span>
                    <span className="export-format-description">
                      Abre el arte en un navegador conservando texto y fondo.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="export-format-option"
                    onClick={() => void exportAscii('ansi')}
                  >
                    <span className="export-format-extension">ANSI</span>
                    <span className="export-format-name">Terminal</span>
                    <span className="export-format-description">
                      Incluye códigos de color de 24 bits para terminales compatibles.
                    </span>
                  </button>
                </div>

                <p className="export-modal-note">
                  Para volver a abrir un trabajo con su imagen original y sus
                  ajustes, utiliza <strong>Exportar proyecto</strong> y el archivo
                  <code> .asciimotion.json</code>.
                </p>
              </section>
            </div>
          )}

          {notice && (
            <p className="notice workspace-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      )}

      {view === 'import' && (
        <section className="converter-view">
          <button className="back-button" onClick={resetApp}>
            ← Volver al inicio
          </button>
          <div className="section-heading">
            <div className="eyebrow"><span /> IMPORTAR</div>
            <h1>Tus proyectos<span className="accent">.</span></h1>
            <p>
              Importa proyectos de ASCII Motion, GIF compatibles o cualquier archivo TXT con arte ASCII.
            </p>
          </div>
          <div className="import-placeholder">
            <span className="upload-icon">▱</span>
            <strong>Importar proyecto ASCII Motion</strong>
            <p>
              Selecciona un .asciimotion.json, un GIF exportado por ASCII Motion o un .txt externo. El texto se abre en el editor y conserva su indentación.
            </p>

            <input
              ref={projectInputRef}
              className="visually-hidden"
              type="file"
              accept=".asciimotion.json,.json,.gif,.txt,application/json,image/gif,text/plain"
              onChange={(event) => {
                const selectedProject = event.target.files?.[0];
                if (selectedProject) void importProjectOrGif(selectedProject);
                event.target.value = '';
              }}
            />

            <button
              type="button"
              className="browse-button"
              onClick={() => {
                setNotice('');
                projectInputRef.current?.click();
              }}
            >
              Seleccionar archivo →
            </button>

            {notice && <p className="notice" role="status">{notice}</p>}

            <button
              type="button"
              className="secondary-button"
              onClick={resetApp}
            >
              Volver al inicio
            </button>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>
          ASCII MOTION <span className="footer-version">PREVIEW 0.1.0</span>
        </span>
        <span>HECHO PARA CREAR. DISEÑADO PARA TU PRIVACIDAD.</span>
      </footer>
    </main>
  );
}

export default App;
