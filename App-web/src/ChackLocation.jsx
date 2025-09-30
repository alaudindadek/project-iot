
// import { doc, getDoc } from "firebase/firestore";
// import { ref, onValue } from "firebase/database";
// import emailjs from '@emailjs/browser';
// import { db, rtdb  } from "../firebase";

// emailjs.init("esD328TvJ7zr7eoZj");

// const sendPetAlertEmail = async (petId, ownerId) => {
//   try {
//     // ดึงข้อมูลสัตว์จาก pets
//     const petSnap = await getDoc(doc(db, "pets", petId));
//     if (!petSnap.exists()) {
//       console.error("❌ ไม่พบข้อมูลสัตว์ ID:", petId);
//       return;
//     }
//     const petData = petSnap.data();

//     // ดึงข้อมูลเจ้าของจาก users
//     const ownerSnap = await getDoc(doc(db, "users", ownerId));
//     if (!ownerSnap.exists()) {
//       console.error("❌ ไม่พบข้อมูลเจ้าของ ID:", ownerId);
//       return;
//     }
//     const ownerData = ownerSnap.data();

//     // ตรวจสอบว่ามี email ก่อนส่ง
//     if (!ownerData.email || typeof ownerData.email !== 'string') {
//       console.error("❌ Owner email is missing or invalid. ไม่สามารถส่งอีเมลได้");
//       return;
//     }

//     // ดึงข้อมูล location ล่าสุดจาก lora_data
//     let location = "ไม่มีข้อมูลตำแหน่ง";
//     try {
//       const loraDataSnap = ref(rtdb, "lora_data");
//       const deviceData = loraDataSnap.docs
//         .map(doc => ({ id: doc.id, ...doc.data() }))
//         .find(data => data.id === petData.device_id);
      
//       if (deviceData && deviceData.latitude != null && deviceData.longitude != null) {
//         location = `${deviceData.latitude}, ${deviceData.longitude}`;
//       }
//     } catch (error) {
//       console.warn("⚠️ ไม่สามารถดึงข้อมูลตำแหน่งจาก lora_data:", error);
//     }

//     // เตรียมพารามิเตอร์สำหรับ EmailJS
//     const templateParams = {
//       to_name: ownerData.username || "ผู้ใช้",
//       pet_name: petData.name || "สัตว์เลี้ยง",
//       location: (petData.lat != null && petData.lng != null) ? `${petData.lat}, ${petData.lng}` : "ไม่มีข้อมูลตำแหน่ง",
//       time: new Date().toLocaleString(),
//       email: ownerData.email
//     };

//     console.log("templateParams:", templateParams);

//     // ส่งอีเมลผ่าน EmailJS
//     await emailjs.send(
//       "service_jxwswpv",
//       "template_9c7e5lj",
//       templateParams
//     );

//     console.log("✅ ส่งอีเมลแจ้งเตือนเรียบร้อยแล้ว");

//   } catch (error) {
//     console.error("เกิดข้อผิดพลาดในการส่งอีเมล:", error);
//   }
// };

// // เก็บสถานะสัตว์ที่ออกนอก safezone
// const petStatusMap = {};
// // โครงสร้าง: { [petId]: { isOutside: true/false, lastExitTime: timestamp } }


// /**
//  * Normalize polygon coordinates
//  * รองรับรูปแบบ [{lat,lng}, ...] หรือ [[lat,lng], ...]
//  */
// const normalizePolygon = (coords) => {
//   if (!Array.isArray(coords)) {
//     console.warn("⚠️ polygon ไม่ใช่ array หรือไม่มีข้อมูล:", coords);
//     return [];
//   }

//   return coords.map(c => {
//     if (Array.isArray(c)) {
//       return { lat: Number(c[0]), lng: Number(c[1]) };
//     } else {
//       return { lat: Number(c.lat), lng: Number(c.lng) };
//     }
//   });
// };

// /**
//  * Ray-casting algorithm (point-in-polygon)
//  * point: { lat, lng }
//  * polygon: array of { lat, lng }
//  * คืนค่า true ถ้า point อยู่ใน polygon หรือบนเส้นขอบ
//  */
// export const pointInPolygon = (point, polygon) => {
//   const x = Number(point.lng);
//   const y = Number(point.lat);

//   let inside = false;
//   for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
//     const xi = Number(polygon[i].lng), yi = Number(polygon[i].lat);
//     const xj = Number(polygon[j].lng), yj = Number(polygon[j].lat);

