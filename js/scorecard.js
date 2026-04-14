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
        
        if (!name) {
            alert('Por favor, digite o nome do jogador.');
            return;
        }

        if (matchConfig.players.length >= 4) {
            alert('Máximo de 4 jogadores no mesmo dispositivo (Flight).');
            return;
        }

        // Check for duplicate name
        if (matchConfig.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
            alert('Já existe um jogador com este nome.');
            return;
        }

        matchConfig.players.push({ id: `p_${Date.now()}`, name, hcp });
        inputName.value = '';
        inputHcp.value = '';
        renderPlayersList();
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
         const rounds = parseInt(document.getElementById('match-rounds').value, 10) || 1;

         // Initialize match state (physical holes dictates UI loop)
         const physicalHoles = course.physicalHoles || 18;
         const totalHoles = physicalHoles * rounds;
         
         const scores = {};
         matchConfig.players.forEach(p => {
             // Create a 2D array [ball_index][hole_index]
             // Each entry is now an object { g: greenShots, p: putts }
             scores[p.id] = Array.from({length: ballsMultiplier}, () => 
                 Array.from({length: totalHoles}, () => ({ g: 0, p: 0 }))
             );
         });

         activeMatchState = {
             id: `match_${Date.now()}`,
             courseId: course.id,
             courseName: course.name,
             date: Date.now(),
             players: [...matchConfig.players],
             ballsMultiplier: ballsMultiplier,
             rounds: rounds,
             physicalHoles: physicalHoles,
             totalHoles: totalHoles,
             scores: scores,
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

          const physHole = ((activeMatchState.currentHole - 1) % activeMatchState.physicalHoles) + 1;
          const course = await db.getCourse(activeMatchState.courseId);
          const holeData = course?.holes?.find(h => h.number === physHole);

          document.getElementById('scorecard-course-name').innerText = activeMatchState.courseName;
          document.getElementById('current-hole-num').innerText = activeMatchState.currentHole;

          const par = holeData?.par || 4; 
          document.getElementById('current-hole-par-label').innerText = `• Par ${par}`;

          // Update map if visible
          if (isMapVisible && window.GolfMap) {
              if (holeData && holeData.points && holeData.points.greenCenter) {
                   window.GolfMap.loadScorecardGreen(holeData.points.greenCenter.lat, holeData.points.greenCenter.lng);
              }
              window.GolfMap.centerOnGreen();
          }

          renderScoreCounters();
          app.navigate('view-scorecard');
    }

    async function toggleGpsMap() {
         const mapContainer = document.getElementById('scorecard-map-container');
         isMapVisible = !isMapVisible;
         if (isMapVisible) {
             mapContainer.style.display = 'block';
             const course = await db.getCourse(activeMatchState.courseId);
             const physHole = ((activeMatchState.currentHole - 1) % activeMatchState.physicalHoles) + 1;
             if (!window.GolfMap.isInitialized()) {
                  window.GolfMap.initScorecardMap('scorecard-map-container', course?.offlineMap);
             }
             
             // Extract green data 
             if (course && course.holes) {
                  const holeData = course.holes.find(h => h.number === physHole);
                  if (holeData && holeData.points && holeData.points.greenCenter) {
                       window.GolfMap.loadScorecardGreen(holeData.points.greenCenter.lat, holeData.points.greenCenter.lng);
                  }
             }

             window.GolfMap.centerOnGreen();
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
                   const scoreObj = activeMatchState.scores[p.id][b][holeIdx] || { g: 0, p: 0 };
                   const displayG = scoreObj.g === 0 ? '-' : scoreObj.g;
                   const displayP = scoreObj.p === 0 ? '-' : scoreObj.p;
                   
                   // Compute total gross across all logical holes and all balls
                   activeMatchState.scores[p.id][b].forEach(s => {
                       totalGross += (s.g || 0) + (s.p || 0);
                   });

                   ballsHtml += `
                   <div style="margin-top:12px; background:var(--bg-primary); border-radius:12px; padding:16px; border:1px solid var(--border-subtle);">
                       <span style="font-size:0.8rem; color:var(--accent-primary); font-weight:700; text-transform:uppercase; letter-spacing:1px;">Bola ${b + 1}</span>
                       
                       <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                           <span style="font-size:0.9rem; color:var(--text-secondary);">Até o Green</span>
                           <div style="display:flex; align-items:center; gap:12px;">
                               <button class="icon-btn" style="background:var(--bg-secondary); width:36px; height:36px; font-size:1.2rem;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, -1, 'g')">-</button>
                               <span style="font-size:1.4rem; font-weight:700; width:30px; text-align:center;">${displayG}</span>
                               <button class="icon-btn" style="background:var(--bg-secondary); width:36px; height:36px; font-size:1.2rem;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, 1, 'g')">+</button>
                           </div>
                       </div>

                       <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);">
                           <span style="font-size:0.9rem; color:var(--text-secondary);">Putts</span>
                           <div style="display:flex; align-items:center; gap:12px;">
                               <button class="icon-btn" style="background:var(--bg-secondary); width:36px; height:36px; font-size:1.2rem;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, -1, 'p')">-</button>
                               <span style="font-size:1.4rem; font-weight:700; width:30px; text-align:center;">${displayP}</span>
                               <button class="icon-btn" style="background:var(--bg-secondary); width:36px; height:36px; font-size:1.2rem;" onclick="ScorecardApp.updateScore('${p.id}', ${b}, 1, 'p')">+</button>
                           </div>
                       </div>
                   </div>`;
               }
              
              let netScore = totalGross - (p.hcp || 0);

              return `
              <div class="secondary-card" style="padding:16px;">
                   <div style="display:flex; align-items:center; justify-content:space-between;">
                       <h3 style="font-size:1.1rem; margin-bottom:0;">${p.name}</h3>
                       <div style="text-align:right;">
                           <p style="font-size:0.8rem; color:var(--text-secondary);">Gross: ${totalGross} | <b>Net: ${netScore}</b></p>
                       </div>
                   </div>
                   ${ballsHtml}
              </div>
              `;
          }).join('');
     }

    async function updateScore(playerId, ballIdx, delta, type = 'g') {
         const holeIdx = activeMatchState.currentHole - 1;
         let scoreObj = activeMatchState.scores[playerId][ballIdx][holeIdx];
         
         // Fix for potential legacy or missing objects
         if (typeof scoreObj !== 'object') {
             scoreObj = { g: typeof scoreObj === 'number' ? scoreObj : 0, p: 0 };
             activeMatchState.scores[playerId][ballIdx][holeIdx] = scoreObj;
         }

         scoreObj[type] = (scoreObj[type] || 0) + delta;
         if (scoreObj[type] < 0) scoreObj[type] = 0;
         
         // Persist active match state
         await db.setActiveMatch(activeMatchState);
         renderScoreCounters();
    }

    function nextHole() {
          if (activeMatchState.currentHole < (activeMatchState.totalHoles || activeMatchState.physicalHoles)) {
              activeMatchState.currentHole++;
              db.setActiveMatch(activeMatchState);
              loadScorecardView();
          } else {
              confirmFinishMatch();
          }
     }

     function prevHole() {
          if (activeMatchState.currentHole > 1) {
              activeMatchState.currentHole--;
              loadScorecardView();
          }
     }

     function confirmFinishMatch() {
          let incomplete = false;
           Object.keys(activeMatchState.scores).forEach(pId => {
                activeMatchState.scores[pId].forEach(bArr => {
                     // Incomplete if total strokes (g+p) is 0 for any hole
                     if (bArr.some(s => (s.g + s.p) === 0)) incomplete = true;
                });
           });

          if (incomplete) {
               alert("Não é possível finalizar com buracos sem pontuação. Use 'Pausar' para sair sem concluir.");
               return;
          }

          if(confirm("Deseja FINALIZAR e salvar no histórico oficial?")) {
              finishMatch();
          }
     }

     async function saveAndExit() {
         await db.setActiveMatch(activeMatchState);
         alert("Partida pausada. Retome-a no menu inicial.");
         app.navigate('view-home');
     }

     async function finishMatch() {
          activeMatchState.finished = true;
          activeMatchState.finishedDate = Date.now();
          await db.saveMatch(activeMatchState);
          await db.clearActiveMatch();
          activeMatchState = null;
          alert("Partida finalizada! 🏆");
          app.navigate('view-home');
     }

    // Attempt to resume
    async function resumeActive() {
         const active = await db.getActiveMatch();
         if (active) {
             // Migration logic for old data format
             Object.keys(active.scores).forEach(pId => {
                 active.scores[pId].forEach(ballArray => {
                     ballArray.forEach((s, idx) => {
                         if (typeof s === 'number') {
                             ballArray[idx] = { g: s, p: 0 };
                         }
                     });
                 });
             });
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
         saveAndExit,
         resumeActive
    };
})();
