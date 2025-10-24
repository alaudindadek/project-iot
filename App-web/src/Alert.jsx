import { doc, getDoc, query, collection, where, getDocs } from "firebase/firestore";
import { ref, get, push, set } from "firebase/database";
import emailjs from '@emailjs/browser';
import { db, rtdb } from "./firebase";

emailjs.init("pwudGPgOzLEf91Mw3");

// ส่งอีเมลแจ้งเตือนสัตว์ออกนอก SafeZone
export const sendPetAlertEmail = async (petId, caregiverId) => {

  const startTime = Date.now();
  console.log(`\n========== เริ่มส่งการแจ้งเตือน ==========`);
  console.log(`Pet ID: ${petId}`);
  console.log(`Caregiver ID: ${caregiverId}`);
  console.log(`เวลา: ${new Date().toLocaleString("th-TH")}\n`);
  try {
    // ตรวจสอบ input parameters
    if (!petId || !caregiverId) {
      console.error("petId หรือ caregiverId ไม่ถูกต้อง:", { petId, caregiverId });
      return;
    }

    const petSnap = await getDoc(doc(db, "pets", petId));
    const petData = petSnap.exists() ? petSnap.data() : {};
    
    // ดึงข้อมูล Caregiver
    const caregiverSnap = await getDoc(doc(db, "users", caregiverId));
    const caregiverData = caregiverSnap.exists() ? caregiverSnap.data() : {};

    // ตรวจสอบและแปลงค่า Caregiver
    const caregiver_name = (caregiverData?.username != null) ? String(caregiverData.username).trim() : "ผู้ดูแล";
    const pet_name = (petData?.name != null) ? String(petData.name).trim() : "สัตว์เลี้ยง";
    const caregiver_email = (caregiverData?.email != null) ? String(caregiverData.email).trim() : "";

    // log ค่าเพื่อ debug
    console.log("ข้อมูลที่ดึงได้:");
    console.log(`   - ชื่อสัตว์เลี้ยง: ${pet_name}`);
    console.log(`   - ชื่อผู้ดูแล: ${caregiver_name}`);
    console.log(`   - อีเมลผู้ดูแล: ${caregiver_email}`);
    console.log(`   - Device ID: ${petData?.device_id || 'ไม่มี'}`);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // ดึง location จาก Realtime Database (LoRaData/Devices)
    let location = "ไม่มีข้อมูลตำแหน่ง";
    if (petData?.device_id != null && String(petData.device_id).trim() !== "") {
      try {
        const deviceId = String(petData.device_id).trim();
        // เปลี่ยน path เป็น LoRaData/Devices
        const deviceSnap = await get(ref(rtdb, `LoRaData/Devices/${deviceId}`));
        if (deviceSnap.exists()) {
          const data = deviceSnap.val();
          if (data?.latitude != null && data?.longitude != null) {
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              location = `${lat}, ${lng}`;
              console.log(`ดึงตำแหน่งจาก RTDB: ${location}`);
            }
          }
        } else {
          console.warn(`ไม่พบข้อมูลอุปกรณ์ใน RTDB: ${deviceId}`);
        }
      } catch (err) {
        console.error("ไม่สามารถดึงข้อมูลตำแหน่ง:", err);
      }
    } else {
      console.warn("device_id ของสัตว์ไม่ถูกต้อง:", petData?.device_id);
    }

    const time = String(new Date().toLocaleString("th-TH") || new Date().toString());

    // ส่งเมลให้ Caregiver 
    if (caregiver_email && emailRegex.test(caregiver_email)) {
      const locationInfo = `สัตว์ ออกนอกพื้นที่ ตำแหน่ง : ${location}`;
      const caregiverTemplateParams = {
        to_name: String(caregiver_name || "ผู้ดูแล"),
        pet_name: String(pet_name || "สัตว์เลี้ยง"),
        location: String(locationInfo || "ไม่มีข้อมูลตำแหน่ง"),
        time: time,
        email: String(caregiver_email)
      };

      // ตรวจสอบว่าไม่มีค่า undefined หรือ null
      for (const [key, value] of Object.entries(caregiverTemplateParams)) {
        if (value == null || value === "null" || value === "undefined") {
          console.error(`caregiverTemplateParams.${key} มีค่าไม่ถูกต้อง:`, value);
          caregiverTemplateParams[key] = key === "email" ? caregiver_email : "ไม่มีข้อมูล";
        }
      }

      console.log("Sending email to Caregiver with params:", caregiverTemplateParams);

      try {
        const result = await emailjs.send("service_alert01", "template_x2s9x03", caregiverTemplateParams);
        console.log("ส่งเมลให้ Caregiver เรียบร้อยแล้ว:", result);
      } catch (error) {
        console.error("ส่งเมลให้ Caregiver ล้มเหลว:", error);
      }
    } else {
      console.warn("Caregiver ไม่มีอีเมลหรือรูปแบบไม่ถูกต้อง");
    }

    //  หาและส่งเมลให้ Owner 
    try {
      const ownersQuery = query(
        collection(db, "users"),
        where("role", "==", "owner")
      );

      const ownersSnap = await getDocs(ownersQuery);

      if (ownersSnap.empty) {
        console.warn("ไม่พบ user ที่มี role = owner");
      } else {
        console.log(`พบ Owner จำนวน ${ownersSnap.size} คน`);

        for (const ownerDoc of ownersSnap.docs) {
          const ownerData = ownerDoc.data();
          const ownerId = ownerDoc.id;
          
          // ข้ามถ้าเป็นคนเดียวกับ caregiver
          if (ownerId === caregiverId) {
            console.log(`Owner (${ownerData?.username}) และ Caregiver เป็นคนเดียวกัน - ข้ามไป`);
            continue;
          }

          const owner_name = String(ownerData?.username || "เจ้าของ").trim();
          const owner_email = String(ownerData?.email || "").trim();

          console.log(`กำลังส่งเมลให้ Owner: ${owner_name} (${owner_email})`);

          if (owner_email && emailRegex.test(owner_email)) {
            const locationInfo = `สัตว์ ออกนอกพื้นที่ ตำแหน่ง : ${location}`;
            const ownerTemplateParams = {
              to_name: owner_name,
              pet_name: pet_name,
              location: locationInfo,
              time: time,
              email: owner_email
            };

            try {
              const result = await emailjs.send("service_alert01", "template_x2s9x03", ownerTemplateParams);
              console.log(`ส่งเมลให้ Owner (${owner_name}) สำเร็จ:`, result);
            } catch (error) {
              console.error(`ส่งเมลให้ Owner (${owner_name}) ล้มเหลว:`, error);
            }
          } else {
            console.warn(`Owner (${owner_name}) ไม่มีอีเมลหรือรูปแบบไม่ถูกต้อง`);
          }
        }
      }
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการค้นหา Owner:", error);
    }

    console.log("ส่งเมลแจ้งเตือนเสร็จสิ้น");

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่งอีเมล:");
    console.error("- Error message:", error.message);
    console.error("- Error stack:", error.stack);
    console.error("- Error object:", error);
  }
};

