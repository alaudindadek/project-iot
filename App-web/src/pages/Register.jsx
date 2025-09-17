import React, { useState } from "react";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { rtdb, db } from "../firebase";
import { ref, set, get } from "firebase/database";
import {
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import "./Auth.css";

const Register = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  // const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const auth = getAuth();
  const [success, setSuccess] = useState(false); // เพิ่ม state สำหรับป็อปอัพ

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !email || !phone) {
      setError("กรุณากรอกข้อมูลให้ครบ");
      return;
    }
    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    // ตรวจสอบรูปแบบเบอร์โทรศัพท์
    const cleanePhone = phone.replace(/-/g, "");
    const phoneRegex = /^[0-9]{3}[0-9]{3}[0-9]{4}$/;
    if (!phoneRegex.test(cleanePhone)) {
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก");
      return;
    }

    const formatPhone = cleanePhone.replace(
      /(\d{3})(\d{3})(\d{4})/,
      "$1-$2-$3"
    );
    setLoading(true);
    try {
      // ตรวจสอบ username ซ้ำ
      const usersRef = query(
        collection(db, "users"),
        where("username", "==", username)
      );
      const snapshot = await getDocs(usersRef);
      if (!snapshot.empty) {
        setError("ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว");
        setLoading(false);
        return;
      }

      // ตรวจสอบเบอร์โทรศัพท์ซ้ำ
      const phoneRef = query(
        collection(db, "users"),
        where("phone", "==", formatPhone)
      );
      const phoneSnapshot = await getDocs(phoneRef);
      if (!phoneSnapshot.empty) {
        setError("เบอร์โทรศัพท์นี้ถูกใช้ไปแล้ว");
        setLoading(false);
        return;
      }

      // ตรวจสอบอีเมลซ้ำ
      const emailRef = query(
        collection(db, "users"),
        where("email", "==", email)
      );
      const emailSnapshot = await getDocs(emailRef);
      if (!emailSnapshot.empty) {
        setError("อีเมลนี้ถูกใช้ไปแล้ว");
        setLoading(false);
        return;
      }

      // สมัครสมาชิก
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // บันทึก username, email, password ลง Firestore
      await setDoc(doc(db, "users", userCredential.user.uid), {
        userId: userCredential.user.uid,
        username,
        email,
        phone: formatPhone,
        password,
        role: "caregiver", // ควรเข้ารหัสก่อนบันทึกจริง (แต่ตัวอย่างนี้บันทึก plain text ตามคำขอ)
      });
      setSuccess(true); // แสดงป็อปอัพ
      setTimeout(() => {
        setSuccess(false);
        navigate("/login");
      }, 2000); // ปิดป็อปอัพและเปลี่ยนหน้าอัตโนมัติหลัง 2 วินาที
    } catch (error) {
      setError(error.message); // หรือ error.code
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>ลงทะเบียน</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>ชื่อผู้ใช้</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>อีเมล</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>เบอร์โทรศัพท์</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="081-xxx-xxxx"
              pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
              required
            />
          </div>
          <div className="form-group">
            <label>รหัสผ่าน</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>ยืนยันรหัสผ่าน</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? "กำลังลงทะเบียน..." : "ลงทะเบียน"}
          </button>
        </form>
        <p className="auth-link">
          มีบัญชีอยู่แล้ว?{" "}
          <span
            style={{
              color: "#4a90e2",
              cursor: "pointer",
              textDecoration: "underline",
            }}
            onClick={() => navigate("/login")}
          >
            เข้าสู่ระบบ
          </span>
        </p>
        {success && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              background: "rgba(0,0,0,0.0)", // ไม่ต้องมีพื้นหลังดำจาง
              display: "flex",
              alignItems: "flex-start", // ชิดบน
              justifyContent: "center",
              zIndex: 9999,
            }}
          >
            <div
              style={{
                marginTop: "2rem", // ขยับลงมาจากขอบบน
                background: "white",
                padding: "1rem 2rem",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                textAlign: "center",
                fontSize: "1.2rem",
                color: "#357abd",
              }}
            >
              ลงทะเบียนเสร็จสิ้น กำลังเปลี่ยนไปหน้าเข้าสู่ระบบ...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
