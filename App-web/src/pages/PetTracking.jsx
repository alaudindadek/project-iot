
import React, { useEffect, useState , useRef} from "react";
import { db, rtdb } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import {
  GoogleMap,
  useLoadScript,
  Polygon,
  Marker,
  Polyline,
} from "@react-google-maps/api";
import "./Dashboard.css";

import {
  getPetLocationHistory,
  subscribeMultiplePetLocationUpdates,
  unsubscribeAllPetLocationUpdates,
  cleanAllHistory,
} from "../PetLocationHistory";

import { useAuth } from "../contexts/AuthContext";

const mapContainerStyle = { width: "100%", height: "550px" };
const defaultCenter = { lat: 7.012004316421167, lng: 100.49736863544827 };

import { filterPetsByAllSafezones } from "../CheckSafeZone"; 
import { sendBatteryAlertEmail, logBatteryAlert } from "../alert";

// ฟังก์ชันแปลงข้อมูลจาก LoRaData format ทำความสะอาดและแปลงข้อมูลให้พร้อมใช้
const convertLoRaDataFormat = (data) => {
  if (!data) return null;

  console.log("Converting data:", data); 
  
  return {
    latitude: parseFloat(data.latitude),
    longitude: parseFloat(data.longitude),
    date: data.date ? data.date.replace("Date: ", "").trim() : null,
    time: data.time ? data.time.replace("Time: ", "").trim() : null,
    battery: data.battery ?? null,
    batteryLevel: data.batteryLevel ?? "-", 
    fixStatus: data.fixStatus ? data.fixStatus.replace(/"/g, "").trim() : null,
    satellites: data.satellites || 0,
    deviceName: data.deviceName ? data.deviceName.replace(/"/g, "").trim() : null,
  };
};

const PetTracking = () => {
  const [safezones, setSafezones] = useState([]);
  const [selectedZone, setSelectedZone] = useState("all");
  const [pets, setPets] = useState([]);
  const [filteredPets, setFilteredPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outsidePets, setOutsidePets] = useState([]);
  const [loraData, setLoraData] = useState({});
  const [petsFirestore, setPetsFirestore] = useState([]);

  // state สำหรับประวัติ
  const [selectedPetForHistory, setSelectedPetForHistory] = useState(null);
  const [petHistory, setPetHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDateRange, setHistoryDateRange] = useState("today"); // today, week, month, all

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [safeZoneFilter, setSafeZoneFilter] = useState("all");

  // const [batteryAlertsSent, setBatteryAlertsSent] = useState({}); // เก็บสถานะการแจ้งเตือนแบตเตอรี่
  

  const { user } = useAuth();

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyCHMaJZvvPadPj5BlZs_oR_iy_wtg9OiqI",
  });

  // ดึงข้อมูล safezones และ pets จาก Firestore เมื่อ component โหลดครั้งแรก
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // ดึง safezones
      const safezoneSnap = await getDocs(collection(db, "safezones"));
      const safezoneList = [];
      safezoneSnap.forEach((doc) => {
        const data = doc.data();

        // ถ้าเป็น caregiver ให้แสดงเฉพาะ safezone ที่ assignedCaregivers มี user.uid
        if (
          user &&
          user.role === "caregiver" &&
          data.caregiverId !== user.uid
        ) {
          return; // ข้าม safezone ที่ไม่ได้รับมอบหมาย
        }
        safezoneList.push({ id: doc.id, ...data });
      });
      setSafezones(safezoneList);

      // โหลด pets จาก Firestore
      const petsSnap = await getDocs(collection(db, "pets"));
      const petsList = [];
      petsSnap.forEach((doc) => petsList.push({ id: doc.id, ...doc.data() }));
      setPetsFirestore(petsList);

      setLoading(false);
    };
    fetchData();
  }, [user]);

  // ดึงข้อมูลตำแหน่งจาก Realtime Database (LoRaData/Devices)
  useEffect(() => {
    const locationRef = ref(rtdb, "LoRaData/Devices");
    const unsubscribe = onValue(locationRef, (snapshot) => {
      const data = snapshot.val() || {};
      console.log("Loaded LoRaData/Devices:", data);
      setLoraData(data);
    });

    return () => unsubscribe();
  }, []);

  // รวมข้อมูลจาก Firestore (pets) และ Realtime Database (LoRaData)
  useEffect(() => {
    console.log("=== Merging Data ===");
    console.log("petsFirestore:", petsFirestore);
    console.log("loraData:", loraData);

    if (petsFirestore.length === 0) {
      console.log("No pets from Firestore");
      setPets([]);
      return;
    }

    const mergedPets = petsFirestore
      .map((pet) => {

        console.log(`\nPet Name: ${pet.name}`);
        console.log(`Pet device_id: "${pet.device_id}"`); // ดู device_id ของ pet
        console.log(`Available devices:`, Object.keys(loraData)); // ดูว่ามี device อะไรบ้าง
        const deviceData = loraData[pet.device_id];

        console.log(`   Found deviceData:`, deviceData); // ดูข้อมูล deviceData ที่เจอ
        const convertedData = convertLoRaDataFormat(deviceData);
        
        if (convertedData && convertedData.latitude && convertedData.longitude) {
          return {
            ...pet,
            lat: convertedData.latitude,
            lng: convertedData.longitude,
            date: convertedData.date || "-",
            time: convertedData.time || "-",
            battery: convertedData.battery || "-",
            batteryLevel: convertedData.batteryLevel || "-",
            fixStatus: convertedData.fixStatus || "-",
            satellites: convertedData.satellites || 0,
          };
        } else {
          return null;
        }
      })
      .filter((pet) => pet !== null);

    console.log("Final merged pets data:", mergedPets);
    setPets(mergedPets);
  }, [petsFirestore, loraData]);

 const batteryCheckInProgress = useRef(false);
