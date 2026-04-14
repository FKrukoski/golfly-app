/**
 * History & Statistics Module
 * Generates the dashboard facts from the match history.
 */

window.HistoryApp = (function() {
    
    async function initHistoryView() {
        const matches = await db.getMatches();
        renderStats(matches);
        renderHistoryList(matches);
        app.navigate('view-history');
    }

    function renderStats(matches) {
        if (matches.length === 0) {
            document.getElementById('stat-avg-score').innerText = '--';
            document.getElementById('stat-best-score').innerText = '--';
            document.getElementById('stat-distribution').innerText = '-- / -- / --';
            return;
        }

        let totalRounds18 = 0;
        let sumScores18 = 0;
        let bestScore = Infinity;

        let totalBirdies = 0;
        let totalPars = 0;
        let totalBogeys = 0;

        matches.forEach(m => {
            // Find "Eu" player score
            const myPlayer = m.players[0]; // Usually the first player is the active device owner
            const myScoresArrays = m.scores[myPlayer.id] || [];
            
            // Sum all shots across all balls and all physical holes for the Gross total
             let myTotalGross = 0;
             myScoresArrays.forEach(ballArray => {
                 ballArray.forEach(s => {
                     if (typeof s === 'object') {
                         myTotalGross += (s.g || 0) + (s.p || 0);
                     } else {
                         myTotalGross += (s || 0);
                     }
                 });
             });

            // Net
            let myNet = myTotalGross - myPlayer.hcp;

            // Compute logical holes played
            const logicalHolesCompleted = m.physicalHoles * m.ballsMultiplier;

            if (logicalHolesCompleted >= 18) {
                totalRounds18++;
                sumScores18 += myNet; // Average by Net Score
                if (myNet < bestScore && myNet > 0) bestScore = myNet;
            }

             // Calculate distribution (mock par 4 for each stroke)
             myScoresArrays.forEach(ballArray => {
                 ballArray.forEach(s => {
                     const total = typeof s === 'object' ? (s.g + s.p) : s;
                     if (total === 0) return; // not played
                     const par = 4; // MVP Mock
                     if (total < par) totalBirdies++;
                     else if (total === par) totalPars++;
                     else if (total > par) totalBogeys++;
                 });
             });
        });

        document.getElementById('stat-avg-score').innerText = totalRounds18 > 0 ? (sumScores18 / totalRounds18).toFixed(1) : '--';
        document.getElementById('stat-best-score').innerText = bestScore !== Infinity ? bestScore : '--';
        document.getElementById('stat-distribution').innerText = `${totalBirdies} / ${totalPars} / ${totalBogeys}`;
    }

    function renderHistoryList(matches) {
        const list = document.getElementById('history-list');
        if (matches.length === 0) {
            list.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px 0;">Nenhuma partida finalizada ainda.</p>';
            return;
        }

        list.innerHTML = matches.map(m => {
            const date = new Date(m.date).toLocaleDateString('pt-BR');
            const myPlayer = m.players[0];
            
            let myTotalGross = 0;
             (m.scores[myPlayer.id] || []).forEach(ballArray => {
                 ballArray.forEach(s => {
                     if (typeof s === 'object') {
                         myTotalGross += (s.g || 0) + (s.p || 0);
                     } else {
                         myTotalGross += (s || 0);
                     }
                 });
             });
            let myNet = myTotalGross - (myPlayer.hcp || 0);

            const isEdited = m.isEdited ? '<span style="font-size:0.6rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle; border:1px solid var(--border-subtle);">EDITADO</span>' : '';

            return `
            <div class="secondary-card" style="padding:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                     <h3 style="font-size:1.1rem;">${m.courseName}${isEdited}</h3>
                     <div style="text-align:right;">
                         <span style="font-weight:700;color:var(--accent-primary);display:block;">${myNet} Net</span>
                         <span style="font-size:0.8rem;color:var(--text-secondary);">${myTotalGross} Gross</span>
                     </div>
                </div>
                <p style="font-size:0.8rem;color:var(--text-secondary); margin-bottom:12px;">${m.physicalHoles} Físicos x ${m.ballsMultiplier} Bolas • ${date} • ${m.players.length} Jogadores</p>
                
                <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    <button class="primary-card" style="padding:10px 12px; font-size:0.8rem; border-radius:8px; flex:1.5; text-align:center; background:var(--accent-primary); color:white; border:none;" onclick="HistoryApp.viewMatchReport('${m.id}')">📊 Ver Scorecard</button>
                    <button class="secondary-card" style="padding:10px 12px; font-size:0.8rem; border-radius:8px; flex:1; text-align:center;" onclick="HistoryApp.editMatch('${m.id}')">✏️ Editar</button>
                    <button class="secondary-card" style="padding:10px 12px; font-size:0.8rem; border-radius:8px; flex:1; text-align:center; color:var(--danger); border-color:var(--danger-glow);" onclick="HistoryApp.deleteMatch('${m.id}')">🗑️</button>
                </div>
            </div>
            `;
        }).join('');
    }

    async function editMatch(id) {
        if (!confirm("Ao editar, esta partida voltará ao simulador e sairá do histórico até ser finalizada novamente. Continuar?")) return;
        
        const match = await db.getMatch(id);
        if (match) {
            match.isEdited = true;
            await db.deleteMatch(id); 
            await db.setActiveMatch(match);
            app.navigate('view-scorecard');
            ScorecardApp.resumeActive();
        }
    }

    async function deleteMatch(id) {
        if (confirm("Apagar permanentemente este registro?")) {
            await db.deleteMatch(id);
            initHistoryView();
        }
    }

    async function viewMatchReport(id) {
        const match = await db.getMatch(id);
        if (!match) return;

        document.getElementById('report-course-name').innerText = match.courseName;
        
        // Render Summary
        const summary = document.getElementById('report-summary');
        const date = new Date(match.date).toLocaleDateString('pt-BR');
        
        // Get primary player stats
        const p1 = match.players[0];
        let totalG = 0, totalP = 0, totalS = 0;
        match.scores[p1.id].forEach(bArr => {
            bArr.forEach(s => {
                const g = typeof s === 'object' ? s.g : s;
                const p = typeof s === 'object' ? s.p : 0;
                totalG += g; totalP += p; totalS += (g + p);
            });
        });

        summary.innerHTML = `
            <div class="primary-card" style="padding:16px;">
                <p style="font-size:0.7rem; color:var(--text-secondary);">SCORE BRUTO</p>
                <h3 style="font-size:1.5rem;">${totalS}</h3>
            </div>
            <div class="secondary-card" style="padding:16px;">
                <p style="font-size:0.7rem; color:var(--text-secondary);">PUTTS TOTAL</p>
                <h3 style="font-size:1.5rem;">${totalP}</h3>
            </div>
            <div class="secondary-card" style="padding:16px;">
                <p style="font-size:0.7rem; color:var(--text-secondary);">DATA</p>
                <h3 style="font-size:1.1rem;">${date}</h3>
            </div>
        `;

        // Render Table
        renderDetailedScorecard(match);
        app.navigate('view-match-report');
    }

    async function renderDetailedScorecard(match) {
        const container = document.getElementById('report-scorecard-container');
        const course = await db.getCourse(match.courseId);
        
        let html = '';
        
        match.players.forEach(p => {
            html += `
                <div style="margin-top:24px;">
                    <h3 style="font-size:1.1rem; margin-bottom:12px; color:var(--accent-primary);">${p.name} <span style="color:var(--text-secondary); font-size:0.8rem;">(HCP ${p.hcp || 0})</span></h3>
                    <div class="scorecard-table-container">
                        <table class="scorecard-table">
                            <thead>
                                <tr>
                                    <th class="hole-col">#</th>
                                    <th>PAR</th>
                                    <th>GREEN</th>
                                    <th>PUTTS</th>
                                    <th>TOTAL</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            for (let b = 0; b < match.ballsMultiplier; b++) {
                if (match.ballsMultiplier > 1) {
                    html += `<tr class="highlight-row"><td colspan="5" style="text-align:left; font-weight:700; font-size:0.7rem;">BOLA ${b+1}</td></tr>`;
                }

                let ballTotalG = 0, ballTotalP = 0, ballTotalT = 0, ballTotalPar = 0;

                match.scores[p.id][b].forEach((s, idx) => {
                    const physHole = (idx % match.physicalHoles) + 1;
                    const holeData = course?.holes?.find(h => h.number === physHole);
                    const par = holeData?.par || 4;
                    
                    const g = typeof s === 'object' ? s.g : s;
                    const pScore = typeof s === 'object' ? s.p : 0;
                    const total = g + pScore;
                    
                    ballTotalG += g; ballTotalP += pScore; ballTotalT += total; ballTotalPar += par;

                    html += `
                        <tr>
                            <td class="hole-col">${idx + 1}</td>
                            <td style="color:var(--text-secondary);">${par}</td>
                            <td>${g}</td>
                            <td>${pScore}</td>
                            <td style="font-weight:700; color:${total <= par ? 'var(--accent-primary)' : 'white'}">${total}</td>
                        </tr>
                    `;
                });

                html += `
                    <tr class="total-row">
                        <td colspan="2" style="text-align:right;">TOTAL:</td>
                        <td>${ballTotalG}</td>
                        <td>${ballTotalP}</td>
                        <td style="color:var(--accent-primary);">${ballTotalT}</td>
                    </tr>
                `;
            }

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    return {
        initHistoryView,
        editMatch,
        deleteMatch,
        viewMatchReport
    };
})();
