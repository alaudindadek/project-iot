import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc , updateDoc  } from 'firebase/firestore';
import { GoogleMap, useLoadScript, DrawingManager, Polygon } from '@react-google-maps/api';
import Navbar from '../../components/Navbar';
import { query, where } from 'firebase/firestore';
import './SafeZone.css';

import { getAuth } from 'firebase/auth';

const mapContainerStyle = { width: '100%', height: '550px' };
const center = { lat: 7.012004316421167 ,lng: 100.49736863544827 };
const libraries = ['drawing'];

const SafeZone = () => {
  const [zoneName, setZoneName] = useState('');
  const [zoneCoords, setZoneCoords] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const polygonRef = useRef(null);

  const auth = getAuth();

  // โหลด Safe Zone จาก Firestore
  useEffect(() => {
    const fetchZones = async () => {
      const querySnapshot = await getDocs(collection(db, 'safezones'));
      const zonesData = [];
      querySnapshot.forEach((docSnap) => {
    zonesData.push({ id: docSnap.id, zoneId: docSnap.id, ...docSnap.data() });
      });
      setZones(zonesData);
    };
    fetchZones();
  }, []);


// โหลด Safe Zone จาก Firestore เฉพาะของ caregiver ปัจจุบัน
// useEffect(() => {
//   const fetchZones = async () => {
//     const user = auth.currentUser;
//     if (!user) return;

//     // ดึง userData เพื่อเอา username หรือ userId มา filter
//     const usersRef = collection(db, 'users');
//     const qUser = query(usersRef, where('email', '==', user.email));
//     const userSnap = await getDocs(qUser);
//     if (userSnap.empty) {
//       console.error("ไม่พบข้อมูลผู้ใช้ใน Firestore");
//       return;
//     }
//     const userData = userSnap.docs[0].data();
//     const username = userData.username; // หรือจะใช้ userId ก็ได้

//     // ดึง safezones เฉพาะของ caregiver คนนี้
//     const zonesRef = collection(db, 'safezones');
//     const qZones = query(zonesRef, where('createdBy', '==', username));
//     const zonesSnapshot = await getDocs(qZones);

//     const zonesData = [];
//     zonesSnapshot.forEach((docSnap) => {
//       zonesData.push({ id: docSnap.id, zoneId: docSnap.id, ...docSnap.data() });
//     });
//     setZones(zonesData);
//   };

//   fetchZones();
// }, [auth.currentUser]);


  // โหลด Google Maps
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: 'AIzaSyCHMaJZvvPadPj5BlZs_oR_iy_wtg9OiqI', // <--  API Key 
    libraries: libraries
  });

  // เมื่อวาด polygon เสร็จ
  const onPolygonComplete = (polygon) => {
    const path = polygon.getPath().getArray().map((coord, index) => ({
      lat: coord.lat(),
      lng: coord.lng(),
      order_index: index  // ลำดับ index 
    }));
    setZoneCoords(path);
    polygonRef.current = polygon;
  };

  // ล้าง polygon
  const handleClear = () => {
    setZoneCoords([]);
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
  };

  // บันทึก Safe Zone
  const handleSave = async () => {
  if (!zoneName || zoneCoords.length === 0) {
    alert('กรุณากรอกชื่อพื้นที่และวาดขอบเขตให้ครบถ้วน');
    return;
  }
  setLoading(true);
  try {
    const user = auth.currentUser;
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', user.email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error("ไม่พบข้อมูลผู้ใช้ใน Firestore");
    }

    const userData = querySnapshot.docs[0].data();
    const username = userData.username || 'unknown';

    // บันทึก Safe Zone และรับ id กลับมา
    const docRef = await addDoc(collection(db, 'safezones'), {
      name: zoneName,
      coordinates: zoneCoords,
      createdBy: username,
      createdById: user.uid
    });

    // อัปเดต zoneId ลงใน document
    await updateDoc(doc(db, 'safezones', docRef.id), {
      zoneId: docRef.id
    });

    setZoneName('');
    setZoneCoords([]);
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    const zonesSnapshot = await getDocs(collection(db, 'safezones'));
    const zonesData = [];
    zonesSnapshot.forEach((docSnap) => {
      zonesData.push({ id: docSnap.id, ...docSnap.data() });
    });
    setZones(zonesData);

  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
  } finally {
    setLoading(false);
  }
  };



  // ฟังก์ชันลบ Safe Zone
  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('คุณต้องการลบพื้นที่นี้ใช่หรือไม่?')) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'safezones', zoneId));
      // reload zones
      const querySnapshot = await getDocs(collection(db, 'safezones'));
      const zonesData = [];
      querySnapshot.forEach((doc) => {
        zonesData.push({ id: doc.id, ...doc.data() });
      });
      setZones(zonesData);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="a">
      <h1 className="safezone-title">ตั้งค่าพื้นที่ปลอดภัย (Safe Zone)</h1>
      <div className="safezone-container">
        <div className="safezone-card">
          <h2 className="safezone-label">กำหนดพื้นที่ปลอดภัย</h2>
          <div className="safezone-map">
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={center}
                zoom={14}
              >
                {/* แสดง Safe Zone ที่บันทึกไว้ */}
                {zones.map((zone, idx) => (
                  <Polygon
                    key={zone.id || idx}
                    paths={zone.coordinates || zone.points} // แล้วแต่ชื่อ field ที่เก็บ
                    options={{
                      fillColor: "#FF0000",
                      fillOpacity: 0.2,
                      strokeColor: "#FF0000",
                      strokeOpacity: 0.8,
                      strokeWeight: 2,
                      clickable: false,
                      editable: false,
                      zIndex: 1
                    }}
                  />
                ))}
                {/* DrawingManager สำหรับวาดใหม่ */}
                <DrawingManager
                  onPolygonComplete={onPolygonComplete}
                  options={{
                    drawingControl: true,
                    drawingControlOptions: {
                      position: window.google?.maps.ControlPosition.TOP_CENTER,
                      drawingModes: ['polygon']
                    },
                    polygonOptions: {
                      fillColor: "#00FF00",
                      fillOpacity: 0.3,
                      strokeWeight: 2,
                      editable: true
                    }
                  }}
                />
              </GoogleMap>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded-lg">
                <span>กำลังโหลดแผนที่...</span>
              </div>
            )}
          </div>
          <button
            className="safezone-btn-red"
            onClick={handleClear}
          >
            ล้างพื้นที่
          </button>
        </div>

        <div className="safezone-card" >
          <h2 className="safezone-ladel">รายละเอียดพื้นที่ปลอดภัย</h2>
          <label className="safezone-text">ชื่อพื้นที่ : </label>
          <input
            type="text"
            placeholder="กรอกชื่อพื้นที่ปลอดภัย"
            className="safezone-input"
            value={zoneName}
            onChange={e => setZoneName(e.target.value)}
          />
        </div>
        <div>
          <label className="safezone-taxt"> พิกัดพื้นที่ปลอดภัย : </label>
          <div>
          <textarea
            className="safezone-input"
            value={JSON.stringify(zoneCoords, null, 2)}
            readOnly
          />
          </div>
          <button
            className="safezone-btn-green"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'กำลังบันทึก...' : 'บันทึกพื้นที่'}
          </button>
        </div>
        <div className="safezone-card">
          <h2 className="safezone-lebel"> พื้นที่ทั้งหมดที่สร้างไว้ </h2>
          <ul className="safezone-list">
            {zones.map((zone) => (
              <li key={zone.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>{zone.name} {zone.createdBy ? ` สร้าง โดย ${zone.createdBy}` : ''} : {JSON.stringify(zone.coordinates)}</span>
                <button
                  className="safezone-btn-red"
                  style={{ padding: '2px 10px', fontSize: '0.95rem' }}
                  onClick={() => handleDeleteZone(zone.id)}
                  disabled={loading}
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SafeZone;