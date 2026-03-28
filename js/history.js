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
                ballArray.forEach(s => myTotalGross += s);
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
                    if (s === 0) return; // not played
                    const par = 4; // MVP Mock
                    if (s < par) totalBirdies++;
                    else if (s === par) totalPars++;
                    else if (s > par) totalBogeys++;
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
                ballArray.forEach(s => myTotalGross += s);
            });
            let myNet = myTotalGross - myPlayer.hcp;
            
            return `
            <div class="secondary-card" style="padding:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                     <h3 style="font-size:1.1rem;">${m.courseName}</h3>
                     <div style="text-align:right;">
                         <span style="font-weight:700;color:var(--accent-primary);display:block;">${myNet} Net</span>
                         <span style="font-size:0.8rem;color:var(--text-secondary);">${myTotalGross} Gross</span>
                     </div>
                </div>
                <p style="font-size:0.875rem;color:var(--text-secondary);">${m.physicalHoles} Físicos x ${m.ballsMultiplier} Bolas • ${date} • ${m.players.length} Jogadores</p>
            </div>
            `;
        }).join('');
    }

    return {
        initHistoryView
    };
})();
