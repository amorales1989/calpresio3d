# Servidor de pedidos (en construcción)

Borrador del backend para el VPS: Express + PostgreSQL + aviso por mail (Nodemailer/SMTP).
Todavía no está conectado al front: hoy los pedidos se guardan en el navegador (`src/lib/pedidosRepo.ts`).

Hecho hasta ahora: configuración por variables de entorno (`src/config.ts`), estados (`src/estados.ts`)
y validación de los datos de entrada (`src/validate.ts`). Falta: base de datos, rutas, envío de mails y deploy.
