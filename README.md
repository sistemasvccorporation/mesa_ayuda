# SIGeCom Mesa de Ayuda — V&C Corporation

Sistema de mesa de ayuda sobre la base **existente** `proyecto_sigecom`. El login usa la tabla `usuarios` (campo `usuario` + `contrasena`). Django **no** recrea ni altera `usuarios`, `areas`, `cargos` ni `bancos`.

El **encargado** de un ticket puede ser **cualquier usuario activo** de SIGeCom, no un técnico fijo. Al asignarlo, si solo era solicitante, pasa a rol `tecnico` para ver la bandeja “A mi cargo”.

## Requisitos

- Python 3.13
- Node 22
- MariaDB/MySQL con la base `proyecto_sigecom` ya cargada (tabla `usuarios` con datos)

## Arranque

```bash
# 1) Backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edita .env con tu usuario/clave de MariaDB

cd backend
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py seed_mesa_ayuda --admin NOMBRE.USUARIO --tecnico OTRO.USUARIO
..\.venv\Scripts\python.exe manage.py runserver
```

`--admin` y `--tecnico` deben ser valores de `usuarios.usuario` **activos**. No se insertan personas nuevas.

Otra forma de crear el primer admin: en `.env` pon `MESA_BOOTSTRAP_ADMIN=tu.usuario` y entra al sistema. Ese usuario queda como administrador de mesa. Luego puedes asignar técnicos desde **Encargados y roles**. El encargado de cada ticket puede ser **cualquier colaborador activo**, no solo TI.

```bash
# 2) Frontend (otra terminal)
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

- Login: tu usuario SIGeCom (ej. `eduardo.bonilla`), no el correo.
- Las contraseñas en texto plano se rehashean a Django en el primer ingreso correcto.

## Roles

| Rol | Quién lo tiene | Qué ve |
|---|---|---|
| solicitante | cualquier colaborador sin fila en `mesa_roles_usuario` | solo sus solicitudes |
| tecnico | asignado en Encargados y roles, o al convertirse en encargado de un ticket | cola + tickets a su cargo |
| admin | asignado en Encargados y roles | todas, catálogos, reportes, asignación |

## Asignación

En el detalle de la solicitud, busca por nombre o usuario y elige al **encargado**. Puede ser otra área, no solo TI. También puedes **derivar** a otro usuario (requiere motivo) o **tomar** el ticket tú mismo.

## API

- `POST /api/auth/login/` `{ "usuario", "password" }`
- `GET /api/auth/me/`
- `GET /api/usuarios/?q=` colaboradores activos para asignar
- `POST /api/solicitudes/{id}/asignar/` `{ "id_encargado": 123 }`
- `POST /api/solicitudes/{id}/derivar/` `{ "id_encargado": 456, "motivo": "..." }`
