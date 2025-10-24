
import { collection, getDocs } from "firebase/firestore";
import { ref, get } from "firebase/database";
import { db, rtdb } from "./firebase";
import { sendPetAlertEmail, logPetAlert } from "./alert";

// แปลง coordinates ให้เป็นรูปแบบมาตรฐาน
const normalizePolygon = (coords) => {
  if (!Array.isArray(coords)) return [];
  return coords.map(c =>
    Array.isArray(c)
      ? { lat: Number(c[0]), lng: Number(c[1]) }
      : { lat: Number(c.lat), lng: Number(c.lng) }
  );
};

// ตรวจสอบว่าจุดอยู่ใน polygon หรือไม่
const pointInPolygon = (point, polygon) => {
  const x = Number(point.lng), y = Number(point.lat);
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].lng), yi = Number(polygon[i].lat);
    const xj = Number(polygon[j].lng), yj = Number(polygon[j].lat);

    const onSegment = Math.abs((yi - y) * (xj - xi) - (xi - x) * (yj - yi)) < 1e-12 &&
      x >= Math.min(xi, xj) - 1e-12 && x <= Math.max(xi, xj) + 1e-12 &&
      y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12;
    if (onSegment) return true;

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// สถานะสัตว์ที่อยู่นอก safezone
const petStatusMap = {};
let intervalId = null;

// ดึงข้อมูลสัตว์เลี้ยงจาก Firestore พร้อมตำแหน่งจาก RTDB
export const fetchPets = async () => {
  try {
    // 1. ดึงข้อมูลจาก Firestore
    const querySnapshot = await getDocs(collection(db, "pets"));
    const firestorePets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log("Firestore pets:", firestorePets);

    // 2. ดึงข้อมูลตำแหน่งจาก RTDB และรวมเข้ากับ pets
    const petsWithLocation = await Promise.all(
      firestorePets.map(async (pet) => {
        if (!pet.device_id) {
          console.warn(`Pet ${pet.name} ไม่มี device_id`);
          return { ...pet, lat: null, lng: null };
        }

        try {
          const loraSnap = await get(ref(rtdb, `LoRaData/Devices/${pet.device_id}`));

          if (loraSnap.exists()) {
            const data = loraSnap.val();
            return {
              ...pet,
              lat: data?.latitude || null,
              lng: data?.longitude || null,
              lastUpdate: `${data?.date || ""} ${data?.time || ""}` || null
            };
          } else {
            console.warn(`ไม่พบข้อมูลตำแหน่งของ device ${pet.device_id}`);
            return { ...pet, lat: null, lng: null };
          }
        } catch (err) {
          console.error(`ดึงข้อมูล device ${pet.device_id} ล้มเหลว:`, err);
          return { ...pet, lat: null, lng: null };
        }
      })
    );

    console.log("โหลดข้อมูล pets พร้อมตำแหน่งสำเร็จ:", petsWithLocation);
    return petsWithLocation;

  } catch (error) {
    console.error("โหลดข้อมูล pets ล้มเหลว:", error);
    return [];
  }
};

// ✅ ฟังก์ชันหา caregiverId จาก pet's zoneId
const getCaregiverIdForPet = (pet, safezones) => {
  if (!pet.zoneId) {
    console.warn(`⚠️ Pet ${pet.name} ไม่มี zoneId`);
    return null;
  }

  const zone = safezones.find(z => z.id === pet.zoneId);
  if (!zone) {
    console.warn(`⚠️ ไม่พบ safezone สำหรับ pet ${pet.name} (zoneId: ${pet.zoneId})`);
    return null;
  }

  if (!zone.caregiverId) {
    console.warn(`⚠️ Safezone ${zone.name} ไม่มี caregiverId`);
    return null;
  }

  console.log(`✅ พบ caregiverId สำหรับ ${pet.name}: ${zone.caregiverId}`);
  return zone.caregiverId;
};

