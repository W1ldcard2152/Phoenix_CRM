# Auto Repair Shop CRM API Documentation

## Base URL

All API requests should be prefixed with: `/api`

## Authentication

The API uses JWT (JSON Web Token) for authentication.

### Login

```
POST /api/users/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "data": {
    "user": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "User Name",
      "email": "user@example.com",
      "role": "technician"
    }
  }
}
```

### Register

```
POST /api/users/signup
```

**Request Body:**
```json
{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "password123",
  "passwordConfirm": "password123",
  "role": "technician"
}
```

**Response:** Same as login

### Logout

```
GET /api/users/logout
```

**Response:**
```json
{
  "status": "success"
}
```

### Protected Routes

For all protected routes, include the JWT token in the request header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Customer Endpoints

### Get All Customers

```
GET /api/customers
```

**Response:**
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "customers": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "555-123-4567",
        "address": {
          "street": "123 Main St",
          "city": "Anytown",
          "state": "CA",
          "zip": "12345"
        },
        "communicationPreference": "SMS",
        "vehicles": ["60d21b4667d0d8992e610c86"],
        "createdAt": "2023-01-01T00:00:00.000Z",
        "updatedAt": "2023-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### Get Single Customer

```
GET /api/customers/:id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "555-123-4567",
      "address": {
        "street": "123 Main St",
        "city": "Anytown",
        "state": "CA",
        "zip": "12345"
      },
      "communicationPreference": "SMS",
      "vehicles": [
        {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5",
          "vin": "WBAKJ4C51BC123456"
        }
      ],
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z"
    }
  }
}
```

### Create Customer

```
POST /api/customers
```

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "phone": "555-987-6543",
  "address": {
    "street": "456 Oak Ave",
    "city": "Somewhere",
    "state": "CA",
    "zip": "67890"
  },
  "communicationPreference": "Email"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "60d21b4667d0d8992e610c87",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "555-987-6543",
      "address": {
        "street": "456 Oak Ave",
        "city": "Somewhere",
        "state": "CA",
        "zip": "67890"
      },
      "communicationPreference": "Email",
      "vehicles": [],
      "createdAt": "2023-01-02T00:00:00.000Z",
      "updatedAt": "2023-01-02T00:00:00.000Z"
    }
  }
}
```

### Update Customer

```
PATCH /api/customers/:id
```

**Request Body:**
```json
{
  "phone": "555-111-2222",
  "communicationPreference": "SMS"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "customer": {
      "_id": "60d21b4667d0d8992e610c87",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "555-111-2222",
      "address": {
        "street": "456 Oak Ave",
        "city": "Somewhere",
        "state": "CA",
        "zip": "67890"
      },
      "communicationPreference": "SMS",
      "vehicles": [],
      "createdAt": "2023-01-02T00:00:00.000Z",
      "updatedAt": "2023-01-02T00:00:00.000Z"
    }
  }
}
```

### Delete Customer

```
DELETE /api/customers/:id
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

### Search Customers

```
GET /api/customers/search?query=john
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "customers": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "555-123-4567"
      }
    ]
  }
}
```

### Get Customer Vehicles

```
GET /api/customers/:id/vehicles
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "vehicles": [
      {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456",
        "licensePlate": "ABC123",
        "customer": "60d21b4667d0d8992e610c85"
      }
    ]
  }
}
```

---

## Vehicle Endpoints

### Get All Vehicles

```
GET /api/vehicles
```