//     // เช็คกรณีอยู่บนเส้นขอบ
//     const onSegment =
//       (Math.abs(((yi - y) * (xj - xi)) - ((xi - x) * (yj - yi))) < 1e-12) &&
//       (Math.min(xi, xj) - 1e-12 <= x && x <= Math.max(xi, xj) + 1e-12) &&
//       (Math.min(yi, yj) - 1e-12 <= y && y <= Math.max(yi, yj) + 1e-12);
//     if (onSegment) return true;

//     // เช็คการตัดของเส้นแนวนอน
//     const intersect = ((yi > y) !== (yj > y)) &&
//       (x < (xj - xi) * (y - yi) / (yj - yi + 0.0) + xi);
//     if (intersect) inside = !inside;
//   }
//   return inside;
// };

// /**
//  * ฟังก์ชันตรวจสอบสัตว์ที่อยู่ในและนอก safezone
//  * @param {Array} pets รายการสัตว์ [{lat, lng, ...}]
//  * @param {Array} polygon โพลิกอนของ safezone [{lat, lng}, ...]
//  * @returns {Object} { inside: [...], outside: [...] }
//  */
// // export const filterPetsBySafezone = (pets, polygon) => {
// //   const normalizedPolygon = normalizePolygon(polygon);
// //   const inside = [];
// //   const outside = [];

// //   pets.forEach(pet => {
// //     if (pet.lat == null || pet.lng == null) return;
// //     const pt = { lat: Number(pet.lat), lng: Number(pet.lng) };
// //     const isInside = pointInPolygon(pt, normalizedPolygon);
// //     if (isInside) {
// //       inside.push(pet);
// //       console.log(`สัตว์ชื่อ "${pet.name}" (ID: ${pet.id}) อยู่ **ในพื้นที่ปลอดภัย**`);
// //     } else {
// //       outside.push(pet);
// //       console.log(`สัตว์ชื่อ "${pet.name}" (ID: ${pet.id}) อยู่ **นอกพื้นที่ปลอดภัย**`);
// //       // sendPetAlertEmail(pet.id, pet.ownerId);
// //     }
// //   });

// //   return { inside, outside };
// // };

// /**
//  * pets: [{lat, lng, ...}]
//  * safezones: [{ id, name, polygon: [{lat, lng}, ...] }]
//  */
// // export const filterPetsByAllSafezones = (pets, safezones) => {
// //   const inside = [];
// //   const outside = [];

// //   pets.forEach(pet => {
// //     if (pet.lat == null || pet.lng == null) return;
// //     const pt = { lat: Number(pet.lat), lng: Number(pet.lng) };

// //     let foundZone = null;

// //     for (const zone of safezones) {
// //   if (!Array.isArray(zone.coordinates) || zone.coordinates.length === 0) {
// //     console.warn(`⏭ ข้าม Safe Zone "${zone.name}" เพราะไม่มี polygon`);
// //     continue;
// //   }

// //   const normalizedPolygon = normalizePolygon(zone.coordinates);
// //   if (pointInPolygon(pt, normalizedPolygon)) {
// //     foundZone = zone;
// //     break;
// //   }
// // }

// //     if (foundZone) {
// //       inside.push({ ...pet, safezoneId: foundZone.id, safezoneName: foundZone.name });
// //       console.log(`สัตว์ "${pet.name}" (ID: ${pet.id}) อยู่ในพื้นที่ปลอดภัย: ${foundZone.name}`);
// //     } else {
// //       outside.push(pet);
// //       console.log(`สัตว์ "${pet.name}" (ID: ${pet.id}) อยู่นอกทุกพื้นที่ปลอดภัย`);
// //       sendPetAlertEmail(pet.id, pet.ownerId);
// //     }
// //   });

// //   return { inside, outside };
// // };

// export const filterPetsByAllSafezones = (pets, safezones) => {
//   const inside = [];
//   const outside = [];
//   const now = Date.now();

//   pets.forEach((pet) => {
//     if (pet.lat == null || pet.lng == null) return;
//     const pt = { lat: Number(pet.lat), lng: Number(pet.lng) };

//     let foundZone = null;

//     for (const zone of safezones) {
//       if (!Array.isArray(zone.coordinates) || zone.coordinates.length === 0) {
//         console.warn(`⏭ ข้าม Safe Zone "${zone.name}" เพราะไม่มี polygon`);
//         continue;
//       }

