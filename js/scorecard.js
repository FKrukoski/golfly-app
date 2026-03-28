/**
 * Scorecard Engine
 * Handles starting matches, adding players, scoring per hole, and finishing the match.
 */

window.ScorecardApp = (function() {
    let matchConfig = {
        courseId: null,
        courseName: '',
        balls: 1,
        players: [{ id: 'p1', name: 'Eu', hcp: 0 }],
        date: null
    };

    let activeMatchState = null;
    let isMapVisible = false;

    async function initNewMatchView() {
        const select = document.getElementById('match-course-select');
        const courses = await db.getCourses();
        
        if (courses.length === 0) {
            select.innerHTML = '<option value="">Nenhum campo cadastrado</option>';
        } else {
            select.innerHTML = courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
        
        // Reset players to just "Eu"
        matchConfig.players = [{ id: `p_${Date.now()}`, name: 'Eu', hcp: 0 }];
        document.getElementById('match-balls-multiplier').value = "1";
        renderPlayersList();
        
        app.navigate('view-new-match');
    }

    function renderPlayersList() {
        const list = document.getElementById('players-list');
        list.innerHTML = matchConfig.players.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-secondary);padding:12px;border-radius:8px;">
                <span>${p.name} <span style="color:var(--text-secondary);font-size:0.8rem;">(HCP ${p.hcp})</span></span>
                ${matchConfig.players.length > 1 ? `<button onclick="ScorecardApp.removePlayer('${p.id}')" style="background:none;border:none;color:var(--danger);font-size:1.2rem;">&times;</button>` : ''}
            </div>
        `).join('');
    }

    function addPlayer() {
        const inputName = document.getElementById('new-player-name');
        const inputHcp = document.getElementById('new-player-hcp');
        const name = inputName.value.trim();
        const hcp = parseInt(inputHcp.value) || 0;
        
        if (name && matchConfig.players.length < 4) {
             matchConfig.players.push({ id: `p_${Date.now()}`, name, hcp });
             inputName.value = '';
             inputHcp.value = '';
             renderPlayersList();
        } else if (matchConfig.players.length >= 4) {
             alert('Máximo de 4 jogadores no mesmo dispositivo (Flight).');
        }
    }

    function removePlayer(id) {
         matchConfig.players = matchConfig.players.filter(p => p.id !== id);
         renderPlayersList();
    }

    async function startMatch() {
         const select = document.getElementById('match-course-select');
         if (!select.value) {
              alert('Selecione ou crie um campo primeiro.');
              return;
         }

         const courseId = select.value;
         const course = await db.getCourse(courseId);
         
         if (!course) return;

         const ballsMultiplier = parseInt(document.getElementById('match-balls-multiplier').value, 10) || 1;

         // Initialize match state (physical holes dictates UI loop)
         const physicalHoles = course.physicalHoles || 18;
         
         const scores = {};
         matchConfig.players.forEach(p => {
             // Create a 2D array [ball_index][hole_index]
             scores[p.id] = Array.from({length: ballsMultiplier}, () => Array(physicalHoles).fill(0));
         });

         activeMatchState = {
             id: `match_${Date.now()}`,
             courseId: course.id,
             courseName: course.name,
             date: Date.now(),
             players: [...matchConfig.players],
             ballsMultiplier: ballsMultiplier,
             scores: scores,
             physicalHoles: physicalHoles,
             currentHole: 1
         };

         await db.setActiveMatch(activeMatchState);
         loadScorecardView();
    }

    async function loadScorecardView() {
         if (!activeMatchState) {
             activeMatchState = await db.getActiveMatch();
         }
         if (!activeMatchState) return;

         document.getElementById('scorecard-course-name').innerText = activeMatchState.courseName;
         document.getElementById('current-hole-num').innerText = activeMatchState.currentHole;
         
         // Mocking par as 4 for unmapped holes
         const par = 4; 
         document.getElementById('current-hole-par-label').innerText = `• Par ${par} (Físico)`;

         // Update map if visible
         if (isMapVisible && window.GolfMap) {
             window.GolfMap.loadHoleGPS(activeMatchState.courseId, activeMatchState.currentHole);
         }

         renderScoreCounters();
         app.navigate('view-scorecard');
    }

    function toggleGpsMap() {
         const mapContainer = document.getElementById('scorecard-map-container');
         isMapVisible = !isMapVisible;
         if (isMapVisible) {
             mapContainer.style.display = 'block';
             if (!window.GolfMap.isInitialized()) {
                  window.GolfMap.initScorecardMap('scorecard-map-container');
             }
             window.GolfMap.loadHoleGPS(activeMatchState.courseId, activeMatchState.currentHole);
         } else {
             mapContainer.style.display = 'none';
         }
    }

    function renderScoreCounters() {
         const container = document.getElementById('scorecard-players-container');
         const holeIdx = activeMatchState.currentHole - 1;

         container.innerHTML = activeMatchState.players.map(p => {
             
             let ballsHtml = '';
             let totalGross = 0;
             
             for (let b = 0; b < activeMatchState.ballsMultiplier; b++) {
                 const score = activeMatchState.scores[p.id][b][holeIdx] || 0;
                 const displayScore = score === 0 ? '-' : score;
                 
                 // Compute total gross across all physical holes and all balls for this player
                 activeMatchState.scores[p.id][b].forEach(s => totalGross += s);

                 ballsHtml += `
                 <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;background:var(--bg-primary);border-radius:8px;padding:8px 12px;border:1px solid var(--border-subtle);">
                     <span style="font-size:0.9rem;color:var(--text-secondary);">Bola ${b + 1}</span>
                     <div style="display:flex;align-items:center;gap:12px;">
                         <button class="icon-btn" style="background:var(--bg-secondary);width:32px;height:32px;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, -1)">-</button>
                         <span style="font-size:1.2rem;font-weight:700;width:24px;text-align:center;">${displayScore}</span>
                         <button class="icon-btn" style="background:var(--bg-secondary);width:32px;height:32px;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, 1)">+</button>
                     </div>
                 </div>`;
             }
             
             let netScore = totalGross - p.hcp;

             return `
             <div class="secondary-card" style="padding:16px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                      <h3 style="font-size:1.1rem;margin-bottom:0;">${p.name}</h3>
                      <div style="text-align:right;">
                          <p style="font-size:0.8rem;color:var(--text-secondary);">Gross: ${totalGross} | <b>Net: ${netScore}</b></p>
                      </div>
                  </div>
                  ${ballsHtml}
             </div>
             `;
         }).join('');
    }

    async function updateScore(playerId, ballIdx, delta) {
         const holeIdx = activeMatchState.currentHole - 1;
         let current = activeMatchState.scores[playerId][ballIdx][holeIdx] || 0;
         current += delta;
         if (current < 0) current = 0;
         
         activeMatchState.scores[playerId][ballIdx][holeIdx] = current;
         
         // Persist active match state
         await db.setActiveMatch(activeMatchState);
         renderScoreCounters();
    }

    function nextHole() {
         if (activeMatchState.currentHole < activeMatchState.physicalHoles) {
             activeMatchState.currentHole++;
             db.setActiveMatch(activeMatchState);
             loadScorecardView();
         } else {
             finishMatch();
         }
    }

    function prevHole() {
         if (activeMatchState.currentHole > 1) {
             activeMatchState.currentHole--;
             db.setActiveMatch(activeMatchState);
             loadScorecardView();
         }
    }

    function confirmFinishMatch() {
         if(confirm("Deseja interromper e salvar esta partida?")) {
             finishMatch();
         }
    }

    async function finishMatch() {
         await db.saveMatch(activeMatchState);
         await db.clearActiveMatch();
         activeMatchState = null;
         alert("Partida salva no Histórico!");
         app.navigate('view-home');
    }

    // Attempt to resume
    async function resumeActive() {
         const active = await db.getActiveMatch();
         if (active) {
             activeMatchState = active;
             loadScorecardView();
             return true;
         }
         return false;
    }

    return {
         initNewMatchView,
         addPlayer,
         removePlayer,
         startMatch,
         updateScore,
         toggleGpsMap,
         nextHole,
         prevHole,
         finishMatch,
         confirmFinishMatch,
         resumeActive
    };
})();
