import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ManagePet from './pages/Admin/ManagePet';
import RoleManagement from './pages/Admin/RoleManagement';
import SafeZone from './pages/User/SafeZone';
import Report from './pages/User/Report';
import Notification from './pages/Notification';
import SetAccout from './pages/AccountSettings';
import Navbar from './components/Navbar';
import AuthNavbar from './components/AuthNavbar';
import './App.css';

const AppContent = () => {
  const { user } = useAuth();
  const location = useLocation();

  // ถ้าอยู่หน้า login หรือ register → ใช้ AuthNavbar
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <>
      {isAuthPage ? <AuthNavbar /> : user && <Navbar />}
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/manage-pet" element={<ManagePet />} />
          <Route path="/role-management" element={<RoleManagement />} />
          <Route path="/notification" element={<Notification />} />
          <Route path="/safezone" element={<SafeZone />} />
          <Route path="/report" element={<Report />} />
          {/* <Route path="/alert-set" element={<AddAlert />} /> */}
          <Route path="/account-setting" element={<SetAccout />} />
        </Routes>
      </div>
    </>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
};

export default App;
