import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { rtdb } from '../../firebase';
import { ref, push, set, onValue, remove } from 'firebase/database';
import { useAuth } from '../../contexts/AuthContext';
import './Report.css';

import { sendReportAlertEmail } from '../../alert';

const Report = () => {
  const { user } = useAuth();
  const [pet, setPet] = useState('');
  const [problem, setProblem] = useState('');
  const [detail, setDetail] = useState('');
  const [receiver, setReceiver] = useState('');
  const [pets, setPets] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]); // รายชื่อผู้ใช้ทั้งหมด

  // โหลดรายชื่อสัตว์เลี้ยงทั้งหมด
  useEffect(() => {
    const fetchPets = async () => {
      const snapshot = await getDocs(collection(db, 'pets'));
      const petsData = [];
      snapshot.forEach(doc => {
        petsData.push({ id: doc.id, ...doc.data() });
      });
      setPets(petsData);
    };
    fetchPets();
  }, []);

  // โหลดรายงานที่ user ส่งไปแล้ว (จาก rtdb)
  useEffect(() => {
    if (!user) return;
    const reportsRef = ref(rtdb, 'reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      const reportsData = [];
      if (data) {
        Object.entries(data).forEach(([key, value]) => {
          if (value.sender === user.uid) {
            reportsData.push({ id: key, ...value });
          }
        });
      }
      setReports(reportsData);
    });
    return () => unsubscribe();
  }, [user]);

  // โหลดรายชื่อผู้ใช้ทั้งหมด (ยกเว้นตัวเอง)
  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersData = [];
      snapshot.forEach(doc => {
        if (doc.id !== user.uid) {
          usersData.push({ id: doc.id, ...doc.data() });
        }
      });
      setUsers(usersData);
      // ตั้ง receiver เป็นคนแรกในลิสต์ถ้ามี
      if (usersData.length > 0) setReceiver(usersData[0].id);
    };
    fetchUsers();
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pet || !problem || !receiver) return;
    setLoading(true);
    try {
      // บันทึกลง rtdb
      const newReportRef = push(ref(rtdb, 'reports'));
      const reportId = newReportRef.key;

      await set(newReportRef, {
        pet,
        problem,
        detail,
        receiver, // uid ของผู้รับ
        sender: user.uid,
        createdAt: new Date().toISOString()
      });

      // หาข้อมูลสัตว์
      const petObj = pets.find(p => p.id === pet);
      const petName = petObj?.name || 'สัตว์เลี้ยง';

      // ส่งอีเมลแจ้งเตือนผู้รับ
      const emailSent = await sendReportAlertEmail(
        reportId,
        pet,
        petName,
        problem,
        detail,
        user.uid,
        receiver
      );

      if (emailSent?.success) {
        alert('ส่งรายงานสำเร็จและแจ้งเตือนไปยังผู้รับแล้ว');
      } else {
        alert('ส่งรายงานสำเร็จ แต่แจ้งเตือนไปยังผู้รับไม่สำเร็จ');
      }
      
      // รีเซ็ตฟอร์ม
      setPet('');
      setProblem('');
      setDetail('');

      // ไม่ต้อง reload reports ตรงนี้ เพราะ useEffect จะ sync อัตโนมัติจาก rtdb
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการส่งรายงาน: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setLoading(true);
    try {
      await remove(ref(rtdb, 'reports/' + id));
      alert('ลบรายงานสำเร็จ');
      // ไม่ต้อง setReports เพราะ useEffect จะ sync อัตโนมัติ
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการลบรายงาน: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="report-container">
      <h1 className="report-title">รายงานปัญหาสัตว์เลี้ยง</h1>
      <div className="report-card">
        <div className="report-section-title">รายงานปัญหา</div>
        <form onSubmit={handleSubmit}>
          <label className="report-label">เลือกสัตว์ที่พบปัญหา</label>
          <select className="report-input" value={pet} onChange={e => setPet(e.target.value)} required>
            <option value="">-- เลือก --</option>
            {pets.map(p => <option key={p.id} value={p.id}>{p.name} {p.breed ? `(${p.breed})` : ''}</option>)}
          </select>
          <label className="report-label">ปัญหาที่พบ</label>
          <select className="report-input" value={problem} onChange={e => setProblem(e.target.value)} required>
            <option value="">-- เลือก --</option>
            <option value="สัตว์หายตัว">สัตว์หายตัว</option>
            <option value="อุปกรณ์เสียหาย">อุปกรณ์เสียหาย</option>
            <option value="สัตว์ป่วย">สัตว์ป่วย</option>
            <option value="สัตว์บาดเจ็บ">สัตว์บาดเจ็บ</option>
            <option value="พฤติกรรมผิดปกติ">พฤติกรรมผิดปกติ</option>
            <option value="อื่นๆ">อื่นๆ</option>
          </select>
          <label className="report-label">รายละเอียดเพิ่มเติม</label>
          <textarea
            className="report-input"
            placeholder="รายละเอียดเพิ่มเติม..."
            value={detail}
            onChange={e => setDetail(e.target.value)}
          />
          <label className="report-label">ส่งรายงานถึง</label>
          <select className="report-input" value={receiver} onChange={e => setReceiver(e.target.value)} required>
            {users.length === 0 ? (
              <option value="">-- ไม่พบผู้รับ --</option>
            ) : (
              users.map(u => (
                <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
              ))
            )}
          </select>
          <div>
          <button className="report-btn-red" type="submit" disabled={loading}>{loading ? 'กำลังส่ง...' : 'ส่งรายงาน'}</button>
          </div>
        </form>
      </div>
      <div className="report-card">
        <div className="report-section-title">รายงานที่ส่งไปแล้ว</div>
        {reports.length === 0 ? (
          <div style={{ color: '#888', padding: '1rem 0' }}>ยังไม่มีรายงาน</div>
        ) : (
          reports.map(r => {
            const receiverUser = users.find(u => u.id === r.receiver);
            const petObj = pets.find(p => p.id === r.pet);
            return (
              <div className="report-sent-card" key={r.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '80px' }}>
                <b>{petObj ? petObj.name : r.pet}</b>{petObj && petObj.breed ? ` (${petObj.breed})` : ''} - {r.problem}
                <div>รายละเอียด: {r.detail || 'ไม่มีรายละเอียดเพิ่มเติม'}</div>
                <div>ส่งถึง: <span role="img" aria-label="receiver"></span> {receiverUser ? `${receiverUser.username} (${receiverUser.role})` : r.receiver}</div>
                <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                  <span className="report-delete" onClick={() => handleDelete(r.id)}>ลบ</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Report; 