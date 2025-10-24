import React, { useState, useEffect } from "react";
import { getAuth, updatePassword, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import "./AccountSettings.css";

const AccountSettings = () => {
  const auth = getAuth();
  const user = auth.currentUser;

  const [userDocRef, setUserDocRef] = useState(null);
  const [profile, setProfile] = useState({
    username: "",
    email: "",
    phone: "",
  });

  const [editField, setEditField] = useState(null);
  const [tempValue, setTempValue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""); // สำหรับยืนยันตัวตน
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user?.email) return;

      try {
        const q = query(
          collection(db, "users"),
          where("email", "==", user.email)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          setUserDocRef(doc.ref);
          setProfile({
            username: data.username || "",
            phone: data.phone || "",
            email: data.email || user.email,
          });
        }
      } catch (err) {
        alert("โหลดข้อมูลผิดพลาด: " + err.message);
      }
    };

    fetchUserData();
  }, [user]);

  const handleStartEdit = (field) => {
    setEditField(field);
    setTempValue(profile[field]);
    setCurrentPassword(""); // รีเซ็ตรหัสผ่าน
  };

  const handleSaveField = async (field) => {
    if (!userDocRef) return;
    setLoading(true);

    try {
      //---------แก้ไขเบอร์โทร 
      if (field === "phone") {
        const cleanedPhone = tempValue.replace(/-/g, '');
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(cleanedPhone)) {
          alert("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
          setLoading(false);
          return;
        }
        
        const formatPhone = cleanedPhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

        const phoneRef = query(
          collection(db, "users"),
          where("phone", "==", formatPhone)
        );
        const phoneSnapshot = await getDocs(phoneRef);

        if (!phoneSnapshot.empty) {
          const isOwnNumber = phoneSnapshot.docs.some(
            (doc) => doc.id === userDocRef.id
          );
          if (!isOwnNumber) {
            alert("เบอร์โทรศัพท์นี้ถูกใช้ไปแล้ว");
            setLoading(false);
            return;
          }
        }

        await updateDoc(userDocRef, { [field]: formatPhone });
        setProfile((prev) => ({ ...prev, [field]: formatPhone }));
        setEditField(null);
      } 
      //----------แก้ไขอีเมล
      else if (field === "email") {
        // ตรวจสอบรูปแบบอีเมล
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(tempValue)) {
          alert("กรุณากรอกอีเมลที่ถูกต้อง");
          setLoading(false);
          return;
        }

        // ตรวจสอบว่าต้องกรอกรหัสผ่านปัจจุบัน
        if (!currentPassword) {
          alert("กรุณากรอกรหัสผ่านปัจจุบันเพื่อยืนยันการเปลี่ยนอีเมล");
          setLoading(false);
          return;
        }

        // ตรวจสอบว่าอีเมลซ้ำหรือไม่
        const emailQuery = query(
          collection(db, "users"),
          where("email", "==", tempValue)
        );
        const emailSnapshot = await getDocs(emailQuery);
        
        if (!emailSnapshot.empty) {
          alert("อีเมลนี้ถูกใช้ไปแล้ว");
          setLoading(false);
          return;
        }

        // ยืนยันตัวตนก่อนเปลี่ยนอีเมล
        const credential = EmailAuthProvider.credential(
          user.email,
          currentPassword
        );
        
        try {
          await reauthenticateWithCredential(user, credential);
        } catch (err) {
          alert("รหัสผ่านไม่ถูกต้อง");
          setLoading(false);
          return;
        }

        // อัปเดตอีเมลใน Firebase Auth
        await updateEmail(user, tempValue);
        
        // อัปเดตอีเมลใน Firestore
        await updateDoc(userDocRef, { email: tempValue });
        
        setProfile((prev) => ({ ...prev, email: tempValue }));
        setEditField(null);
        setCurrentPassword("");
        alert("เปลี่ยนอีเมลเรียบร้อยแล้ว");
      }
      // แก้ไข username
      else {
        await updateDoc(userDocRef, { [field]: tempValue });
        setProfile((prev) => ({ ...prev, [field]: tempValue }));
        setEditField(null);
      }
    } catch (err) {
      alert("บันทึกไม่สำเร็จ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) return alert("กรุณากรอกรหัสผ่านใหม่");
    if (newPassword.length < 6) return alert("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
    
    setLoading(true);
    try {
      await updatePassword(user, newPassword);
      alert("เปลี่ยนรหัสผ่านเรียบร้อย");
      setNewPassword("");
    } catch (err) {
      alert("เปลี่ยนรหัสผ่านล้มเหลว: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-settings">
      <h1 className="account-title">โปรไฟล์</h1>
      <div className="account-container">
        {/* Field: Username */}
        <div className="account-section">
          <label className="account-label">ผู้ใช้</label>
          {editField === "username" ? (
            <>
              <input
                type="text"
                className="account-input"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
              />
              <div className="account-buttons">
                <button
                  onClick={() => handleSaveField("username")}
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => setEditField(null)}
                  className="cancel-btn"
                >
                  ยกเลิก
                </button>
              </div>
            </>
          ) : (
            <div className="account-value">
              <span>{profile.username}</span>
              <button
                onClick={() => handleStartEdit("username")}
                className="edit-btn"
              >
                แก้ไข
              </button>
            </div>
          )}
        </div>

        {/* Field: Phone */}
        <div className="account-section">
          <label className="account-label">เบอร์โทรศัพท์</label>
          {editField === "phone" ? (
            <>
              <input
                type="text"
                className="account-input"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                placeholder="0XX-XXX-XXXX"
              />
              <div className="account-buttons">
                <button
                  onClick={() => handleSaveField("phone")}
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => setEditField(null)}
                  className="cancel-btn"
                >
                  ยกเลิก
                </button>
              </div>
            </>
          ) : (
            <div className="account-value">
              <span>{profile.phone}</span>
              <button
                onClick={() => handleStartEdit("phone")}
                className="edit-btn"
              >
                แก้ไข
              </button>
            </div>
          )}
        </div>

        {/* Field: Email */}
        <div className="account-section">
          <label className="account-label">อีเมล</label>
          {editField === "email" ? (
            <>
              <input
                type="email"
                className="account-input"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                placeholder="example@email.com"
              />
              <input
                type="password"
                className="account-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="รหัสผ่านปัจจุบัน (เพื่อยืนยัน)"
              />
              <div className="account-buttons">
                <button
                  onClick={() => handleSaveField("email")}
                  className="save-btn"
                  disabled={loading}
                >
                  {loading ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => setEditField(null)}
                  className="cancel-btn"
                >
                  ยกเลิก
                </button>
              </div>
            </>
          ) : (
            <div className="account-value">
              <span>{profile.email}</span>
              <button
                onClick={() => handleStartEdit("email")}
                className="edit-btn"
              >
                แก้ไข
              </button>
            </div>
          )}
        </div>

        {/* Field: Password */}
        <div className="account-section">
          <label className="account-label">เปลี่ยนรหัสผ่าน</label>
          <input
            type="password"
            className="password-input"
            placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <div>
            <button
              onClick={handleChangePassword}
              disabled={loading}
              className="change-password-btn"
            >
              {loading ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;