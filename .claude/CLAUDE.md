# Phoenix CRM

Auto repair shop CRM for a German vehicle specialist. Manages customers, vehicles, work orders, appointments, invoices, quotes, and parts inventory.

## Tech Stack

- **Frontend**: React 18 + React Router v6, Tailwind CSS + Bootstrap, Axios, Formik/Yup, jsPDF
- **Backend**: Node.js/Express, MongoDB/Mongoose, JWT (HTTP-only cookies), Passport.js (Google OAuth)
- **External Services**: AWS S3 (media), SendGrid (email), Twilio (SMS), OpenAI (receipt extraction)

## Project Structure

```
src/
├── server/
│   ├── app.js              # Express setup & middleware
│   ├── controllers/        # Request handlers
│   ├── models/             # Mongoose schemas
│   ├── routes/             # API routes
│   ├── services/           # External integrations (email, SMS, S3, AI)
│   ├── middleware/         # Error handling
│   └── utils/              # Helpers (calculations, validation, dates)
└── client/src/
    ├── pages/              # Page components by feature
    ├── components/         # Reusable UI components
    ├── contexts/           # AuthContext for state
    ├── services/           # API client services
    └── utils/              # Formatters, PDF utils
```

## Key Models

- **Customer**: Contact info, communication preferences, linked vehicles
- **Vehicle**: Year/make/model/VIN, mileage history, service history
- **WorkOrder**: Core entity - parts, labor, media, status tracking, technician assignment
- **Appointment**: Scheduling with technician, reminders, multi-day support
- **Invoice**: Generated from work orders, payment tracking, line items
- **Quote**: Estimates that convert to work orders
- **Part**: Catalog with cost/price/vendor tracking
- **User**: Roles (admin, management, service-writer, technician), Google OAuth support

## Work Order Statuses

`Scheduled` → `Inspected` → `Awaiting Approval` → `Parts Ordered` → `In Progress` → `Repair Complete - Awaiting Payment` → `Ready for Pickup` → `Completed`

## Important Patterns

### Error Handling
- `AppError` class for operational errors (`src/server/utils/appError.js`)
- `catchAsync` wrapper for async handlers (`src/server/utils/catchAsync.js`)
- Global error middleware in `src/server/middleware/errorHandler.js`

### Authentication
- JWT in HTTP-only cookies (XSS protection)
- `protect` middleware validates JWT and user status
- `restrictTo('admin', 'management')` for role-based access
- Google OAuth via Passport.js

### Cost Calculations
Use `src/server/utils/calculationHelpers.js` for all pricing:
- Parts: price × quantity
- Labor: rate × quantity (supports hourly or fixed billing)
- Totals calculated server-side for consistency

### API Response Format
```javascript
{ status: 'success', data: { ... }, message: '...' }
```

### Model Relationships
- Customer → many Vehicles
- Vehicle → many WorkOrders
- WorkOrder → many Appointments, Media, Invoices
- Appointment → one Technician, one WorkOrder

## Commands

```bash
npm run dev          # Run both client & server (concurrently)
npm run dev:server   # Server only (nodemon)
npm run dev:client   # Client only
npm run build        # Build client for production
```

## Environment Variables

Required in `.env`:
- `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`, `AWS_REGION`
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Naming Conventions

- Models: PascalCase singular (`WorkOrder`, not `WorkOrders`)
- Routes: kebab-case plural (`/api/work-orders`)
- Controllers/Services: PascalCase with suffix (`workOrderController`)
- Variables/functions: camelCase

## Security

- Helmet.js for HTTP headers
- express-mongo-sanitize for NoSQL injection
- XSS sanitizer middleware
- Rate limiting on auth endpoints
- CORS with credentials
- Password reset tokens expire in 10 minutes
