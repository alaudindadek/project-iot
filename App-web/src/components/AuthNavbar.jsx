// src/components/AuthNavbar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const AuthNavbar = () => {

  return (
    <nav style={{
      background: '#357abd',
      color: 'white',
      padding: '1rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: '60px',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '2rem' }}>
        Pet Tracking System
      </div>
    </nav>
  );
};

export default AuthNavbar;
