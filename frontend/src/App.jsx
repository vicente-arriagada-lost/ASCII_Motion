import { getApiUrl } from './api.js';
import { useEffect, useRef, useState } from 'react'
import './App.css'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp|bmp|gif)$/i

function App() {
  const [view, setView] = useState('home')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [width, setWidth] = useState(80)
  const [ascii, setAscii] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef(null)
  const previewUrlRef = useRef('')

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  function clearPreview() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
    }
    setPreviewUrl('')
  }

  function updatePreview(selectedFile) {
    clearPreview()
    const url = URL.createObjectURL(selectedFile)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  function resetApp() {
    clearPreview()
    setFile(null)
    setAscii('')
    setNotice('')
    setWidth(80)
    setView('home')
  }

  function chooseFile(selectedFile) {
    if (!selectedFile) return

    if (!ACCEPTED_EXTENSIONS.test(selectedFile.name)) {
      setNotice('Formato no compatible. Selecciona PNG, JPG, WEBP, BMP o GIF.')
      return
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setNotice('El archivo supera el límite de 25 MB.')
      return
    }

    if (selectedFile.size === 0) {
      setNotice('El archivo está vacío.')
      return
    }

    updatePreview(selectedFile)
    setFile(selectedFile)
    setAscii('')
    setNotice('')
    setView('workspace')
  }

  async function convertImage() {
    if (!file || loading) return

    if (/\.gif$/i.test(file.name)) {
      setNotice('La conversión de GIF estará disponible cuando conectemos el endpoint de animaciones.')
      return
    }

    setLoading(true)
    setNotice('')
    setAscii('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('width', String(width))

    try {
      const response = await fetch(await getApiUrl('/convert/image'), {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.detail || 'No se pudo convertir la imagen.')
      }

      setAscii(result.content)
    } catch (error) {
      setNotice(
        error instanceof TypeError
          ? 'No se pudo conectar con la API local. Comprueba que FastAPI esté ejecutándose en el puerto 8000.'
          : error.message || 'Ocurrió un error durante la conversión.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function copyAscii() {
    try {
      await navigator.clipboard.writeText(ascii)
      setNotice('Arte ASCII copiado al portapapeles.')
    } catch {
      setNotice('No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.')
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={resetApp} aria-label="Volver al inicio">
          <span className="brand-mark">▦</span>
          <span className="brand-name">ASCII<span>MOTION</span></span>
        </button>

        <div className="privacy-label">
          <span className="status-dot" />
          PROCESAMIENTO LOCAL
        </div>
      </header>

      {view === 'home' && (
        <section className="home-view">
          <div className="eyebrow"><span /> IMAGEN · TEXTO · MOVIMIENTO</div>
          <h1>Tu imagen.<br /><span>Un mundo de caracteres.</span></h1>
          <p className="hero-description">
            Convierte imágenes y GIF en arte ASCII. Ajusta cada detalle
            y descubre una nueva forma de ver tus archivos.
          </p>

          <div className="action-grid">
            <button className="action-card primary-card" onClick={() => { setNotice(''); setView('convert') }}>
              <span className="action-icon">▧</span>
              <span className="action-title">Convertir</span>
              <span className="action-description">Transforma una imagen o GIF en arte ASCII.</span>
              <span className="action-footer">EMPEZAR →</span>
            </button>

            <button className="action-card" onClick={() => setView('import')}>
              <span className="action-icon muted-icon">▱</span>
              <span className="action-title">Importar</span>
              <span className="action-description">Recupera un proyecto o una configuración guardada.</span>
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
          <button className="back-button" onClick={resetApp}>← Volver al inicio</button>
          <div className="section-heading">
            <div className="eyebrow"><span /> NUEVA CONVERSIÓN</div>
            <h1>Elige tu archivo<span className="accent">.</span></h1>
            <p>Selecciona una imagen o un GIF para comenzar a crear.</p>
          </div>

          <button
            className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              chooseFile(event.dataTransfer.files?.[0])
            }}
          >
            <span className="upload-icon">↑</span>
            <strong>Cargar o soltar archivo</strong>
            <span className="dropzone-description">Arrastra tu imagen aquí o haz clic para buscarla.</span>
            <span className="file-formats">PNG · JPG · WEBP · BMP · GIF</span>
            <span className="browse-button">Seleccionar archivo →</span>
          </button>

          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.bmp,.gif"
            onChange={(event) => {
              chooseFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />

          {notice && <p className="notice" role="alert">{notice}</p>}
          <p className="local-note">◇ Tus archivos se procesan en tu equipo.</p>
        </section>
      )}

      {view === 'workspace' && file && (
        <section className="workspace-view">
          <button className="back-button" onClick={() => { setNotice(''); setView('convert') }}>
            ← Cambiar archivo
          </button>

          <div className="workspace-heading">
            <div>
              <div className="eyebrow"><span /> ESPACIO DE TRABAJO</div>
              <h1>Vamos a crear<span className="accent">.</span></h1>
              <p>Archivo: <strong>{file.name}</strong></p>
            </div>
            <span className="file-badge">{file.name.split('.').pop().toUpperCase()}</span>
          </div>

          <div className="preview-grid">
            <article className="preview-panel">
              <div className="panel-header">
                <span>01 / ORIGINAL</span>
                <span>ARCHIVO DE ENTRADA</span>
              </div>
              <div className="image-preview">
                {file.type === 'image/gif' && <span className="gif-badge">GIF</span>}
                {previewUrl && <img src={previewUrl} alt={`Vista previa de ${file.name}`} />}
              </div>
              <div className="panel-footer">{file.name}</div>
            </article>

            <article className="preview-panel">
              <div className="panel-header">
                <span>02 / ASCII</span>
                <span>{ascii ? 'CONVERTIDO' : 'RESULTADO'}</span>
              </div>
              <div className="ascii-placeholder">
                {ascii ? (
                  <pre className="ascii-result">{ascii}</pre>
                ) : (
                  <div className="empty-result">
                    <span className="action-icon">▦</span>
                    <strong>{loading ? 'Convirtiendo imagen…' : 'Tu resultado aparecerá aquí'}</strong>
                    <p>{loading ? 'El motor Python está procesando el archivo.' : 'Ajusta la anchura y pulsa Convertir imagen.'}</p>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                {loading ? <span className="loading-indicator" /> : null}
                {loading ? 'Procesando localmente…' : ascii ? 'Conversión completada' : 'Esperando conversión'}
              </div>
            </article>
          </div>

          <section className="settings-panel">
            <div className="settings-heading">
              <div>
                <span className="settings-kicker">AJUSTES DE CONVERSIÓN</span>
                <h2>Dimensiones del arte</h2>
              </div>
              <span className="width-value">{width} columnas</span>
            </div>
            <label className="slider-label" htmlFor="ascii-width">
              Anchura de salida
              <input
                id="ascii-width"
                type="range"
                min="10"
                max="200"
                step="1"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
              <span className="slider-ends"><span>10</span><span>200</span></span>
            </label>
            <div className="settings-actions">
              <button className="convert-button" onClick={convertImage} disabled={loading}>
                {loading ? 'Convirtiendo…' : ascii ? 'Volver a convertir' : 'Convertir imagen →'}
              </button>
              {ascii && (
                <button className="secondary-button" onClick={copyAscii}>
                  Copiar ASCII
                </button>
              )}
            </div>
          </section>

          {notice && <p className="notice workspace-notice" role="status">{notice}</p>}
          <button className="secondary-button" onClick={() => { clearPreview(); setFile(null); setAscii(''); setNotice(''); setView('convert') }}>
            ↑ Elegir otro archivo
          </button>
        </section>
      )}

      {view === 'import' && (
        <section className="converter-view">
          <button className="back-button" onClick={resetApp}>← Volver al inicio</button>
          <div className="section-heading">
            <div className="eyebrow"><span /> IMPORTAR</div>
            <h1>Tus proyectos<span className="accent">.</span></h1>
            <p>La importación de proyectos guardados se implementará en una siguiente etapa.</p>
          </div>
          <div className="import-placeholder">
            <span className="upload-icon">▱</span>
            <strong>Importación de proyectos</strong>
            <p>Primero definiremos el formato de los archivos de proyecto y configuración.</p>
            <button className="browse-button" onClick={resetApp}>Volver al inicio</button>
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>ASCII MOTION <span className="footer-version">PREVIEW 0.1.0</span></span>
        <span>HECHO PARA CREAR. DISEÑADO PARA TU PRIVACIDAD.</span>
      </footer>
    </main>
  )
}

export default App
