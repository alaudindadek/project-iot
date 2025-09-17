// src/utils/PetLocationHistory.js
import { rtdb } from "./firebase";
import { ref, get, update, onValue, set , remove } from "firebase/database";
import { filterPetsByAllSafezones } from "./ChackLocation";
const lastSaveTimes = new Map(); 

// เก็บ listeners เพื่อใช้ในการ cleanup
const activeListeners = new Map();

/**
 * บันทึกประวัติตำแหน่งสัตว์ (ปรับปรุง timestamp เพื่อป้องกันการทับซ้อน)
 */
export const savePetLocationHistory = async (deviceId, currentData, safezones = []) => {
  if (!deviceId || !currentData) return false;
  
  try {
    const { latitude, longitude, battery, date, time } = currentData;
    
    //สร้าง timestamp ที่ไม่ซ้ำ
    const now = Date.now();
    let timestamp = now;
    
    // ตรวจสอบว่า timestamp นี้มีอยู่แล้วหรือไม่
    const historyRef = ref(rtdb, `lora_data/${deviceId}/history`);
    const existingSnapshot = await get(ref(rtdb, `lora_data/${deviceId}/history/${timestamp}`));
    
    // ถ้า timestamp ซ้ำ ให้เพิ่มค่าขึ้น 1 มิลลิวินาที
    while (existingSnapshot.exists()) {
      timestamp += 1;
      const nextCheck = await get(ref(rtdb, `lora_data/${deviceId}/history/${timestamp}`));
      if (!nextCheck.exists()) break;
    }
    
    // แปลงข้อมูลให้เป็นตัวเลข
    const lat = parseFloat(latitude) || 0;
    const lng = parseFloat(longitude) || 0;
    const batteryLevel = parseInt(battery) || 0;
    
    // ตรวจสอบว่าอยู่ใน Safe Zone หรือไม่
    let inSafeZone = false;
    if (safezones && safezones.length > 0) {
      const petMock = [{ id: deviceId, lat, lng }];
      const { inside } = filterPetsByAllSafezones(petMock, safezones);
      inSafeZone = inside.length > 0;
    }
    
    const historyRecord = {
      latitude: lat,
      longitude: lng,
      battery: batteryLevel,
      date: date || new Date(timestamp).toISOString().split('T')[0],
      time: time || new Date(timestamp).toTimeString().split(' ')[0],
      timestamp,
      inSafeZone,
      saved_at: new Date(timestamp).toISOString() //เพิ่มเวลาที่บันทึกจริง
    };
    
    // บันทึกใน path: lora_data/{deviceId}/history/{timestamp}
    const recordRef = ref(rtdb, `lora_data/${deviceId}/history/${timestamp}`);
    await set(recordRef, historyRecord);
    
    console.log(`✅ History saved for ${deviceId} at ${timestamp}:`, historyRecord);
    
    // จำกัดจำนวนประวัติ (เก็บแค่ 50 records ล่าสุด)
    await limitHistoryRecords(deviceId, 50);
    
    return true;
  } catch (error) {
    console.error("❌ Error saving pet history:", error);
    return false;
  }
};

/**
 * ดึงประวัติตำแหน่งของสัตว์
 */