**Query Parameters:**
- `customer`: Filter by customer ID
- `make`: Filter by vehicle make
- `model`: Filter by vehicle model

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "vehicles": [
      {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456",
        "licensePlate": "ABC123",
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe",
          "phone": "555-123-4567",
          "email": "john@example.com"
        },
        "serviceHistory": ["60d21b4667d0d8992e610c88"],
        "createdAt": "2023-01-01T00:00:00.000Z",
        "updatedAt": "2023-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### Get Single Vehicle

```
GET /api/vehicles/:id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "vehicle": {
      "_id": "60d21b4667d0d8992e610c86",
      "year": 2018,
      "make": "BMW",
      "model": "X5",
      "vin": "WBAKJ4C51BC123456",
      "licensePlate": "ABC123",
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe"
      },
      "serviceHistory": [
        {
          "_id": "60d21b4667d0d8992e610c88",
          "date": "2023-01-05T00:00:00.000Z",
          "status": "Completed - Paid",
          "serviceRequested": "Oil Change",
          "totalEstimate": 89.99,
          "totalActual": 89.99
        }
      ]
    }
  }
}
```

### Create Vehicle

```
POST /api/vehicles
```

**Request Body:**
```json
{
  "customer": "60d21b4667d0d8992e610c85",
  "year": 2020,
  "make": "Audi",
  "model": "Q5",
  "vin": "WAUZ4C51BC789012",
  "licensePlate": "XYZ789",
  "notes": "New purchase"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "vehicle": {
      "_id": "60d21b4667d0d8992e610c89",
      "year": 2020,
      "make": "Audi",
      "model": "Q5",
      "vin": "WAUZ4C51BC789012",
      "licensePlate": "XYZ789",
      "customer": "60d21b4667d0d8992e610c85",
      "serviceHistory": [],
      "notes": "New purchase",
      "createdAt": "2023-01-03T00:00:00.000Z",
      "updatedAt": "2023-01-03T00:00:00.000Z"
    }
  }
}
```

### Update Vehicle

```
PATCH /api/vehicles/:id
```

**Request Body:**
```json
{
  "licensePlate": "NEW123",
  "notes": "Updated license plate"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "vehicle": {
      "_id": "60d21b4667d0d8992e610c89",
      "year": 2020,
      "make": "Audi",
      "model": "Q5",
      "vin": "WAUZ4C51BC789012",
      "licensePlate": "NEW123",
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe"
      },
      "serviceHistory": [],
      "notes": "Updated license plate",
      "createdAt": "2023-01-03T00:00:00.000Z",
      "updatedAt": "2023-01-03T00:00:00.000Z"
    }
  }
}
```

### Delete Vehicle

```
DELETE /api/vehicles/:id
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

### Search Vehicles

```
GET /api/vehicles/search?query=bmw
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "vehicles": [
      {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456",
        "licensePlate": "ABC123",
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe",
          "phone": "555-123-4567",
          "email": "john@example.com"
        }
      }
    ]
  }
}
```

### Get Vehicle Service History

```
GET /api/vehicles/:id/service-history
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "vehicle": {
      "_id": "60d21b4667d0d8992e610c86",
      "year": 2018,
      "make": "BMW",
      "model": "X5"
    },
    "serviceHistory": [
      {
        "_id": "60d21b4667d0d8992e610c88",
        "date": "2023-01-05T00:00:00.000Z",
        "status": "Completed - Paid",
        "serviceRequested": "Oil Change",
        "diagnosticNotes": "Regular maintenance",
        "parts": [
          {
            "name": "Oil Filter",
            "partNumber": "OIL-123",
            "quantity": 1,
            "price": 12.99
          }
        ],
        "labor": [
          {
            "description": "Oil Change",
            "hours": 1,
            "rate": 75
          }
        ],
        "totalEstimate": 89.99,
        "totalActual": 89.99
      }
    ]
  }
}
```

---

## Work Order Endpoints

### Get All Work Orders

```
GET /api/workorders
```

**Query Parameters:**
- `status`: Filter by status
- `customer`: Filter by customer ID
- `vehicle`: Filter by vehicle ID
- `startDate`: Filter by start date
- `endDate`: Filter by end date

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "workOrders": [
      {
        "_id": "60d21b4667d0d8992e610c88",
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5",
          "vin": "WBAKJ4C51BC123456"
        },
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe",
          "phone": "555-123-4567"
        },
        "date": "2023-01-05T00:00:00.000Z",
        "status": "Completed - Paid",
        "serviceRequested": "Oil Change",
        "totalEstimate": 89.99,
        "totalActual": 89.99
      }
    ]
  }
}
```

### Get Single Work Order

```
GET /api/workorders/:id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c88",
      "vehicle": {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456"
      },
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe",
        "phone": "555-123-4567",
        "email": "john@example.com"
      },
      "date": "2023-01-05T00:00:00.000Z",
      "priority": "Normal",
      "status": "Completed - Paid",
      "serviceRequested": "Oil Change",
      "diagnosticNotes": "Regular maintenance",
      "parts": [
        {
          "_id": "60d21b4667d0d8992e610c8a",
          "name": "Oil Filter",
          "partNumber": "OIL-123",
          "quantity": 1,
          "price": 12.99,
          "ordered": true,
          "received": true
        }
      ],
      "labor": [
        {
          "_id": "60d21b4667d0d8992e610c8b",
          "description": "Oil Change",
          "hours": 1,
          "rate": 75
        }
      ],
      "media": [],
      "totalEstimate": 89.99,
      "totalActual": 89.99,
      "appointmentId": null,
      "createdAt": "2023-01-05T00:00:00.000Z",
      "updatedAt": "2023-01-05T00:00:00.000Z"
    }
  }
}
```

