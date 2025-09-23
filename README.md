# Pet Tracking System

A full-stack web application for tracking and managing pets in real-time.

## Features
- Register pets and set their information
- Track pets’ real-time location
- View pets’ movement history
- Assign caregivers and manage roles
- Receive notifications when pets enter/exit unsafe zones
- Set safe boundaries (Geo-fence) via Google Maps API

## User Roles

### 1. Pet Owner
- Register pets and set up their information (name, type, and tracking device ID)
- Track pets’ real-time location
- View pets’ movement history
- Assign roles and manage caregivers

### 2. Caregiver
- Track pets’ location within authorized areas
- Receive notifications when pets enter or leave unsafe zones
- Set up safe boundaries (Geo-fence) using Google Maps API

## Tech Stack

### Frontend
- React.js + JSX + Tailwind CSS
- React Router DOM for navigation
- Leaflet + React-Leaflet for maps
- EmailJS for sending notifications

### Backend
- Node.js + Express.js
- cors, dotenv for configuration
- MongoDB (via Mongoose) and MySQL (via mysql2)

### Database / Services
- Firebase Firestore / Realtime Database for real-time updates (if used)
- Firebase Auth for authentication
- Firebase Hosting / Functions (optional serverless backend)

## GitHub
[https://github.com/alaudindadek]
