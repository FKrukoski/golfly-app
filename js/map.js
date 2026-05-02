/**
 * Map Integration Logic using Leaflet.js
 * Handles pinning 6 points per hole and calculating the Green Center.
 */

window.GolfMap = (function() {
    let mapInstance = null;
    let markers = {};
    let currentHolePoints = {
        greenCenter: null
    };
    
    // Configurable state
    let activePointType = 'greenCenter'; // Always Green Center now

    let userLocation = null;
    let locationWatchId = null;
    let targetMarker = null;
    let scorecardGreenCenter = null;
    let layupPolyline = null;
    let offlineLayer = null;
    let tileLayer = null;
    let mapSelection = {
        layup: true,
        atual: true,
        green: true
    };


    function initMap(containerId, initialCenter = [-23.5505, -46.6333]) {
        setupLeaflet(containerId, initialCenter);
        mapInstance.on('click', onEditorMapClick);
        
        // Reset points
        Object.keys(currentHolePoints).forEach(k => currentHolePoints[k] = null);
        markers = {};
    }

    function setupLeaflet(containerId, center) {
        if (mapInstance) {
            mapInstance.remove();
        }
        
        mapInstance = L.map(containerId, { 
            rotate: true, 
            bearing: 0,
            touchRotate: true,
            shiftKeyRotate: true,
            rotateControl: {
                closeOnZeroBearing: false
            }
        }).setView(center, 16);
        
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 20
        }).addTo(mapInstance);
    }

    function setOfflineOverlay(imageUrl, bounds) {
        if (!mapInstance) return;
        if (offlineLayer) mapInstance.removeLayer(offlineLayer);
        
        offlineLayer = L.imageOverlay(imageUrl, bounds, {
            opacity: 1,
            interactive: false
        }).addTo(mapInstance);
        
        // Push offline layer to back so pins are above it
        offlineLayer.getElement()?.style.setProperty('z-index', '0');
        
        if (bounds) mapInstance.fitBounds(bounds);
    }

    function getCourseBounds(holes) {
        if (!holes || holes.length === 0) return null;
        let lats = [], lngs = [];
        holes.forEach(h => {
             if (h.points?.greenCenter) {
                 lats.push(h.points.greenCenter.lat);
                 lngs.push(h.points.greenCenter.lng);
             }
        });
        if (lats.length === 0) return null;
        
        let minLat = Math.min(...lats);
        let maxLat = Math.max(...lats);
        let minLng = Math.min(...lngs);
        let maxLng = Math.max(...lngs);
        
        // Add margin (~600 yards / ~550 meters margin)
        const margin = 0.0055; 
        return [
            [minLat - margin, minLng - margin],
            [maxLat + margin, maxLng + margin]
        ];
    }

    function resetHolePoints() {
        Object.keys(currentHolePoints).forEach(k => currentHolePoints[k] = null);
        Object.keys(markers).forEach(k => {
            if (mapInstance && markers[k]) mapInstance.removeLayer(markers[k]);
        });
        markers = {};
    }

    function loadMapContext(holesArray, activeHoleNum) {
        resetHolePoints();
        if (!holesArray) return;

        holesArray.forEach(hole => {
            if (hole.points && hole.points.greenCenter && hole.points.greenCenter.lat) {
                const latLng = L.latLng(hole.points.greenCenter.lat, hole.points.greenCenter.lng);
                
                if (hole.number === activeHoleNum) {
                    // This is the active hole being mapped (Green Draggable Marker)
                    currentHolePoints.greenCenter = { lat: latLng.lat, lng: latLng.lng };
                    drawMarker('greenCenter', latLng);
                } else {
                    // Draw a static ghost marker for already mapped holes
                    drawStaticMarker(hole.number, latLng);
                }
            }
        });
    }

    function drawStaticMarker(num, latLng) {
        const icon = L.divIcon({
            className: "ghost-pin",
            html: `<div style="background:#4B5563;width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;box-shadow:0 0 8px rgba(0,0,0,0.5);">${num}</div>`,
            iconAnchor: [12, 12]
        });
        const m = L.marker(latLng, { icon: icon, draggable: false }).addTo(mapInstance);
        markers[`ghost_${num}`] = m;
    }

    function onEditorMapClick(e) {
        const latLng = e.latlng;
        
        currentHolePoints.greenCenter = { lat: latLng.lat, lng: latLng.lng };
        drawMarker('greenCenter', latLng);
        
        if (window.onPointCaptured) {
            window.onPointCaptured('greenCenter');
        }
    }

    function drawMarker(type, latLng) {
        if (markers[type]) {
            mapInstance.removeLayer(markers[type]);
        }
        
        const icon = L.divIcon({
            className: "center-pin",
            html: `<div style="background:#10B981;width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(16, 185, 129,0.8);"></div>`,
            iconAnchor: [9, 9]
        });

        markers[type] = L.marker(latLng, { icon: icon, draggable: true }).addTo(mapInstance);
        
        markers[type].on('dragend', function(e) {
            const newPos = markers[type].getLatLng();
            currentHolePoints[type] = { lat: newPos.lat, lng: newPos.lng };
            if (window.onPointCaptured) {
                window.onPointCaptured('greenCenter');
            }
        });
    }

    function setActivePointType(type) {
        // No longer needed but kept for signature backward compatibility
        activePointType = 'greenCenter';
    }

    function getHoleData() {
        return currentHolePoints;
    }

    // --- Scorecard GPS Tático --- //
    
    function isInitialized() {
         return !!mapInstance;
    }

    function initScorecardMap(containerId, offlineMap = null) {
         setupLeaflet(containerId, [-23.5505, -46.6333]);
         
         if (offlineMap && offlineMap.image && offlineMap.bounds) {
             setOfflineOverlay(offlineMap.image, offlineMap.bounds);
         }

         // Start GPS
         if ('geolocation' in navigator) {
             locationWatchId = navigator.geolocation.watchPosition(
                 (pos) => updateUserLocation(pos.coords.latitude, pos.coords.longitude),
                 (err) => console.log('GPS Error', err),
                 { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
             );
         }

         mapInstance.on('click', onScorecardMapClick);
    }

    function loadScorecardGreen(lat, lng) {
         scorecardGreenCenter = L.latLng(lat, lng);
         if (markers['scorecardGreen']) mapInstance.removeLayer(markers['scorecardGreen']);
         
         const icon = L.divIcon({
             className: "green-pin-target",
             html: `🎯`,
             iconSize: [24,24],
             iconAnchor: [12, 12]
         });
         
         markers['scorecardGreen'] = L.marker(scorecardGreenCenter, { icon }).addTo(mapInstance);
         updateDistanceHUD();
    }

    function updateUserLocation(lat, lng) {
         let latlng = [lat, lng];
         
         // Se estiver simulando a partida (muito longe do green, > 2km), forçar o userLocation para ser um Tee simulado (300y abaixo do green).
         if (scorecardGreenCenter && typeof L !== 'undefined') {
             const distToGreen = L.latLng(lat, lng).distanceTo(scorecardGreenCenter);
             if (distToGreen > 2000) {
                 // Fake Tee 300 meters south
                 latlng = [scorecardGreenCenter.lat - 0.003, scorecardGreenCenter.lng];
             }
         }

         userLocation = latlng;
         
         if (markers['user']) mapInstance.removeLayer(markers['user']);
         
         const userIcon = L.divIcon({
             className: "user-loc-pin",
             html: `<div style="background:#3B82F6;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 16px rgba(59,130,246,0.8);"></div>`,
             iconAnchor: [8, 8]
         });
         
         markers['user'] = L.marker(userLocation, { icon: userIcon }).addTo(mapInstance);
         updateDistanceHUD();
    }
    
    function getUserLocation() {
        return userLocation;
    }

    function centerOnUser() {
         if (userLocation && mapInstance) {
             mapInstance.setView(userLocation, 19);
             updateDistanceHUD(); 
         } else {
             alert('Aguardando sinal GPS...');
         }
    }

    function centerOnGreen() {
         if (scorecardGreenCenter && mapInstance) {
             mapInstance.setView(scorecardGreenCenter, 18);
             updateDistanceHUD();
         } else {
             // Fallback to user if no green
             centerOnUser();
         }
    }

    function fitHoleView() {
        if (!userLocation || !scorecardGreenCenter || !mapInstance) return;
        
        const userL = L.latLng(userLocation[0], userLocation[1]);
        const greenL = L.latLng(scorecardGreenCenter.lat, scorecardGreenCenter.lng);
        
        // 1. Calculate and set bearing (User -> Green is "UP")
        const bearing = calculateBearing(userL.lat, userL.lng, greenL.lat, greenL.lng);
        if (typeof mapInstance.setBearing === 'function') {
            mapInstance.setBearing(bearing);
        }

        // 2. Fit bounds with asymmetric padding to push Green to the TOP
        // padding: [50, 50, 150, 50] -> [top, right, bottom, left] in standard Leaflet order
        // In Leaflet-rotate, we might need to use simple padding if asymmetric is buggy, 
        // but let's try the standard way first.
        mapInstance.fitBounds([userL, greenL], {
            paddingTopLeft: [40, 60], // More padding at top might push it down... wait.
            paddingBottomRight: [40, 160], // This pushes points AWAY from bottom.
            maxZoom: 19,
            animate: true
        });
    }


    function setCenter(lat, lng) {
         if (mapInstance) {
             mapInstance.setView([lat, lng], 18);
         }
    }

    function onScorecardMapClick(e) {
         if (targetMarker) mapInstance.removeLayer(targetMarker);
         
         targetMarker = L.marker(e.latlng, {
              icon: L.divIcon({
                  html: '<div style="background:#F59E0B;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(245, 158, 11,0.8);"></div>',
                  iconAnchor: [6,6]
              })
         }).addTo(mapInstance);
         
         updateDistanceHUD();
    }

    function calculateBearing(startLat, startLng, destLat, destLng) {
      const startLatR = startLat * Math.PI / 180;
      const startLngR = startLng * Math.PI / 180;
      const destLatR = destLat * Math.PI / 180;
      const destLngR = destLng * Math.PI / 180;
      
      const y = Math.sin(destLngR - startLngR) * Math.cos(destLatR);
      const x = Math.cos(startLatR) * Math.sin(destLatR) -
                Math.sin(startLatR) * Math.cos(destLatR) * Math.cos(destLngR - startLngR);
      const brng = Math.atan2(y, x);
      return (brng * 180 / Math.PI + 360) % 360;
    }

    function toggleSelection(type) {
         mapSelection[type] = !mapSelection[type];
         const btn = document.getElementById(`btn-map-${type}`);
         if (btn) {
             if (mapSelection[type]) btn.classList.add('active');
             else btn.classList.remove('active');
         }
         
         // Update layup marker visibility if it's the layup being toggled
         if (type === 'layup' && targetMarker) {
             if (mapSelection.layup) targetMarker.addTo(mapInstance);
             else mapInstance.removeLayer(targetMarker);
         }
         
         updateDistanceHUD();
    }

    function updateDistanceHUD() {
         if (!userLocation || !scorecardGreenCenter || !mapInstance) return;
         
         const userL = L.latLng(userLocation[0], userLocation[1]);
         
         // Auto Rotate logic (always based on User -> Green for orientation)
         if (typeof mapInstance.setBearing === 'function') {
             const bearing = calculateBearing(userL.lat, userL.lng, scorecardGreenCenter.lat, scorecardGreenCenter.lng);
             mapInstance.setBearing(bearing);
         }

         if (layupPolyline) mapInstance.removeLayer(layupPolyline);

         let hudContent = [];
         let polylinePoints = [];
         let polylineColor = '#10B981'; // Green by default
         let polylineDash = '';

         const hasLayup = targetMarker && mapSelection.layup;
         const showAtual = mapSelection.atual;
         const showGreen = mapSelection.green;
         const showLayup = mapSelection.layup && targetMarker;

         // Logic based on requirements:
         // 1. All three selected (and layup exists)
         if (showAtual && showLayup && showGreen) {
             const layupL = targetMarker.getLatLng();
             const layupYds = Math.round(userL.distanceTo(layupL) * 1.09361);
             const restYds = Math.round(layupL.distanceTo(scorecardGreenCenter) * 1.09361);
             hudContent.push(`L: <b>${layupYds}y</b>`, `🚩: <b>${restYds}y</b>`);
             polylinePoints = [userL, layupL, scorecardGreenCenter];
             polylineColor = '#F59E0B'; // Orange for layup path
             polylineDash = '8, 8';
         } 
         // 2. Only Layup and Atual
         else if (showAtual && showLayup) {
             const layupL = targetMarker.getLatLng();
             const dist = Math.round(userL.distanceTo(layupL) * 1.09361);
             hudContent.push(`Pos ➔ Layup: <b>${dist}y</b>`);
             polylinePoints = [userL, layupL];
             polylineColor = '#F59E0B';
         }
         // 3. Only Layup and Green
         else if (showLayup && showGreen) {
             const layupL = targetMarker.getLatLng();
             const dist = Math.round(layupL.distanceTo(scorecardGreenCenter) * 1.09361);
             hudContent.push(`Layup ➔ Green: <b>${dist}y</b>`);
             polylinePoints = [layupL, scorecardGreenCenter];
             polylineColor = '#10B981';
         }
         // 4. Only Atual and Green
         else if (showAtual && showGreen) {
             const dist = Math.round(userL.distanceTo(scorecardGreenCenter) * 1.09361);
             hudContent.push(`🚩 Green: <b>${dist}y</b>`);
             polylinePoints = [userL, scorecardGreenCenter];
             polylineColor = '#10B981';
         }

         // Update UI
         const hud = document.getElementById('gps-distance-hud');
         if (hudContent.length > 0) {
             hud.innerHTML = hudContent.join(' | ');
             hud.style.display = 'block';
             layupPolyline = L.polyline(polylinePoints, {
                 color: polylineColor, 
                 weight: 4, 
                 opacity: 0.8,
                 dashArray: polylineDash
             }).addTo(mapInstance);
         } else {
             hud.style.display = 'none';
         }
     }

    // --- Walkthrough Editor (V2.0) --- //
    let wtMapInstance = null;
    let wtMarkers = [];
    let wtPolyline = null;

    function initWalkthroughMap(containerId, activeShots) {
        if (wtMapInstance) {
            wtMapInstance.remove();
            wtMapInstance = null;
        }
        
        let center = activeShots && activeShots.length > 0 ? 
            [activeShots[0].lat, activeShots[0].lng] : (scorecardGreenCenter || [-23.5505, -46.6333]);
            
        wtMapInstance = L.map(containerId, { rotate: true, bearing: 0 }).setView(center, 18);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
        }).addTo(wtMapInstance);
        
        if (scorecardGreenCenter) {
            L.marker(scorecardGreenCenter, {
                icon: L.divIcon({ html: `🎯`, iconSize: [24,24], iconAnchor: [12,12] })
            }).addTo(wtMapInstance);
        }

        refreshWalkthroughMarkers(activeShots);
    }

    function refreshWalkthroughMarkers(activeShots) {
        // Clear existing
        wtMarkers.forEach(m => wtMapInstance.removeLayer(m));
        wtMarkers = [];
        if (wtPolyline) {
            wtMapInstance.removeLayer(wtPolyline);
            wtPolyline = null;
        }

        if (!activeShots || activeShots.length === 0) return;

        // Draw polyline
        const pts = activeShots.map(p => [p.lat, p.lng]);
        if (scorecardGreenCenter) pts.push(scorecardGreenCenter);
        wtPolyline = L.polyline(pts, { color: '#3B82F6', weight: 3, dashArray: '5,5', opacity: 0.8 }).addTo(wtMapInstance);

        // Draw markers
        activeShots.forEach((shot, i) => {
            const icon = L.divIcon({
                className: "wt-shot-pin",
                html: `<div style="background:var(--accent-primary);width:24px;height:24px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:bold;box-shadow:0 0 8px rgba(0,0,0,0.5);">${i+1}</div>`,
                iconAnchor: [12, 12]
            });
            
            const m = L.marker([shot.lat, shot.lng], { icon, draggable: true }).addTo(wtMapInstance);
            
            m.on('click', () => {
                if (window.ScorecardApp && window.ScorecardApp.onWalkthroughMarkerSelected) {
                    window.ScorecardApp.onWalkthroughMarkerSelected(i);
                }
                selectWalkthroughMarker(i);
            });

            m.on('drag', () => {
                updateWtDistanceHUD(m.getLatLng());
                // Update polyline dynamically
                if (wtPolyline) {
                    const currentPts = wtMarkers.map(marker => marker.getLatLng());
                    if (scorecardGreenCenter) currentPts.push(scorecardGreenCenter);
                    wtPolyline.setLatLngs(currentPts);
                }
            });
            m.on('dragend', () => {
                const hud = document.getElementById('wt-hud-distance');
                if (hud) hud.style.display = 'none';
            });
            
            wtMarkers.push(m);
        });
        
        // Auto-fit bounds if we have more than 1 point
        if (pts.length > 1) {
             wtMapInstance.fitBounds(wtPolyline.getBounds(), { padding: [30, 30] });
        }
    }

    function selectWalkthroughMarker(index) {
        wtMarkers.forEach((m, i) => {
            if (m.getElement()) {
                const circle = m.getElement().querySelector('div');
                if (!circle) return;
                
                if (i === index) {
                    circle.style.background = 'var(--warning)'; // highlight selected
                    circle.style.transform = 'scale(1.3)';
                    m.getElement().style.zIndex = 1000;
                } else {
                    circle.style.background = 'var(--accent-primary)';
                    circle.style.transform = 'scale(1)';
                    m.getElement().style.zIndex = 400;
                }
            }
        });
    }

    function getWalkthroughShotsArray() {
        return wtMarkers.map(m => {
            const pos = m.getLatLng();
            return { lat: pos.lat, lng: pos.lng };
        });
    }

    function updateWtDistanceHUD(latlng) {
        const hud = document.getElementById('wt-hud-distance');
        if (hud && scorecardGreenCenter) {
            const dist = Math.round(latlng.distanceTo(scorecardGreenCenter) * 1.09361);
            hud.innerText = `Ao Green: ${dist} yds`;
            hud.style.display = 'block';
        }
    }

    return {
        initMap,
        setActivePointType,
        getHoleData,
        resetHolePoints,
        loadMapContext,
        isInitialized,
        initScorecardMap,
        loadScorecardGreen,
        centerOnUser,
        centerOnGreen,
        fitHoleView,
        setCenter,
        getCourseBounds,
        setOfflineOverlay,
        toggleSelection,
        initWalkthroughMap,
        refreshWalkthroughMarkers,
        selectWalkthroughMarker,
        getWalkthroughShotsArray,
        getUserLocation
    };
})();