### Create Work Order

```
POST /api/workorders
```

**Request Body:**
```json
{
  "vehicle": "60d21b4667d0d8992e610c86",
  "customer": "60d21b4667d0d8992e610c85",
  "date": "2023-01-10T10:00:00.000Z",
  "priority": "Normal",
  "status": "Created",
  "serviceRequested": "Brake Inspection",
  "diagnosticNotes": "Customer reports squeaking brakes",
  "parts": [],
  "labor": []
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c8c",
      "vehicle": "60d21b4667d0d8992e610c86",
      "customer": "60d21b4667d0d8992e610c85",
      "date": "2023-01-10T10:00:00.000Z",
      "priority": "Normal",
      "status": "Created",
      "serviceRequested": "Brake Inspection",
      "diagnosticNotes": "Customer reports squeaking brakes",
      "parts": [],
      "labor": [],
      "media": [],
      "totalEstimate": 0,
      "totalActual": 0,
      "appointmentId": null,
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T00:00:00.000Z"
    }
  }
}
```

### Update Work Order

```
PATCH /api/workorders/:id
```

**Request Body:**
```json
{
  "status": "In Progress",
  "diagnosticNotes": "Front brake pads worn, recommend replacement"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c8c",
      "vehicle": "60d21b4667d0d8992e610c86",
      "customer": "60d21b4667d0d8992e610c85",
      "date": "2023-01-10T10:00:00.000Z",
      "priority": "Normal",
      "status": "In Progress",
      "serviceRequested": "Brake Inspection",
      "diagnosticNotes": "Front brake pads worn, recommend replacement",
      "parts": [],
      "labor": [],
      "media": [],
      "totalEstimate": 0,
      "totalActual": 0,
      "appointmentId": null,
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T01:00:00.000Z"
    }
  }
}
```

### Delete Work Order

```
DELETE /api/workorders/:id
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

### Update Work Order Status

```
PATCH /api/workorders/:id/status
```

**Request Body:**
```json
{
  "status": "Parts Ordered"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c8c",
      "status": "Parts Ordered",
      // other work order fields...
    }
  }
}
```

### Add Part to Work Order

```
POST /api/workorders/:id/parts
```

**Request Body:**
```json
{
  "name": "Front Brake Pads",
  "partNumber": "BP-456",
  "quantity": 1,
  "price": 89.99,
  "ordered": true,
  "received": false
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c8c",
      "parts": [
        {
          "_id": "60d21b4667d0d8992e610c8d",
          "name": "Front Brake Pads",
          "partNumber": "BP-456",
          "quantity": 1,
          "price": 89.99,
          "ordered": true,
          "received": false
        }
      ],
      "totalEstimate": 89.99,
      // other work order fields...
    }
  }
}
```

### Add Labor to Work Order

```
POST /api/workorders/:id/labor
```

**Request Body:**
```json
{
  "description": "Brake Pad Replacement",
  "hours": 1.5,
  "rate": 85
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c8c",
      "labor": [
        {
          "_id": "60d21b4667d0d8992e610c8e",
          "description": "Brake Pad Replacement",
          "hours": 1.5,
          "rate": 85
        }
      ],
      "totalEstimate": 217.49,
      // other work order fields...
    }
  }
}
```

### Get Work Orders by Status

```
GET /api/workorders/status/:status
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "workOrders": [
      {
        "_id": "60d21b4667d0d8992e610c8c",
        "status": "Parts Ordered",
        // other work order fields...
      }
    ]
  }
}
```

### Generate Invoice

```
GET /api/workorders/:id/invoice
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "invoice": {
      "workOrderId": "60d21b4667d0d8992e610c8c",
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "555-123-4567",
        "address": {
          "street": "123 Main St",
          "city": "Anytown",
          "state": "CA",
          "zip": "12345"
        }
      },
      "vehicle": {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456"
      },
      "date": "2023-01-10T10:00:00.000Z",
      "parts": [
        {
          "name": "Front Brake Pads",
          "partNumber": "BP-456",
          "quantity": 1,
          "price": 89.99
        }
      ],
      "labor": [
        {
          "description": "Brake Pad Replacement",
          "hours": 1.5,
          "rate": 85
        }
      ],
      "partsCost": 89.99,
      "laborCost": 127.5,
      "totalCost": 217.49,
      "status": "Completed - Paid"
    }
  }
}
```

### Search Work Orders

```
GET /api/workorders/search?query=brake
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "workOrders": [
      {
        "_id": "60d21b4667d0d8992e610c8c",
        "serviceRequested": "Brake Inspection",
        // other work order fields...
      }
    ]
  }
}
```

---

## Appointment Endpoints

### Get All Appointments

```
GET /api/appointments
```

**Query Parameters:**
- `startDate`: Filter by start date
- `endDate`: Filter by end date
- `status`: Filter by status
- `technician`: Filter by technician

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "appointments": [
      {
        "_id": "60d21b4667d0d8992e610c90",
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe",
          "phone": "555-123-4567",
          "email": "john@example.com"
        },
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5"
        },
        "serviceType": "Maintenance",
        "startTime": "2023-01-15T09:00:00.000Z",
        "endTime": "2023-01-15T11:00:00.000Z",
        "technician": "Mike",
        "status": "Scheduled"
      }
    ]
  }
}
```

