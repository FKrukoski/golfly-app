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
                    <button class="secondary-card" style="padding:10px 12px; font-size:0.8rem; border-radius:8px; flex:1; text-align:center;" onclick="HistoryApp.viewDetailedHoleHistory('${m.id}')">🔍 Detalhes</button>
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
        
        // Get global stats
        let totalG = 0, totalP = 0, totalS = 0;
        match.players.forEach(p => {
            if(match.scores[p.id]) {
                match.scores[p.id].forEach(bArr => {
                    bArr.forEach(s => {
                        const g = typeof s === 'object' ? s.g : s;
                        const pScore = typeof s === 'object' ? s.p : 0;
                        totalG += g; totalP += pScore; totalS += (g + pScore);
                    });
                });
            }
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

    let activeDetailedMatch = null;
    let detailedMapInstance = null;
    let detailedMarkers = [];
    let detailedPolyline = null;

    async function viewDetailedHoleHistory(id) {
        activeDetailedMatch = await db.getMatch(id);
        if (!activeDetailedMatch) return;

        document.getElementById('detailed-course-name').innerText = activeDetailedMatch.courseName;

        const scrollContainer = document.getElementById('detailed-holes-scroll');
        let html = '';
        const totalHoles = activeDetailedMatch.totalHoles || activeDetailedMatch.physicalHoles;
        for(let i=1; i<=totalHoles; i++) {
             html += `<div style="padding:10px 16px; border-radius:12px; background:var(--bg-glass); color:white; font-weight:700; cursor:pointer; flex-shrink:0;" onclick="HistoryApp.renderDetailedHole(${i}, this)">Buraco ${i}</div>`;
        }
        scrollContainer.innerHTML = html;
        
        app.navigate('view-detailed-history');
        
        // Select first hole
        const firstBtn = scrollContainer.firstChild;
        if(firstBtn) firstBtn.click();
    }

    async function renderDetailedHole(holeNum, btnElement) {
        // Update UI selection
        const btns = document.getElementById('detailed-holes-scroll').children;
        for(let b of btns) {
             b.style.background = 'var(--bg-glass)';
             b.style.border = 'none';
        }
        if(btnElement) {
            btnElement.style.background = 'var(--accent-primary)';
            btnElement.style.border = '2px solid #fff';
        }

        const match = activeDetailedMatch;
        const physHole = ((holeNum - 1) % match.physicalHoles) + 1;
        const course = await db.getCourse(match.courseId);
        const holeData = course?.holes?.find(h => h.number === physHole);
        
        const greenCenter = holeData?.points?.greenCenter;

        // Render Map
        if (!detailedMapInstance) {
            detailedMapInstance = L.map('detailed-history-map-container', { zoomControl: false }).setView(
                greenCenter ? [greenCenter.lat, greenCenter.lng] : [-23.5505, -46.6333], 17
            );
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 20
            }).addTo(detailedMapInstance);
        }

        detailedMarkers.forEach(m => detailedMapInstance.removeLayer(m));
        if (detailedPolyline) detailedMapInstance.removeLayer(detailedPolyline);
        detailedMarkers = [];
        
        if (greenCenter) {
            const gm = L.marker([greenCenter.lat, greenCenter.lng], {
                icon: L.divIcon({ html: `🎯`, iconSize: [24,24], iconAnchor: [12,12] })
            }).addTo(detailedMapInstance);
            detailedMarkers.push(gm);
        }

        const p1 = match.players[0];
        const validatedShots = (match.validatedShots && match.validatedShots[holeNum]) ? match.validatedShots[holeNum] : [];
        
        if (validatedShots.length > 0) {
            const pts = validatedShots.map(p => [p.lat, p.lng]);
            if (greenCenter) pts.push([greenCenter.lat, greenCenter.lng]);
            detailedPolyline = L.polyline(pts, { color: '#F59E0B', weight: 3, dashArray: '5,5', opacity: 0.8 }).addTo(detailedMapInstance);
            
            validatedShots.forEach((shot, i) => {
                const icon = L.divIcon({
                    className: "wt-shot-pin",
                    html: `<div style="background:var(--accent-primary);width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;">${i+1}</div>`,
                    iconAnchor: [12, 12]
                });
                const m = L.marker([shot.lat, shot.lng], { icon, interactive: false }).addTo(detailedMapInstance);
                detailedMarkers.push(m);
            });

            if (pts.length > 0) {
                detailedMapInstance.fitBounds(detailedPolyline.getBounds(), { padding: [30, 30] });
            }
        } else if (greenCenter) {
            detailedMapInstance.setView([greenCenter.lat, greenCenter.lng], 18);
        }

        // Render List
        let listHtml = '';
        
        // P1 Details
        listHtml += `<h3 style="font-size:1rem; color:var(--accent-primary); margin-bottom:12px;">${p1.name} (Jogador Principal)</h3>`;
        if (validatedShots.length > 0) {
            listHtml += `<div style="display:flex; flex-direction:column; gap:8px; margin-bottom:24px;">`;
            validatedShots.forEach((s, idx) => {
                let distHtml = '--';
                if (idx < validatedShots.length - 1) {
                    const nextShot = validatedShots[idx+1];
                    const latlng1 = L.latLng(s.lat, s.lng);
                    const latlng2 = L.latLng(nextShot.lat, nextShot.lng);
                    const yds = Math.round(latlng1.distanceTo(latlng2) * 1.09361);
                    distHtml = `${yds}y`;
                } else if (greenCenter) {
                    const latlng1 = L.latLng(s.lat, s.lng);
                    const latlng2 = L.latLng(greenCenter.lat, greenCenter.lng);
                    const yds = Math.round(latlng1.distanceTo(latlng2) * 1.09361);
                    distHtml = `${yds}y`;
                }

                const penaltyHtml = s.penalty ? `<span style="background:var(--warning); color:#000; padding:2px 6px; border-radius:4px; font-size:0.6rem; font-weight:bold; margin-left:8px;">PENALIDADE</span>` : '';
                
                listHtml += `
                    <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="font-weight:bold; font-size:0.9rem;">Tacada ${idx+1}</span>
                            <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:8px;">${s.club} (${s.lie})</span>
                            ${penaltyHtml}
                        </div>
                        <div style="font-weight:bold; color:var(--accent-primary);">
                            ${distHtml}
                        </div>
                    </div>
                `;
            });
            listHtml += `</div>`;
        } else {
             listHtml += `<p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:24px;">Tacadas não mapeadas via GPS.</p>`;
        }

        // Other Players Summary
        if (match.players.length > 1) {
             listHtml += `<h3 style="font-size:1rem; color:var(--accent-primary); margin-bottom:12px;">Outros Jogadores</h3>`;
             match.players.slice(1).forEach(p => {
                 let playerG = 0, playerP = 0;
                 if(match.scores[p.id]) {
                     match.scores[p.id].forEach(bArr => {
                         const scoreObj = bArr[holeNum-1] || {g:0, p:0};
                         const g = typeof scoreObj === 'object' ? scoreObj.g : scoreObj;
                         const pScore = typeof scoreObj === 'object' ? scoreObj.p : 0;
                         playerG += g; playerP += pScore;
                     });
                 }
                 listHtml += `
                    <div style="background:var(--bg-primary); border:1px solid var(--border-subtle); border-radius:8px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between;">
                        <span style="font-weight:bold;">${p.name}</span>
                        <span style="font-size:0.9rem; color:var(--text-secondary);">Total: ${playerG + playerP} (Putts: ${playerP})</span>
                    </div>
                 `;
             });
        }
        
        document.getElementById('detailed-hole-info').innerHTML = listHtml;

        setTimeout(() => {
            if (detailedMapInstance) detailedMapInstance.invalidateSize();
        }, 100);
    }

    function shareMatchReport() {
        const container = document.getElementById('report-scorecard-container');
        let text = `Relatório de Partida - ${document.getElementById('report-course-name').innerText}\n\n`;
        
        // Simples text extraction from scorecard table
        const rows = container.querySelectorAll('tr');
        rows.forEach(tr => {
            let rowData = [];
            tr.querySelectorAll('th, td').forEach(td => rowData.push(td.innerText));
            if(rowData.length > 0) text += rowData.join('\t') + '\n';
        });

        const subject = encodeURIComponent('Meu Relatório de Golfe - Golfly');
        const body = encodeURIComponent(text);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    return {
        initHistoryView,
        editMatch,
        deleteMatch,
        viewMatchReport,
        viewDetailedHoleHistory,
        renderDetailedHole,
        shareMatchReport
    };
})();
