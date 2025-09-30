import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import "./RoleManagement.css";
import { getAuth } from "firebase/auth";
const auth = getAuth();
const currentUserId = auth.currentUser?.uid;

const RoleManagement = () => {
  const [users, setUsers] = useState([]);
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedPet, setSelectedPet] = useState("");
  const [selectedRole, setSelectedRole] = useState("user");

  const [selectedZone, setSelectedZone] = useState("");
  const [selectedZoneCaregiver, setSelectedZoneCaregiver] = useState("");
  const [safeZones, setSafeZones] = useState([]);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // โหลดข้อมูลผู้ใช้และสัตว์เลี้ยง
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // โหลดข้อมูลผู้ใช้
        const usersSnap = await getDocs(collection(db, "users"));
        const usersList = [];
        usersSnap.forEach((doc) => {
          usersList.push({ id: doc.id, ...doc.data() });
        });
        setUsers(usersList);

        // โหลดข้อมูลสัตว์เลี้ยง
        const petsSnap = await getDocs(collection(db, "pets"));
        const petsList = [];
        petsSnap.forEach((doc) => {
          petsList.push({ id: doc.id, ...doc.data() });
        });
        setPets(petsList);

        const querySnapshot = await getDocs(collection(db, "safezones"));
        const zones = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setSafeZones(zones);
      } catch (error) {
        console.error("Error fetching data:", error);
        showMessage("เกิดข้อผิดพลาดในการโหลดข้อมูล", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 3000);
  };

  // อัปเดตบทบาทของผู้ใช้
  const updateUserRole = async () => {
    if (!selectedUser) {
      showMessage("กรุณาเลือกผู้ใช้", "error");
      return;
    }

    try {
      await updateDoc(doc(db, "users", selectedUser), {
        role: selectedRole,
      });
      showMessage("อัปเดตบทบาทสำเร็จ", "success");

      // อัปเดตข้อมูลใน state
      setUsers(
        users.map((user) =>
          user.id === selectedUser ? { ...user, role: selectedRole } : user
        )
      );
    } catch (error) {
      console.error("Error updating role:", error);
      showMessage("เกิดข้อผิดพลาดในการอัปเดตบทบาท", "error");
    }
  };

  const assignZoneCaregiver = async () => {
  if (!selectedZone || !selectedZoneCaregiver) {
    return showMessage("กรุณาเลือก Safe Zone และผู้ดูแล", "error");
  }

  try {
    const caregiver = users.find((u) => u.id === selectedZoneCaregiver);

    if (!caregiver) {
      return showMessage("ไม่พบผู้ดูแล", "error");
    }

    // 1. อัปเดต Safe Zone
    await updateDoc(doc(db, "safezones", selectedZone), {
      caregiverId: selectedZoneCaregiver,
      caregiverName: caregiver.username,
    });

    // 2. หา pets ในโซนนี้
    const petsInZone = pets.filter((pet) => pet.zoneId === selectedZone);

    // 3. อัปเดต caregiver ของแต่ละ pet ใน Firestore
    const updatePromises = petsInZone.map((pet) =>
      updateDoc(doc(db, "pets", pet.id), {
        caregiverId: selectedZoneCaregiver,
        caregiverName: caregiver.username,
      })
    );
    await Promise.all(updatePromises);

    // 4. อัปเดต state ของ Safe Zones และ Pets
    setSafeZones(
      safeZones.map((zone) =>
        zone.id === selectedZone
          ? { ...zone, caregiverId: selectedZoneCaregiver, caregiverName: caregiver.username }
          : zone
      )
    );

    setPets(
      pets.map((pet) =>
        pet.zoneId === selectedZone
          ? { ...pet, caregiverId: selectedZoneCaregiver, caregiverName: caregiver.username }
          : pet
      )
    );

    showMessage("มอบหมายผู้ดูแล Safe Zone สำเร็จ", "success");
  } catch (error) {
    console.error("Error assigning zone caregiver:", error);
    showMessage("เกิดข้อผิดพลาดในการมอบหมาย Safe Zone", "error");
  }
};


  return (
    <div className="role-management-container">
      <div className="role-management-content">
        <header className="role-management-header">
          <h1>จัดการบทบาทและมอบหมายผู้ดูแลสัตว์</h1>
        </header>

        {message && <div className={`message ${messageType}`}>{message}</div>}

        {loading ? (
          <div className="loading">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="role-management-sections">
            {/* ส่วนกำหนดบทบาท */}
            <div className="management-section">
              <h2>กำหนดบทบาทผู้ใช้</h2>
              <div className="form-group">
                <label>เลือกผู้ใช้:</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">-- เลือกผู้ใช้ --</option>
                  {users
                    // วนลูปเช็คค User ที่ไม่รวม user ที่กำลัง login อยู่ (auth.currentUser?.uid)
                    .filter((user) => user.id !== currentUserId)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} ({user.email}) - {user.role}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-group">
                <label>บทบาทใหม่:</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  <option value="owner">owner</option>
                  <option value="caregiver">Caregiver</option>
                </select>
              </div>

              <button
                className="update-button"
                onClick={updateUserRole}
                // ต้องเลือก User ก่อน (selectedUser != null)
                disabled={!selectedUser}
              >
                อัปเดตบทบาท
              </button>
            </div>

            <div className="management-section">
              <h2>มอบหมายผู้ดูแล Safe Zone</h2>
              <div className="form-group">
                <label>เลือก Safe Zone:</label>
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                >
                  <option value="">-- เลือก Safe Zone --</option>
                  {safeZones.length > 0 ? (
                    safeZones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} - ผู้ดูแลปัจจุบัน:{" "}
                        {zone.caregiverName || "ยังไม่มีการมอบหมาย"}
                      </option>
                    ))
                  ) : (
                    <option disabled>ไม่มีข้อมูล Safe Zone</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>เลือกผู้ดูแล:</label>
                <select
                  value={selectedZoneCaregiver}
                  onChange={(e) => setSelectedZoneCaregiver(e.target.value)}
                >
                  <option value="">-- เลือกผู้ดูแล --</option>
                  {users
                    .filter((u) => ["caregiver", "user"].includes(u.role))
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} ({user.email})
                      </option>
                    ))}
                </select>
              </div>

              <button
                className="assign-button"
                onClick={assignZoneCaregiver}
                disabled={!selectedZone || !selectedZoneCaregiver}
              >
                มอบหมาย Safe Zone
              </button>
            </div>
          </div>
        )}

        {/* ตารางแสดงข้อมูล */}
        <div className="data-tables">
          <div className="table-section">
            <h3>รายชื่อผู้ใช้ทั้งหมด</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ชื่อผู้ใช้</th>
                  <th>อีเมล</th>
                  <th>เบอร์โทร</th>
                  <th>บทบาท</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email}</td>
                    <td>{user.phone || "-"}</td>
                    <td>
                      <span className={`role-badge ${user.role}`}>
                        {user.role}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-section">
            <h3>รายชื่อ Safe Zone และชื่อสัตว์ในโซน</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ชื่อ Safe Zone</th>
                  <th>ชื่อสัตว์ในโซน</th>
                  <th>ผู้ดูแล Safe Zone</th>
                </tr>
              </thead>
              <tbody>
                {safeZones.map((zone) => {
                  // หา pets ที่อยู่ในโซนนี้
                  const petsInZone = pets.filter(
                    (pet) => pet.zoneId === zone.zoneId
                  );
                  return (
                    <tr key={zone.id}>
                      <td>{zone.name}</td>
                      <td>
                        {petsInZone.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: "20px" }}>
                            {petsInZone.map((pet) => (
                              <li key={pet.id}>{pet.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>ไม่มีสัตว์ในโซนนี้</span>
                        )}
                      </td>
                      <td>{zone.caregiverName || "ยังไม่มีการมอบหมาย"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoleManagement;