### Get Single Appointment

```
GET /api/appointments/:id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "_id": "60d21b4667d0d8992e610c90",
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe",
        "phone": "555-123-4567",
        "email": "john@example.com"
      },
      "vehicle": {
        "_id": "60d21b4667d0d8992e610c86",
        "year": 2018,
        "make": "BMW",
        "model": "X5",
        "vin": "WBAKJ4C51BC123456"
      },
      "serviceType": "Maintenance",
      "startTime": "2023-01-15T09:00:00.000Z",
      "endTime": "2023-01-15T11:00:00.000Z",
      "technician": "Mike",
      "notes": "Regular oil change",
      "status": "Scheduled",
      "workOrder": null,
      "reminder": {
        "sent": false
      },
      "followUp": {
        "sent": false
      },
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T00:00:00.000Z"
    }
  }
}
```

### Create Appointment

```
POST /api/appointments
```

**Request Body:**
```json
{
  "customer": "60d21b4667d0d8992e610c85",
  "vehicle": "60d21b4667d0d8992e610c86",
  "serviceType": "Maintenance",
  "startTime": "2023-01-15T09:00:00.000Z",
  "endTime": "2023-01-15T11:00:00.000Z",
  "technician": "Mike",
  "notes": "Regular oil change",
  "status": "Scheduled",
  "createWorkOrder": false
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "_id": "60d21b4667d0d8992e610c90",
      "customer": "60d21b4667d0d8992e610c85",
      "vehicle": "60d21b4667d0d8992e610c86",
      "serviceType": "Maintenance",
      "startTime": "2023-01-15T09:00:00.000Z",
      "endTime": "2023-01-15T11:00:00.000Z",
      "technician": "Mike",
      "notes": "Regular oil change",
      "status": "Scheduled",
      "workOrder": null,
      "reminder": {
        "sent": false
      },
      "followUp": {
        "sent": false
      },
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T00:00:00.000Z"
    }
  }
}
```

### Update Appointment

```
PATCH /api/appointments/:id
```

**Request Body:**
```json
{
  "status": "Confirmed",
  "notes": "Customer confirmed via phone"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "_id": "60d21b4667d0d8992e610c90",
      "status": "Confirmed",
      "notes": "Customer confirmed via phone",
      // other appointment fields...
    }
  }
}
```

### Delete Appointment

