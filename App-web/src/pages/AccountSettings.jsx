import React, { useState, useEffect } from "react";
import { getAuth, updatePassword } from "firebase/auth";
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
  };

  const handleSaveField = async (field) => {
  if (!userDocRef) return;
  setLoading(true);

  try {
    // เช็คเบอร์โทรซ้ำก่อนอัปเดต
    if (field === "phone") {
      const cleanePhone = tempValue.replace(/-/g, '');
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(cleanePhone)) {
        alert("กรุณากรอกเบอร์โทรศัพท์ 10 หลัก");
        setLoading(false);
        return;
      }
      // แปลงเป็น 090-000-0000
      const formatPhone = cleanePhone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');

      const phoneRef = query(
        collection(db, "users"),
        where("phone", "==", formatPhone)
      );
      const phoneSnapshot = await getDocs(phoneRef);

      // ถ้าเจอเบอร์ที่ใช้แล้ว (และไม่ใช่ของ user ตัวเอง)
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
    } else {
      // ถ้าไม่ซ้ำหรือเป็นเบอร์ตัวเอง → อัปเดตได้
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
                >
                  บันทึก
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
              />
              <div className="account-buttons">
                <button
                  onClick={() => handleSaveField("phone")}
                  className="save-btn"
                >
                  บันทึก
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
          <div className="account-value">{profile.email}</div>
        </div>

        {/* Field: Password */}
        <div className="account-section">
          <label className="account-label">เปลี่ยนรหัสผ่าน</label>
          <input
            type="password"
            className="password-input"
            placeholder="รหัสผ่านใหม่"
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
