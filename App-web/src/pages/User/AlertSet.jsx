// AddAlert.jsx
import React, { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from '../../firebase';

export default function AddAlert() {
  const [form, setForm] = useState({
    alert_id: "",
    user_id: "",
    device_id: "",
    message: "",
    threshold: "",
    last_updated: "",
    enabled: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "alerts"), {
        ...form,
        alert_id: parseInt(form.alert_id),
        user_id: parseInt(form.user_id),
        device_id: parseInt(form.device_id),
        threshold: form.threshold,
        last_updated: new Date(form.last_updated),
        enabled: form.enabled,
      });
      alert("เพิ่มข้อมูลสำเร็จ");
      setForm({
        alert_id: "",
        user_id: "",
        device_id: "",
        message: "",
        threshold: "",
        last_updated: "",
        enabled: false,
      });
    } catch (err) {
      console.error("เกิดข้อผิดพลาด", err);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="alert_id" placeholder="Alert ID" value={form.alert_id} onChange={handleChange} />
      <input name="user_id" placeholder="User ID" value={form.user_id} onChange={handleChange} />
      <input name="device_id" placeholder="Device ID" value={form.device_id} onChange={handleChange} />
      <input name="message" placeholder="Message" value={form.message} onChange={handleChange} />
      <input name="threshold" placeholder="Threshold" value={form.threshold} onChange={handleChange} />
      <input type="date" name="last_updated" value={form.last_updated} onChange={handleChange} />
      <label>
        เปิดใช้งาน:
        <input type="checkbox" name="enabled" checked={form.enabled} onChange={handleChange} />
      </label>
      <button type="submit">เพิ่มการแจ้งเตือน</button>
    </form>
  );
}
