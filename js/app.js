/**
 * Main Application Logic
 */

const app = (function() {
    let currentView = 'view-home';
    let activeMappingCourse = null;
    let currentMappingHoleIdx = 1;
    let deferredPrompt = null;

    async function init() {
         console.log("App initializing...");
         
         if (window.AuthApp) {
             const loggedIn = await window.AuthApp.checkSession();
             if (!loggedIn) {
                  navigate('view-auth');
                  return; 
             }
             const user = window.AuthApp.getUser();
             if(user) {
                 document.getElementById('user-display-email').innerText = user.email;
                 
                 // CORREÇÃO: Atualizar o rótulo de cargo (Admin vs Jogador)
                 const role = window.AuthApp.getRole();
                 const roleLabel = document.getElementById('user-display-role');
                 if (roleLabel) {
                     roleLabel.innerText = role === 'admin' ? 'Administrador' : 'Jogador';
                     roleLabel.style.color = role === 'admin' ? 'var(--accent-primary)' : 'var(--text-secondary)';
                 }
             }
         }
        
        await renderActiveMatches();

        // Role-based UI visibility
        const isAdmin = window.AuthApp.isAdmin();
        const adminSection = document.getElementById('admin-sidebar-section');
        if (adminSection) adminSection.style.display = isAdmin ? 'block' : 'none';

        navigate('view-home');
        db.syncPullCourses();

        // PWA Install Logic
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            const installBtn = document.getElementById('pwa-install-btn');
            if (installBtn) installBtn.style.display = 'block';
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            const installBtn = document.getElementById('pwa-install-btn');
            if (installBtn) installBtn.style.display = 'none';
            console.log('PWA instalado com sucesso!');
        });

        // Register Service Worker for PWA Offline mode
        if ('serviceWorker' in navigator) {
             try {
                  const registration = await navigator.serviceWorker.register('sw.js');
                  console.log('ServiceWorker registered:', registration.scope);
                  
                  // Detecção de atualização do Service Worker
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                      console.log('Novo conteúdo disponível, recarregando...');
                      window.location.reload();
                  });
             } catch (e) {
                  console.error('ServiceWorker registration failed:', e);
             }
        }
    }

    async function installPwa() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install: ${outcome}`);
        deferredPrompt = null;
        const installBtn = document.getElementById('pwa-install-btn');
        if (installBtn) installBtn.style.display = 'none';
    }

    function navigate(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Show target view
        const target = document.getElementById(viewId);
        const previousView = currentView;
        if (target) {
            target.classList.add('active');
            currentView = viewId;
        }

        // View-specific logic
        if (viewId === 'view-courses') {
             renderCourseList();
        } else if (viewId === 'view-course-editor') {
             initCourseEditor();
        } else if (viewId === 'view-new-match' && previousView !== 'view-new-match') {
             setTimeout(() => ScorecardApp.initNewMatchView(), 0);
        } else if (viewId === 'view-history' && previousView !== 'view-history') {
             setTimeout(() => HistoryApp.initHistoryView(), 0);
        } else if (viewId === 'view-admin-panel') {
             renderAdminPanel();
        }
    }

    async function renderActiveMatches() {
        const container = document.getElementById('active-matches-container');
        if (!container) return;
        
        const activeMatches = await db.getAllActiveMatches();
        
        if (activeMatches.length > 0) {
            container.innerHTML = activeMatches.map(m => `
                <div class="primary-card" style="background:linear-gradient(135deg, var(--bg-secondary), var(--accent-glow)); border-color:var(--accent-primary);" onclick="ScorecardApp.resumeActive('${m.id}')">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="text-align:left;">
                            <h3 style="font-size:1.2rem; margin-bottom:4px;">${m.courseName || 'Partida Ativa'}</h3>
                            <p style="color:var(--text-primary); font-size:0.9rem;">Buraco ${m.currentHole || 1} • Em Progresso</p>
                        </div>
                        <button class="icon-btn" style="background:var(--accent-primary); border-radius:12px; padding:8px 16px; color:white; font-weight:700; width:auto; height:auto; font-size:0.8rem;">RETOMAR</button>
                    </div>
                </div>
            `).join('');
            container.style.display = 'flex';
        } else {
            container.style.display = 'none';
            container.innerHTML = '';
        }
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('user-sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    }

    // --- Course Views Logic ---
    async function renderCourseList() {
        const listContainer = document.getElementById('courses-list');
        listContainer.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">Carregando...</p>';
        
        const courses = await db.getCourses();
        
        if (courses.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding: 40px 0;">
                    <p style="color:var(--text-secondary); margin-bottom: 16px;">Não há campos cadastrados.</p>
                    ${window.AuthApp.isAdmin() ? `
                        <button class="primary-card" style="width:100%;text-align:center" onclick="app.navigate('view-course-editor')">
                             Criar Meu Primeiro Campo
                        </button>
                    ` : `
                        <button class="secondary-card" style="width:100%;text-align:center" onclick="app.navigate('view-requests')">
                             Sugerir Novo Campo 📍
                        </button>
                    `}
                </div>
            `;
            return;
        }

        const isAdmin = window.AuthApp.isAdmin();
        listContainer.innerHTML = courses.map(c => `
             <div class="secondary-card" style="margin-bottom:12px; display:flex; flex-direction:column; gap:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                       <div>
                           <h3 style="font-size:1.1rem;margin-bottom:4px;">${c.name}</h3>
                           <p style="font-size:0.8rem;color:var(--text-secondary);">${c.city || 'S/ Cidade'} • Par ${c.totalPar || '--'} • ${c.holes ? c.holes.length : 0} Buracos</p>
                       </div>
                       ${isAdmin ? `<button class="icon-btn" style="color:var(--danger);font-size:1.2rem;" onclick="app.deleteCourseUi('${c.id}')">🗑️</button>` : ''}
                  </div>
                  <div style="display:flex; gap:8px;">
                       <button class="primary-card" style="flex:1; padding:10px;text-align:center;font-size:0.9rem;" onclick="ScorecardApp.initNewMatchView('${c.id}')">
                            🏁 Iniciar Partida
                       </button>
                       ${isAdmin ? `
                            <button class="secondary-card" style="flex:1; padding:10px;text-align:center;font-size:0.9rem;" onclick="app.resumeCourseMapping('${c.id}')">
                                 ⚙️ Editar
                            </button>
                       ` : ''}
                  </div>
             </div>
        `).join('');
    }

    async function deleteCourseUi(id) {
         if (confirm('Tem certeza que deseja apagar este campo completamente?')) {
              await db.deleteCourse(id);
              renderCourseList();
         }
    }

    function initCourseEditor() {
         if (!window.AuthApp.isAdmin()) {
             alert("Acesso restrito a administradores.");
             navigate('view-courses');
             return;
         }
         const editorSection = document.getElementById('view-course-editor');
         editorSection.innerHTML = `
            <div class="view-header">
                <button class="icon-btn back-btn" onclick="app.navigate('view-courses')">⬅</button>
                <h2>Novo Campo</h2>
            </div>
            <div class="form-group" style="display:flex;flex-direction:column;gap:16px;">
                 <label>Nome do Campo</label>
                 <input type="text" id="course-name" style="padding:16px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-subtle);color:white;font-size:1rem;" placeholder="Ex: Graciosa Country Club"/>
                 
                 <label>Localização (Cidade, Estado)</label>
                 <input type="text" id="course-city" style="padding:16px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-subtle);color:white;font-size:1rem;" placeholder="Ex: Francisco Beltrão - PR"/>
 
                 <label>Formato Físico do Campo</label>
                 <select id="course-format" style="padding:16px;border-radius:12px;background:var(--bg-secondary);color:white;border:1px solid var(--border-subtle);font-size:1rem;">
                      <option value="6">6 Buracos Físicos</option>
                      <option value="9">9 Buracos Físicos</option>
                      <option value="18" selected>18 Buracos Físicos</option>
                 </select>
 
                 <button class="primary-card" style="text-align:center;margin-top:8px;background:var(--accent-primary);color:#fff;" onclick="app.startCourseMapping()">
                      Iniciar Mapeamento 🗺️
                 </button>
                 
                 <div style="border-top:1px solid var(--border-subtle); margin-top:8px; padding-top:16px;">
                      <label style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:8px; display:block;">[Opcional] Mapeamento Rápido (CSV)</label>
                      <input type="file" id="course-csv-upload" accept=".csv,.txt" style="display:none;" onchange="app.handleCsvUpload(event)">
                      <button class="secondary-card" style="text-align:center; width:100%; font-size:0.9rem; padding:12px;" onclick="document.getElementById('course-csv-upload').click()">
                          Importar Coordenadas via .CSV 📄
                      </button>
                 </div>
            </div>
         `;
    }
    
    async function startCourseMapping() {
        const nameInput = document.getElementById('course-name');
        const cityInput = document.getElementById('course-city');
        const formatInput = document.getElementById('course-format');
        
        if (!nameInput.value.trim() || !cityInput.value.trim()) {
            alert('Por favor, informe Nome e Cidade.');
            return;
        }

        activeMappingCourse = {
            id: `course_${Date.now()}`,
            name: nameInput.value.trim(),
            city: cityInput.value.trim(),
            physicalHoles: parseInt(formatInput.value, 10),
            holes: [],
            totalPar: 0
        };

        currentMappingHoleIdx = 1;
        document.getElementById('mapper-instruction').innerText = 'Localizando cidade no GPS... Aguarde.';
        navigate('view-course-mapper');
        document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
        document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;
        
        let centerLatLng = [-23.5505, -46.6333];
        try {
            const query = encodeURIComponent(activeMappingCourse.city);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
            const data = await response.json();
            if(data && data.length > 0) {
                 centerLatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            }
        } catch (e) { console.error(e); }

        document.getElementById('mapper-instruction').innerText = 'Selecione o ponto e toque no mapa para fixar.';
        loadMapperHole(currentMappingHoleIdx, centerLatLng);
    }

    async function resumeCourseMapping(courseId) {
        const course = await db.getCourse(courseId);
        if(!course) return;

        activeMappingCourse = course;
        currentMappingHoleIdx = 1;
        navigate('view-course-mapper');
        document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
        document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;

        let centerLatLng = [-23.5505, -46.6333];
        try {
            const query = encodeURIComponent(activeMappingCourse.city);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
            const data = await response.json();
            if(data && data.length > 0) { centerLatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)]; }
        } catch (e) { console.error(e); }

        loadMapperHole(currentMappingHoleIdx, centerLatLng);
    }

    function loadMapperHole(holeNum, centerLatLng = null) {
        currentMappingHoleIdx = holeNum;
        const scrollContainer = document.getElementById('mapper-holes-scroll');
        let html = '';
        for(let i=1; i<=activeMappingCourse.physicalHoles; i++) {
             const hasData = activeMappingCourse.holes.find(h => h.number === i && h.points.greenCenter);
             const badgeColor = i === holeNum ? 'var(--accent-primary)' : (hasData ? '#10B981' : 'var(--bg-glass)');
             const isSelected = i === holeNum ? 'border:2px solid #fff;' : 'border:none;';
             html += `<div style="padding:10px 16px; border-radius:12px; background:${badgeColor}; color:white; font-weight:700; cursor:pointer; flex-shrink:0; ${isSelected}" onclick="app.switchMapperHole(${i})">Buraco ${i}</div>`;
        }
        scrollContainer.innerHTML = html;

        if (!window.GolfMap.isInitialized()) {
             window.GolfMap.initMap('course-map-container', centerLatLng || [-23.5505, -46.6333]);
        } else {
             if (centerLatLng && holeNum === 1) { 
                 window.GolfMap.initMap('course-map-container', centerLatLng);
             } else {
                 window.GolfMap.resetHolePoints();
             }
        }
        window.GolfMap.loadMapContext(activeMappingCourse.holes, holeNum);
        
        const existingData = activeMappingCourse.holes.find(h => h.number === holeNum);
        if (existingData && existingData.points && existingData.points.greenCenter) {
             document.getElementById('mapper-lat-input').value = existingData.points.greenCenter.lat;
             document.getElementById('mapper-lng-input').value = existingData.points.greenCenter.lng;
        } else {
             document.getElementById('mapper-lat-input').value = "";
             document.getElementById('mapper-lng-input').value = "";
        }
        
        let holePar = 4;
        if (existingData && existingData.par) { holePar = existingData.par; }
        app.setManualPar(holePar);
        
        window.onPointCaptured = function(type) {
             const points = window.GolfMap.getHoleData();
             if (points && points.greenCenter) {
                 document.getElementById('mapper-lat-input').value = points.greenCenter.lat;
                 document.getElementById('mapper-lng-input').value = points.greenCenter.lng;
             }
             persistCurrentPointsIntoMemory();
             loadMapperHoleSilently(currentMappingHoleIdx);
        };
    }

    function loadMapperHoleSilently(holeNum) {
        const scrollContainer = document.getElementById('mapper-holes-scroll');
        let html = '';
        for(let i=1; i<=activeMappingCourse.physicalHoles; i++) {
             const hasData = activeMappingCourse.holes.find(h => h.number === i && h.points.greenCenter);
             const badgeColor = i === holeNum ? 'var(--accent-primary)' : (hasData ? '#10B981' : 'var(--bg-glass)');
             const isSelected = i === holeNum ? 'border:2px solid #fff;' : 'border:none;';
             html += `<div style="padding:10px 16px; border-radius:12px; background:${badgeColor}; color:white; font-weight:700; cursor:pointer; flex-shrink:0; ${isSelected}" onclick="app.switchMapperHole(${i})">Buraco ${i}</div>`;
        }
        scrollContainer.innerHTML = html;
    }

    function applyManualCoords() {
         const lat = parseFloat(document.getElementById('mapper-lat-input').value);
         const lng = parseFloat(document.getElementById('mapper-lng-input').value);
         if (!isNaN(lat) && !isNaN(lng)) {
             let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
             const fixedPoints = { greenCenter: {lat, lng} };
             if (existing) { existing.points = fixedPoints; } else { activeMappingCourse.holes.push({ number: currentMappingHoleIdx, points: fixedPoints }); }
             window.GolfMap.loadMapContext(activeMappingCourse.holes, currentMappingHoleIdx);
             window.GolfMap.setCenter(lat, lng);
             loadMapperHoleSilently(currentMappingHoleIdx);
         }
    }

    function setManualPar(parValue) {
         document.querySelectorAll('.par-btn').forEach(btn => {
              btn.style.background = 'transparent'; btn.style.boxShadow = 'none';
         });
         const targetBtn = document.getElementById(`par-btn-${parValue}`);
         if (targetBtn) {
              targetBtn.style.background = 'var(--accent-primary)'; targetBtn.style.boxShadow = '0 0 12px var(--accent-glow)';
         }
         let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
         if (existing) { existing.par = parValue; } else { activeMappingCourse.holes.push({ number: currentMappingHoleIdx, points: null, par: parValue }); }
    }

    function switchMapperHole(newHoleNum) { persistCurrentPointsIntoMemory(); loadMapperHole(newHoleNum); }
    
    function persistCurrentPointsIntoMemory() {
        const points = window.GolfMap.getHoleData();
        if (!points || !points.greenCenter) return;
        let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
        const pointsClone = JSON.parse(JSON.stringify(points));
        if (existing) { existing.points = pointsClone; } else { activeMappingCourse.holes.push({ number: currentMappingHoleIdx, points: pointsClone }); }
    }

    async function saveMappingProgress() {
        persistCurrentPointsIntoMemory();
        let total = 0;
        activeMappingCourse.holes.forEach(h => { total += (h.par || 4); });
        activeMappingCourse.totalPar = total;
        await db.saveCourse(activeMappingCourse);
        alert('Salvo com sucesso!');
        activeMappingCourse = null;
        navigate('view-courses');
    }

    function cancelMapping() { if(confirm('Cancelar?')) { activeMappingCourse = null; navigate('view-courses'); } }

    async function handleCsvUpload(event) {
         const file = event.target.files[0];
         if (!file) return;
         const nameInput = document.getElementById('course-name');
         const cityInput = document.getElementById('course-city');
         const formatInput = document.getElementById('course-format');
         if (!nameInput.value.trim() || !cityInput.value.trim()) { alert('Informe Nome e Cidade.'); return; }
         const reader = new FileReader();
         reader.onload = async function(e) {
             const text = e.target.result;
             const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
             const phys = parseInt(formatInput.value, 10);
             activeMappingCourse = { id: `course_${Date.now()}`, name: nameInput.value.trim(), city: cityInput.value.trim(), physicalHoles: phys, holes: [], totalPar: 0 };
             for(let i = 0; i < lines.length && i < phys; i++) {
                 const parts = lines[i].split(/[,;]/);
                 if (parts.length >= 2) {
                     const lat = parseFloat(parts[0]); const lng = parseFloat(parts[1]);
                     if (!isNaN(lat) && !isNaN(lng)) { activeMappingCourse.holes.push({ number: i + 1, par: 4, points: { greenCenter: { lat, lng } } }); }
                 }
             }
             await db.saveCourse(activeMappingCourse);
             alert('Importação concluída!');
             currentMappingHoleIdx = 1;
             navigate('view-course-mapper');
             document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
             document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;
             let centerLatLng = activeMappingCourse.holes.length > 0 ? [activeMappingCourse.holes[0].points.greenCenter.lat, activeMappingCourse.holes[0].points.greenCenter.lng] : null;
             loadMapperHole(currentMappingHoleIdx, centerLatLng);
         };
         reader.readAsText(file);
    }

    async function processAuth(isRegistration) {
         const email = document.getElementById('auth-email').value.trim();
         const pass = document.getElementById('auth-pass').value.trim();
         if(!email || !pass || pass.length < 6) { alert('Verifique os dados.'); return; }
         let success = false;
         if(isRegistration) {
             success = await window.AuthApp.register(email, pass);
             if (success) success = await window.AuthApp.login(email, pass);
         } else { success = await window.AuthApp.login(email, pass); }
         if (success) {
             document.getElementById('auth-email').value = '';
             document.getElementById('auth-pass').value = '';
             if (window.db && typeof window.db.syncPullCourses === 'function') { window.db.syncPullCourses(); }
             init();
         }
    }

    async function downloadOfflineMap() {
        if (!activeMappingCourse || !activeMappingCourse.holes) return;
        const bounds = window.GolfMap.getCourseBounds(activeMappingCourse.holes);
        if (!bounds) return;
        const progressContainer = document.getElementById('map-progress-container');
        const progressBar = document.getElementById('map-progress-bar');
        const progressPercent = document.getElementById('map-progress-percent');
        progressContainer.style.display = 'block'; progressBar.style.width = '0%'; progressPercent.innerText = '0%';
        const staticUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bounds[0][1]},${bounds[0][0]},${bounds[1][1]},${bounds[1][0]}&bboxSR=4326&size=1024,1024&format=png&f=image`;
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 15; if (progress > 90) progress = 90;
                progressBar.style.width = `${Math.round(progress)}%`; progressPercent.innerText = `${Math.round(progress)}%`;
            }
        }, 300);
        try {
            const resp = await fetch(staticUrl); if (!resp.ok) throw new Error("Download failed");
            const blob = await resp.blob(); const reader = new FileReader();
            reader.onloadend = async () => {
                clearInterval(interval); progressBar.style.width = '100%'; progressPercent.innerText = '100%';
                activeMappingCourse.offlineMap = { image: reader.result, bounds: bounds };
                await db.saveCourse(activeMappingCourse);
                setTimeout(() => { alert("Mapa Offline Salvo!"); progressContainer.style.display = 'none'; }, 500);
            };
            reader.readAsDataURL(blob);
        } catch(e) { clearInterval(interval); progressContainer.style.display = 'none'; alert("Erro ao baixar mapa."); }
    }

    async function submitRequest(type) {
        if (type === 'course') {
            const name = document.getElementById('req-course-name').value.trim();
            const loc = document.getElementById('req-course-loc').value.trim();
            if (!name || !loc) return alert("Preencha todos os campos.");
            await db.sendCourseRequest(name, loc); alert("Sugestão enviada!");
            document.getElementById('req-course-name').value = ''; document.getElementById('req-course-loc').value = '';
        } else {
            const reason = document.getElementById('req-admin-reason').value.trim();
            if (!reason) return alert("Justifique seu pedido.");
            await db.sendAdminRequest(reason); alert("Pedido enviado.");
            document.getElementById('req-admin-reason').value = '';
        }
        navigate('view-home');
    }

    async function renderAdminPanel() {
        const list = document.getElementById('admin-requests-list');
        list.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Carregando pedidos...</p>';
        try {
            const cReqs = await db.getPendingRequests('course_requests');
            const aReqs = await db.getPendingRequests('admin_requests');
            if (cReqs.length === 0 && aReqs.length === 0) { list.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);">Nenhum pedido pendente.</p>'; return; }
            let html = '';
            if (cReqs.length > 0) {
                html += '<h3 style="margin:20px 0 12px;font-size:0.9rem;color:var(--accent-primary);">📍 NOVOS CAMPOS</h3>';
                html += cReqs.map(r => `<div class="secondary-card" style="margin-bottom:12px;"><p><strong>${r.course_name}</strong> (${r.location})</p><p style="font-size:0.7rem;color:var(--text-secondary);">De: ${r.profiles ? r.profiles.email : '?'}</p><div style="display:flex;gap:8px;margin-top:12px;"><button class="primary-card" style="flex:1;font-size:0.8rem;padding:8px;" onclick="app.handleApproval('course_requests', '${r.id}', 'approved')">OK</button><button class="secondary-card" style="flex:1;font-size:0.8rem;padding:8px;color:var(--danger);" onclick="app.handleApproval('course_requests', '${r.id}', 'rejected')">Recusar</button></div></div>`).join('');
            }
            if (aReqs.length > 0) {
                html += '<h3 style="margin:20px 0 12px;font-size:0.9rem;color:var(--accent-primary);">🛡️ PEDIDOS DE CARGO</h3>';
                html += aReqs.map(r => `<div class="secondary-card" style="margin-bottom:12px;border:1px solid var(--accent-primary);"><p style="font-size:0.8rem;"><strong>${r.profiles ? r.profiles.email : '?'}</strong> deseja ser Admin.</p><p style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">"${r.reason}"</p><div style="display:flex;gap:8px;margin-top:12px;"><button class="primary-card" style="flex:1;font-size:0.8rem;padding:8px;" onclick="app.handleApproval('admin_requests', '${r.id}', 'approved', '${r.user_id}')">Aprovar Admin</button><button class="secondary-card" style="flex:1;font-size:0.8rem;padding:8px;color:var(--danger);" onclick="app.handleApproval('admin_requests', '${r.id}', 'rejected')">Recusar</button></div></div>`).join('');
            }
            list.innerHTML = html;
        } catch(e) { list.innerHTML = '<p style="color:var(--danger);">Erro crítico.</p>'; }
    }

    async function handleApproval(table, id, status, userId = null) {
        if (!confirm(status === 'approved' ? 'Aprovar?' : 'Recusar?')) return;
        await db.updateRequestStatus(table, id, status, userId); renderAdminPanel();
    }

    return {
        init, navigate, startCourseMapping, resumeCourseMapping, deleteCourseUi, switchMapperHole, saveMappingProgress,
        cancelMapping, applyManualCoords, handleCsvUpload, setManualPar, processAuth, toggleSidebar, downloadOfflineMap,
        installPwa, submitRequest, handleApproval, renderActiveMatches
    };
})();

document.addEventListener('DOMContentLoaded', app.init);
