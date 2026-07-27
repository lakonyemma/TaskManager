# 🚀 Taskly

Taskly is a modern task and team management platform designed to help individuals and teams organize projects, manage tasks, collaborate efficiently, and track productivity.

Built with a modern full-stack architecture, Taskly provides secure authentication, team collaboration, task tracking, notifications, reporting, and workspace management in a professional SaaS experience.

## ✨ Features

#### 🔐 Authentication & Security

* User Registration
* User Login
* Persistent Authentication
* Secure Password Hashing
* Protected Routes
* Session Management
* Role-Based Access Control

#### 👥 Team Management

* Create Teams
* Manage Team Members
* Assign Roles
* Invite Users via Email
* Track Pending Invitations
* Manage Accepted Invitations

#### 📋 Task Management

* Create Tasks
* Update Tasks
* Delete Tasks
* Assign Tasks
* Task Prioritization
* Task Status Tracking
* Due Dates

#### 📊 Productivity & Reporting

* Productivity Dashboard
* Team Performance Reports
* Task Completion Analytics
* Activity Tracking

#### 🔔 Notifications

* In-App Notifications
* Web Push Notifications (delivered even when Taskly is closed)
* Task Reminder Scheduling (5m / 10m / 15m / 30m / 1h / 1d / custom before due)
* Notification Actions — View Task, Mark Complete, Snooze
* Sound & Vibration Preferences
* Notification Center with Read/Unread Status
* Notification Preferences (push, sound, vibration, default reminder times)

See [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md) for the full design.

#### 🏢 Workspace Management

* Workspace Settings
* Workspace Members
* Workspace Permissions

#### 📜 Activity Logs

* Login History
* User Activities
* Team Activities
* Task Activities
* Security Events

## 🏗️ System Architecture

Taskly follows a modern client-server architecture.

Frontend

* React
* TypeScript
* Tailwind CSS

Backend

* Node.js
* Express.js
* TypeScript

Database

* PostgreSQL
* Prisma ORM

Authentication

* JWT Authentication
* Refresh Tokens

Email Services

* Resend API

Version Control

* Git
* GitHub

## 📁 Project Structure

Taskly
│
├── frontend/
│   ├── src/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   └── services/
│
├── backend/
│   ├── src/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── prisma/
│
└── README.md

## ⚙️ Installation

Clone Repository

git clone <repository-url>

Navigate to Project

cd Taskly

Backend Setup

cd backend
npm install

Create a `.env` file:

DATABASE_URL=
JWT_SECRET=
RESEND_API_KEY=

Run migrations:

npx prisma migrate dev

Start backend:

npm run dev

Frontend Setup

cd frontend
npm install
npm run dev

## 🔑 Environment Variables

Backend

DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
RESEND_API_KEY=
APP_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
REMINDER_POLL_INTERVAL_MS=

Frontend

VITE_VAPID_PUBLIC_KEY=  (optional fallback — normally fetched from the API at runtime)

## 👤 User Roles

Taskly supports role-based access control.

#### Owner

* Full system access
* Manage workspaces
* Manage members
* Manage settings

#### Admin

* Manage team members
* Manage projects
* Manage tasks

#### Manager

* Manage assigned teams
* Create reports
* Monitor productivity

#### Member

* Create and manage tasks
* Collaborate with team members

## 📧 Invitation Workflow

1. User sends an invitation.
2. Taskly sends an email invitation.
3. Recipient receives invitation link.
4. Recipient registers an account.
5. Recipient joins the workspace.

## 🔒 Security Features

* JWT Authentication
* Password Hashing
* Route Protection
* Session Tracking
* Activity Logging
* Role-Based Permissions
* Secure API Validation

## 📱 Responsive Design

Taskly supports:

* Desktop
* Tablet
* Mobile Devices

## 🚀 Future Enhancements

* Real-Time Collaboration
* File Attachments
* Calendar Integration
* Team Chat
* AI Task Suggestions
* Mobile Application
* Advanced Analytics

## 🧪 Testing

Run backend tests:

npm test

Run frontend tests:

npm test

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Author

Developed by **Nuweampiire Anati**

Diploma in Software Engineering
ISBAT University – Kampala, Uganda

## 🌟 Project Status

Taskly is actively under development and continuously improving with new features, performance enhancements, and security updates.