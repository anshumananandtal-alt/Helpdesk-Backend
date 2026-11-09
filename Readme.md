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

Although `express-graphql` is listed as a dependency, the current application exposes Express REST routes and does not configure a GraphQL endpoint.

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

The application listens on port `8080`. The configured CORS origin is `http://localhost:5173`.

> **Startup note:** The current source has import mismatches that must be corrected before the server will start. `app.js` imports the rate limiter from a path outside the project, and `routes/ticket.js` imports `getTickets`, which is not exported by `controllers/ticketController.js` (the controller exports `getAllTickets`). On case-sensitive filesystems, the `User.js` and `Ticket.js` imports in the controllers also do not match the lowercase model filenames.

## API

All endpoints are prefixed with `/api`. Request and response bodies use JSON unless an endpoint is receiving image files.

### Users

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/users/signup` | Create a user and return a JWT |
| `POST` | `/api/users/login` | Verify credentials and return a JWT |
| `GET` | `/api/users/:id` | Get a user by ID |
| `PUT` | `/api/users/:id` | Update a user by ID |
| `DELETE` | `/api/users/:id` | Delete a user by ID |

Signup accepts `name`, `email`, `password`, and `role`. The schema permits `admin`, `customer`, and `support`. Include a valid `role`: the schema's configured default (`user`) is not one of its permitted values.

Example:

```json
{
  "name": "Alex Customer",
  "email": "alex@example.com",
  "password": "replace-with-a-password",
  "role": "customer"
}
```

Signup returns `201` with `{ "user": ..., "token": "..." }`. Login accepts `email` and `password` and returns the same shape. Tokens are signed using `JWT_SECRET` and expire after one hour.

### Tickets

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tickets` | List tickets |
| `GET` | `/api/tickets/:id` | Get a ticket by ID |
| `POST` | `/api/tickets` | Create a ticket |
| `PUT` | `/api/tickets/:id` | Update a ticket |
| `DELETE` | `/api/tickets/:id` | Delete a ticket |

Ticket fields include:

- `title` and `description` (required when creating)
- `priority`: `low`, `medium`, `high`, or `urgent`
- `status`: `open`, `in progress`, `resolved`, or `closed`
- `creator` (required MongoDB user ID) and optional `assignee`
- `fileName`, managed by the API when images are uploaded
- `version`, used for update concurrency checks

Ticket updates require the current `version`; a stale version returns `409 Conflict`. Successful changes to status, assignee, and priority are recorded in the audit trail, and the version increases when a ticket changes.

To attach images on ticket creation or update, send `multipart/form-data` with files under the repeated field name `image`. The upload middleware accepts PNG and JPEG/JPG images. Without image files, ticket creation can use JSON.

### Comments

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/comments/tickets/:ticketId/comments` | Add a comment |
| `GET` | `/api/comments/tickets/:ticketId/comments` | List comments for a ticket |
| `PUT` | `/api/comments/tickets/:ticketId/comments/:commentId` | Update a comment |
| `DELETE` | `/api/comments/tickets/:ticketId/comments/:commentId` | Delete a comment |

Create a comment with `text` and `author` (a user ID). Update a comment with `text`.

### Admin

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/dashboard` | Get dashboard metrics |

This endpoint requires an admin JWT in the `Authorization` header:

```http
Authorization: Bearer <token>
```

The dashboard response contains `ticketCountPerStatus`, `averageResolutionHours`, and `breachedTicketsPerPriority`.

## Current limitations

- `requireAdmin` is currently applied only to the admin dashboard route. The user, ticket, and comment routes do not have authentication middleware attached. Some ticket mutations nevertheless expect `req.userId` for ownership checks and auditing, so those operations are not fully wired to JWT authentication.
- Ticket image uploads require valid AWS S3 configuration. Images are stored under the `images/` key prefix.
- The rate limiter is applied globally and allows up to five requests per IP per 15-minute window.
- `npm test` is a placeholder that exits with an error; no test suite is configured yet.
- The package does not define a production `start` script.

## Project layout

```text
app.js                 Express application setup and route mounting
controllers/           Request handlers
middleware/            Authentication middleware
models/                Mongoose schemas and ticket audit/update logic
routes/                User, ticket, comment, and admin routes
utils/                 MongoDB connection, S3 integration, and rate limiter
```
