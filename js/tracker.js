/**
 * Shot Tracker Engine
 * Ouve o GPS em background/foreground para detectar paradas prolongadas como Candidatos de Tacada.
 */
window.ShotTracker = (function() {
    let watchId = null;
    let wakeLock = null;
    let isTracking = false;
    
    // Configurações de Predição
    const STOP_THRESHOLD_SPEED = 0.5; // m/s
    const STOP_TIME_REQUIRED = 30000; // 30 segundos parado para ser candidato
    const MOVEMENT_TO_CONFIRM = 30; // 30 metros de distanciamento para confirmar o candidato anterior
    
    let pathHistory = []; // Array de posições {lat, lng, speed, time}
    let shotCandidates = []; // Pontos onde o usuário parou muito tempo
    
    let currentStopStartTime = null;
    let currentCandidate = null;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log('Wake Lock ativo. A tela não vai apagar.');
                
                // Listener se o lock cair
                wakeLock.addEventListener('release', () => {
                    console.log('Wake Lock liberado.');
                });
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        } else {
            console.warn("Wake Lock API não suportada neste navegador.");
        }
    }

    function releaseWakeLock() {
        if (wakeLock !== null) {
            wakeLock.release()
                .then(() => { wakeLock = null; });
        }
    }

    function startTracking() {
        if (isTracking) return;
        if (!('geolocation' in navigator)) {
            alert("Geolocation não suportado.");
            return;
        }

        pathHistory = [];
        shotCandidates = [];
        currentStopStartTime = null;
        currentCandidate = null;
        
        requestWakeLock();

        watchId = navigator.geolocation.watchPosition(
            onPositionUpdate,
            (err) => console.error("GPS Error:", err),
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10000
            }
        );
        isTracking = true;
        console.log("Tracker iniciado.");
    }

    function stopTracking() {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        releaseWakeLock();
        isTracking = false;
        console.log("Tracker parado.");
    }

    function getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // metros
        const p1 = lat1 * Math.PI/180;
        const p2 = lat2 * Math.PI/180;
        const dp = (lat2-lat1) * Math.PI/180;
        const dl = (lon2-lon1) * Math.PI/180;
        const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function onPositionUpdate(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speed = pos.coords.speed || 0; // m/s (pode ser null)
        const time = pos.timestamp;

        // Se speed do GPS vier null, podemos calcular manually se necessário, mas para MVP vamos usar o speed nativo e fallback simples.
        
        pathHistory.push({ lat, lng, speed, time });

        // 1. Lógica de Parada (Identificar Candidato a Tacada)
        if (speed < STOP_THRESHOLD_SPEED) {
            if (!currentStopStartTime) {
                currentStopStartTime = time;
            } else {
                const stoppedFor = time - currentStopStartTime;
                if (stoppedFor >= STOP_TIME_REQUIRED) {
                    // Parou por 30s. Potencial tacada.
                    if (!currentCandidate) {
                        currentCandidate = { lat, lng, time, confirmed: false };
                        console.log("Candidato a tacada detectado!", currentCandidate);
                    }
                }
            }
        } else {
            // Em movimento.
            currentStopStartTime = null;

            // 2. Lógica de Confirmação (Distanciou-se do candidato?)
            if (currentCandidate && !currentCandidate.confirmed) {
                const dist = getDistance(currentCandidate.lat, currentCandidate.lng, lat, lng);
                if (dist > MOVEMENT_TO_CONFIRM) {
                    currentCandidate.confirmed = true;
                    shotCandidates.push(currentCandidate);
                    console.log("Tacada anterior confirmada! (distanciamento detectado)");
                    currentCandidate = null; // Zera para a próxima
                }
            }
        }
    }

    function endHoleAndGetWalkthroughData() {
        // Se há um candidato ativo que nunca confirmamos, podemos empurrá-lo também.
        if (currentCandidate) {
            currentCandidate.confirmed = true;
            shotCandidates.push(currentCandidate);
        }

        const data = {
            path: [...pathHistory],
            predictedShots: [...shotCandidates]
        };
        
        // Zera estado para o próximo buraco sem desligar o GPS
        pathHistory = [];
        shotCandidates = [];
        currentCandidate = null;
        
        return data;
    }

    return {
        startTracking,
        stopTracking,
        endHoleAndGetWalkthroughData,
        isTracking: () => isTracking
    };
})();
