import React, { useEffect, useState , useMemo} from "react";
import { db, rtdb } from "../firebase";
import { collection, getDocs , query, where} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import {
  GoogleMap,
  useLoadScript,
  Polygon,
  Marker,
  Polyline,
} from "@react-google-maps/api";
import "./Dashboard.css";

// นำเข้าฟังก์ชันจาก PetLocationHistory.js
import {
  getPetLocationHistory,
  subscribeMultiplePetLocationUpdates,
  unsubscribeAllPetLocationUpdates,
  cleanAllHistory,
} from "../PetLocationHistory";
import { useAuth } from "../contexts/AuthContext";

const mapContainerStyle = { width: "100%", height: "550px" };
const defaultCenter = { lat: 7.012004316421167, lng: 100.49736863544827 };

import { filterPetsByAllSafezones } from "../ChackLocation"; // นำเข้าฟังก์ชันที่ใช้ตรวจสอบตำแหน่งสัตว์

const Dashboard = () => {
  const { user } = useAuth();
  const [safezones, setSafezones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [pets, setPets] = useState([]);
  const [filteredPets, setFilteredPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [outsidePets, setOutsidePets] = useState([]);
  const [loraData, setLoraData] = useState({});
  const [petsFirestore, setPetsFirestore] = useState([]);

  // เพิ่ม state สำหรับประวัติ
  const [selectedPetForHistory, setSelectedPetForHistory] = useState(null);
  const [petHistory, setPetHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyDateRange, setHistoryDateRange] = useState("today"); // today, week, month, all
  

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: "AIzaSyCHMaJZvvPadPj5BlZs_oR_iy_wtg9OiqI",
  });

  // // โหลด safezones และ pets จาก Firestore
  // useEffect(() => {
  //   const fetchData = async () => {
  //     setLoading(true);

  //     // ดึง safezones
  //     const safezoneSnap = await getDocs(collection(db, "safezones"));
  //     const safezoneList = [];
  //     safezoneSnap.forEach((doc) =>
  //       safezoneList.push({ id: doc.id, ...doc.data() })
  //     );
  //     setSafezones(safezoneList);
  //     // เลือก safezone แรกเป็น default
  //     if (safezoneList.length > 0) setSelectedZone(safezoneList[0].id);

  //     // ดึง pets จาก Firestore
  //     const petsSnap = await getDocs(collection(db, "pets"));
  //     const petsList = [];
  //     petsSnap.forEach((doc) => petsList.push({ id: doc.id, ...doc.data() }));
  //     console.log("Loaded pets from Firestore:", petsList);
  //     setPetsFirestore(petsList);

  //     setLoading(false);
  //   };
  //   fetchData();
  // }, []);

  // ---- โหลด Safezones ตาม role ----
  useEffect(() => {
    const fetchSafezones = async () => {
      try {
        let q;
        if (user.role === "owner") {
          // owner เห็นทั้งหมด
          q = collection(db, "safezones");
        } else if (user.role === "caregiver") {
          // caregiver เห็นเฉพาะ safezone ที่ตัวเองถูก assign
          q = query(
            collection(db, "safezones"),
            where("caregiverId", "==", user.uid)
          );
        }

        const snapshot = await getDocs(q);
        const safezoneData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setSafezones(safezoneData);
      } catch (err) {
        console.error("Error fetching safezones:", err);
      }
    };

    if (user) {
      fetchSafezones();
    }
  }, [user]);

  // โหลด pets จาก Firestore
useEffect(() => {
  const fetchPets = async () => {
    try {
      setLoading(true);
      const petsSnap = await getDocs(collection(db, "pets"));
      const petsList = [];
      petsSnap.forEach((doc) =>
        petsList.push({ id: doc.id, ...doc.data() })
      );
      console.log("Loaded pets from Firestore:", petsList);
      setPetsFirestore(petsList);
    } catch (err) {
      console.error("Error fetching pets:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchPets();
}, []);

  // ดึงข้อมูลตำแหน่งจาก Realtime Database
  useEffect(() => {
    const locationRef = ref(rtdb, "lora_data");
    const unsubscribe = onValue(locationRef, (snapshot) => {
      const data = snapshot.val() || {};
      console.log("Loaded lora_data:", data);
      setLoraData(data);
    });

    return () => unsubscribe();
  }, []);

  // รวมข้อมูลจาก Firestore (pets) และ Realtime Database (lora_data)
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
        console.log(`Processing pet: ${pet.name}, device_id: ${pet.device_id}`);

        // หา device_id ที่ตรงกับสัตว์นี้
        const deviceData = loraData[pet.device_id];
        console.log(`Device data for ${pet.device_id}:`, deviceData);

        if (deviceData && deviceData.latitude && deviceData.longitude) {
          // ใช้ตำแหน่งจาก lora_data เท่านั้น
          const mergedPet = {
            // คัดลอก properties ทั้งหมดของ object
            ...pet,
            lat: deviceData.latitude,
            lng: deviceData.longitude,
            date: deviceData.date || null,
            time: deviceData.time || null,
            battery: deviceData.battery || null,
          };
          console.log("Merged pet:", mergedPet);
          return mergedPet;
        } else {
          console.log(
            `No location data for pet: ${pet.name} (device_id: ${pet.device_id})`
          );
          // ไม่มีข้อมูลใน lora_data จะไม่แสดงสัตว์นี้
          return null;
        }
      })
      .filter((pet) => pet !== null); // กรองเอาเฉพาะที่มีข้อมูลตำแหน่งจาก lora_data

    console.log("Final merged pets data:", mergedPets);
    setPets(mergedPets);
  }, [petsFirestore, loraData]);

  // *** เพิ่ม: Auto-subscribe เพื่อบันทึกประวัติอัตโนมัติ ***
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

  // *** เพิ่ม: Cleanup เมื่อ component unmount ***
  useEffect(() => {
    return () => {
      unsubscribeAllPetLocationUpdates();
    };
  }, []);

  // // เมื่อเลือก Safe Zone หรือ pets เปลี่ยน ให้ filter
  useEffect(() => {
    if (!selectedZone || selectedZone === "all") {
      if (safezones.length === 0) {
        setFilteredPets([]);
        setOutsidePets([]);
        return;
      }
      
      const { inside, outside } = filterPetsByAllSafezones(pets, safezones);
      setFilteredPets(inside);
      setOutsidePets(outside);
      return;
    }

    if (safezones.length === 0) {
      setFilteredPets([]);
      setOutsidePets([]);
      return;
    }

    const zone = safezones.find((z) => z.id === selectedZone);
    if (!zone || !zone.coordinates) {
      setFilteredPets([]);
      setOutsidePets([]);
      return;
    }

    // กรองสัตว์ใน safezone ที่เลือก
    const { inside, outside } = filterPetsByAllSafezones(pets, [zone]); // ส่งเป็น array เดียวเพื่อกรองแค่ zone นี้
    setFilteredPets(inside);
    setOutsidePets(outside);
  }, [selectedZone, pets, safezones]);

  // // Filter pets inside/outside safezones
  // useEffect(() => {
  //   if (pets.length === 0 || safezones.length === 0) {
  //     setFilteredPets([]);
  //     setOutsidePets([]);
  //     return;
  //   }

  //   // สำหรับ caregiver: ตรวจสอบ pets กับ safezone ของ caregiver ทั้งหมด
  //   const ChackSafezone =
  //     user.role === "caregiver"
  //       ? safezones.filter((z) => z.caregiverId === user.id)
  //       : safezones;

  //   let inside = [];
  //   let outside = [];

  //   if (!selectedZone || selectedZone === "all") {
  //     //
  //     const result = filterPetsByAllSafezones(pets, ChackSafezone);
  //     inside = result.inside;
  //     outside = result.outside;
  //   } else {
  //     // ถ้าเลือก safezone เฉพาะ (selectedZone) ให้กรองสำหรับ dropdown display
  //   const zoneObj = safezones.find((z) => z.id === selectedZone);

  //   if (!zoneObj) {
  //     // ไม่มี safezone แสดงว่า caregiver ไม่มีพื้นที่ assigned
  //     setFilteredPets([]);
  //     setOutsidePets([]);
  //     return;
  //   }

  //   // ใช้ safezonesForCheck สำหรับเช็ก inside/outside จริง
  //   const result = filterPetsByAllSafezones(pets, [zoneObj]);
  //   inside = result.inside;
  //   outside = result.outside;
  //   }

  //   setFilteredPets(inside);
  //   setOutsidePets(outside);
  // }, [pets, safezones, selectedZone, user]);

  // *** ใช้ getPetLocationHistory แทน ***
  const fetchPetHistory = async (petId, deviceId) => {
    if (!petId || !deviceId) return;

    setHistoryLoading(true);
    try {
      // ใช้ฟังก์ชันจาก PetLocationHistory.js
      const historyList = await getPetLocationHistory(deviceId, 50); // ดึง 50 records

      if (historyList.length === 0) {
        console.log("No history found, creating sample data");
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

  // *** ฟังก์ชันทำความสะอาดประวัติ ***
  const handleCleanOldHistory = async () => {
    try {
      let totalCleaned = 0;
      const deviceIds = pets.map((pet) => pet.device_id).filter((id) => id);

      for (const deviceId of deviceIds) {
        const cleaned = await cleanAllHistory(deviceId);
        totalCleaned += cleaned;
      }

      // *** เพิ่มการ refresh ประวัติหลังจากลบ ***
      if (selectedPetForHistory) {
        // Refresh ประวัติของสัตว์ที่กำลังแสดงอยู่
        await fetchPetHistory(
          selectedPetForHistory.id,
          selectedPetForHistory.device_id
        );
      }

      alert(`ลบประวัติแล้ว `);
    } catch (error) {
      console.error("Error cleaning history:", error);
      alert("เกิดข้อผิดพลาดในการลบประวัติ");
    }
  };

  // เมื่อเลือกสัตว์หรือเปลี่ยนช่วงเวลา ให้ดึงประวัติใหม่
  useEffect(() => {
    if (selectedPetForHistory) {
      fetchPetHistory(
        selectedPetForHistory.id,
        selectedPetForHistory.device_id
      );
      // fetchDeviceStats(selectedPetForHistory.device_id); // ดึงสถิติด้วย
    }
  }, [selectedPetForHistory, historyDateRange]);

  // ฟังก์ชันแสดงประวัติ
  const handleShowHistory = (pet) => {
    setSelectedPetForHistory(pet);
    setShowHistory(true);
  };

  // ฟังก์ชันปิดประวัติ
  const handleCloseHistory = () => {
    setShowHistory(false);
    setSelectedPetForHistory(null);
    setPetHistory([]);
  };

  // สร้าง path สำหรับแสดงเส้นทางบนแผนที่
  const getHistoryPath = () => {
    return petHistory
      .map((point) => ({
        lat: Number(point.latitude),
        lng: Number(point.longitude),
      }))
      .filter((point) => point.lat && point.lng);
  };

  // หา Safe Zone ที่เลือก
  const selectedZoneObj = safezones.find((z) => z.id === selectedZone);

  // const ShowPets = useMemo(() => {
  //   if (!user) return [];
  //   if (user.role === "caregiver") {
  //      console.log("user", user);
  // console.log("all safezones", safezones);
  //     // caregiver เห็นเฉพาะสัตว์ที่อยู่ใน safezone ของตัวเอง
  //     const caregiverSafezones = safezones.filter((z) => z.caregiverId === user.id);
  //     console.log("caregiverSafezones", caregiverSafezones);
  // console.log("pets", pets);
  //     const { inside } = filterPetsByAllSafezones(pets, caregiverSafezones);
  //     console.log("inside", inside);
  //     return inside;
  //   } else {
  //     // owner เห็นทั้งหมด
  //     return pets;
  //   }
  // }, [pets, safezones, user]);

  return (
    <div className="dashboard-container">
      {/* Main Content */}
      <main>
        <header>
          <div>
            <h1 className="dashboard-title">ติดตามสัตว์เลี้ยง</h1>
          </div>
        </header>

        {/* แสดงสัตว์เลี้ยงทั้งหมด */}
        <div className="dashboard-card">
          <h2 className="dashboard-label">
            รายชื่อสัตว์เลี้ยงทั้งหมด
          </h2>
          {pets.length === 0 ? (
            <p>ไม่พบข้อมูลสัตว์เลี้ยง</p>
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
                  <th>ประวัติ</th>
                </tr>
              </thead>
              <tbody>
                {pets.map((pet) => (
                  <tr key={pet.id}>
                    <td>{pet.name}</td>
                    <td>{pet.age || "-"}</td>
                    <td>{pet.breed || "-"}</td>
                    <td>{pet.device_id || "-"}</td>
                    <td>{pet.lat}</td>
                    <td>{pet.lng}</td>
                    <td>{pet.battery || "-"}</td>
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
          )}
        </div>

        {/* Safe Zone Dropdown */}
        <div className="dashboard-card mb-5">
         <h2 className="dashboard-label">เลือก Safe Zone</h2>

  {safezones.length === 0 ? (
    <p>ไม่พบข้อมูล Safe Zone</p>
  ) : (
    <select
      className="dashboard-select"
      value={selectedZone || "all"}
      onChange={(e) => setSelectedZone(e.target.value)}
    >
      <option value="all">ทั้งหมด</option>
      {safezones.map((zone) => (
        <option key={zone.id} value={zone.id}>
          {zone.name}
        </option>
      ))}
    </select>
  )}
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
          <div
            style={{ padding: 0 }}
          >
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
                      ? safezones.map(
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
                {showHistory && petHistory.length > 0 && (
                  <>
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
                    {petHistory.length > 0 && (
                      <Marker
                        position={{
                          lat: Number(
                            petHistory[petHistory.length - 1].latitude
                          ),
                          lng: Number(
                            petHistory[petHistory.length - 1].longitude
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
                    {petHistory.length > 0 && (
                      <Marker
                        position={{
                          lat: Number(petHistory[0].latitude),
                          lng: Number(petHistory[0].longitude),
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

                  <button
                    onClick={handleCloseHistory}
                    className="btn-close"
                  >
                    ปิด
                  </button>
                </div>
                <div>
                  <button
                    onClick={handleCleanOldHistory}
                    className="btn-clear"
                  >
                    ทำความสะอาดประวัติ
                  </button>
                </div>
              </div>
            </div>
            
            {historyLoading ? (
              <div className="text-center py-4">กำลังโหลดประวัติ...</div>
            ) : petHistory.length === 0 ? (
              <div className="text-no text-center py-4">
                ไม่พบประวัติตำแหน่งในช่วงเวลาที่เลือก
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
                    </tr>
                  </thead>
                  <tbody>
                    {petHistory.map((record, index) => (
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
                        <td className="p-2 border">
                          {record.longitude || "-"}
                        </td>
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
              <div className="text-no">
                ไม่พบสัตว์เลี้ยงใน Safe Zone
              </div>
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
                    <th>Battery (%)</th>
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
                      <td>{pet.battery || "-"}</td>
                      <td>{pet.safezoneName || "-"}
                      </td>
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

export default Dashboard;