export const getPetLocationHistory = async (deviceId, limit = 20) => {
  if (!deviceId) return [];
  
  try {
    const historyRef = ref(rtdb, `lora_data/${deviceId}/history`);
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
    const deviceRef = ref(rtdb, `lora_data/${deviceId}`);
    const snapshot = await get(deviceRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const { history, ...currentData } = data;
      return {
        ...currentData,
        historyCount: history ? Object.keys(history).length : 0
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
  
  const deviceRef = ref(rtdb, `lora_data/${deviceId}`);
  let lastDataSnapshot = null;
  let isFirstLoad = true; // เพิ่ม flag เพื่อจัดการข้อมูลครั้งแรก

  const SAVE_INTERVAL = 30000; // 30 วินาที

  const unsubscribe = onValue(deviceRef, async (snapshot) => {
    if (!snapshot.exists()) return;
    
    const currentData = snapshot.val();
    const { history, ...dataWithoutHistory } = currentData;
    
    // ถ้าเป็นครั้งแรก ให้เก็บข้อมูลและไม่บันทึกประวัติ
    if (isFirstLoad) {
      lastDataSnapshot = { ...dataWithoutHistory };
      isFirstLoad = false;
      console.log(`Initial data loaded for ${deviceId}, not saving to history`);
      return;
    }
    
    // ตรวจสอบว่าข้อมูลเปลี่ยนแปลงหรือไม่
    const hasChanged = hasDataChanged(lastDataSnapshot, dataWithoutHistory);
    
    if (!hasChanged) {
      // ถ้าข้อมูลไม่เปลี่ยน ไม่ต้องทำอะไร
      return;
    }
    
    //  ข้อมูลเปลี่ยนแปลง - อัปเดต lastDataSnapshot ทันที
    console.log(`Data changed for ${deviceId}:`, {
      old: lastDataSnapshot,
      new: dataWithoutHistory
    });
    lastDataSnapshot = { ...dataWithoutHistory };
    
    // ตรวจสอบเวลาสำหรับการบันทึก
    const lastSaveTime = lastSaveTimes.get(deviceId) || 0;
    const now = Date.now();
    
    if (now - lastSaveTime >= SAVE_INTERVAL) {
      console.log(`Saving history for ${deviceId} - data changed and interval met`);
      const success = await savePetLocationHistory(deviceId, dataWithoutHistory, safezones);
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
    const historyRef = ref(rtdb, `lora_data/${deviceId}/history`);
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
 * ตรวจสอบว่าข้อมูลเปลี่ยนแปลงหรือไม่ (ปรับปรุงให้แม่นยำขึ้น)
 */
const hasDataChanged = (oldData, newData) => {
  if (!oldData || !newData) return true; // ข้อมูลครั้งแรก
  
  // เปรียบเทียบแต่ละฟิลด์อย่างละเอียด
  const oldLat = parseFloat(oldData.latitude) || 0;
  const newLat = parseFloat(newData.latitude) || 0;
  const oldLng = parseFloat(oldData.longitude) || 0;
  const newLng = parseFloat(newData.longitude) || 0;
  const oldBattery = parseInt(oldData.battery) || 0;
  const newBattery = parseInt(newData.battery) || 0;
  
  // ตรวจสอบการเปลี่ยนแปลงของตำแหน่ง (ใช้ความแม่นยำ 6 หลัก)
  const latChanged = Math.abs(oldLat - newLat) > 0.000001;
  const lngChanged = Math.abs(oldLng - newLng) > 0.000001;
  const batteryChanged = oldBattery !== newBattery;
  const dateChanged = oldData.date !== newData.date;
  const timeChanged = oldData.time !== newData.time;
  
  const isChanged = latChanged || lngChanged || batteryChanged || dateChanged || timeChanged;
  
  if (isChanged) {
    console.log(`Data change detected:`, {
      latitude: latChanged ? `${oldLat} → ${newLat}` : 'unchanged',
      longitude: lngChanged ? `${oldLng} → ${newLng}` : 'unchanged',
      battery: batteryChanged ? `${oldBattery} → ${newBattery}` : 'unchanged',
      date: dateChanged ? `${oldData.date} → ${newData.date}` : 'unchanged',
      time: timeChanged ? `${oldData.time} → ${newData.time}` : 'unchanged'
    });
  }
  
  return isChanged;
};

/**
 * ลบประวัติเก่า
 */
export const cleanAllHistory = async (deviceId) => {
  try {
    const historyRef = ref(rtdb, `lora_data/${deviceId}/history`);
    
    await remove(historyRef); //ลบ node ทั้งหมด
    
    console.log(`ลบประวัติทั้งหมดของ ${deviceId} แล้ว`);
    return true;
  } catch (error) {
    console.error("Error cleaning history:", error);
    return false;
  }
};

