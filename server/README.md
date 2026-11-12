# Servidor (API + PostgreSQL)

Express + PostgreSQL + aviso por mail (Nodemailer/SMTP). Sirve la API en `/api` y también la app (el build de Vite),
así que en Coolify es **una sola aplicación** más la base de datos.

Las reglas de pedidos, perfiles y productos son las mismas del front: el servidor importa `../src/lib` y esbuild lo empaqueta.

## Qué guarda

| Tabla      | Qué tiene                                                         |
| ---------- | ----------------------------------------------------------------- |
| `profiles` | perfiles de impresora (JSONB, mismo formato que el front)         |
| `products` | productos guardados con costos, precio y material                 |
| `pedidos`  | pedidos con número correlativo, estado e historial                |
| `settings` | datos de la empresa y numeración de presupuestos                  |
| `sessions` | sesiones de login (solo el hash del token)                        |

Las tablas se crean solas al arrancar (`src/db.ts`, migraciones numeradas).

## Deploy en Coolify

1. **Base de datos:** en el proyecto, *+ New → Database → PostgreSQL*. Arrancala y copiá la **Postgres URL (internal)**.
2. **App:** *+ New → Public/Private Repository* → este repo, rama `main`, **Build Pack: Dockerfile** (usa el `Dockerfile` de la raíz).
   - Puerto: `3000`
   - Dominio: el que quieras (Coolify pone HTTPS solo)
   - Healthcheck: `/healthz`
3. **Variables de entorno** de la app:

   | Variable         | Valor                                                              |
   | ---------------- | ------------------------------------------------------------------ |
   | `DATABASE_URL`   | la Postgres URL (internal) del paso 1                              |
   | `ADMIN_USER`     | tu usuario para entrar                                             |
   | `ADMIN_PASSWORD` | una contraseña larga (10+ caracteres)                              |
   | `SMTP_HOST` …    | opcional, para que los avisos de “terminado” salgan de verdad (ver `.env.example`) |

4. **Deploy.** Con *Auto Deploy* activado, cada push a `main` se publica solo.

La primera vez que entres desde un navegador que ya tenía datos, la app ofrece subirlos al servidor.

**Backups:** en el recurso PostgreSQL de Coolify, pestaña *Backups*, programá uno diario.

## En tu compu

```bash
docker run -d --name calc3d-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=calc3d -p 55432:5432 postgres:17-alpine
cp .env.example .env          # y completá ADMIN_PASSWORD
npm install
npm run dev                   # API en http://localhost:3000
# en otra terminal, desde la raíz del repo:
VITE_API=1 npm run dev        # app en http://localhost:5173 (le pasa /api al servidor)
```

Tests de integración (necesitan un PostgreSQL; **borran la base que les pases**):

```bash
TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/calc3d_test npm test
```

## API

Todo bajo `/api`, en JSON. Salvo `login`, pide la cookie de sesión.

| Método y ruta                     | Para qué                                                     |
| --------------------------------- | ------------------------------------------------------------ |
| `POST /login` · `POST /logout`    | iniciar / cerrar sesión (cookie httpOnly, 90 días)           |
| `GET /session`                    | quién está logueado                                          |
| `GET /data`                       | todo junto al abrir la app                                   |
| `PUT/DELETE /profiles/:id`        | guardar / borrar un perfil                                   |
| `PUT/DELETE /products/:id`        | guardar / borrar un producto                                 |
| `PUT /settings/business`          | datos de la empresa                                          |
| `PUT /settings/quoteSeq`          | próximo número de presupuesto                                |
| `GET/POST /pedidos`               | listar / crear                                               |
| `PUT/DELETE /pedidos/:id`         | editar / borrar                                              |
| `POST /pedidos/:id/estado`        | cambiar estado (a “terminado” manda el aviso)                |
| `POST /pedidos/:id/aviso`         | reenviar el aviso                                            |
| `POST /import`                    | subir los datos que había en el navegador                    |

`GET /healthz` (sin login) responde 200 si la base contesta.
