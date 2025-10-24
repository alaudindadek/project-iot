
// PetLocationHistory.js
import { rtdb } from "./firebase";
import { ref, get, onValue, set, remove } from "firebase/database";
import { filterPetsByAllSafezones } from "./CheckSafeZone";

const lastSaveTimes = new Map(); 

// เก็บ listeners เพื่อใช้ในการ cleanup
const activeListeners = new Map();

/**
 * บันทึกประวัติตำแหน่งสัตว์ (บันทึกแยกใน PetHistory)
 */
export const savePetLocationHistory = async (deviceId, currentData, safezones = []) => {
  if (!deviceId || !currentData) return false;
  
  try {
    const { latitude, longitude, satellites, date, time , battery} = currentData;
    
    // แปลง date และ time จากข้อมูล LoRa เป็น timestamp
    let actualTimestamp;
    if (date && time) {
      // ลบ "Date: " และ "Time: " ออกก่อน
      const cleanDate = date.replace("Date: ", "").trim();
      const cleanTime = time.replace("Time: ", "").trim();
      
      // แปลง format จาก DD/MM/YYYY เป็น YYYY-MM-DD
      const [day, month, year] = cleanDate.split('/');
      const formattedDate = `${year}-${month}-${day}`;
      
      actualTimestamp = new Date(`${formattedDate} ${cleanTime}`).getTime();
    } else {
      // fallback: ใช้เวลาปัจจุบัน
      actualTimestamp = Date.now();
    }

    // ตรวจสอบว่า timestamp นี้มีอยู่แล้วหรือไม่
    let timestamp = actualTimestamp;
    const existingSnapshot = await get(ref(rtdb, `PetHistory/${deviceId}/${timestamp}`));
    
    // ถ้า timestamp ซ้ำ ให้เพิ่มค่าขึ้น 1 มิลลิวินาที
    if (existingSnapshot.exists()) {
      timestamp = actualTimestamp + 1;
      let nextCheck = await get(ref(rtdb, `PetHistory/${deviceId}/${timestamp}`));
      while (nextCheck.exists()) {
        timestamp += 1;
        nextCheck = await get(ref(rtdb, `PetHistory/${deviceId}/${timestamp}`));
      }
    }
    
    // แปลงข้อมูลให้เป็นตัวเลข
    const lat = parseFloat(latitude) || 0;
    const lng = parseFloat(longitude) || 0;
    const satelliteCount = parseInt(satellites) || 0;
    const batteryPer = parseInt(battery); // 
    
    // ตรวจสอบว่าอยู่ใน Safe Zone หรือไม่
    let inSafeZone = false;
    let safezoneName = null;
    if (safezones && safezones.length > 0) {
      const petMock = [{ id: deviceId, name: deviceId , lat, lng }];
      const { inside } = filterPetsByAllSafezones(petMock, safezones);
      inSafeZone = inside.length > 0;
      if (inside.length > 0) {
        safezoneName = inside[0].safezoneName || null;
      }
    }

    const historyRecord = {
      latitude: lat,
      longitude: lng,
      battery: batteryPer,
      satellites: satelliteCount,
      date: date || new Date(actualTimestamp).toLocaleDateString('th-TH'),
      time: time || new Date(actualTimestamp).toLocaleTimeString('th-TH'),
      timestamp: actualTimestamp,
      inSafeZone,
      safezoneName,
      saved_at: new Date().toISOString()
    };
    
    // บันทึกใน path: PetHistory/{deviceId}/{timestamp}
    const recordRef = ref(rtdb, `PetHistory/${deviceId}/${timestamp}`);
    await set(recordRef, historyRecord);
    
    console.log(`History saved for ${deviceId} at ${timestamp}:`, historyRecord);
    
    // จำกัดจำนวนประวัติ (เก็บแค่ 50 records ล่าสุด)
    await limitHistoryRecords(deviceId, 8640);
    
    return true;
  } catch (error) {
    console.error("❌ Error saving pet history:", error);
    return false;
  }
};

/**
 * ดึงประวัติตำแหน่งของสัตว์
 */
