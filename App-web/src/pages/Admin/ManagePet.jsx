import React, { useState, useEffect } from "react";
import { db, rtdb } from "../../firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { ref, get, onValue } from "firebase/database";
import Navbar from "../../components/Navbar";
import "./ManagePet.css";
import { Link } from "react-router-dom";

const ManagePet = () => {
  const [pets, setPets] = useState([]);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(false);

  // ตัวแปรสำหรับจัดการการแก้ไข
  const [editingPetId, setEditingPetId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editBreed, setEditBreed] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editZoneId, setEditZoneId] = useState("");

  // ตัวแปรสำหรับจัดการไฟล์ภาพ
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  // ตัวแปรสำหรับจัดการการแก้ไขภาพ
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState("");

  const [device_id, setDeviceId] = useState("");
  const [devices, setDevices] = useState([]);

  const [safeZones, setSafeZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState("");

  // เพิ่ม state สำหรับเก็บตำแหน่งจาก Realtime Database
  const [devicePositions, setDevicePositions] = useState({});

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // โหลดรายการสัตว์เลี้ยงทั้งหมด
  useEffect(() => {
    const fetchPets = async () => {
      const querySnapshot = await getDocs(collection(db, "pets"));
      const petsData = [];
      querySnapshot.forEach((doc) => {
        petsData.push({ id: doc.id, ...doc.data() });
      });
      setPets(petsData);
    };
    fetchPets();
  }, []);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        console.log("กำลังดึงข้อมูล devices...");
        // ลองดึงทั้งหมดก่อน (ไม่ filter) เพื่อดูว่ามีข้อมูลหรือไม่
        const allSnapshot = await getDocs(collection(db, "devices"));
        console.log(
          "devices ทั้งหมด:",
          allSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );

        // ดึงเฉพาะที่ Status = available (ใช้ Status ตัวใหญ่)
        const q = query(
          collection(db, "devices"),
          where("Status", "==", "available")
        );
        const snapshot = await getDocs(q);
        const devicesList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log("devices ที่ available:", devicesList);
        setDevices(devicesList);
      } catch (error) {
        console.error("Error fetching devices:", error);
      }
    };
    fetchDevices();
  }, []);

  useEffect(() => {
    const fetchSafeZones = async () => {
      const snapshot = await getDocs(collection(db, "safezones"));
      const zones = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setSafeZones(zones);
    };
    fetchSafeZones();
  }, []);

  // เพิ่ม useEffect สำหรับฟังตำแหน่งจาก Realtime Database
  useEffect(() => {
    const lora_dataRef = ref(rtdb, "lora_data");

    const unsubscribe = onValue(lora_dataRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setDevicePositions(data);
      }
    });

    return () => unsubscribe(); // cleanup listener
  }, []);

  // ฟังก์ชันสำหรับดึงตำแหน่งล่าสุดของ device
  const getDevicePosition = async (deviceId) => {
    try {
      const deviceRef = ref(rtdb, `lora_data/${deviceId}`);
      const snapshot = await get(deviceRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        return {
          lat: data.latitude || 7.210740754264216, // default ถ้าไม่มีข้อมูล
          lng: data.longitude || 100.49371420711375,
        };
      }

      // ถ้าไม่มีข้อมูล return ค่า default
      return {
        lat: 7.210740754264216,
        lng: 100.49371420711375,
      };
    } catch (error) {
      console.error("Error fetching device position:", error);
      return {
        lat: 7.210740754264216,
        lng: 100.49371420711375,
      };
    }
  };

  // ฟังก์ชันสำหรับจัดการการเปลี่ยนแปลงไฟล์ภาพ
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
    if (file && file.size > 2048 * 2048) {
      // 2MB
      alert("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 2MB");
      return;
    }
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview("");
    }
  };

  // เพิ่มสัตว์เลี้ยงใหม่ - แก้ไขเพื่อดึงตำแหน่งจริงจาก Realtime Database
  const handleAddPet = async (e) => {
    e.preventDefault();
    if (!selectedZone) {
      alert("กรุณาเลือก Safe Zone");
      return;
    }
    if (!name || !breed || !age || !device_id) {
      alert("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setLoading(true);
    let imageBase64 = "";
    if (imagePreview) imageBase64 = imagePreview;

    try {
      // ตรวจสอบว่ามี device นี้อยู่ใน Firestore หรือไม่
      const deviceRef = doc(db, "devices", device_id);
      const deviceSnap = await getDoc(deviceRef);
      if (!deviceSnap.exists()) {
        alert("ไม่พบรหัสอุปกรณ์นี้");
        setLoading(false);
        return;
      }

      // ตรวจสอบว่าอุปกรณ์นี้ถูกใช้งานแล้วหรือยัง
      if (deviceSnap.data().Status === "in-use") {
        alert("อุปกรณ์นี้ถูกใช้งานแล้ว");
        setLoading(false);
        return;
      }

      // ดึงตำแหน่งล่าสุดจาก Realtime Database แทนการใช้ค่าฮาร์ดโค้ด
      const position = await getDevicePosition(device_id);
      console.log(`ดึงตำแหน่งของ device ${device_id}:`, position);

      await addDoc(collection(db, "pets"), {
        name,
        breed,
        age,
        imageBase64,
        device_id,
        zoneId: selectedZone,
      });

      // อัปเดตสถานะ device เป็น in-use
      await updateDoc(deviceRef, {
        Status: "in-use",
      });

      // รีเซ็ตฟอร์ม
      setName("");
      setBreed("");
      setAge("");
      setImageFile(null);
      setImagePreview("");
      setDeviceId("");
      setSelectedZone("");

      // reload pets
      const querySnapshot = await getDocs(collection(db, "pets"));
      const petsData = [];
      querySnapshot.forEach((doc) => {
        petsData.push({ id: doc.id, ...doc.data() });
      });
      setPets(petsData);

      // โหลด devices ใหม่
      const q = query(
        collection(db, "devices"),
        where("Status", "==", "available")
      );
      const snapshot = await getDocs(q);
      const devicesList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setDevices(devicesList);

      alert("เพิ่มสัตว์เลี้ยงสำเร็จ!");
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPet = (pet) => {
    setEditingPetId(pet.id);
    setEditName(pet.name || "");
    setEditBreed(pet.breed || "");
    setEditAge(pet.age || "");
    setEditImagePreview(pet.imageBase64 || "");
    setEditImageFile(null);
    setEditZoneId(pet.zoneId || "");
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingPetId(null);
    setEditName("");
    setEditBreed("");
    setEditAge("");
    setEditZoneId("");
    setEditImagePreview("");
    setEditImageFile(null);
  };

  const handleDeletePet = async (id) => {
    if (!window.confirm("คุณต้องการลบสัตว์เลี้ยงนี้ใช่หรือไม่?")) return;
    setLoading(true);
    try {
      const petRef = doc(db, "pets", id);
      const petSnap = await getDoc(petRef);
      if (!petSnap.exists()) {
        alert("ไม่พบสัตว์เลี้ยงนี้");
        setLoading(false);
        return;
      }

      const petData = petSnap.data();
      const deviceIdToUpdate = petData.device_id;

      // ลบสัตว์เลี้ยง
      await deleteDoc(petRef);

      // // ถ้ามี device_id ให้รีเซ็ตสถานะ device เป็น available
      // if (deviceIdToUpdate) {
      //   const deviceRef = doc(db, 'devices', deviceIdToUpdate);
      //   await updateDoc(deviceRef, { Status: 'available' });
      // }

      setPets(pets.filter((p) => p.id !== id));

      // โหลด devices ใหม่
      const q = query(
        collection(db, "devices"),
        where("Status", "==", "available")
      );
      const snapshot = await getDocs(q);
      const devicesList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setDevices(devicesList);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ฟังก์ชันสำหรับจัดการการเปลี่ยนแปลงไฟล์ภาพในโหมดแก้ไข
  const handleEditImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("ไฟล์รูปภาพต้องไม่เกิน 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    setEditImageFile(file);
  };

  // ฟังก์ชันสำหรับอัปเดตสัตว์เลี้ยง
  const handleUpdatePet = async () => {
    if (!editName || !editBreed || !editAge) return;
    setLoading(true);
    try {
      const petRef = doc(db, "pets", editingPetId);
      const updatedData = {
        name: editName,
        breed: editBreed,
        age: editAge,
        zoneId: editZoneId,
      };
      if (editImagePreview) {
        updatedData.imageBase64 = editImagePreview;
      }
      await updateDoc(petRef, updatedData);
      setEditingPetId(null);
      const snapshot = await getDocs(collection(db, "pets"));
      const newPets = [];
      snapshot.forEach((doc) => {
        newPets.push({ id: doc.id, ...doc.data() });
      });
      setPets(newPets);
      handleCloseEditModal();
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการอัปเดต: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="managepet-container">
      <h1 className="managepet-title">จัดการสัตว์เลี้ยง</h1>
      <div className="managepet-card">
        <h2 className="managepet-label">รายการสัตว์เลี้ยงของคุณ</h2>
        <div className="managepet-list-cards">
          {pets.length === 0 ? (
            <div style={{ color: "#888", padding: "1rem 0" }}>
              ไม่มีข้อมูลสัตว์เลี้ยง
            </div>
          ) : (
            pets.map((pet) => (
              <div
                className="pet-card"
                key={pet.id}
                style={{ position: "relative" }}
              >
                {editingPetId === pet.id ? (
                  <>
                    {isEditModalOpen && (
                      <div className="modal-overlay">
                        <div className="modal-content">
                          <h3>แก้ไขสัตว์เลี้ยง</h3>

                          {editImagePreview && (
                            <img
                              src={editImagePreview}
                              alt="preview"
                              style={{
                                width: 80,
                                height: 80,
                                objectFit: "cover",
                                borderRadius: "50%",
                                marginBottom: "1rem",
                              }}
                            />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleEditImageChange}
                            className="managepet-input"
                          />
                          <input
                            className="managepet-input"
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="ชื่อสัตว์เลี้ยง"
                          />
                          <input
                            className="managepet-input"
                            type="text"
                            value={editBreed}
                            onChange={(e) => setEditBreed(e.target.value)}
                            placeholder="สายพันธุ์"
                          />
                          <input
                            className="managepet-input"
                            type="number"
                            value={editAge}
                            onChange={(e) => setEditAge(e.target.value)}
                            placeholder="อายุ"
                          />
                          <select
                            className="managepet-input"
                            value={editZoneId}
                            onChange={(e) => setEditZoneId(e.target.value)}
                          >
                            <option value="">-- เลือก Safe Zone --</option>
                            {safeZones.map((zone) => (
                              <option key={zone.id} value={zone.id}>
                                {zone.name}
                              </option>
                            ))}
                          </select>

                          <div className="modal-actions">
                            <button
                              onClick={handleUpdatePet}
                              className="managepet-btn"
                              disabled={loading}
                            >
                              บันทึก
                            </button>
                            <button
                              onClick={handleCloseEditModal}
                              className="managepet-btn"
                              style={{ backgroundColor: "#6c757d" }}
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {pet.imageBase64 && (
                      <img
                        src={pet.imageBase64}
                        alt={pet.name}
                        style={{
                          width: 60,
                          height: 60,
                          objectFit: "cover",
                          borderRadius: "50%",
                        }}
                      />
                    )}
                    <div>
                      <b>ชื่อ:</b> {pet.name}
                    </div>
                    <div>
                      <b>สายพันธุ์:</b> {pet.breed}
                    </div>
                    <div>
                      <b>อายุ:</b> {pet.age} ปี
                    </div>
                    <div>
                      <b>อุปกรณ์:</b> {pet.device_id || "ไม่มี"}
                    </div>
                    <div>
                      <b>Safe Zone:</b>{" "}
                      {pet.zoneId
                        ? safeZones.find((zone) => zone.id === pet.zoneId)
                            ?.name || "ไม่พบ"
                        : "ไม่มี"}
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <button
                        onClick={() => handleEditPet(pet)}
                        style={{
                          background: "#ffc107",
                          color: "black",
                          border: "none",
                          borderRadius: 4,
                          padding: "0.3rem 0.7rem",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                        }}
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleDeletePet(pet.id)}
                        disabled={loading}
                        style={{
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: 4,
                          padding: "0.3rem 0.7rem",
                          cursor: "pointer",
                          fontSize: "0.95rem",
                        }}
                      >
                        ลบ
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="managepet-card">
        {/* ฟอร์มเพิ่มสัตว์เลี้ยง */}
        <h2 className="managepet-label">เพิ่มสัตว์เลี้ยง</h2>
        <form onSubmit={handleAddPet}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 60,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>ชื่อ :</label>
            <input
              className="managepet-input"
              type="text"
              placeholder="ชื่อสัตว์เลี้ยง"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 60,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>สายพันธุ์ :</label>
            <input
              className="managepet-input"
              type="text"
              placeholder="สายพันธุ์"
              value={breed}
              onChange={(e) => setBreed(e.target.value)}
              required
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 60,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>อายุ :</label>
            <input
              className="managepet-input"
              type="number"
              placeholder="อายุ"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 23,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>เลือกรูปสัตว์เลี้ยง :</label>
            <input
              className="managepet-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 60,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>อุปกรณ์ :</label>
            <select
              className="managepet-input"
              value={device_id}
              onChange={(e) => setDeviceId(e.target.value)}
              required
            >
              <option value="">
                -- เลือกอุปกรณ์ ({devices.length} รายการ) --
              </option>
              {devices.length > 0 ? (
                devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.DeviceName || device.id}
                  </option>
                ))
              ) : (
                <option disabled>ไม่มีอุปกรณ์ที่ใช้งานได้</option>
              )}
            </select>
            {devices.length === 0 && (
              <small style={{ color: "red", marginLeft: "10px" }}>
                ไม่พบอุปกรณ์ที่มีสถานะ available
              </small>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 28,
              marginBottom: 12,
            }}
          >
            <label style={{ minWidth: 80 }}>เลือก Safe Zone :</label>

            <select
              className="managepet-input"
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value)}
              required
            >
              <option value="">-- เลือก Safe Zone --</option>
              {safeZones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="managepet-btn" disabled={loading}>
            {loading ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ManagePet;
