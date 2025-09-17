import React, { useEffect, useState } from 'react';
import { Link, useNavigate , useLocation} from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { rtdb } from '../firebase';
import { ref, onValue } from 'firebase/database';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, loading } = useAuth();
  const [notifCount, setNotifCount] = useState(0);

  // Real-time count for admin notification
  useEffect(() => {
    if (user && user.role === 'owner') {
      const reportsRef = ref(rtdb, 'reports');
      const unsubscribe = onValue(reportsRef, (snapshot) => {
        const data = snapshot.val();
        let count = 0;
        if (data) {
          count = Object.keys(data).length;
        }
        setNotifCount(count);
      });
      return () => unsubscribe();
    }
  }, [user]);

const isActive = (path) => location.pathname.startsWith(path);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // แสดง loading indicator
  if (loading) {
    return (
      <nav style={{
        background: '#357abd',
        color: 'white',
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        
      }}>
        <div style={{ 
          fontWeight: 'bold', 
          fontSize: '1.2rem' 
        }}>Pet tracking system</div>
        <div></div>
      </nav>
    );
  }

  // ไม่แสดง Navbar ถ้ายังไม่ได้ login
  if (!user) {
    return null;
  }

  // Debug: แสดงข้อมูล user ใน console
  console.log('Navbar - User data:', user);
  console.log('Navbar - User role:', user.role);

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
      {/* Left side - Brand */}
      <div style={{ 
        fontWeight: 'bold', 
        fontSize: '2rem'
      }} >Pet tracking system</div>
      
      {/* Center - Navigation Links */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1
      }}>
        {/* {!user && (
          <Link to="/login" style={{ color: 'white', textDecoration: 'none' }}>Login</Link>
        )} */}
        {user && (user.role === 'caregiver' || !user.role) && (
          <>
            <Link to="/dashboard" style={{ 
              color: isActive('/dashboard') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/dashboard') ? 'none' : 'none',
              fontWeight: isActive('/dashboard') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>Dashboard</Link>
            <Link to="/safezone" style={{ 
              color: isActive('/safezone') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/safezone') ? 'none' : 'none',
              fontWeight: isActive('/safezone') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>SafeZone</Link>
            <Link to="/report" style={{ 
              color: isActive('/report') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/report') ? 'none' : 'none',
              fontWeight: isActive('/report') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>Report</Link>
            
          </>
        )}
        {user && user.role === 'owner' && (
          <>
            <Link to="/dashboard" style={{ 
              color: isActive('/dashboard') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/dashboard') ? 'none' : 'none',
              fontWeight: isActive('/dashboard') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>Dashboard</Link>
            <Link to="/manage-pet" style={{ 
              color: isActive('/manage-pet') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/manage-pet') ? 'none' : 'none',
              fontWeight: isActive('/manage-pet') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>ManagePet</Link>
            <Link to="/role-management" style={{ 
              color: isActive('/role-management') ? '#ffd700' : 'white',
              marginRight: '2rem',
              textDecoration: isActive('/role-management') ? 'none' : 'none',
              fontWeight: isActive('/role-management') ? 'bold' : 'normal',
              fontSize: '1.5rem',
              textDecorationLine: 'none'
            }}>Role-Management</Link>
          </>
        )}
      </div>
      
      {/* Right side - User info, notification, and logout */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        gap: '1rem'
      }}>
        {user && user.role === 'owner' && (
          <Link to="/notification" style={{ 
            color: isActive('/notification') ? '#ffd700' : 'white',
            position: 'relative',
            fontSize: '1.5rem',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}>
            <svg width="24" height="24" fill="white" viewBox="0 -3 20 20" style={{ verticalAlign: 'middle' }}>
              <path d="M12 2C8.13 2 5 5.13 5 9v5H3v2h18v-2h-2V9c0-3.87-3.13-7-7-7zm0 18c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"/>
            </svg>
            {notifCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-0.3rem',
                right: '-0.7rem',
                background: 'red',
                color: 'white',
                borderRadius: '60%',
                fontSize: '0.85rem',
                minWidth: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                padding: '0 6px',
                zIndex: 2
              }}>{notifCount}</span>
            )}
          </Link>
        )}
        
        {user && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '1rem',
            color: isActive('/account-setting') ? '#ffd700' : 'white',
            fontWeight: isActive('/account-setting') ? 'bold' : 'normal',
            fontSize: '1.5rem', 
          }}>
            <span 
              onClick={() => navigate('/account-setting')}
              style={{ 
                cursor: 'pointer', 
            }}
            >
              {user.username || user.email}
            </span>

            <button onClick={handleLogout} style={{ 
              color: 'white', 
              background: '#e74c3c',
              padding: '0.5rem 1rem',
              borderRadius: '5px', 
              border: 'none', 
              cursor: 'pointer',
              fontSize: '20px'
            }}>Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;