(() => {
  const titleMap = { overview: 'Operations overview', reservations: 'Reservations', labs: 'Labs & workstations', users: 'Students', settings: 'Settings' };
  const settingsKeys = ['sameDay', 'automaticExpiry', 'maintenanceAlerts'];
  const sections = document.querySelectorAll('.section-panel');
  const links = document.querySelectorAll('.sidebar-link');
  const slot = '09:00 AM – 10:30 AM';
  let toastTimer;

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.querySelector('span').textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 2500);
  }

  function openFormDialog(title, fields, onSave) {
    const dialog = document.getElementById('admin-dialog');
    const form = document.getElementById('admin-dialog-form');
    const error = document.getElementById('dialog-error');
    document.getElementById('dialog-title').textContent = title;
    error.classList.add('hidden');
    document.getElementById('dialog-fields').innerHTML = fields.map(field => {
      const control = field.type === 'select'
        ? `<select name="${escapeHTML(field.name)}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">${field.options.map(option => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join('')}</select>`
        : `<input name="${escapeHTML(field.name)}" type="${escapeHTML(field.type || 'text')}" value="${escapeHTML(field.value || '')}" placeholder="${escapeHTML(field.placeholder || '')}" ${field.required === false ? '' : 'required'} ${field.min ? `min="${field.min}"` : ''} ${field.max ? `max="${field.max}"` : ''} class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-900 focus:outline-none">`;
      return `<div><label class="block text-xs font-bold text-slate-600 uppercase mb-1">${escapeHTML(field.label)}</label>${control}</div>`;
    }).join('');
    form.onsubmit = event => {
      event.preventDefault();
      const values = Object.fromEntries([...form.querySelectorAll('[name]')].map(input => [input.name, input.value.trim()]));
      const message = onSave(values);
      if (message) {
        error.textContent = message;
        error.classList.remove('hidden');
        return;
      }
      dialog.close();
    };
    dialog.showModal();
  }

  document.getElementById('dialog-close').addEventListener('click', () => document.getElementById('admin-dialog').close());
  document.getElementById('dialog-cancel').addEventListener('click', () => document.getElementById('admin-dialog').close());

  function availableCount(lab) {
    if (lab.closed) return 0;
    let available = 0;
    for (let index = 1; index <= lab.capacity; index += 1) {
      const pc = `PC-${String(index).padStart(2, '0')}`;
      if (ComLabStore.isAvailable(lab.name, pc, slot)) available += 1;
    }
    return available;
  }

  function statusStyle(status) {
    return { Active: 'bg-emerald-100 text-emerald-700', Reserved: 'bg-blue-100 text-blue-700', Pending: 'bg-amber-100 text-amber-700', Cancelled: 'bg-rose-100 text-rose-700' }[status] || 'bg-slate-100 text-slate-700';
  }

  function renderReservations() {
    const reservations = ComLabStore.reservations();
    const query = document.getElementById('reservation-search').value.trim().toLowerCase();
    const filter = document.getElementById('status-filter').value;
    const filtered = reservations.filter(item => (filter === 'all' || item.status.toLowerCase() === filter) && `${item.ref} ${item.student} ${item.id} ${item.lab} ${item.pc}`.toLowerCase().includes(query));
    document.getElementById('reservation-list').innerHTML = filtered.map(item => `<tr><td class="px-5 py-4 font-semibold text-blue-900">#${escapeHTML(item.ref)}</td><td class="px-5 py-4"><p class="font-semibold">${escapeHTML(item.student)}</p><p class="text-xs text-slate-400">${escapeHTML(item.id)}</p></td><td class="px-5 py-4">${escapeHTML(item.lab)}<span class="text-xs text-slate-400"> / ${escapeHTML(item.pc)}</span></td><td class="px-5 py-4 text-xs">${escapeHTML(item.slot)}</td><td class="px-5 py-4"><span class="${statusStyle(item.status)} px-2 py-1 rounded-full text-xs font-bold">${escapeHTML(item.status)}</span></td><td class="px-5 py-4 text-right whitespace-nowrap">${item.status === 'Pending' ? `<button data-approve="${escapeHTML(item.ref)}" class="mr-3 text-emerald-600 hover:text-emerald-800" title="Approve reservation" aria-label="Approve reservation"><i class="fa-solid fa-circle-check"></i></button>` : ''}<button data-cancel="${escapeHTML(item.ref)}" class="text-slate-400 hover:text-rose-600 disabled:opacity-30" title="Cancel reservation" aria-label="Cancel reservation" ${item.status === 'Cancelled' ? 'disabled' : ''}><i class="fa-solid fa-ban"></i></button></td></tr>`).join('');
    document.getElementById('empty-results').classList.toggle('hidden', filtered.length > 0);
    document.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', () => {
      const item = ComLabStore.reservations().find(reservation => reservation.ref === button.dataset.cancel);
      if (!item || item.status === 'Cancelled' || !confirm(`Cancel reservation ${item.ref}?`)) return;
      item.status = 'Cancelled';
      ComLabStore.saveReservations(ComLabStore.reservations().map(reservation => reservation.ref === item.ref ? item : reservation));
      renderAll();
      showToast('Reservation cancelled; workstation released');
    }));
    document.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => {
      const reservations = ComLabStore.reservations();
      const item = reservations.find(reservation => reservation.ref === button.dataset.approve);
      if (!item || item.status !== 'Pending') return;
      item.status = 'Reserved';
      ComLabStore.saveReservations(reservations);
      renderAll();
      showToast('Reservation approved');
    }));
  }

  function renderLabs() {
    const container = document.getElementById('lab-list');
    container.replaceChildren();
    document.querySelectorAll('#labs > article').forEach(card => card.remove());
    ComLabStore.labs().forEach((lab, index) => {
      const available = availableCount(lab);
      const percent = lab.capacity ? Math.round((available / lab.capacity) * 100) : 0;
      const offline = (lab.offlinePCs || []).length;
      const card = document.createElement('article');
      card.className = 'bg-white border border-slate-200 rounded-xl shadow-sm p-5';
      card.innerHTML = `<div class="flex justify-between gap-3"><div><h3 class="font-bold text-blue-950">${escapeHTML(lab.name)}</h3><p class="text-xs text-slate-500 mt-1">${escapeHTML(lab.location)}</p></div><span class="${lab.closed ? 'bg-rose-100 text-rose-700' : percent < 20 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} px-2 py-1 rounded-full h-fit text-xs font-bold">${lab.closed ? 'Closed' : percent < 20 ? 'High usage' : 'Open'}</span></div><div class="grid grid-cols-3 gap-2 my-6 text-center"><div><p class="text-xl font-bold text-blue-950">${lab.capacity}</p><p class="text-[11px] text-slate-500">Total PCs</p></div><div><p class="text-xl font-bold text-emerald-600">${available}</p><p class="text-[11px] text-slate-500">Available</p></div><div><p class="text-xl font-bold text-rose-600">${offline}</p><p class="text-[11px] text-slate-500">Offline</p></div></div><div class="h-2 bg-slate-100 rounded-full mb-4"><div class="h-2 ${percent < 20 ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full" style="width:${percent}%"></div></div><div class="grid grid-cols-2 gap-2"><button data-manage-pcs="${index}" class="border border-slate-300 rounded-lg py-2 text-xs font-semibold hover:bg-slate-50">Manage PCs</button><button data-edit-lab="${index}" class="border border-slate-300 rounded-lg py-2 text-xs font-semibold hover:bg-slate-50">Edit details</button><button data-toggle-lab="${index}" class="col-span-2 ${lab.closed ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-slate-700 hover:bg-slate-800'} text-white rounded-lg py-2 text-xs font-semibold">${lab.closed ? 'Open laboratory' : 'Close laboratory'}</button></div>`;
      container.appendChild(card);
    });
    container.querySelectorAll('[data-manage-pcs]').forEach(button => button.addEventListener('click', () => {
      const labIndex = Number(button.dataset.managePcs);
      const lab = ComLabStore.labs()[labIndex];
      openFormDialog(`Manage PCs · ${lab.name}`, [
        { name: 'pc', label: 'Workstation ID', value: 'PC-01' },
        { name: 'action', label: 'Maintenance action', type: 'select', options: [{ value: 'offline', label: 'Mark offline' }, { value: 'online', label: 'Restore online' }] }
      ], values => {
        const number = Number(values.pc.toUpperCase().replace(/^PC-?/, ''));
        if (!Number.isInteger(number) || number < 1 || number > lab.capacity) return `Enter a workstation from PC-01 to PC-${String(lab.capacity).padStart(2, '0')}.`;
        const labs = ComLabStore.labs();
        const currentLab = labs[labIndex];
        const workstation = `PC-${String(number).padStart(2, '0')}`;
        currentLab.offlinePCs = currentLab.offlinePCs || [];
        const isOffline = currentLab.offlinePCs.includes(workstation);
        if (values.action === 'offline' && !isOffline) currentLab.offlinePCs.push(workstation);
        if (values.action === 'online' && isOffline) currentLab.offlinePCs = currentLab.offlinePCs.filter(pc => pc !== workstation);
        ComLabStore.saveLabs(labs);
        renderAll();
        showToast(`${workstation} ${values.action === 'offline' ? 'marked offline' : 'restored'}`);
        return '';
      });
    }));
    container.querySelectorAll('[data-edit-lab]').forEach(button => button.addEventListener('click', () => {
      const labIndex = Number(button.dataset.editLab);
      const lab = ComLabStore.labs()[labIndex];
      openFormDialog('Edit laboratory', [
        { name: 'location', label: 'Location', value: lab.location },
        { name: 'capacity', label: 'Number of workstations', type: 'number', value: String(lab.capacity), min: 1, max: 200 }
      ], values => {
        const capacity = Number(values.capacity);
        if (!values.location || !Number.isInteger(capacity) || capacity < 1 || capacity > 200) return 'Enter a location and a whole-number capacity from 1 to 200.';
        const labs = ComLabStore.labs();
        const currentLab = labs[labIndex];
        currentLab.location = values.location;
        currentLab.capacity = capacity;
        currentLab.offlinePCs = (currentLab.offlinePCs || []).filter(pc => Number(pc.slice(3)) <= capacity);
        ComLabStore.saveLabs(labs);
        renderAll();
        showToast('Laboratory details saved');
        return '';
      });
    }));
    container.querySelectorAll('[data-toggle-lab]').forEach(button => button.addEventListener('click', () => {
      const labs = ComLabStore.labs();
      const lab = labs[Number(button.dataset.toggleLab)];
      lab.closed = !lab.closed;
      ComLabStore.saveLabs(labs);
      renderAll();
      showToast(`${lab.name} ${lab.closed ? 'closed' : 'opened'}`);
    }));
  }

  function renderStudents() {
    const section = document.getElementById('users');
    section.innerHTML = `<div><p class="text-teal-600 text-xs font-bold uppercase tracking-wider">Account management</p><h2 class="text-2xl font-bold text-blue-950 mt-1">Students</h2><p class="text-sm text-slate-500 mt-1">Student records created by bookings or imported from a CSV list.</p></div><div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"><div class="p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-3 justify-between"><input id="student-search" type="search" placeholder="Search by student name or ID" class="w-full sm:max-w-md border border-slate-300 rounded-lg px-3 py-2 text-sm"><div class="flex gap-2"><input id="student-file" type="file" accept=".csv,text/csv" class="hidden"><button id="import-students" class="bg-blue-900 text-white rounded-lg px-3 py-2 text-sm font-bold hover:bg-blue-800"><i class="fa-solid fa-upload mr-2"></i>Import CSV</button><button id="export-students" class="border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-50"><i class="fa-solid fa-download mr-2"></i>Export</button></div></div><div class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th class="px-5 py-3">Student</th><th class="px-5 py-3">Student ID</th><th class="px-5 py-3">Reservations</th></tr></thead><tbody id="student-list" class="divide-y divide-slate-100"></tbody></table></div><p id="empty-students" class="hidden p-8 text-center text-slate-500 text-sm">No student records match this search.</p><p class="px-5 py-3 border-t border-slate-100 text-xs text-slate-500">CSV columns: student ID, student name</p></div>`;
    const draw = () => {
      const query = document.getElementById('student-search').value.trim().toLowerCase();
      const reservations = ComLabStore.reservations();
      const students = ComLabStore.students().filter(student => `${student.name} ${student.id}`.toLowerCase().includes(query));
      document.getElementById('student-list').innerHTML = students.map(student => `<tr><td class="px-5 py-4 font-semibold">${escapeHTML(student.name)}</td><td class="px-5 py-4">${escapeHTML(student.id)}</td><td class="px-5 py-4">${reservations.filter(item => item.id === student.id && item.status !== 'Cancelled').length}</td></tr>`).join('');
      document.getElementById('empty-students').classList.toggle('hidden', students.length > 0);
    };
    document.getElementById('student-search').addEventListener('input', draw);
    document.getElementById('import-students').addEventListener('click', () => document.getElementById('student-file').click());
    document.getElementById('student-file').addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const existing = ComLabStore.students();
        const byId = new Map(existing.map(student => [student.id, student]));
        const rows = String(reader.result).split(/\r?\n/).filter(Boolean);
        rows.forEach((row, index) => {
          if (index === 0 && /student\s*id|^id\s*,/i.test(row)) return;
          const [idValue, ...nameParts] = row.split(',');
          const id = (idValue || '').trim().replace(/^"|"$/g, '');
          const name = nameParts.join(',').trim().replace(/^"|"$/g, '');
          if (id && name) byId.set(id, { id, name });
        });
        ComLabStore.saveStudents([...byId.values()]);
        draw();
        showToast('Student list imported');
        event.target.value = '';
      };
      reader.readAsText(file);
    });
    document.getElementById('export-students').addEventListener('click', () => {
      const rows = [['Student ID', 'Student Name'], ...ComLabStore.students().map(student => [student.id, student.name])];
      const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'comlab-students.csv';
      link.click();
      URL.revokeObjectURL(url);
    });
    draw();
  }

  function renderSettings() {
    const values = ComLabStore.settings();
    document.querySelectorAll('#settings input[type="checkbox"]').forEach((input, index) => {
      const key = settingsKeys[index];
      input.checked = Boolean(values[key]);
      input.addEventListener('change', () => {
        const updated = ComLabStore.settings();
        updated[key] = input.checked;
        ComLabStore.saveSettings(updated);
        showToast('Reservation settings saved');
      });
    });
  }

  function renderOverview() {
    const reservations = ComLabStore.reservations();
    const labs = ComLabStore.labs();
    const metrics = document.querySelectorAll('#overview .grid.grid-cols-1.sm\\:grid-cols-2.xl\\:grid-cols-4 > div');
    const active = reservations.filter(item => item.status === 'Active' || item.status === 'Reserved').length;
    const occupied = reservations.filter(item => item.status === 'Active').length;
    const totalPCs = labs.reduce((total, lab) => total + lab.capacity, 0);
    const available = labs.reduce((total, lab) => total + availableCount(lab), 0);
    const pending = reservations.filter(item => item.status === 'Pending').length;
    const figures = [active, `${occupied} / ${totalPCs}`, available, pending];
    metrics.forEach((metric, index) => {
      const figure = metric.querySelector('.text-3xl');
      if (figure) figure.textContent = figures[index];
    });
    const recentBody = document.querySelector('#overview table tbody');
    recentBody.innerHTML = reservations.slice(0, 5).map(item => `<tr><td class="px-5 py-4"><p class="font-semibold">${escapeHTML(item.student)}</p><p class="text-xs text-slate-400">${escapeHTML(item.id)}</p></td><td class="px-5 py-4">${escapeHTML(item.lab)} <span class="text-xs text-slate-400">/ ${escapeHTML(item.pc)}</span></td><td class="px-5 py-4 text-xs">${escapeHTML(item.slot)}</td><td class="px-5 py-4"><span class="${statusStyle(item.status)} px-2 py-1 rounded-full text-xs font-bold">${escapeHTML(item.status)}</span></td></tr>`).join('');
    const statusPanel = document.querySelector('#overview .xl\\:grid-cols-3 > div:last-child .p-5');
    statusPanel.innerHTML = `${labs.map(lab => {
      const count = availableCount(lab);
      const percent = lab.capacity ? Math.round((count / lab.capacity) * 100) : 0;
      return `<div><div class="flex justify-between text-sm mb-2"><span class="font-semibold">${escapeHTML(lab.name)}</span><span class="${percent < 20 ? 'text-amber-600' : 'text-emerald-600'} font-bold">${count} / ${lab.capacity} free</span></div><div class="h-2 bg-slate-100 rounded-full"><div class="h-2 ${percent < 20 ? 'bg-amber-500' : 'bg-emerald-500'} rounded-full" style="width:${percent}%"></div></div></div>`;
    }).join('')}<button data-section-link="labs" class="w-full mt-1 border border-slate-300 rounded-lg py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Manage laboratories</button>`;
    statusPanel.querySelector('[data-section-link]').addEventListener('click', () => showSection('labs'));
    const badge = document.querySelector('.sidebar-link[data-section="reservations"] span');
    if (badge) badge.textContent = String(pending);
  }

  function renderAll() {
    renderOverview();
    renderReservations();
    renderLabs();
    renderStudents();
  }

  function showSection(name) {
    if (!titleMap[name]) return;
    sections.forEach(section => section.classList.toggle('hidden', section.id !== name));
    links.forEach(link => link.classList.toggle('active', link.dataset.section === name));
    document.getElementById('page-title').textContent = titleMap[name];
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('scrim').classList.add('hidden');
    if (name === 'users') renderStudents();
  }

  links.forEach(link => link.addEventListener('click', () => showSection(link.dataset.section)));
  document.querySelectorAll('[data-section-link]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.sectionLink)));
  document.getElementById('menu-button').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('-translate-x-full');
    document.getElementById('scrim').classList.remove('hidden');
  });
  document.getElementById('scrim').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('scrim').classList.add('hidden');
  });
  document.getElementById('reservation-search').addEventListener('input', renderReservations);
  document.getElementById('status-filter').addEventListener('change', renderReservations);
  document.querySelector('[data-action="refresh"]').addEventListener('click', event => {
    const icon = event.currentTarget.querySelector('i');
    icon.classList.add('fa-spin');
    renderAll();
    setTimeout(() => icon.classList.remove('fa-spin'), 500);
    showToast('Dashboard data refreshed');
  });
  document.querySelector('#labs > div:first-of-type button').addEventListener('click', () => {
    openFormDialog('Add laboratory', [
      { name: 'name', label: 'Laboratory name' },
      { name: 'location', label: 'Location' },
      { name: 'capacity', label: 'Number of workstations', type: 'number', value: '30', min: 1, max: 200 }
    ], values => {
      const capacity = Number(values.capacity);
      if (!values.name || !values.location || !Number.isInteger(capacity) || capacity < 1 || capacity > 200) return 'Complete all fields and enter a whole-number capacity from 1 to 200.';
      const labs = ComLabStore.labs();
      if (labs.some(lab => lab.name.toLowerCase() === values.name.toLowerCase())) return 'A laboratory with that name already exists.';
      labs.push({ name: values.name, location: values.location, capacity, available: capacity, offline: 0, offlinePCs: [], closed: false });
      ComLabStore.saveLabs(labs);
      renderAll();
      showToast('Laboratory added');
      return '';
    });
  });
  document.querySelector('[aria-label="Notifications"]').addEventListener('click', () => {
    const count = ComLabStore.reservations().filter(item => item.status === 'Pending').length;
    showToast(count ? `${count} reservation${count === 1 ? '' : 's'} need review` : 'No pending reservation actions');
  });
  window.addEventListener('storage', renderAll);
  document.getElementById('current-date').textContent = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  renderSettings();
  renderAll();
})();
