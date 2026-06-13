# Server Yuca 4.0

Servidor Node con Express para guardar los diagnosticos.

- En local usa SQLite en `data/server-yuca.sqlite`.
- En Render usa Postgres si existe la variable `DATABASE_URL`.
- Tambien puede exponerse temporalmente con ngrok.

## Instalacion

```powershell
npm.cmd install
Copy-Item .env.example .env
```

## Ejecutar local

```powershell
npm.cmd start
```

Abre `http://localhost:3000`.

## Desplegar gratis en Render por unos dias

1. Sube este proyecto a GitHub.
2. Entra a Render y crea un nuevo Blueprint.
3. Conecta el repositorio de GitHub.
4. Render detectara `render.yaml`.
5. Aplica el Blueprint.

El archivo `render.yaml` crea:

- Un Web Service gratis para Node.
- Una base Render Postgres gratis.
- La variable `DATABASE_URL` conectada automaticamente al servidor.

Cuando Render termine, abre la URL `https://...onrender.com`.

Importante: el plan gratis de Render puede dormir despues de un rato sin visitas. La primera carga despues de dormir puede tardar unos segundos.

## Ejecutar con ngrok

1. Agrega tu token en `.env`:

```env
NGROK_AUTHTOKEN=tu_token
```

2. Inicia el tunel:

```powershell
npm.cmd run tunnel
```

El servidor imprimira la URL publica de ngrok en la consola.

## Rutas utiles

- `GET /` dashboard.
- `GET /diagnostico1.html` formulario 1.
- `GET /diagnostico2.html` formulario 2.
- `POST /api/diagnosticos` guarda un envio.
- `GET /api/diagnosticos` lista envios.
- `GET /api/diagnosticos.csv` descarga CSV.
- `GET /api/health` verifica el servidor.

## Exportaciones para analisis

- `GET /api/export/resumen.csv`: puntaje general por productor.
- `GET /api/export/detalle.csv`: una fila por pregunta respondida.
- `GET /api/export/secciones.csv`: resultados por seccion del instrumento.
- `GET /api/export/dimensiones.csv`: resultados por dimension de gestion.
- `GET /api/export/matriz.csv`: respuestas en columnas `P1`, `P2`, `P3`, etc.

Para analisis humano en Excel, descarga primero `resumen.csv` y `detalle.csv`.

## Datos

La base local queda en `data/server-yuca.sqlite`. Esa carpeta no se sube a GitHub.

En Render los diagnosticos quedan en Postgres, no en el disco local del servidor.