const batteryAlertsSentRef = useRef({}); // ✅ เก็บสถานะแจ้งเตือนไม่ให้ส่งซ้ำ

useEffect(() => {
  if (pets.length === 0 || safezones.length === 0) return;

  const checkBatteryLevels = async () => {
    if (batteryCheckInProgress.current) {
      console.log("กำลังตรวจสอบแบตเตอรี่อยู่แล้ว - ข้ามรอบนี้");
      return;
    }

    batteryCheckInProgress.current = true;

    for (const pet of pets) {
      if (!pet.device_id || pet.battery === undefined || pet.battery === "-") continue;

      const batteryLevel = parseInt(pet.battery);
      if (isNaN(batteryLevel)) {
        console.warn(`แบตเตอรี่ไม่ใช่ตัวเลข: ${pet.name} - ${pet.battery}`);
        continue;
      }

      // ตรวจสอบแบตเตอรี่ต่ำกว่า 20%
      if (batteryLevel < 20 && !batteryAlertsSentRef.current[pet.device_id]) {
        console.log(`แจ้งเตือนแบตต่ำ: ${pet.name} (${batteryLevel}%)`);

        try {
          const petZone = safezones.find(z => z.id === pet.zoneId);
          const caregiverId = petZone?.caregiverId || user?.uid;

          if (!caregiverId) {
            console.warn(`ไม่พบ caregiver สำหรับ ${pet.name}`);
            continue;
          }

          //บันทึกสถานะว่า "ส่งแล้ว"
          batteryAlertsSentRef.current[pet.device_id] = Date.now();

          await sendBatteryAlertEmail(pet.id, caregiverId, batteryLevel);
          await logBatteryAlert(pet.id, pet.name, caregiverId, batteryLevel, pet.device_id);

          console.log(`ส่งการแจ้งเตือนแบตเตอรี่สำเร็จ: ${pet.name}`);
        } catch (error) {
          console.error(`ส่งการแจ้งเตือนแบตเตอรี่ล้มเหลว (${pet.name}):`, error);
        }
      }
      
      // ถ้าแบตกลับมาสูงกว่า 20%
      if (batteryLevel >= 20 && batteryAlertsSentRef.current[pet.device_id]) {
        console.log(`แบตกลับมาปกติ: ${pet.name} (${batteryLevel}%)`);
        delete batteryAlertsSentRef.current[pet.device_id];
      }

      // รีเซ็ต flag ทุก 30 วินาที
      const lastAlert = batteryAlertsSentRef.current[pet.device_id];
      if (lastAlert && Date.now() - lastAlert > 30000) {
        console.log(`รีเซ็ตการแจ้งเตือนแบตของ ${pet.name}`);
        delete batteryAlertsSentRef.current[pet.device_id];
      }
    }

    batteryCheckInProgress.current = false;
  };

  // เรียกใช้ทันทีและตั้งเวลาเช็กทุก 30 วิ
  checkBatteryLevels();
  const interval = setInterval(checkBatteryLevels, 30000);

  return () => {
    clearInterval(interval);
    batteryCheckInProgress.current = false;
  };
}, [pets, safezones, user]);


  // เพิ่ม Auto-subscribe เพื่อบันทึกประวัติอัตโนมัติ
  useEffect(() => {
    if (pets.length > 0 && safezones.length > 0) {
      const deviceIds = pets.map((pet) => pet.device_id).filter((id) => id);

      console.log(`Starting auto-history for ${deviceIds.length} devices`);

      // Subscribe หลาย devices พร้อมกัน
      const unsubscribe = subscribeMultiplePetLocationUpdates(
        deviceIds,
        safezones
      );

      return () => {
        unsubscribe();
        console.log("Stopped auto-history subscription");
      };
    }
  }, [pets, safezones]);

  // เพิ่ม Cleanup เมื่อ component unmount
  useEffect(() => {
    return () => {
      unsubscribeAllPetLocationUpdates();
    };
  }, []);

  // กรอง pets ตาม safezone ที่เลือก
  const assignedZones =
    user && user.role === "caregiver"
      ? safezones.filter((z) => z.caregiverId === user.uid)
      : safezones;

  const zoneIds = assignedZones.map((z) => z.id);
  const petsInAssignedZones = pets.filter((pet) =>
    zoneIds.includes(pet.zoneId)
  );

  // กรอง pets เมื่อ selectedZone, pets, safezones, user เปลี่ยน
  useEffect(() => {
    if (!selectedZone || selectedZone === "all") {
      if (assignedZones.length === 0) {
        setFilteredPets([]);
        setOutsidePets([]);
        return;
      }
      // ใช้ petsInAssignedZones แทน pets
      const { inside, outside } = filterPetsByAllSafezones(
        petsInAssignedZones,
        assignedZones
      );
      setFilteredPets(inside);
      setOutsidePets(outside);
      return;
    }

    if (assignedZones.length === 0) {
      setFilteredPets([]);
      setOutsidePets([]);
      return;
    }

    const zone = assignedZones.find((z) => z.id === selectedZone);
    if (!zone || !zone.coordinates) {
      setFilteredPets([]);
      setOutsidePets([]);
      return;
    }

    // ใช้ petsInAssignedZones เฉพาะ zone ที่เลือก
    const petsInZone = petsInAssignedZones.filter(
      (pet) => pet.zoneId === zone.id
    );
    const { inside, outside } = filterPetsByAllSafezones(petsInZone, [zone]);
    setFilteredPets(inside);
    setOutsidePets(outside);
  }, [selectedZone, pets, safezones, user]);

  // ดึงประวัติสตำแหน่ง
  const fetchPetHistory = async (petId, deviceId) => {
    if (!petId || !deviceId) return;

    setHistoryLoading(true);
    try {
      // ใช้ฟังก์ชันจาก PetLocationHistory.js
      const historyList = await getPetLocationHistory(deviceId); // ดึง 50 records

      if (historyList.length === 0) {
        console.log("No history found");
        setPetHistory([]);
      } else {
        // กรองตามช่วงเวลา
        let filteredHistory = historyList;
        if (historyDateRange !== "all") {
          const now = new Date();
          let cutoffDate;

          switch (historyDateRange) {
            case "today":
              cutoffDate = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
              );
              break;
            case "week":
              cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              break;
            case "month":
              cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              break;
          }

          if (cutoffDate) {
            filteredHistory = historyList.filter(
              (record) => new Date(record.timestamp) >= cutoffDate
            );
          }
        }

        console.log(
          `Pet history data (${filteredHistory.length} records):`,
          filteredHistory
        );
        setPetHistory(filteredHistory);
      }
    } catch (error) {
      console.error("Error fetching pet history:", error);
      setPetHistory([]);
    }
    setHistoryLoading(false);
  };

  const handleCleanOldHistory = async () => {
  try {
    if (!selectedPetForHistory || !selectedPetForHistory.device_id) {
      alert("กรุณาเลือกสัตว์เลี้ยงก่อนลบประวัติ");
      return;
    }

    const deviceId = selectedPetForHistory.device_id;
    const cleaned = await cleanAllHistory(deviceId);

    // refresh ประวัติของสัตว์ที่กำลังดู
    await fetchPetHistory(selectedPetForHistory.id, deviceId);

    alert(`ลบประวัติของ ${selectedPetForHistory.name} แล้ว (${cleaned} records)`);
  } catch (error) {
    console.error("Error cleaning history:", error);
    alert("เกิดข้อผิดพลาดในการลบประวัติ");
  }
};


  // เมื่อเลือกสัตว์หรือเปลี่ยนช่วงเวลา ให้ดึงประวัติใหม่ (refresh)
  useEffect(() => {
    if (selectedPetForHistory) {
      fetchPetHistory(
        selectedPetForHistory.id,
        selectedPetForHistory.device_id
      );
    }
  }, [selectedPetForHistory, historyDateRange]);

  // ฟังก์ชันแสดงประวัติ
  const handleShowHistory = (pet) => {
    setSelectedPetForHistory(pet);
    setShowHistory(true);
    setStartDate(null);
    setEndDate(null);
    setSafeZoneFilter("all");
  };

  // ฟังก์ชันปิดประวัติ
  const handleCloseHistory = () => {
    setShowHistory(false);
    setSelectedPetForHistory(null);
    setPetHistory([]);
    setStartDate(null);
    setEndDate(null);
    setSafeZoneFilter("all");
  };

  const filteredHistory = petHistory.filter((record) => {
    const recordDate = new Date(record.timestamp);

    // กรองตามช่วงวันที่
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (recordDate < start) {
        return false;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (recordDate > end) {
        return false;
      }
    }

    //กรองตามสถานะ SafeZone
    if (safeZoneFilter === "inside" && !record.inSafeZone) {
      return false;
    }
    if (safeZoneFilter === "outside" && record.inSafeZone) {
      return false;
    }
    return true;
  });

  // สร้าง path สำหรับแสดงเส้นทางบนแผนที่
  const getHistoryPath = () => {
    return filteredHistory
      .map((point) => ({
        lat: Number(point.latitude),
        lng: Number(point.longitude),
      }))
      .filter((point) => point.lat && point.lng);
  };

  // หา Safe Zone ที่เลือก
  const selectedZoneObj = safezones.find((z) => z.id === selectedZone);

  return (
    <div className="dashboard-container">
      {/* Main Content */}
      <main>
        <header>
          <div>
            <h1 className="dashboard-title">ติดตามสัตว์เลี้ยง</h1>
          </div>
        </header>

        {/* ตารางสัตว์ที่ caregiver ได้รับมอบหมายดูแล */}
        {user && (user.role === "caregiver" || user.role === "owner") && (
          <div className="dashboard-card">
            <h2 className="dashboard-label">
              สัตว์ทั้งหมดที่อยู่ใน Safe Zone 
            </h2>
            {safezones.length === 0 ? (
              <p>ไม่พบ Safe Zone </p>
            ) : (
              (() => {
                // owner ดูสัตว์ทุกตัวในทุก safezone
                const assignedZones =
                  user.role === "owner"
                    ? safezones
                    : safezones.filter((z) => z.caregiverId === user.uid);

                // กรอง safezone ที่ได้รับมอบหมาย
                const assignedZoneId = assignedZones.map((z) => z.id);

                // กรองสัตว์ที่อยู่ใน safezone ที่ได้รับมอบหมาย
                const petsInAssignedZones = pets.filter((pet) =>
                  assignedZoneId.includes(pet.zoneId)
                );
                return petsInAssignedZones.length === 0 ? (
                  // <p>ไม่มีสัตว์เลี้ยงใน Safe Zone ที่ได้รับมอบหมาย</p>
                  <div className="text-no">ไม่มีสัตว์เลี้ยงใน Safe Zone </div>
                ) : (
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>ชื่อสัตว์</th>
                        <th>อายุ</th>
                        <th>สายพันธุ์</th>
                        <th>Device ID</th>
                        <th>ละติจูด</th>
                        <th>ลองจิจูด</th>
                        <th>แบตเตอรี่ (%)</th>
                        <th>ระดับแบตเตอรี่</th>
                        <th>สถานะ GPS</th>
                        <th>ประวัติ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {petsInAssignedZones.map((pet) => (
                        <tr key={pet.id}>
                          <td>{pet.name}</td>
                          <td>{pet.age || "-"}</td>
                          <td>{pet.breed || "-"}</td>
                          <td>{pet.device_id || "-"}</td>
                          <td>{pet.lat}</td>
                          <td>{pet.lng}</td>
                          <td>{pet.battery || "-"}</td>
                          <td>{pet.batteryLevel || "-"}</td>
                          <td>{pet.fixStatus || "-"}</td>
                          <td>
                            <button
                              onClick={() => handleShowHistory(pet)}
                              className="btn-seeHis"
                            >
                              ดูประวัติ
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()
            )}
          </div>
        )}

        {/* Safe Zone Dropdown */}
        <div className="dashboard-card mb-5">
          <h2 className="dashboard-label">เลือก Safe Zone</h2>
          <select
            className="dashboard-select"
            value={selectedZone || "all"}
            onChange={(e) => setSelectedZone(e.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            {assignedZones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>
        </div>

        {/* Map Section */}
        <div className="dashboard-card map">
          <h2 className="dashboard-label">
            แผนที่ติดตามสัตว์{" "}
            {selectedZoneObj && selectedZone !== "all"
              ? `— ${selectedZoneObj.name}`
              : ""}
            {showHistory &&
              selectedPetForHistory &&
              ` — ประวัติ ${selectedPetForHistory.name}`}
          </h2>
          <div style={{ padding: 0 }}>
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={defaultCenter}
                zoom={15}
              >
                {/* แสดง Safe Zones */}
                {!showHistory && (
                  <>
                    {selectedZone === "all"
                      ? assignedZones.map(
                          (zone) =>
                            zone.coordinates && (
                              <Polygon
                                key={zone.id}
                                paths={zone.coordinates}
                                options={{
                                  fillColor: "#FF0000",
                                  fillOpacity: 0.1,
                                  strokeColor: "#FF0000",
                                  strokeOpacity: 0.7,
                                  strokeWeight: 1,
                                  clickable: false,
                                  editable: false,
                                  zIndex: 1,
                                }}
                              />
                            )
                        )
                      : selectedZoneObj &&
                        selectedZoneObj.coordinates && (
                          <Polygon
                            paths={selectedZoneObj.coordinates}
                            options={{
                              fillColor: "#FF0000",
                              fillOpacity: 0.2,
                              strokeColor: "#FF0000",
                              strokeOpacity: 0.8,
                              strokeWeight: 2,
                              clickable: false,
                              editable: false,
                              zIndex: 1,
                            }}
                          />
                        )}

                    {/* แสดงสัตว์ปัจจุบัน */}
                    {selectedZone === "all" ? (
                      <>
                        {/* แสดงสัตว์ในพื้นที่ (inside) สีเขียว */}
                        {filteredPets.map((pet, idx) => (
                          <Marker
                            key={`${pet.id}_inside_${idx}`}
                            position={{
                              lat: Number(pet.lat),
                              lng: Number(pet.lng),
                            }}
                            label={{
                              text: pet.name,
                              color: "green",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                            icon={
                              pet.imageBase64
                                ? {
                                    url: pet.imageBase64,
                                    scaledSize: new window.google.maps.Size(
                                      40,
                                      40
                                    ),
                                  }
                                : undefined
                            }
                          />
                        ))}
                        {/* แสดงสัตว์นอกพื้นที่ (outside) สีแดง */}
                        {outsidePets.map((pet) => (
                          <Marker
                            key={`${pet.id}_outside`}
                            position={{
                              lat: Number(pet.lat),
                              lng: Number(pet.lng),
                            }}
                            label={{
                              text: pet.name,
                              color: "red",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                            icon={
                              pet.imageBase64
                                ? {
                                    url: pet.imageBase64,
                                    scaledSize: new window.google.maps.Size(
                                      40,
                                      40
                                    ),
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </>
                    ) : (
                      <>
                        {/* กรณีเลือก safezone เจาะจง แสดง inside สีเขียว */}
                        {filteredPets.map((pet, idx) => (
                          <Marker
                            key={`${pet.id}_${idx}`}
                            position={{
                              lat: Number(pet.lat),
                              lng: Number(pet.lng),
                            }}
                            label={{
                              text: pet.name,
                              color: "green",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                            icon={
                              pet.imageBase64
                                ? {
                                    url: pet.imageBase64,
                                    scaledSize: new window.google.maps.Size(
                                      40,
                                      40
                                    ),
                                  }
                                : undefined
                            }
                          />
                        ))}
                        {/* แสดง outside สีแดง */}
                        {outsidePets.map((pet) => (
                          <Marker
                            key={`${pet.id}_outside`}
                            position={{
                              lat: Number(pet.lat),
                              lng: Number(pet.lng),
                            }}
                            label={{
                              text: pet.name,
                              color: "red",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                            icon={
                              pet.imageBase64
                                ? {
                                    url: pet.imageBase64,
                                    scaledSize: new window.google.maps.Size(
                                      40,
                                      40
                                    ),
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </>
                    )}
                  </>
                )}

                {/* แสดงประวัติการเคลื่อนไหว */}
                {showHistory &&
                  selectedPetForHistory &&
                  filteredHistory.length > 0 && (
                    <>
                      {selectedZoneObj && selectedZoneObj.coordinates && (
                        <Polygon
                          paths={selectedZoneObj.coordinates}
                          options={{
                            fillColor: "#FF0000",
                            fillOpacity: 0.2,
                            strokeColor: "#FF0000",
                            strokeOpacity: 0.8,
                            strokeWeight: 2,
                            clickable: false,
                            editable: false,
                            zIndex: 1,
                          }}
                        />
                      )}
                      {/* เส้นทางการเคลื่อนไหว */}
                      <Polyline
                        path={getHistoryPath()}
                        options={{
                          strokeColor: "#0066FF",
                          strokeOpacity: 0.8,
                          strokeWeight: 3,
                        }}
                      />

                      {/* จุดเริ่มต้น (สีเขียว) */}
                      {filteredHistory.length > 0 && (
                        <Marker
                          position={{
                            lat: Number(
                              filteredHistory[filteredHistory.length - 1].latitude
                            ),
                            lng: Number(
                              filteredHistory[filteredHistory.length - 1].longitude
                            ),
                          }}
                          icon={{
                            url:
                              "data:image/svg+xml;charset=UTF-8," +
                              encodeURIComponent(
                                '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="green" stroke="white" stroke-width="2"/></svg>'
                              ),
                          }}
                          title="จุดเริ่มต้น"
                        />
                      )}

                      {/* จุดปัจจุบัน (สีแดง) */}
                      {filteredHistory.length > 0 && (
                        <Marker
                          position={{
                            lat: Number(filteredHistory[0].latitude),
                            lng: Number(filteredHistory[0].longitude),
                          }}
                          icon={{
                            url:
                              "data:image/svg+xml;charset=UTF-8," +
                              encodeURIComponent(
                                '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="red" stroke="white" stroke-width="2"/></svg>'
                              ),
                          }}
                          title="ตำแหน่งล่าสุด"
                        />
                      )}
                    </>
                  )}
              </GoogleMap>
            ) : (
              <span>กำลังโหลดแผนที่...</span>
            )}
          </div>
        </div>

        {/* ประวัติตำแหน่ง Modal */}
        {showHistory && (
          <div className="dashboard-card mb-5">
            <div>
              <h2 className="text-lg font-bold">
                ประวัติตำแหน่ง - {selectedPetForHistory?.name}
              </h2>
              <div className="gap">
                <div className="gap">
                  <select
                    value={historyDateRange}
                    onChange={(e) => setHistoryDateRange(e.target.value)}
                    className="dashboard-select"
                  >
                    <option value="today">วันนี้</option>
                    <option value="week">7 วันที่แล้ว</option>
                    <option value="month">30 วันที่แล้ว</option>
                    <option value="all">ทั้งหมด</option>
                  </select>

                {/*กรองวัน*/ }
                <div className="gap">
                  <label>จากวันที่ :</label>
                  <div>
                    <input
                    type="date"
                    value={startDate || ""}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="dashboard-select"
                    />
                  </div>

                  <label>ถึงวันที่ :</label>
                  <input
                    type="date"
                    value={endDate || ""}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="dashboard-select"
                  />
                </div>

                {/* กรองสถานะ SafeZone */}
                <div>
                  <label>กรองสถานะ Safe Zone: </label>
                  <select
                  value={safeZoneFilter}
                    onChange={(e) => setSafeZoneFilter(e.target.value)}
                    className="dashboard-select" 
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="inside">ในพื้นที่ปลอดภัย</option>
                    <option value="outside">นอกพื้นที่ปลอดภัย</option>
                </select>
                </div>

                  <button onClick={handleCloseHistory} className="btn-close">
                    ปิด
                  </button>
                </div>
                <div>
                  <button onClick={handleCleanOldHistory} className="btn-clear">
                    ทำความสะอาดประวัติ
                  </button>
                </div>
              </div>
            </div>

            {historyLoading ? (
              <div className="text-center py-4">กำลังโหลดประวัติ...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-no text-center py-4">
                ไม่พบประวัติตำแหน่ง
              </div>
            ) : (
              <div className="detail-his max-h-64 overflow-auto">
                <table className="dashboard-table w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 border">วันที่</th>
                      <th className="p-2 border">เวลา</th>
                      <th className="p-2 border">ละติจูด</th>
                      <th className="p-2 border">ลองจิจูด</th>
                      <th className="p-2 border">แบตเตอรี่ (%)</th>
                      <th className="p-2 border">ตำแหน่ง</th>
                      <th className="p-2 border">safezone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((record, index) => (
                      <tr key={record.id || index}>
                        <td className="p-2 border">
                          {record.datetime
                            ? record.datetime.split(" ")[0]
                            : new Date(record.timestamp).toLocaleDateString(
                                "th-TH"
                              )}
                        </td>
                        <td className="p-2 border">
                          {record.datetime
                            ? record.datetime.split(" ")[1]
                            : new Date(record.timestamp).toLocaleTimeString(
                                "th-TH"
                              )}
                        </td>
                        <td className="p-2 border">{record.latitude || "-"}</td>
                        <td className="p-2 border">{record.longitude || "-"}</td>
                        <td className="p-2 border">{record.battery || "-"}</td>
                        <td className="p-2 border">
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              record.inSafeZone
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {record.inSafeZone
                              ? "ในพื้นที่ปลอดภัย"
                              : "นอกพื้นที่ปลอดภัย"}
                          </span>
                        </td>
                        <td>{record.safezoneName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ตารางสัตว์เลี้ยงใน Safe Zone */}
        {!showHistory && (
          <div className="dashboard-card">
            <h2 className="dashboard-label">
              รายละเอียดตำแหน่งที่อยู่ในพื้นที่ Safe Zone
            </h2>
            {loading ? (
              <div>กำลังโหลดข้อมูล...</div>
            ) : filteredPets.length === 0 ? (
              <div className="text-no">ไม่พบสัตว์เลี้ยงใน Safe Zone</div>
            ) : (
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>ชื่อสัตว์</th>
                    <th>อายุ</th>
                    <th>สายพันธุ์</th>
                    <th>Device ID</th>
                    <th>ละติจูด</th>
                    <th>ลองจิจูด</th>
                    <th>วันที่</th>
                    <th>เวลา</th>
                    <th>สถานะ GPS</th>
                    <th>Safe Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPets.map((pet) => (
                    <tr key={pet.id}>
                      <td>{pet.name}</td>
                      <td>{pet.age || "-"}</td>
                      <td>{pet.breed || "-"}</td>
                      <td>{pet.device_id || "-"}</td>
                      <td>{pet.lat}</td>
                      <td>{pet.lng}</td>
                      <td>{pet.date || "-"}</td>
                      <td>{pet.time || "-"}</td>
                      <td>{pet.fixStatus || "-"}</td>
                      <td>{pet.safezoneName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default PetTracking;