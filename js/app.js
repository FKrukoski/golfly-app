/**
 * Main Application Logic
 */

const app = (function() {
    let currentView = 'view-home';

    let activeMappingCourse = null;
    let currentMappingHoleIdx = 1;

    async function init() {
         console.log("App initializing...");
         
         // Supabase Auth Check
         if (window.AuthApp) {
             const loggedIn = await window.AuthApp.checkSession();
             if (!loggedIn) {
                  navigate('view-auth');
                  return; // Stop initialization, force login
             }
         }
        
        // Attempt to resume active match if it exists
        const resumed = await ScorecardApp.resumeActive();
        if (!resumed) {
             navigate('view-home');
        }
        
        // Listeners
        document.getElementById('nav-menu-btn').addEventListener('click', () => {
             alert('Menu em breve!');
        });
        
        // Register Service Worker for PWA Offline mode
        if ('serviceWorker' in navigator) {
             try {
                  const registration = await navigator.serviceWorker.register('sw.js');
                  console.log('ServiceWorker registered with scope:', registration.scope);
             } catch (e) {
                  console.error('ServiceWorker registration failed:', e);
             }
        }
    }

    function navigate(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Remove active class from tabs
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));

        // Show target view
        const target = document.getElementById(viewId);
        const previousView = currentView;
        if (target) {
            target.classList.add('active');
            currentView = viewId;
        }

        // Highlight bottom bar if applicable
        if (viewId === 'view-home') {
             const tabs = document.querySelectorAll('.tab-item');
             if(tabs.length > 0) tabs[0].classList.add('active');
        } else if (viewId === 'view-courses') {
             const tabs = document.querySelectorAll('.tab-item');
             if(tabs.length > 1) tabs[1].classList.add('active');
             renderCourseList();
        } else if (viewId === 'view-course-editor') {
             initCourseEditor();
        } else if (viewId === 'view-new-match' && previousView !== 'view-new-match') {
             // Let the Scorecard module initialize the match view correctly
             setTimeout(() => ScorecardApp.initNewMatchView(), 0);
        } else if (viewId === 'view-history' && previousView !== 'view-history') {
             setTimeout(() => HistoryApp.initHistoryView(), 0);
        }
    }

    // --- Course Views Logic ---
    async function renderCourseList() {
        const listContainer = document.getElementById('courses-list');
        listContainer.innerHTML = '<p style="color:var(--text-secondary);text-align:center;">Carregando...</p>';
        
        const courses = await db.getCourses();
        
        if (courses.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding: 40px 0;">
                    <p style="color:var(--text-secondary); margin-bottom: 16px;">Você ainda não possui campos cadastrados.</p>
                    <button class="primary-card" style="width:100%;text-align:center" onclick="app.navigate('view-course-editor')">
                         Criar Meu Primeiro Campo
                    </button>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = courses.map(c => `
             <div class="secondary-card" style="margin-bottom:12px; display:flex; flex-direction:column; gap:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                       <div>
                           <h3 style="font-size:1.1rem;margin-bottom:4px;">${c.name}</h3>
                           <p style="font-size:0.8rem;color:var(--text-secondary);">${c.city || 'S/ Cidade'} • Par ${c.totalPar || '--'} • ${c.holes ? c.holes.length : 0} Buracos</p>
                       </div>
                       <button class="icon-btn" style="color:var(--danger);font-size:1.2rem;" onclick="app.deleteCourseUi('${c.id}')">🗑️</button>
                  </div>
                  <button class="primary-card" style="padding:10px;text-align:center;font-size:0.9rem;" onclick="app.resumeCourseMapping('${c.id}')">
                       Editar Mapeamento
                  </button>
             </div>
        `).join('');
    }

    async function deleteCourseUi(id) {
         if (confirm('Tem certeza que deseja apagar este campo completamente? (Incluindo todos os pinos de mapeamento)')) {
              await db.deleteCourse(id);
              renderCourseList();
         }
    }

    function initCourseEditor() {
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
            alert('Por favor, informe um nome e a cidade para o campo.');
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
        
        // Disable UI and show loading
        document.getElementById('mapper-instruction').innerText = 'Localizando cidade no GPS... Aguarde.';
        navigate('view-course-mapper');
        document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
        document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;
        
        // Geocoding request
        let centerLatLng = [-23.5505, -46.6333]; // Fallback SP
        try {
            const query = encodeURIComponent(activeMappingCourse.city);
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
            const data = await response.json();
            if(data && data.length > 0) {
                 centerLatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
            } else {
                 alert('Cidade não encontrada pelo satélite. Abriremos o mapa padrão.');
            }
        } catch (e) {
            console.error('Geocoding error', e);
        }

        document.getElementById('mapper-instruction').innerText = 'Selecione o tipo de ponto abaixo e toque no mapa georreferenciado para fixá-lo. Segure as marcações para arrastá-las. Segure SHIFT no PC ou gire os dois dedos no Celular para rotacionar.';
        
        loadMapperHole(currentMappingHoleIdx, centerLatLng);
    }

    async function resumeCourseMapping(courseId) {
        const course = await db.getCourse(courseId);
        if(!course) return;

        activeMappingCourse = course;
        currentMappingHoleIdx = 1;
        
        // Disable UI and show loading
        document.getElementById('mapper-instruction').innerText = 'Localizando cidade no GPS... Aguarde.';
        navigate('view-course-mapper');
        document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
        document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;

        let centerLatLng = [-23.5505, -46.6333];
        try {
            if (activeMappingCourse.city) {
                const query = encodeURIComponent(activeMappingCourse.city);
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
                const data = await response.json();
                if(data && data.length > 0) {
                     centerLatLng = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                }
            }
        } catch (e) { console.error(e); }

        document.getElementById('mapper-instruction').innerText = 'Edite ou insira os pontos do buraco e clique em Salvar para manter o progresso.';
        
        loadMapperHole(currentMappingHoleIdx, centerLatLng);
    }

    function loadMapperHole(holeNum, centerLatLng = null) {
        currentMappingHoleIdx = holeNum;
        
        // Render the horizontal scroll holes
        const scrollContainer = document.getElementById('mapper-holes-scroll');
        let html = '';
        for(let i=1; i<=activeMappingCourse.physicalHoles; i++) {
             // Check if data exists for hole i to color it differently
             const hasData = activeMappingCourse.holes.find(h => h.number === i && h.points.greenCenter);
             const badgeColor = i === holeNum ? 'var(--accent-primary)' : (hasData ? '#10B981' : 'var(--bg-glass)');
             const isSelected = i === holeNum ? 'border:2px solid #fff;' : 'border:none;';
             
             html += `<div style="padding:10px 16px; border-radius:12px; background:${badgeColor}; color:white; font-weight:700; cursor:pointer; flex-shrink:0; ${isSelected}" onclick="app.switchMapperHole(${i})">
                 Buraco ${i}
             </div>`;
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
        
        let holePar = 4; // Default
        if (existingData && existingData.par) {
             holePar = existingData.par;
        }
        app.setManualPar(holePar);
        
        window.onPointCaptured = function(type) {
             const points = window.GolfMap.getHoleData();
             if (points && points.greenCenter) {
                 document.getElementById('mapper-lat-input').value = points.greenCenter.lat;
                 document.getElementById('mapper-lng-input').value = points.greenCenter.lng;
             }
             persistCurrentPointsIntoMemory();
             
             // Re-render scroll silently to update green badge
             loadMapperHoleSilently(currentMappingHoleIdx);
        };
    }

    function loadMapperHoleSilently(holeNum) {
        // Just recreate badges
        const scrollContainer = document.getElementById('mapper-holes-scroll');
        let html = '';
        for(let i=1; i<=activeMappingCourse.physicalHoles; i++) {
             const hasData = activeMappingCourse.holes.find(h => h.number === i && h.points.greenCenter);
             const badgeColor = i === holeNum ? 'var(--accent-primary)' : (hasData ? '#10B981' : 'var(--bg-glass)');
             const isSelected = i === holeNum ? 'border:2px solid #fff;' : 'border:none;';
             
             html += `<div style="padding:10px 16px; border-radius:12px; background:${badgeColor}; color:white; font-weight:700; cursor:pointer; flex-shrink:0; ${isSelected}" onclick="app.switchMapperHole(${i})">
                 Buraco ${i}
             </div>`;
        }
        scrollContainer.innerHTML = html;
    }

    function applyManualCoords() {
         const lat = parseFloat(document.getElementById('mapper-lat-input').value);
         const lng = parseFloat(document.getElementById('mapper-lng-input').value);
         
         if (!isNaN(lat) && !isNaN(lng)) {
             // Forcefully push to our memory list
             let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
             const fixedPoints = { greenCenter: {lat, lng} };
             if (existing) {
                 existing.points = fixedPoints;
             } else {
                 activeMappingCourse.holes.push({ number: currentMappingHoleIdx, points: fixedPoints });
             }
             
             window.GolfMap.loadMapContext(activeMappingCourse.holes, currentMappingHoleIdx);
             window.GolfMap.setCenter(lat, lng);
             loadMapperHoleSilently(currentMappingHoleIdx);
         }
    }

    function setManualPar(parValue) {
         // UI Toggle
         document.querySelectorAll('.par-btn').forEach(btn => {
              btn.style.background = 'transparent';
              btn.style.boxShadow = 'none';
         });
         const targetBtn = document.getElementById(`par-btn-${parValue}`);
         if (targetBtn) {
              targetBtn.style.background = 'var(--accent-primary)';
              targetBtn.style.boxShadow = '0 0 12px var(--accent-glow)';
         }
         
         // Persist Memory
         let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
         if (existing) {
              existing.par = parValue;
         } else {
              activeMappingCourse.holes.push({ number: currentMappingHoleIdx, points: null, par: parValue });
         }
    }

    function switchMapperHole(newHoleNum) {
        persistCurrentPointsIntoMemory();
        loadMapperHole(newHoleNum);
    }
    
    function persistCurrentPointsIntoMemory() {
        const points = window.GolfMap.getHoleData();
        if (!points || !points.greenCenter) return;

        let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
        // Disconnect reference to prevent mutation across holes!
        const pointsClone = JSON.parse(JSON.stringify(points));
        
        if (existing) {
             existing.points = pointsClone;
        } else {
             activeMappingCourse.holes.push({
                 number: currentMappingHoleIdx,
                 points: pointsClone
             });
        }
    }

    async function saveMappingProgress() {
        persistCurrentPointsIntoMemory();
        
        let total = 0;
        activeMappingCourse.holes.forEach(h => {
             total += (h.par || 4); // Default to par 4 if unset
        });
        activeMappingCourse.totalPar = total;

        await db.saveCourse(activeMappingCourse);
        alert('Progresso salvo com sucesso! O Campo está pronto pra jogo.');
        activeMappingCourse = null;
        navigate('view-courses');
    }

    function cancelMapping() {
        if(confirm('Tem certeza? Suas edições não salvas do buraco atual serão perdidas.')) {
            activeMappingCourse = null;
            navigate('view-courses');
        }
    }

    async function handleCsvUpload(event) {
         const file = event.target.files[0];
         if (!file) return;

         const nameInput = document.getElementById('course-name');
         const cityInput = document.getElementById('course-city');
         const formatInput = document.getElementById('course-format');
         
         if (!nameInput.value.trim() || !cityInput.value.trim()) {
             alert('Por favor, informe Nome e Cidade antes de importar.');
             event.target.value = '';
             return;
         }

         const reader = new FileReader();
         reader.onload = async function(e) {
             const text = e.target.result;
             const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
             const phys = parseInt(formatInput.value, 10);
             
             activeMappingCourse = {
                 id: `course_${Date.now()}`,
                 name: nameInput.value.trim(),
                 city: cityInput.value.trim(),
                 physicalHoles: phys,
                 holes: [],
                 totalPar: 0
             };

             for(let i = 0; i < lines.length && i < phys; i++) {
                 const parts = lines[i].split(/[,;]/);
                 if (parts.length >= 2) {
                     const lat = parseFloat(parts[0]);
                     const lng = parseFloat(parts[1]);
                     if (!isNaN(lat) && !isNaN(lng)) {
                         activeMappingCourse.holes.push({
                             number: i + 1,
                             par: 4, // Default to 4 on CSV
                             points: {
                                 greenCenter: { lat, lng }
                             }
                         });
                     }
                 }
             }

             await db.saveCourse(activeMappingCourse);
             alert(`Importação lida com sucesso (${activeMappingCourse.holes.length} buracos importados). O editor se abrirá para eventuais correções.`);
             
             currentMappingHoleIdx = 1;
             navigate('view-course-mapper');
             document.getElementById('mapper-course-name').innerText = activeMappingCourse.name;
             document.getElementById('mapper-total-holes').innerText = activeMappingCourse.physicalHoles;
             
             let centerLatLng = null;
             if (activeMappingCourse.holes.length > 0) {
                 centerLatLng = [activeMappingCourse.holes[0].points.greenCenter.lat, activeMappingCourse.holes[0].points.greenCenter.lng];
             }
             loadMapperHole(currentMappingHoleIdx, centerLatLng);
         };
         reader.readAsText(file);
    }

    // Export public methods
    return {
        init,
        navigate,
        startCourseMapping,
        resumeCourseMapping,
        deleteCourseUi,
        switchMapperHole,
        saveMappingProgress,
        cancelMapping,
        applyManualCoords,
        handleCsvUpload,
        setManualPar,
        processAuth
    };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', app.init);