```
DELETE /api/appointments/:id
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

### Create Work Order from Appointment

```
POST /api/appointments/:id/create-work-order
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "appointment": {
      "_id": "60d21b4667d0d8992e610c90",
      "workOrder": "60d21b4667d0d8992e610c91",
      // other appointment fields...
    },
    "workOrder": {
      "_id": "60d21b4667d0d8992e610c91",
      "vehicle": "60d21b4667d0d8992e610c86",
      "customer": "60d21b4667d0d8992e610c85",
      "date": "2023-01-15T09:00:00.000Z",
      "serviceRequested": "Maintenance",
      "status": "Scheduled",
      "appointmentId": "60d21b4667d0d8992e610c90",
      // other work order fields...
    }
  }
}
```

### Send Appointment Reminder

```
POST /api/appointments/:id/send-reminder
```

**Response:**
```json
{
  "status": "success",
  "message": "Appointment reminder sent successfully",
  "data": {
    "appointment": {
      "_id": "60d21b4667d0d8992e610c90",
      "reminder": {
        "sent": true,
        "sentAt": "2023-01-14T10:30:00.000Z"
      },
      // other appointment fields...
    }
  }
}
```

### Check for Scheduling Conflicts

```
POST /api/appointments/check-conflicts
```

**Request Body:**
```json
{
  "startTime": "2023-01-20T13:00:00.000Z",
  "endTime": "2023-01-20T15:00:00.000Z",
  "technician": "Mike"
}
```

**Response:**
```json
{
  "status": "success",
  "results": 0,
  "data": {
    "hasConflicts": false,
    "conflicts": []
  }
}
```

### Get Appointments by Date Range

```
GET /api/appointments/date-range/:startDate/:endDate
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "appointments": [
      {
        "_id": "60d21b4667d0d8992e610c90",
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe"
        },
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5"
        },
        "startTime": "2023-01-15T09:00:00.000Z",
        "endTime": "2023-01-15T11:00:00.000Z",
        "status": "Confirmed"
      }
    ]
  }
}
```

### Get Today's Appointments

```
GET /api/appointments/today
```

**Response:**
```json
{
  "status": "success",
  "results": 2,
  "data": {
    "appointments": [
      {
        "_id": "60d21b4667d0d8992e610c92",
        "customer": {
          "_id": "60d21b4667d0d8992e610c85",
          "name": "John Doe"
        },
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5"
        },
        "startTime": "2023-01-16T09:00:00.000Z",
        "endTime": "2023-01-16T10:00:00.000Z",
        "status": "Confirmed"
      },
      {
        "_id": "60d21b4667d0d8992e610c93",
        "customer": {
          "_id": "60d21b4667d0d8992e610c87",
          "name": "Jane Smith"
        },
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c89",
          "year": 2020,
          "make": "Audi",
          "model": "Q5"
        },
        "startTime": "2023-01-16T13:00:00.000Z",
        "endTime": "2023-01-16T15:00:00.000Z",
        "status": "Scheduled"
      }
    ]
  }
}
```

### Get Customer Appointments

```
GET /api/appointments/customer/:customerId
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "customer": {
      "_id": "60d21b4667d0d8992e610c85",
      "name": "John Doe"
    },
    "appointments": [
      {
        "_id": "60d21b4667d0d8992e610c90",
        "vehicle": {
          "_id": "60d21b4667d0d8992e610c86",
          "year": 2018,
          "make": "BMW",
          "model": "X5"
        },
        "startTime": "2023-01-15T09:00:00.000Z",
        "endTime": "2023-01-15T11:00:00.000Z",
        "status": "Confirmed"
      }
    ]
  }
}
```

### Get Vehicle Appointments

```
GET /api/appointments/vehicle/:vehicleId
```

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "vehicle": {
      "_id": "60d21b4667d0d8992e610c86",
      "year": 2018,
      "make": "BMW",
      "model": "X5",
      "customer": {
        "_id": "60d21b4667d0d8992e610c85",
        "name": "John Doe"
      }
    },
    "appointments": [
      {
        "_id": "60d21b4667d0d8992e610c90",
        "startTime": "2023-01-15T09:00:00.000Z",
        "endTime": "2023-01-15T11:00:00.000Z",
        "status": "Confirmed"
      }
    ]
  }
}
```

---

## Media Endpoints

### Upload Media

```
POST /api/media/upload
```

**Form Data:**
- `file`: The file to upload
- `workOrder`: Work order ID (optional)
- `vehicle`: Vehicle ID (optional)
- `customer`: Customer ID (optional)
- `type`: Type of media (e.g., 'Pre-Inspection', 'Diagnostic')
- `notes`: Additional notes (optional)

