/**
 * Main Application Logic
 */

const app = (function() {
    let currentView = 'view-home';

    let activeMappingCourse = null;
    let currentMappingHoleIdx = 1;

    async function init() {
        console.log("App initializing...");
        
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

                 <button class="primary-card" style="text-align:center;margin-top:16px;background:var(--accent-primary);color:#fff;" onclick="app.startCourseMapping()">
                      Iniciar Mapeamento 🗺️
                 </button>
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
        document.getElementById('mapper-hole-num').innerText = holeNum;
        
        // Setup Button states
        document.getElementById('btn-prev-hole').style.opacity = holeNum === 1 ? '0.3' : '1';
        document.getElementById('btn-next-hole').style.opacity = holeNum === activeMappingCourse.physicalHoles ? '0.3' : '1';
        
        document.querySelectorAll('.map-point-btn').forEach(b => b.style.opacity = '1');

        if (!window.GolfMap.isInitialized()) {
             window.GolfMap.initMap('course-map-container', centerLatLng || [-23.5505, -46.6333]);
        } else {
             if (centerLatLng && holeNum === 1) { // Only set center on init or hole 1 if forcing
                 window.GolfMap.initMap('course-map-container', centerLatLng);
             } else {
                 window.GolfMap.resetHolePoints();
             }
        }
        
        // Check if there are existing points to render
        const existingData = activeMappingCourse.holes.find(h => h.number === holeNum);
        
        window.onPointRestored = function(type) {
             const btn = document.getElementById(`btn-${type}`);
             if (btn) btn.style.opacity = '0.3';
        };

        if (existingData && existingData.points) {
             window.GolfMap.loadPreexistingPoints(existingData.points);
        }
        
        window.onPointCaptured = function(type) {
             const btn = document.getElementById(`btn-${type}`);
             if (btn) btn.style.opacity = '0.3';
        };
    }

    function persistCurrentPointsIntoMemory() {
        const points = window.GolfMap.getHoleData();
        // check if empty
        const hasAny = Object.values(points).some(v => v !== null);
        if (!hasAny) return;

        let existing = activeMappingCourse.holes.find(h => h.number === currentMappingHoleIdx);
        if (existing) {
             existing.points = points;
        } else {
             activeMappingCourse.holes.push({
                 number: currentMappingHoleIdx,
                 points: points
             });
        }
    }

    function prevMapperHole() {
        if (currentMappingHoleIdx > 1) {
             persistCurrentPointsIntoMemory();
             currentMappingHoleIdx--;
             loadMapperHole(currentMappingHoleIdx);
        }
    }

    function nextMapperHole() {
        if (currentMappingHoleIdx < activeMappingCourse.physicalHoles) {
             persistCurrentPointsIntoMemory();
             currentMappingHoleIdx++;
             loadMapperHole(currentMappingHoleIdx);
        }
    }

    async function saveMappingProgress() {
        persistCurrentPointsIntoMemory();
        await db.saveCourse(activeMappingCourse);
        alert('Progresso salvo com sucesso!');
        activeMappingCourse = null;
        navigate('view-courses');
    }

    function cancelMapping() {
        if(confirm('Tem certeza? O campo não será salvo.')) {
            activeMappingCourse = null;
            navigate('view-courses');
        }
    }

    // Export public methods
    return {
        init,
        navigate,
        startCourseMapping,
        resumeCourseMapping,
        deleteCourseUi,
        prevMapperHole,
        nextMapperHole,
        saveMappingProgress,
        cancelMapping
    };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', app.init);