// กรองสัตว์เลี้ยงตามพื้นที่ safezone
export const filterPetsByAllSafezones = (pets, safezones) => {
  console.log("🔍 เรียก filterPetsByAllSafezones", new Date().toLocaleTimeString());

  const inside = [];
  const outside = [];
  const now = Date.now();

  pets.forEach(pet => {
    if (pet.lat == null || pet.lng == null) {
      console.warn(`⚠️ Pet ${pet.name} ไม่มีตำแหน่ง`);
      return;
    }

    const pt = { lat: Number(pet.lat), lng: Number(pet.lng) };

    // หา safezone ที่สัตว์อยู่
    let foundZone = null;
    for (const zone of safezones) {
      if (!Array.isArray(zone.coordinates) || zone.coordinates.length === 0) continue;
      if (pointInPolygon(pt, normalizePolygon(zone.coordinates))) {
        foundZone = zone;
        break;
      }
    }

    // ✅ ดึง caregiverId จาก safezone ที่สัตว์อยู่หรือจาก pet.zoneId
    const caregiverId = foundZone 
      ? foundZone.caregiverId 
      : getCaregiverIdForPet(pet, safezones);

    if (foundZone) {
      // สัตว์อยู่ใน safezone
      inside.push({
        ...pet,
        safezoneId: foundZone.id,
        safezoneName: foundZone.name
      });
      console.log(`✅ สัตว์ "${pet.name}" อยู่ใน safezone: ${foundZone.name}`);

      // อัพเดทสถานะ
      petStatusMap[pet.id] = {
        isOutside: false,
        lastExitTime: null,
        name: pet.name,
        caregiverId: caregiverId
      };
    } else {
      // สัตว์อยู่นอก safezone
      outside.push(pet);
      console.log(`⚠️ สัตว์ "${pet.name}" อยู่นอก safezone`);

      const prevStatus = petStatusMap[pet.id] || {
        isOutside: false,
        lastExitTime: null
      };

      // ✅ ส่งแจ้งเตือนครั้งแรกเมื่อสัตว์ออกนอก safezone
      if (!prevStatus.isOutside) {
        console.log(`🚨 สัตว์ "${pet.name}" ออกนอก safezone ครั้งแรก - ส่งการแจ้งเตือน`);
        console.log(`   - Pet ID: ${pet.id}`);
        console.log(`   - Caregiver ID: ${caregiverId}`);
        console.log(`   - Device ID: ${pet.device_id}`);

        if (caregiverId) {
          // ส่งเมล
          sendPetAlertEmail(pet.id, caregiverId);
          
          // บันทึกลง RTDB
          logPetAlert(pet.id, pet.name, caregiverId, "outside", pet.device_id);
        } else {
          console.error(`❌ ไม่สามารถส่งแจ้งเตือนได้ - ไม่พบ caregiverId สำหรับ ${pet.name}`);
        }
      }

      // อัพเดทสถานะ
      petStatusMap[pet.id] = {
        isOutside: true,
        lastExitTime: now,
        name: pet.name,
        caregiverId: caregiverId,
        deviceId: pet.device_id || null
      };
    }
  });

  // ✅ จัดการการแจ้งเตือนซ้ำทุก 2 นาที
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (outside.length > 0) {
    console.log(`⏰ ตั้งเวลาส่งการแจ้งเตือนซ้ำทุก 2 นาที (${outside.length} สัตว์นอก safezone)`);
    
    intervalId = setInterval(() => {
      console.log(`\n🔔 ส่งการแจ้งเตือนซ้ำ (${new Date().toLocaleTimeString()})`);
      
      Object.entries(petStatusMap).forEach(([petId, status]) => {
        if (status.isOutside && status.caregiverId) {
          console.log(`📧 ส่งเตือนซ้ำสำหรับ "${status.name}" → Caregiver: ${status.caregiverId}`);
          
          sendPetAlertEmail(petId, status.caregiverId);
          logPetAlert(petId, status.name, status.caregiverId, "outside", status.deviceId);
        } else if (status.isOutside && !status.caregiverId) {
          console.warn(`⚠️ ข้าม "${status.name}" - ไม่มี caregiverId`);
        }
      });
    }, 120000); // 2 นาที
  }

  console.log(`\n📊 สรุป: ${inside.length} ใน safezone, ${outside.length} นอก safezone\n`);
  return { inside, outside };
};

// หยุดการตรวจสอบ safezone
export const stopSafezoneMonitoring = () => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("⏹️ หยุดการตรวจสอบ safezone แล้ว");
  }
};

// รีเซ็ตสถานะสัตว์ทั้งหมด
export const resetPetStatus = () => {
  Object.keys(petStatusMap).forEach(key => delete petStatusMap[key]);
  console.log("🔄 รีเซ็ตสถานะสัตว์แล้ว");
};