//       const normalizedPolygon = normalizePolygon(zone.coordinates);
//       if (pointInPolygon(pt, normalizedPolygon)) {
//         foundZone = zone;
//         break;
//       }
//     }

//     if (foundZone) {
//       inside.push({
//         ...pet,
//         safezoneId: foundZone.id,
//         safezoneName: foundZone.name,
//       });
//       console.log(
//         `✅ สัตว์ "${pet.name}" (ID: ${pet.id}) อยู่ในพื้นที่ปลอดภัย: ${foundZone.name}`
//       );

//       // reset สถานะถ้ากลับเข้ามา
//       petStatusMap[pet.id] = { isOutside: false, lastExitTime: null };
//     } else {
//       outside.push(pet);
//       console.log(`⚠️ สัตว์ "${pet.name}" (ID: ${pet.id}) อยู่นอกทุกพื้นที่ปลอดภัย`);

//       const prevStatus = petStatusMap[pet.id] || {
//         isOutside: false,
//         lastExitTime: null,
//       };

//       if (!prevStatus.isOutside) {
//         // 🐾 ออกจาก safezone ครั้งแรก
//         petStatusMap[pet.id] = { isOutside: true, lastExitTime: now };
//         sendPetAlertEmail(pet.id, pet.ownerId);
//       } else {
//         // 🐾 อยู่นอกต่อเนื่อง
//         if (prevStatus.lastExitTime && now - prevStatus.lastExitTime >= 30000) {
//           sendPetAlertEmail(pet.id, pet.ownerId);
//           // รีเซ็ตเวลาเพื่อป้องกัน spam
//           petStatusMap[pet.id].lastExitTime = now;
//         }
//       }
//     }
//   });

//   return { inside, outside };
// };


import { doc, getDoc } from "firebase/firestore";
import { ref, get } from "firebase/database";
import emailjs from '@emailjs/browser';
import { db, rtdb } from "./firebase";

emailjs.init("esD328TvJ7zr7eoZj");

export const sendPetAlertEmail = async (petId, caregiverId) => {
  try {
    // ตรวจสอบ input parameters
    if (!petId || !caregiverId) {
      console.error("❌ petId หรือ ownerId ไม่ถูกต้อง:", { petId, caregiverId });
      return;
    }

    const petSnap = await getDoc(doc(db, "pets", petId));
    const petData = petSnap.exists() ? petSnap.data() : {};
    const ownerSnap = await getDoc(doc(db, "users", caregiverId));
    const ownerData = ownerSnap.exists() ? ownerSnap.data() : {};

    // ตรวจสอบและแปลงค่า
    const to_name = (ownerData?.username != null) ? String(ownerData.username).trim() : "ผู้ใช้";
    const pet_name = (petData?.name != null) ? String(petData.name).trim() : "สัตว์เลี้ยง";
    const email = (ownerData?.email != null) ? String(ownerData.email).trim() : "";

    // log ค่าเพื่อ debug
    console.log("Debug values:");
    console.log("- petId:", petId);
    console.log("- ownerId:", caregiverId);
    console.log("- ownerData:", ownerData);
    console.log("- petData:", petData);
    console.log("- email:", email);
    console.log("- to_name:", to_name);
    console.log("- pet_name:", pet_name);

    // ตรวจสอบ email 
    if (!email || email === "" || email === "null" || email === "undefined") {
      console.error("❌ Email ของเจ้าของไม่ถูกต้อง:", email);
      return;
    }

    // ตรวจสอบรูปแบบ email 
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("❌ รูปแบบ email ไม่ถูกต้อง:", email);
      return;
    }

    // ดึง location
    let location = "ไม่มีข้อมูลตำแหน่ง";
    if (petData?.device_id != null && String(petData.device_id).trim() !== "") {
      try {
        const deviceId = String(petData.device_id).trim();
        const loraSnap = await get(ref(rtdb, `lora_data/${deviceId}`));
        if (loraSnap.exists()) {
          const data = loraSnap.val();
          if (data?.latitude != null && data?.longitude != null) {
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              location = `${lat}, ${lng}`;
            }
          }
        }
      } catch (err) {
        console.warn("ไม่สามารถดึงข้อมูลตำแหน่ง:", err);
      }
    } else {
      console.warn("device_id ของสัตว์ไม่ถูกต้อง:", petData?.device_id);
    }

    // สร้าง template parameters 
    const templateParams = {
      to_name: String(to_name || "ผู้ใช้"),
      pet_name: String(pet_name || "สัตว์เลี้ยง"),
      location: String(location || "ไม่มีข้อมูลตำแหน่ง"),
      time: String(new Date().toLocaleString("th-TH") || new Date().toString()),
      email: String(email)
    };

    // ตรวจสอบ templateParams อีกครั้ง
    console.log("Final templateParams:", templateParams);
    
    // ตรวจสอบว่าไม่มีค่า undefined หรือ null
    for (const [key, value] of Object.entries(templateParams)) {
      if (value == null || value === "null" || value === "undefined") {
        console.error(`templateParams.${key} มีค่าไม่ถูกต้อง:`, value);
        templateParams[key] = key === "email" ? email : "ไม่มีข้อมูล";
      }
    }

    console.log("Sending email with params:", templateParams);

    // ส่งอีเมลผ่าน EmailJS
    const result = await emailjs.send("service_jxwswpv", "template_9c7e5lj", templateParams);
    console.log("ส่งอีเมลเรียบร้อยแล้ว:", result);

  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดในการส่งอีเมล:");
    console.error("- Error message:", error.message);
    console.error("- Error stack:", error.stack);
    console.error("- Error object:", error);
  }
};