export const getPetLocationHistory = async (deviceId, limit = 200) => {
  if (!deviceId) return [];
  
  try {
    const historyRef = ref(rtdb, `PetHistory/${deviceId}`);
    const snapshot = await get(historyRef);
    
    if (!snapshot.exists()) {
      console.log(`No history found for device: ${deviceId}`);
      return [];
    }
    
    const data = snapshot.val();
    const historyArray = Object.entries(data)
      .map(([key, record]) => ({
        id: key,
        timestamp: new Date(Number(key)),
        datetime: new Date(Number(key)).toLocaleString('th-TH'),
        ...record
      }))
      .sort((a, b) => b.timestamp - a.timestamp) // เรียงจากใหม่ไปเก่า
      .slice(0, limit); // จำกัดจำนวน
    
    console.log(`Retrieved ${historyArray.length} history records for ${deviceId}`);
    return historyArray;
    
  } catch (error) {
    console.error("Error fetching pet history:", error);
    return [];
  }
};

/**
 * ดึงข้อมูลปัจจุบันของ device
 */
export const getCurrentDeviceData = async (deviceId) => {
  if (!deviceId) return null;
  
  try {
    const deviceRef = ref(rtdb, `LoRaData/Devices/${deviceId}`);
    const snapshot = await get(deviceRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // นับจำนวนประวัติ
      const historyRef = ref(rtdb, `PetHistory/${deviceId}`);
      const historySnapshot = await get(historyRef);
      const historyCount = historySnapshot.exists() ? Object.keys(historySnapshot.val()).length : 0;
      
      return {
        ...data,
        historyCount
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error getting current device data:", error);
    return null;
  }
};

/**
 * Subscribe เพื่อบันทึกอัตโนมัติเมื่อข้อมูล LoRa อัพเดต
 */
export const subscribePetLocationUpdates = (deviceId, safezones = []) => {
  if (!deviceId) return () => {};
  
  // หยุด listener เก่าถ้ามี
  if (activeListeners.has(deviceId)) {
    const oldUnsubscribe = activeListeners.get(deviceId);
    oldUnsubscribe();
  }
  
  const deviceRef = ref(rtdb, `LoRaData/Devices/${deviceId}`);
  let lastDataSnapshot = null;
  let isFirstLoad = true;

  const SAVE_INTERVAL = 30000; // 30 วินาที

  const unsubscribe = onValue(deviceRef, async (snapshot) => {
    if (!snapshot.exists()) return;
    
    const currentData = snapshot.val();
    
    // ถ้าเป็นครั้งแรก ให้เก็บข้อมูลและไม่บันทึกประวัติ
    if (isFirstLoad) {
      lastDataSnapshot = { ...currentData };
      isFirstLoad = false;
      console.log(`📌 Initial data loaded for ${deviceId}, not saving to history`);
      return;
    }
    
    // ตรวจสอบว่าข้อมูลเปลี่ยนแปลงหรือไม่
    const hasChanged = hasDataChanged(lastDataSnapshot, currentData);
    
    if (!hasChanged) {
      return;
    }
    
    // ข้อมูลเปลี่ยนแปลง - อัปเดต lastDataSnapshot ทันที
    console.log(`Data changed for ${deviceId}:`, {
      old: lastDataSnapshot,
      new: currentData
    });
    lastDataSnapshot = { ...currentData };
    
    // ตรวจสอบเวลาสำหรับการบันทึก
    const lastSaveTime = lastSaveTimes.get(deviceId) || 0;
    const now = Date.now();
    
    if (now - lastSaveTime >= SAVE_INTERVAL) {
      console.log(`Saving history for ${deviceId} - data changed and interval met`);
      const success = await savePetLocationHistory(deviceId, currentData, safezones);
      if (success) {
        lastSaveTimes.set(deviceId, now);
      }
    } else {
      const remainingTime = Math.ceil((SAVE_INTERVAL - (now - lastSaveTime)) / 1000);
      console.log(`Data changed for ${deviceId}, but waiting ${remainingTime}s before next save`);
    }
  });
  
  // เก็บ listener เพื่อใช้ cleanup
  activeListeners.set(deviceId, unsubscribe);
  
  console.log(`Started listening to updates for device: ${deviceId}`);
  return unsubscribe;
};

/**
 * Subscribe หลาย devices พร้อมกัน
 */
export const subscribeMultiplePetLocationUpdates = (deviceIds, safezones = []) => {
  const unsubscribers = deviceIds.map(deviceId => 
    subscribePetLocationUpdates(deviceId, safezones)
  );
  
  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    console.log(`🛑 Stopped listening to ${deviceIds.length} devices`);
  };
};

/**
 * หยุด subscribe สำหรับ device เฉพาะ
 */
export const unsubscribePetLocationUpdates = (deviceId) => {
  if (activeListeners.has(deviceId)) {
    const unsubscribe = activeListeners.get(deviceId);
    unsubscribe();
    activeListeners.delete(deviceId);
    console.log(`🛑 Stopped listening to device: ${deviceId}`);
  }
};

/**
 * หยุด subscribe ทั้งหมด
 */
export const unsubscribeAllPetLocationUpdates = () => {
  activeListeners.forEach((unsubscribe, deviceId) => {
    unsubscribe();
    console.log(`🛑 Stopped listening to device: ${deviceId}`);
  });
  activeListeners.clear();
  console.log('🛑 All listeners stopped');
};

/**
 * จำกัดจำนวน records ในประวัติ
 */
const limitHistoryRecords = async (deviceId, maxRecords = 50) => {
  try {
    const historyRef = ref(rtdb, `PetHistory/${deviceId}`);
    const snapshot = await get(historyRef);
    
    if (!snapshot.exists()) return;
    
    const history = snapshot.val();
    const entries = Object.entries(history);
    
    if (entries.length <= maxRecords) return;
    
    // เรียงจากใหม่ไปเก่า และเก็บเฉพาะ maxRecords
    entries.sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
    const limitedEntries = entries.slice(0, maxRecords);
    
    // สร้าง object ใหม่
    const limitedHistory = {};
    limitedEntries.forEach(([timestamp, data]) => {
      limitedHistory[timestamp] = data;
    });
    
    // อัพเดตกลับไป Firebase
    await set(historyRef, limitedHistory);
    
    const deletedCount = entries.length - maxRecords;
    console.log(`Cleaned ${deletedCount} old records for ${deviceId}`);
    
  } catch (error) {
    console.error("Error limiting history records:", error);
  }
};

/**
 * ตรวจสอบว่าข้อมูลเปลี่ยนแปลงหรือไม่
 */
const hasDataChanged = (oldData, newData) => {
  if (!oldData || !newData) return true;
  
  const oldLat = parseFloat(oldData.latitude) || 0;
  const newLat = parseFloat(newData.latitude) || 0;
  const oldLng = parseFloat(oldData.longitude) || 0;
  const newLng = parseFloat(newData.longitude) || 0;
  const oldSatellites = parseInt(oldData.satellites) || 0;
  const newSatellites = parseInt(newData.satellites) || 0;
  
  // ตรวจสอบการเปลี่ยนแปลง
  const latChanged = Math.abs(oldLat - newLat) > 0.000001;
  const lngChanged = Math.abs(oldLng - newLng) > 0.000001;
  const satellitesChanged = oldSatellites !== newSatellites;
  const dateChanged = oldData.date !== newData.date;
  const timeChanged = oldData.time !== newData.time;
  
  const isChanged = latChanged || lngChanged || satellitesChanged || dateChanged || timeChanged;
  
  if (isChanged) {
    console.log(`Data change detected:`, {
      latitude: latChanged ? `${oldLat} → ${newLat}` : 'unchanged',
      longitude: lngChanged ? `${oldLng} → ${newLng}` : 'unchanged',
      satellites: satellitesChanged ? `${oldSatellites} → ${newSatellites}` : 'unchanged',
      date: dateChanged ? `${oldData.date} → ${newData.date}` : 'unchanged',
      time: timeChanged ? `${oldData.time} → ${newData.time}` : 'unchanged'
    });
  }
  
  return isChanged;
};

/**
 * ลบประวัติทั้งหมดของ device
 */
export const cleanAllHistory = async (deviceId) => {
  try {
    const historyRef = ref(rtdb, `PetHistory/${deviceId}`);
    
    // นับจำนวน records ก่อนลบ
    const snapshot = await get(historyRef);
    const recordCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
    
    await remove(historyRef);
    
    console.log(`ลบประวัติทั้งหมดของ ${deviceId} แล้ว (${recordCount} records)`);
    return recordCount;
  } catch (error) {
    console.error("Error cleaning history:", error);
    return 0;
  }
};