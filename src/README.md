# Auto Repair Shop CRM

A Customer Relationship Management (CRM) system for an independent auto repair shop specializing in German vehicles.

## Project Overview

This application helps manage customers, vehicles, work orders, and appointments for an auto repair shop. The system is designed to streamline the workflow of repair services while maintaining the existing parts business.

## Technology Stack

### Frontend
- React.js for Progressive Web App (PWA)
- Tailwind CSS for responsive design
- Service workers for offline capabilities
- IndexedDB for local data caching

### Backend
- Node.js with Express
- MongoDB for database
- AWS S3 for media storage
- Mongoose for data modeling

### APIs & Services
- Twilio for SMS/MMS
- SendGrid for email
- AWS S3 for file storage

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- MongoDB (local or Atlas)
- AWS account for S3 storage
- Twilio and SendGrid accounts (optional for communication features)

### Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/auto-repair-crm.git
cd auto-repair-crm
```

2. Install dependencies:
```
# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

3. Environment Setup:
Create a `.env` file in the root directory with the following variables:
```
# Server
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=your_mongodb_connection_string

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=90d
JWT_COOKIE_EXPIRES_IN=90

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
S3_BUCKET_NAME=your_s3_bucket_name

# Twilio (optional)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# SendGrid (optional)
SENDGRID_API_KEY=your_sendgrid_api_key
EMAIL_FROM=your_from_email
```

4. Starting the Development Servers:
```
# In one terminal, start the backend server
npm run server

# In another terminal, start the frontend client
npm run client

# Or to run both concurrently
npm run dev
```

## Features

### Customer Management
- Store customer contact information
- Track customer vehicles and service history
- Maintain notes and communication preferences

### Vehicle Tracking
- Year, make, model tracking
- VIN and license plate information
- Service history linked to each vehicle

### Work Order System
- Status tracking
- Priority levels
- Diagnostic notes
- Parts tracking and ordering
- Labor estimates
- Media attachments

### Appointment Scheduling
- Calendar integration
- Service type & duration tracking
- Technician assignment

### Communication System
- SMS/MMS capabilities
- Email notifications
- Appointment reminders
- Status updates

## Development Notes

### API Endpoints

For detailed API documentation, please see `API_DOCUMENTATION.md` in the project root.

### Production Deployment

1. Build the frontend:
```
cd client
npm run build
cd ..
```

2. Set environment variables for production:
```
NODE_ENV=production
```

3. Start the production server:
```
npm start
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped build this system
- Special thanks to the auto repair shop team for their input and feedback