export const logPetAlert = async (petId, petName, caregiverId, status, deviceId) => {
  try {
    const alertRef = ref(rtdb, 'alerts/alertOutside');
    const newAlertRef = push(alertRef);

    const alertData = {
      petId,
      petName,
      caregiverId,
      status,
      deviceId,
      timestamp: new Date().toISOString()
    };

    await set(newAlertRef, alertData);
    console.log("บันทึกการแจ้งเตือนลง RTDB แล้ว:", alertData);
  } catch (error) {
    console.error("บันทึกการแจ้งเตือนล้มเหลว:", error);
  }
};

// -------------------ส่งอีเมลแจ้งเตือนรายงานปัญหาสัตว์เลี้ยง
export const sendReportAlertEmail = async (
  reportId,
  petId,
  petName,
  problem,
  detail,
  senderId,
  receiverId
) => {
  try {
    // ตรวจสอบ input parameters
    if (!receiverId || !senderId) {
      console.error("receiverId หรือ senderId ไม่ถูกต้อง:", { receiverId, senderId });
      return { success: false, error: "Invalid parameters" };
    }

    // ดึงข้อมูลผู้ส่ง (Sender)
    const senderSnap = await getDoc(doc(db, "users", senderId));
    const senderData = senderSnap.exists() ? senderSnap.data() : {};
    
    // ดึงข้อมูลผู้รับ (Receiver)
    const receiverSnap = await getDoc(doc(db, "users", receiverId));
    const receiverData = receiverSnap.exists() ? receiverSnap.data() : {};

    // ดึงข้อมูลสัตว์
    let petBreed = "";
    if (petId) {
      try {
        const petSnap = await getDoc(doc(db, "pets", petId));
        const petData = petSnap.exists() ? petSnap.data() : {};
        petBreed = petData?.breed || "";
      } catch (err) {
        console.warn("ไม่สามารถดึงข้อมูลสัตว์:", err);
      }
    }

    // แปลงค่าให้เป็น string และ trim
    const sender_name = String(senderData?.username || "ผู้ส่งรายงาน").trim();
    const sender_role = String(senderData?.role || "").trim();
    const receiver_name = String(receiverData?.username || "ผู้รับรายงาน").trim();
    const receiver_email = String(receiverData?.email || "").trim();
    const pet_display = petBreed 
      ? `${petName} (${petBreed})` 
      : petName;

    const time = new Date().toLocaleString("th-TH");

    console.log("Debug Report Alert values:");
    console.log("- reportId:", reportId);
    console.log("- petName:", petName);
    console.log("- problem:", problem);
    console.log("- sender_name:", sender_name);
    console.log("- sender_role:", sender_role);
    console.log("- receiver_name:", receiver_name);
    console.log("- receiver_email:", receiver_email);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!receiver_email || !emailRegex.test(receiver_email)) {
      console.warn("ผู้รับไม่มีอีเมลหรือรูปแบบไม่ถูกต้อง:", receiver_email);
      return { success: false, error: "Invalid email" };
    }

    // เตรียม template parameters สำหรับส่งอีเมล
    const templateParams = {
      to_name: receiver_name,
      from_name: sender_name,
      from_role: sender_role,
      pet_name: pet_display,
      problem: problem,
      detail: detail || "ไม่มีรายละเอียดเพิ่มเติม",
      time: time,
      report_id: reportId,
      email: receiver_email
    };

    // ตรวจสอบว่าไม่มีค่า undefined หรือ null
    for (const [key, value] of Object.entries(templateParams)) {
      if (value == null || value === "null" || value === "undefined") {
        console.error(`templateParams.${key} มีค่าไม่ถูกต้อง:`, value);
        templateParams[key] = key === "email" ? receiver_email : "ไม่มีข้อมูล";
      }
    }

    console.log("Sending report alert email with params:", templateParams);

    try {
      // ส่งอีเมล (สามารถสร้าง template ใหม่สำหรับรายงานได้)
      const result = await emailjs.send(
        "service_alert01", "template_od2l1yq",
        templateParams
      );
      
      console.log("ส่งอีเมลแจ้งเตือนรายงานสำเร็จ:", result);
      return { success: true, result };
    } catch (error) {
      console.error("ส่งอีเมลแจ้งเตือนรายงานล้มเหลว:", error);
      return { success: false, error };
    }

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่งอีเมลรายงาน:");
    console.error("- Error message:", error.message);
    console.error("- Error stack:", error.stack);
    return { success: false, error };
  }
};

