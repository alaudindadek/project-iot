import React, { useState } from 'react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { rtdb, db } from '../firebase';
import { ref, get } from 'firebase/database';
import { useAuth } from '../contexts/AuthContext';
import { collection ,getDocs} from 'firebase/firestore';
// import Navbar from "../components/Navbar";
import './Auth.css';

import { messaging } from '../firebase'; // เพิ่ม
import { getToken } from 'firebase/messaging'; // เพิ่ม
import { doc, setDoc } from 'firebase/firestore'; // เพิ่ม

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();
  const { setUserWithRole } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // ค้นหา email และ role จาก username
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      let foundEmail = null;
      let foundRole = null;
      let foundUid = null;

      snapshot.forEach(docSnap => {
        const user = docSnap.data();
        if (user.username === username) {
          foundEmail = user.email;
          foundRole = user.role;
          foundUid = docSnap.id;
        }
      });
      if (!foundEmail) {
        setError('ไม่พบชื่อผู้ใช้นี้ในระบบ');
        setLoading(false);
        return;
      }
      // login ด้วย email ที่ค้นเจอ
      await signInWithEmailAndPassword(auth, foundEmail, password);
      // ส่งข้อมูล user+role ไป AuthContext
      setUserWithRole({ username, email: foundEmail, role: foundRole, uid: foundUid });
      await saveFcmToken(foundUid); // <-- เพิ่มบรรทัดนี้
      if (foundRole === 'owner') {
        navigate('/dashboard');
      } else {
        navigate('/dashboard'); // เปลี่ยนเส้นทางไปยัง SafeZone หรือหน้าที่ต้องการ
      }
    } catch (error) {
      setError(error.message); // หรือ error.code
    } finally {
      setLoading(false);
      
    }
  };

  const saveFcmToken = async (uid) => {
  try {
    const token = await getToken(messaging, { vapidKey: "YOUR_VAPID_KEY" }); // ใส่ VAPID_KEY ของคุณ
    if (token) {
      await setDoc(doc(db, "users", uid), { fcmToken: token }, { merge: true });
    }
  } catch (err) {
    // ไม่ต้องแจ้ง error กับ user ก็ได้
    console.error("FCM Token error:", err);
  }
};

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>เข้าสู่ระบบ</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>ชื่อผู้ใช้</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required autoFocus />
          </div>
          <div className="form-group">
            <label>รหัสผ่าน</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>
        <p className="auth-link">
          ยังไม่มีบัญชี? <span style={{color:'#4a90e2', cursor:'pointer', textDecoration:'underline'}} onClick={() => navigate('/register')}>ลงทะเบียน</span>
        </p>
      </div>
    </div>
  );
};

export default Login;