const normalizePolygon = (coords) => {
  if (!Array.isArray(coords)) return [];
  return coords.map(c => Array.isArray(c) ? { lat: Number(c[0]), lng: Number(c[1]) } : { lat: Number(c.lat), lng: Number(c.lng) });
};

const pointInPolygon = (point, polygon) => {
  const x = Number(point.lng), y = Number(point.lat);
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = Number(polygon[i].lng), yi = Number(polygon[i].lat);
    const xj = Number(polygon[j].lng), yj = Number(polygon[j].lat);

    // check on segment
    const onSegment = Math.abs((yi - y)*(xj - xi) - (xi - x)*(yj - yi)) < 1e-12 &&
                      x >= Math.min(xi, xj) - 1e-12 && x <= Math.max(xi, xj) + 1e-12 &&
                      y >= Math.min(yi, yj) - 1e-12 && y <= Math.max(yi, yj) + 1e-12;
    if (onSegment) return true;

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi)*(y - yi)/(yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// สถานะสัตว์ที่อยู่นอก safezone
const petStatusMap = {};
let intervalId = null;

export const filterPetsByAllSafezones = (pets, safezones) => {
  console.log("เรียก filterPetsByAllSafezones", new Date().toLocaleTimeString())
  const inside = [];
  const outside = [];
  const now = Date.now();

  pets.forEach(pet => {
    if (pet.lat == null || pet.lng == null) return;
    const pt = { lat: Number(pet.lat), lng: Number(pet.lng) };

    let foundZone = null;
    for (const zone of safezones) {
      if (!Array.isArray(zone.coordinates) || zone.coordinates.length === 0) continue;
      if (pointInPolygon(pt, normalizePolygon(zone.coordinates))) {
        foundZone = zone;
        break;
      }
    }

    if (foundZone) {
      inside.push({ ...pet, safezoneId: foundZone.id, safezoneName: foundZone.name });
      console.log(`สัตว์ "${pet.name}" อยู่ใน safezone: ${foundZone.name}`);
      petStatusMap[pet.id] = { isOutside: false, lastExitTime: null };
    } else {
      outside.push(pet);
      console.log(`สัตว์ "${pet.name}" อยู่นอก safezone`);
      const prevStatus = petStatusMap[pet.id] || { isOutside: false, lastExitTime: null };
      
      if (!prevStatus.isOutside) {
        // ส่งครั้งแรกเมื่อออกจาก safezone
        sendPetAlertEmail(pet.id, pet.caregiverId);
      }
      petStatusMap[pet.id] = { isOutside: true, lastExitTime: now };

    }
  });

  // ตั้ง interval เพื่อตรวจสอบสัตว์ที่อยู่นอก safezone ทุกๆ 1 นาที

  // เคลียร์ intervalId ของเก่า
  if (intervalId) clearInterval(intervalId);

  if (outside.length > 0) {
    intervalId = setInterval(() => {
      outside.forEach(pet => {
        if (petStatusMap[pet.id]?.isOutside) {
          console.log(`ส่งเตือนซ้ำสำหรับสัตว์ "${pet.name}" ที่อยู่นอก safezone`);
          sendPetAlertEmail(pet.id, pet.caregiverId);
        }
      });
    }, 60000); // ทุกๆ 1 นาที
  }

  
  return { inside, outside };
};