// -------------------------ส่งอีเมลแจ้งเตือนแบตเตอรี่ต่ำ

export const sendBatteryAlertEmail = async (petId, caregiverId, batteryLevel) => {
  console.log(`\n========== เริ่มส่งการแจ้งเตือนแบตเตอรี่ ==========`);
  console.log(`Pet ID: ${petId}`);
  console.log(`Caregiver ID: ${caregiverId}`);
  console.log(`Battery Level: ${batteryLevel}%\n`);

  try {
    if (!petId || !caregiverId) {
      console.error("petId หรือ caregiverId ไม่ถูกต้อง");
      return;
    }

  

    const petSnap = await getDoc(doc(db, "pets", petId));
    const petData = petSnap.exists() ? petSnap.data() : {};
    
    const caregiverSnap = await getDoc(doc(db, "users", caregiverId));
    const caregiverData = caregiverSnap.exists() ? caregiverSnap.data() : {};

    const caregiver_name = String(caregiverData?.username || "ผู้ดูแล").trim();
    const pet_name = String(petData?.name || "สัตว์เลี้ยง").trim();
    const caregiver_email = String(caregiverData?.email || "").trim();
    const device_id = String(petData?.device_id || "").trim();

    console.log("ข้อมูลที่ดึงได้:");
    console.log(`   - สัตว์: ${pet_name}`);
    console.log(`   - ผู้ดูแล: ${caregiver_name}`);
    console.log(`   - อีเมล: ${caregiver_email}`);
    console.log(`   - Device: ${device_id}`);
    console.log(`   - แบตเตอรี่: ${batteryLevel}%`);

    const time = new Date().toLocaleString("th-TH");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    let batteryStatus = "ต่ำมาก";
    if (batteryLevel >= 15 && batteryLevel < 20) {
      batteryStatus = "ต่ำ";
    }

    // ส่งเมลให้ Caregiver
    if (caregiver_email && emailRegex.test(caregiver_email)) {
      const batteryInfo = `${batteryLevel}% (${batteryStatus}) | Device: ${device_id || "ไม่ทราบ"}`;
      
      const caregiverTemplateParams = {
        to_name: caregiver_name,
        pet_name: pet_name,
        location: batteryInfo,
        time: time,
        email: caregiver_email
      };

      console.log("ส่งเมลให้ Caregiver:", caregiverTemplateParams);

      try {
        const result = await emailjs.send(
          "service_alert01", "template_x2s9x03",
          caregiverTemplateParams
        );
        console.log("ส่งเมลให้ Caregiver สำเร็จ:", result.text);
      } catch (error) {
        console.error("ส่งเมลให้ Caregiver ล้มเหลว:", error);
        console.error("   Error message:", error.message);
      }
    }

    // ส่งเมลให้ Owner
    try {
      const ownersQuery = query(
        collection(db, "users"),
        where("role", "==", "owner")
      );

      const ownersSnap = await getDocs(ownersQuery);

      if (!ownersSnap.empty) {
        console.log(`พบ Owner จำนวน ${ownersSnap.size} คน`);

        for (const ownerDoc of ownersSnap.docs) {
          const ownerData = ownerDoc.data();
          const ownerId = ownerDoc.id;
          
          if (ownerId === caregiverId) {
            console.log(`Owner และ Caregiver เป็นคนเดียวกัน - ข้ามไป`);
            continue;
          }

          const owner_name = String(ownerData?.username || "เจ้าของ").trim();
          const owner_email = String(ownerData?.email || "").trim();

          console.log(`กำลังส่งเมลให้ Owner: ${owner_name} (${owner_email})`);

          if (owner_email && emailRegex.test(owner_email)) {
            const batteryInfo = `${batteryLevel}% (${batteryStatus}) | Device: ${device_id || "ไม่ทราบ"}`;
            
            const ownerTemplateParams = {
              to_name: owner_name,
              pet_name: pet_name,
              location: batteryInfo,
              time: time,
              email: owner_email
            };

            try {
              const result = await emailjs.send(
                "service_alert01", "template_x2s9x03",
                ownerTemplateParams
              );
              console.log(`ส่งเมลให้ Owner (${owner_name}) สำเร็จ`);
              return { success: true, result };
            } catch (error) {
              console.error(`ส่งเมลให้ Owner (${owner_name}) ล้มเหลว:`, error);
              console.error("   Error message:", error.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("เกิดข้อผิดพลาดในการค้นหา Owner:", error);
    }

    console.log(`\nส่งเมลแจ้งเตือนแบตเตอรี่เสร็จสิ้น\n`);

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการส่งอีเมลแบตเตอรี่:", error);
    console.error("   Error message:", error.message);
    console.error("   Error stack:", error.stack);
  }
};

// บันทึกการแจ้งเตือนแบตเตอรี่ต่ำลง RTDB
export const logBatteryAlert = async (petId, petName, caregiverId, batteryLevel, deviceId) => {
  try {
    // ✅ ป้องกัน undefined
    if (!petId) {
      console.error("❌ petId ไม่ถูกต้อง");
      return { success: false, error: "Invalid petId" };
    }

    const finalCaregiverId = caregiverId || "unknown";
    const finalPetName = petName || "unknown";
    const finalBatteryLevel = batteryLevel ?? 0;
    const finalDeviceId = deviceId || "unknown";

    const alertRef = ref(rtdb, 'alerts/alertBattery');
    const newAlertRef = push(alertRef);

    const alertData = {
      petId,
      petName: finalPetName,
      caregiverId: finalCaregiverId,
      batteryLevel: finalBatteryLevel,
      deviceId: finalDeviceId,
      alertType: 'low_battery',
      timestamp: new Date().toISOString()
    };

    await set(newAlertRef, alertData);
    console.log("✅ บันทึกการแจ้งเตือนแบตเตอรี่ลง RTDB:", alertData);
    return { success: true, data: alertData };
  } catch (error) {
    console.error("❌ บันทึกการแจ้งเตือนแบตเตอรี่ล้มเหลว:", error);
    return { success: false, error };
  }
};