# Helpdesk Backend

A Node.js and Express REST API for managing helpdesk users, tickets, comments, and an administrator dashboard. MongoDB stores application data, and ticket images are uploaded to Amazon S3.

## Features

- User signup, login, and basic user CRUD
- Ticket CRUD with priorities, statuses, assignment, and optimistic version checks
- Comments associated with tickets
- Audit trail records for ticket and comment activity
- Admin dashboard metrics for ticket status, resolution time, and SLA breaches
- Optional ticket image uploads to S3
- Global IP-based rate limiting

## Technology

- Node.js with ES modules
- Express 5
- MongoDB with Mongoose
- JSON Web Tokens and bcrypt
- Multer for image uploads
- AWS SDK for S3

This project exposes an Express REST API; it does not configure a GraphQL endpoint.

## Requirements

- Node.js and npm
- A MongoDB database
- An AWS S3 bucket and credentials if using ticket image uploads

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root and set the environment variables:

   ```dotenv
   MONGO_USERNAME=your_mongodb_username
   MONGO_PASSWORD=your_mongodb_password
   DEFAULT_DATABASE=your_database_name
   JWT_SECRET=replace_with_a_long_random_secret

   AWS_REGION=your_aws_region
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   AWS_S3_BUCKET=your_s3_bucket_name
   ```

   The MongoDB connection string is assembled in `utils/database.js` for the configured MongoDB Atlas host. Do not commit real credentials.

3. Start the development server:

   ```bash
   npm run start:dev
   ```

The application listens on port `8080` by default (or `PORT` if set). The configured CORS origin is `http://localhost:5173`. A frontend can use `VITE_API_BASE_URL=http://localhost:8080/api`.

## API

All endpoints are prefixed with `/api`. Request and response bodies use JSON unless an endpoint is receiving image files.

### Users

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a customer and return a JWT |
| `POST` | `/api/auth/login` | Verify credentials and return a JWT |
| `GET` | `/api/users` | Admin: list users |
| `GET` | `/api/users/:id` | Get own user, or any user as admin |
| `PATCH` | `/api/users/:id` | Admin: change role or deactivate/reactivate |
| `DELETE` | `/api/users/:id` | Admin: delete a user |

Registration accepts `name`, `email`, and `password`; public registration always creates a `customer`. The only roles are `customer`, `agent`, and `admin`; an admin can change a user's role.

Example:

```json
{
  "name": "Alex Customer",
  "email": "alex@example.com",
  "password": "replace-with-a-password"
}
```

Registration returns `201` with `{ "user": ..., "token": "..." }`. Login accepts `email` and `password` and returns the same shape. Tokens are signed using `JWT_SECRET` and expire after one hour. Inactive users cannot log in or continue using an existing token.

### Tickets

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tickets` | List tickets |
| `GET` | `/api/tickets/:id` | Get a ticket by ID |
| `POST` | `/api/tickets` | Create a ticket |
| `PATCH` | `/api/tickets/:id` | Update a ticket |
| `DELETE` | `/api/tickets/:id` | Admin: delete a ticket |
| `GET` | `/api/tickets/:id/comments` | List ticket comments |
| `POST` | `/api/tickets/:id/comments` | Add a public comment or staff note |
| `GET` | `/api/tickets/:id/audit` | Staff: list ticket audit history |
| `GET` | `/api/dashboard` | Admin: dashboard metrics |

Ticket fields include:

- `title` (minimum 5 characters), `description` (minimum 10 characters), and optional `category`
- `priority`: `low`, `medium`, `high`, or `urgent`
- `status`: `open`, `in_progress`, `waiting_on_customer`, `resolved`, `reopened`, or `closed`
- `creator` (derived from the authenticated user) and optional `assignee`
- `fileName`, managed by the API when images are uploaded
- `slaDeadline`, `breached`, and `version` (used for update concurrency checks)

All ticket endpoints require a JWT using `Authorization: Bearer <token>`. Customers can see only their own tickets. The list supports `page`, `limit` (maximum 100), `status`, `priority`, `assignee`, `breached`, and `search` query parameters, and returns `{ tickets, page, limit, total, totalPages }`. Ticket updates require the current `version`; a stale version returns `409 Conflict`. Valid transitions and role permissions follow the lifecycle in `EXPECTED_README.md`. Changes to status, assignee, and priority are recorded in the audit trail; the version increases for any successful ticket change.

The SLA is set at creation based on priority (urgent 4h, high 8h, medium 24h, low 72h). Its clock pauses while the ticket is `waiting_on_customer`. `breached` in ticket responses is computed against the current deadline and is false for paused, resolved, or closed tickets.

To attach images on ticket creation or update, send `multipart/form-data` with files under the repeated field name `image`. The upload middleware accepts PNG and JPEG images up to 5 MB each (maximum five files per request). Without image files, ticket creation can use JSON.

### Comments

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tickets/:id/comments` | Add a comment |
| `GET` | `/api/tickets/:id/comments` | List comments for a ticket |
| `PUT` | `/api/tickets/:id/comments/:commentId` | Update a comment |
| `DELETE` | `/api/tickets/:id/comments/:commentId` | Delete a comment |

Comment requests require authentication; the server derives `author` from the token. Send `text` and optionally `isInternal: true` to add an internal note (agents and admins only). Customers can read only public comments on their own tickets; staff can read both. Comment edits and deletes are limited to the author or an admin. For compatibility, the previous `/api/comments/tickets/:ticketId/comments` routes remain available.

### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Get dashboard metrics |
| `GET` | `/api/admin/dashboard` | Get dashboard metrics (compatibility route) |

Both dashboard routes require an admin JWT in the `Authorization` header:

```http
Authorization: Bearer <token>
```

The dashboard response contains `ticketCountPerStatus`, `averageResolutionHours`, and `breachedTicketsPerPriority`.

## Authorization and limitations

- Ticket, comment, user-management, audit, and dashboard operations enforce authentication and role/ownership rules on the server.
- Ticket image uploads require valid AWS S3 configuration. Images are stored under the `images/` key prefix.
- The rate limiter is applied globally and allows up to 100 requests per IP per 15-minute window.
- Legacy user auth (`/api/users/signup`, `/api/users/login`), ticket `PUT`, and comment routes remain available for compatibility.
- `npm test` runs the built-in Node.js tests for role-based ticket transitions, SLA creation, and role validation.

## Project layout

```text
app.js                 Express application setup and route mounting
controllers/           Request handlers
middleware/            Authentication middleware
models/                Mongoose schemas and ticket audit/update logic
routes/                User, ticket, comment, and admin routes
utils/                 MongoDB connection, S3 integration, and rate limiter
```