**Response:**
```json
{
  "status": "success",
  "data": {
    "media": {
      "_id": "60d21b4667d0d8992e610c95",
      "workOrder": "60d21b4667d0d8992e610c88",
      "vehicle": "60d21b4667d0d8992e610c86",
      "customer": "60d21b4667d0d8992e610c85",
      "type": "Diagnostic",
      "fileUrl": "https://your-s3-bucket.s3.amazonaws.com/60d21b4667d0d8992e610c95",
      "fileName": "brake-pads.jpg",
      "fileType": "image/jpeg",
      "fileSize": 1024000,
      "notes": "Close-up of worn brake pads",
      "uploadedBy": "Mike",
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T00:00:00.000Z"
    }
  }
}
```

### Get All Media

```
GET /api/media
```

**Query Parameters:**
- `workOrder`: Filter by work order ID
- `vehicle`: Filter by vehicle ID
- `customer`: Filter by customer ID
- `type`: Filter by media type

**Response:**
```json
{
  "status": "success",
  "results": 1,
  "data": {
    "media": [
      {
        "_id": "60d21b4667d0d8992e610c95",
        "workOrder": "60d21b4667d0d8992e610c88",
        "vehicle": "60d21b4667d0d8992e610c86",
        "customer": "60d21b4667d0d8992e610c85",
        "type": "Diagnostic",
        "fileUrl": "https://your-s3-bucket.s3.amazonaws.com/60d21b4667d0d8992e610c95",
        "fileName": "brake-pads.jpg",
        "fileType": "image/jpeg",
        "fileSize": 1024000,
        "notes": "Close-up of worn brake pads",
        "uploadedBy": "Mike",
        "createdAt": "2023-01-10T00:00:00.000Z",
        "updatedAt": "2023-01-10T00:00:00.000Z"
      }
    ]
  }
}
```

### Get Single Media

```
GET /api/media/:id
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "media": {
      "_id": "60d21b4667d0d8992e610c95",
      "workOrder": "60d21b4667d0d8992e610c88",
      "vehicle": "60d21b4667d0d8992e610c86",
      "customer": "60d21b4667d0d8992e610c85",
      "type": "Diagnostic",
      "fileUrl": "https://your-s3-bucket.s3.amazonaws.com/60d21b4667d0d8992e610c95",
      "fileName": "brake-pads.jpg",
      "fileType": "image/jpeg",
      "fileSize": 1024000,
      "notes": "Close-up of worn brake pads",
      "uploadedBy": "Mike",
      "createdAt": "2023-01-10T00:00:00.000Z",
      "updatedAt": "2023-01-10T00:00:00.000Z"
    }
  }
}
```

### Delete Media

```
DELETE /api/media/:id
```

**Response:**
```json
{
  "status": "success",
  "data": null
}
```

### Get Signed URL

```
GET /api/media/:id/signed-url
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "signedUrl": "https://your-s3-bucket.s3.amazonaws.com/60d21b4667d0d8992e610c95?AWSAccessKeyId=...",
    "expiresIn": 3600
  }
}
```

### Share Media via Email

```
POST /api/media/:id/share
```

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Media shared successfully",
  "data": {
    "media": {
      "_id": "60d21b4667d0d8992e610c95",
      "isShared": true,
      "sharedWith": [
        {
          "email": "john@example.com",
          "sharedAt": "2023-01-10T05:00:00.000Z"
        }
      ],
      // other media fields...
    }
  }
}
```

---

## Error Responses

All endpoints follow a consistent error response format:

### Client Errors (4xx)

```json
{
  "status": "fail",
  "message": "Error message explaining what went wrong"
}
```

### Server Errors (5xx)

```json
{
  "status": "error",
  "message": "Something went wrong"
}
```

### Common Error Codes

- `400`: Bad Request - Invalid input data
- `401`: Unauthorized - Missing or invalid authentication token
- `403`: Forbidden - Not allowed to access this resource
- `404`: Not Found - Resource doesn't exist
- `409`: Conflict - Resource already exists or other conflict
- `422`: Unprocessable Entity - Request understood but cannot be processed
- `500`: Internal Server Error - Server problem

## Testing the API

You can test the API using tools like:

1. Postman
2. curl command-line tool
3. The browser's Fetch API

Example Fetch request:

```javascript
// Get all customers
fetch('http://localhost:5000/api/customers', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));

// Create a new customer
fetch('http://localhost:5000/api/customers', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'New Customer',
    email: 'newcustomer@example.com',
    phone: '555-555-5555',
    address: {
      street: '789 Pine St',
      city: 'Elsewhere',
      state: 'NY',
      zip: '54321'
    },
    communicationPreference: 'SMS'
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```