import React, { useEffect, useState } from 'react';
import { rtdb } from '../firebase';
import { ref, onValue, remove } from 'firebase/database';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';


const Notification = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [pets, setPets] = useState([]);
  const [users, setUsers] = useState([]);

  // โหลดรายงานทั้งหมดจาก rtdb
  useEffect(() => {
    if (!user) return;
    const reportsRef = ref(rtdb, 'reports');
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      const data = snapshot.val();
      const reportsData = [];
      if (data) {
        Object.entries(data).forEach(([key, value]) => {
          if (value.receiver === user.uid) {
            reportsData.push({ id: key, ...value });
          }
          
        });
      }
      setReports(reportsData);
    });
    return () => unsubscribe();
  }, [user]);

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

  // โหลดรายชื่อผู้ใช้ทั้งหมด
  useEffect(() => {
    const fetchUsers = async () => {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersData = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() });
      });
      setUsers(usersData);
    };
    fetchUsers();
  }, []);

  const handleAccept = (id) => {
    remove(ref(rtdb, 'reports/' + id));
  };
  const handleReject = (id) => {
    remove(ref(rtdb, 'reports/' + id));
  };

  return (
    <div>
      
      <h1 style={{ fontWeight: 'bold', fontSize: '2rem', marginBottom: '2rem' }}>การแจ้งเตือน</h1>
      <div style={{ maxWidth: 'auto', margin: '0 auto' }}>
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px #0001', padding: '2rem' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: 16 }}>กล่องแจ้งเตือน</div>
          {reports.length === 0 ? (
            <div style={{ color: '#888', padding: '1rem 0' }}>ยังไม่มีแจ้งเตือน</div>
          ) : (
            reports.map(r => {
              const petObj = pets.find(p => p.id === r.pet);
              const senderUser = users.find(u => u.id === r.sender);
              return (
                <div key={r.id} style={{ background: '#f2f2f2', borderRadius: 10, padding: '1.2rem 2rem', marginBottom: 20, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <b>{petObj ? petObj.name : r.pet}</b>{petObj && petObj.breed ? ` (${petObj.breed})` : ''} - {r.problem}
                    <div>รายละเอียด: {r.detail || '-'}</div>
                    <div style={{ fontSize: '0.95rem', color: '#666', marginTop: 4 }}>
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('th-TH') : ''} {senderUser ? <span style={{ color: '#357abd', marginLeft: 8 }}>{senderUser.username} ({senderUser.role})</span> : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'green', fontSize: 28, cursor: 'pointer' }} title="รับแจ้งเตือน" onClick={() => handleAccept(r.id)}>&#10004;</span>
                    {/* <span style={{ color: 'red', fontSize: 28, cursor: 'pointer' }} title="ปฏิเสธ" onClick={() => handleReject(r.id)}>&#10006;</span> */}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default Notification; 