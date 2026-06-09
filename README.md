# PsicoApp MVP - Java + MySQL + JWT

PMV funcional para el proyecto de psicología social de NovaSoft Solutions.

## Funciones incluidas
- Login con JWT y roles: `ADMIN`, `PROFESOR`, `ESTUDIANTE`.
- Administración de usuarios.
- Cursos, grupos y asignación de estudiantes.
- Creación/edición/desactivación de casos de psicología social.
- Escenarios, preguntas y opciones con respuesta correcta/justificación.
- Asignación de casos a estudiantes o grupos.
- Estudiante: consulta asignaciones, guarda avance y envía análisis final.
- Profesor: revisa entregas, califica y retroalimenta.
- Sesiones interactivas con PIN, ranking, puntajes y exportación CSV.
- Notificaciones básicas al publicar evaluación.

## Requisitos
- Java 17+
- Maven 3.9+
- Docker Desktop o MySQL 8 local

## Ejecutar
```bash
cd psicoapp-mvp
docker compose up --build -d
```

Abrir: http://localhost:8080

La app y MySQL corren en Docker. MySQL queda expuesto en el host como `localhost:3307` para no chocar con un MySQL local en `3306`.

Para detener:
```bash
docker compose down
```

Para personalizar puertos o credenciales, copia `.env.example` a `.env` y modifica los valores antes de ejecutar `docker compose up --build -d`.

Comandos utiles:
```bash
docker compose logs -f app
docker compose restart app
docker compose down -v
```

## Usuarios demo
Todos usan clave `123456`:
- `admin@psicoapp.com`
- `profesor@psicoapp.com`
- `estudiante@psicoapp.com`

## Configuración MySQL
Está en `src/main/resources/application.properties`:
```properties
spring.datasource.url=jdbc:mysql://localhost:3306/psicoapp?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
spring.datasource.username=root
spring.datasource.password=admin
```

## Flujo mínimo de prueba
1. Entra como admin y crea estudiantes/profesores.
2. Entra como profesor, crea caso y asígnalo a un estudiante por ID.
3. Entra como estudiante, guarda avance y envía entrega.
4. Entra como profesor, califica la entrega.
5. Entra como estudiante y revisa notificaciones/resultados.

## API rápida
- `POST /api/auth/login`
- `GET /api/cases`
- `POST /api/cases`
- `POST /api/cases/import`
- `POST /api/cases/import-text`
- `POST /api/cases/{id}/assign-student/{studentId}`
- `GET /api/student/assignments`
- `POST /api/student/assignments/{id}/draft`
- `POST /api/student/assignments/{id}/submit`
- `GET /api/teacher/submissions`
- `PUT /api/teacher/submissions/{id}/grade`
- `GET /api/game/ranking`

## Importar casos
Los profesores y administradores pueden importar casos en texto natural desde la interfaz.
La plantilla recomendada esta en `docs/case-import-template.txt`. El JSON antiguo sigue soportado en `docs/case-import-template.json`.

Reglas del formato:
- Iniciar con `CASO: nombre del caso`.
- Usar `CATEGORIA:`, `DIFICULTAD:` y `DESCRIPCION:` para los datos generales.
- Separar pantallas con `---`.
- Crear pantallas abiertas con `TEXTO: titulo`.
- Crear preguntas con `PREGUNTA: texto de la pregunta`.
- Debajo de una pregunta escribir `OPCIONES:` y entre 3 y 4 opciones.
- Marcar correctas con `[correcta]`, por ejemplo `- [correcta] Escuchar a las partes`.
