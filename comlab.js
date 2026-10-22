window.ComLabStore = (() => {
  const reservationsKey = 'comlab-reservations-v1';
  const studentsKey = 'comlab-students-v1';
  const labsKey = 'comlab-labs-v1';
  const settingsKey = 'comlab-settings-v1';

  const starterReservations = [
    { ref: 'RES-2026-89102', student: 'Joshua Dela Cruz', id: '03-2023-01928', lab: 'Computer Lab 1', pc: 'PC-08', slot: '09:00 AM – 10:30 AM', status: 'Active' },
    { ref: 'RES-2026-89103', student: 'Angela Santos', id: '03-2024-00671', lab: 'Computer Lab 2', pc: 'PC-17', slot: '09:00 AM – 10:30 AM', status: 'Reserved' },
    { ref: 'RES-2026-89104', student: 'Mark Villanueva', id: '03-2022-01442', lab: 'Computer Lab 1', pc: 'PC-02', slot: '10:30 AM – 12:00 PM', status: 'Pending' },
    { ref: 'RES-2026-89105', student: 'Sofia Reyes', id: '03-2024-00812', lab: 'Computer Lab 3', pc: 'PC-21', slot: '01:00 PM – 02:30 PM', status: 'Cancelled' },
    { ref: 'RES-2026-89106', student: 'Daniel Lim', id: '03-2023-01105', lab: 'Computer Lab 1', pc: 'PC-14', slot: '01:00 PM – 02:30 PM', status: 'Active' }
  ];
  const starterStudents = [
    { id: '03-2023-01928', name: 'Joshua Dela Cruz' },
    { id: '03-2024-00671', name: 'Angela Santos' },
    { id: '03-2022-01442', name: 'Mark Villanueva' },
    { id: '03-2024-00812', name: 'Sofia Reyes' },
    { id: '03-2023-01105', name: 'Daniel Lim' }
  ];

  function read(key, fallback) {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function reservations() {
    const saved = read(reservationsKey, null);
    if (saved !== null) return saved;
    write(reservationsKey, starterReservations);
    return starterReservations.map(item => ({ ...item }));
  }

  function students() {
    const saved = read(studentsKey, null);
    if (saved !== null) return saved;
    write(studentsKey, starterStudents);
    return starterStudents.map(item => ({ ...item }));
  }

  function labs() {
    const saved = read(labsKey, null);
    if (saved !== null) {
      let changed = false;
      const migrated = saved.map(lab => {
        if (Array.isArray(lab.offlinePCs) && typeof lab.closed === 'boolean') return lab;
        changed = true;
        const capacity = Number(lab.capacity) || 0;
        const offlinePCs = Array.isArray(lab.offlinePCs)
          ? lab.offlinePCs
          : Array.from({ length: Math.min(Number(lab.offline) || 0, capacity) }, (_, index) => `PC-${String(capacity - index).padStart(2, '0')}`);
        return { ...lab, offlinePCs, closed: typeof lab.closed === 'boolean' ? lab.closed : lab.available === 0 };
      });
      if (changed) write(labsKey, migrated);
      return migrated;
    }
    const initial = [
      { name: 'Computer Lab 1', location: 'Building A · Room 204', capacity: 30, available: 18, offline: 2, offlinePCs: ['PC-29', 'PC-30'], closed: false },
      { name: 'Computer Lab 2', location: 'Building A · Room 205', capacity: 30, available: 4, offline: 1, offlinePCs: ['PC-30'], closed: false },
      { name: 'Computer Lab 3', location: 'Building B · Room 101', capacity: 30, available: 0, offline: 0, offlinePCs: [], closed: true }
    ];
    write(labsKey, initial);
    return initial;
  }

  function settings() {
    const saved = read(settingsKey, null);
    if (saved !== null) return saved;
    const initial = { sameDay: true, automaticExpiry: true, maintenanceAlerts: true };
    write(settingsKey, initial);
    return initial;
  }

  function saveReservations(items) {
    write(reservationsKey, items);
  }

  function saveStudents(items) {
    write(studentsKey, items);
  }

  function saveLabs(items) {
    write(labsKey, items);
  }

  function saveSettings(value) {
    write(settingsKey, value);
  }

  function nextReference() {
    return `RES-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`;
  }

  function isAvailable(lab, pc, slot) {
    const room = labs().find(item => item.name === lab);
    if (!room || room.closed || room.offlinePCs?.includes(pc)) return false;
    return !reservations().some(item => item.lab === lab && item.pc === pc && item.slot === slot && item.status !== 'Cancelled');
  }

  return { reservations, students, labs, settings, saveReservations, saveStudents, saveLabs, saveSettings, nextReference, isAvailable };
})();
