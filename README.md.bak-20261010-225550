# ASCII Motion

Motor de conversión de imágenes estáticas y animaciones GIF a arte ASCII, desarrollado en Python.

ASCII Motion transforma imágenes en caracteres de texto configurables y permite reproducir y exportar animaciones ASCII. Está diseñado con una arquitectura modular para mantener el motor independiente de la interfaz de usuario y facilitar futuras integraciones.

## Características

- Conversión de imágenes a arte ASCII.
- Procesamiento de imágenes con Pillow y NumPy.
- Compatibilidad con imágenes JPEG, PNG, WEBP, BMP y GIF estáticos.
- Conversión de animaciones GIF conservando la duración de los fotogramas.
- Conjuntos de caracteres predefinidos y personalizados.
- Ajustes de anchura, contraste, brillo, gamma e inversión.
- Normalización del contraste.
- Ajuste de la relación de aspecto de los caracteres.
- Visualización del resultado en la terminal.
- Exportación de resultados a archivos de texto.
- Exportación e importación de animaciones ASCII.
- Interfaz de línea de comandos (CLI).
- Pruebas automatizadas con pytest.
- Análisis estático y comprobación de estilo con Ruff.

## Tecnologías

- Python 3.12 o superior.
- Pillow.
- NumPy.
- pytest.
- Ruff.
- setuptools.

## Requisitos

- Python 3.12 o superior.
- pip.
- Un terminal compatible con texto monoespaciado.

Los comandos siguientes están orientados a Linux.

## Instalación para desarrollo

Clona el repositorio o sitúate en la carpeta del proyecto. Después ejecuta:

```bash
python -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
```

Si ya tienes el entorno virtual configurado, basta con activarlo:

```bash
cd ~/Proyectos/ascii-motion
source .venv/bin/activate
```

Comprueba que la CLI esté disponible:

```bash
ascii-motion --help
```

## Uso

### Consultar la ayuda

```bash
ascii-motion --help
```

### Listar los conjuntos de caracteres

```bash
ascii-motion --list-charsets
```

### Convertir una imagen

```bash
ascii-motion imagen.png
```

### Ajustar la anchura

```bash
ascii-motion imagen.png --width 120
```

### Seleccionar un conjunto de caracteres

```bash
ascii-motion imagen.png --charset dense
```

### Ajustar el contraste y el brillo

```bash
ascii-motion imagen.png --contrast 1.2 --brightness 1.1
```

### Ajustar gamma y normalizar el contraste

```bash
ascii-motion imagen.png --gamma 1.2 --normalize-contrast
```

### Invertir el resultado

```bash
ascii-motion imagen.png --invert
```

### Guardar el resultado en un archivo

```bash
ascii-motion imagen.png --output resultado.txt
```

### Convertir una animación GIF

```bash
ascii-motion animacion.gif --play
```

### Exportar una animación ASCII

```bash
ascii-motion animacion.gif --export-animation animacion_ascii.txt
```

### Reproducir una animación ASCII exportada

```bash
ascii-motion --play-file animacion_ascii.txt
```

Los parámetros disponibles y sus valores aceptados pueden consultarse con `ascii-motion --help`.

## Desarrollo y pruebas

Ejecuta la suite de pruebas:

```bash
pytest -q
```

Comprueba el estilo y los posibles errores estáticos:

```bash
ruff check src tests
```

Para aplicar el formateo:

```bash
ruff format src tests
```

## Arquitectura

El proyecto separa las responsabilidades en módulos:

```text
src/ascii_motion/
├── cli/
│   └── main.py
├── core/
│   ├── animation.py
│   ├── converter.py
│   ├── image_loader.py
│   ├── preprocessing.py
│   ├── resizer.py
│   └── service.py
├── models/
│   ├── frame.py
│   └── settings.py
├── renderers/
│   └── text_renderer.py
└── exceptions.py
```

- **core:** carga, procesamiento, conversión y gestión de animaciones.
- **models:** modelos de datos y configuración de conversión.
- **renderers:** representación y exportación del arte ASCII.
- **cli:** interfaz de línea de comandos.
- **tests:** pruebas automatizadas del comportamiento del proyecto.

La capa de servicios permite utilizar las funciones principales sin depender directamente de la CLI. Esta separación facilita una futura interfaz gráfica.

## Alcance actual

ASCII Motion está centrado en imágenes estáticas y animaciones GIF.

La conversión de vídeo no forma parte del alcance actual. El proyecto no depende de FFmpeg ni de OpenCV.

## Próximas etapas

- Mejorar la experiencia de uso y la documentación.
- Ampliar las opciones de exportación.
- Optimizar el rendimiento y la gestión de errores.
- Desarrollar una interfaz gráfica con React y Tauri.
- Mantener el motor Python reutilizable e independiente de la interfaz.

## Licencia

ASCII Motion se distribuye bajo la **GNU General Public License, versión 3.0 únicamente (`GPL-3.0-only`)**. Consulta el archivo [`LICENSE`](LICENSE) para leer el texto completo.

La GPL permite utilizar, modificar, redistribuir y comercializar el software. Al distribuir versiones modificadas cubiertas por esta licencia, deben respetarse sus condiciones, incluidos los requisitos aplicables de licencia y código fuente.

Las dependencias de terceros pueden tener licencias independientes. Conserva sus avisos y revisa sus condiciones al redistribuir el programa.
