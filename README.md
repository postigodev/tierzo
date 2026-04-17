# Tiermaker Generator

Este proyecto contiene un script simple para convertir la primera columna de un archivo Excel (`.xlsx`) en imagenes PNG. Cada celda no vacia de la columna A se convierte en una imagen cuadrada con el texto centrado.

El caso de uso principal es generar imagenes consistentes para tier lists, donde cada item necesita tener el mismo tamano y una orientacion uniforme.

## Que hace

- Lee el primer worksheet del archivo `.xlsx`.
- Toma todos los valores no vacios de la primera columna, es decir, la columna A.
- Genera una imagen PNG por cada celda.
- Usa un tamano cuadrado consistente para todas las imagenes.
- Centra el texto horizontal y verticalmente.
- Ajusta el tamano de la fuente automaticamente si el texto es largo.
- Divide el texto en varias lineas cuando no cabe en una sola linea.
- Guarda los archivos como `001.png`, `002.png`, `003.png`, etc.

## Requisitos

Necesitas tener instalado:

- Python 3.10 o superior.
- `pip`, normalmente incluido con Python.

Las dependencias del proyecto estan en `requirements.txt`:

- `openpyxl`: para leer archivos Excel `.xlsx`.
- `Pillow`: para generar imagenes PNG.

## Setup inicial

Abre PowerShell en la carpeta del proyecto:

```powershell
cd C:\Users\akuma\repos\tiermaker-generator
```

Instala las dependencias:

```powershell
pip install -r requirements.txt
```

Si tu instalacion usa `python -m pip`, ejecuta:

```powershell
python -m pip install -r requirements.txt
```

## Formato esperado del Excel

El script espera un archivo `.xlsx`.

Solo usa la primera hoja del Excel y solo lee la primera columna:

```text
Columna A
---------
Mario
Luigi
Princess Peach
Bowser
Texto largo que se ajustara automaticamente
```

Las celdas vacias se ignoran.

## Como correrlo

Uso basico:

```powershell
python generate_text_images.py .\archivo.xlsx
```

Ejemplo:

```powershell
python generate_text_images.py .\personajes.xlsx
```

Si el archivo se llama `personajes.xlsx`, el script creara una carpeta llamada:

```text
personajes_images
```

Dentro de esa carpeta se generaran imagenes como:

```text
001.png
002.png
003.png
```

## Elegir carpeta de salida

Puedes indicar una carpeta de salida con `--output` o `-o`:

```powershell
python generate_text_images.py .\personajes.xlsx --output .\imagenes
```

Tambien funciona asi:

```powershell
python generate_text_images.py .\personajes.xlsx -o .\imagenes
```

## Cambiar el tamano de las imagenes

Por defecto, cada imagen mide `1024x1024` pixeles.

Para generar imagenes de otro tamano:

```powershell
python generate_text_images.py .\personajes.xlsx --size 512
```

Esto genera imagenes de `512x512`.

## Cambiar colores

Color de fondo:

```powershell
python generate_text_images.py .\personajes.xlsx --background "#FFFFFF"
```

Color del texto:

```powershell
python generate_text_images.py .\personajes.xlsx --text-color "#000000"
```

Ejemplo con fondo oscuro y texto claro:

```powershell
python generate_text_images.py .\personajes.xlsx --background "#111111" --text-color "#FFFFFF"
```

## Usar una fuente personalizada

El script intenta usar fuentes comunes de Windows como Arial, Segoe UI, Calibri o Tahoma.

Si quieres usar una fuente especifica, pasa la ruta al archivo `.ttf` o `.otf`:

```powershell
python generate_text_images.py .\personajes.xlsx --font "C:\Windows\Fonts\arial.ttf"
```

## Opciones disponibles

```text
Argumento              Descripcion
---------------------  ----------------------------------------------------
xlsx_file              Archivo Excel de entrada.
-o, --output           Carpeta donde se guardaran las imagenes.
--size                 Tamano cuadrado de la imagen en pixeles.
--background           Color de fondo. Por defecto: #FFFFFF.
--text-color           Color del texto. Por defecto: #000000.
--font                 Ruta opcional a una fuente .ttf o .otf.
```

Tambien puedes ver la ayuda desde la terminal:

```powershell
python generate_text_images.py --help
```

## Ejemplos completos

Generar imagenes con la configuracion default:

```powershell
python generate_text_images.py .\items.xlsx
```

Generar imagenes de `768x768` en una carpeta especifica:

```powershell
python generate_text_images.py .\items.xlsx --size 768 --output .\output
```

Generar imagenes con fondo negro, texto blanco y fuente Arial:

```powershell
python generate_text_images.py .\items.xlsx --background "#000000" --text-color "#FFFFFF" --font "C:\Windows\Fonts\arial.ttf"
```

## Problemas comunes

### `python` no se reconoce como comando

Si PowerShell dice que `python` no existe, prueba cerrar y abrir PowerShell de nuevo. Si sigue pasando, revisa que Python este agregado al `PATH`.

Tambien puedes probar:

```powershell
py generate_text_images.py .\archivo.xlsx
```

### Falta una dependencia

Si aparece un error como `ModuleNotFoundError: No module named 'PIL'` o `No module named 'openpyxl'`, instala las dependencias:

```powershell
pip install -r requirements.txt
```

O:

```powershell
python -m pip install -r requirements.txt
```

### El texto sale muy pequeno

Eso normalmente significa que una celda tiene demasiado texto para el tamano elegido. Puedes probar con un tamano de imagen mas grande:

```powershell
python generate_text_images.py .\archivo.xlsx --size 1536
```

### No se genera ninguna imagen

Revisa que el archivo tenga datos en la columna A de la primera hoja. Las celdas vacias se saltan.

## Archivos del proyecto

```text
generate_text_images.py  Script principal.
requirements.txt         Dependencias necesarias.
README.md                Documentacion de uso.
```
