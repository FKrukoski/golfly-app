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

    function resetHolePoints() {
        Object.keys(currentHolePoints).forEach(k => currentHolePoints[k] = null);
        Object.keys(markers).forEach(k => {
            if (mapInstance && markers[k]) mapInstance.removeLayer(markers[k]);
        });
        markers = {};
    }

    function loadPreexistingPoints(pointsObj) {
        resetHolePoints();
        if (!pointsObj) return;

        if (pointsObj.greenCenter && pointsObj.greenCenter.lat) {
             currentHolePoints.greenCenter = { lat: pointsObj.greenCenter.lat, lng: pointsObj.greenCenter.lng };
             drawMarker('greenCenter', L.latLng(pointsObj.greenCenter.lat, pointsObj.greenCenter.lng));
        }
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

    function initScorecardMap(containerId) {
         setupLeaflet(containerId, [-23.5505, -46.6333]);
         
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
         const latlng = [lat, lng];
         userLocation = latlng;
         
         if (markers['user']) mapInstance.removeLayer(markers['user']);
         
         const userIcon = L.divIcon({
             className: "user-loc-pin",
             html: `<div style="background:#3B82F6;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 16px rgba(59,130,246,0.8);"></div>`,
             iconAnchor: [8, 8]
         });
         
         markers['user'] = L.marker(latlng, { icon: userIcon }).addTo(mapInstance);
         updateDistanceHUD();
    }

    function centerOnUser() {
         if (userLocation && mapInstance) {
             mapInstance.setView(userLocation, 18);
             updateDistanceHUD(); // Re-trigger rotate
         } else {
             alert('Aguardando sinal GPS...');
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

    function updateDistanceHUD() {
         if (!userLocation || !scorecardGreenCenter) return;
         
         const userL = L.latLng(userLocation[0], userLocation[1]);
         
         // Auto Rotate logic
         if (mapInstance && typeof mapInstance.setBearing === 'function') {
             const bearing = calculateBearing(userL.lat, userL.lng, scorecardGreenCenter.lat, scorecardGreenCenter.lng);
             mapInstance.setBearing(bearing);
         }

         if (layupPolyline) mapInstance.removeLayer(layupPolyline);

         if (!targetMarker) {
             const distToGreen = Math.round(userL.distanceTo(scorecardGreenCenter) * 1.09361);
             document.getElementById('gps-distance-hud').innerHTML = `🚩 Para o Green: <b>${distToGreen} yds</b>`;
             document.getElementById('gps-distance-hud').style.display = 'block';
             
             layupPolyline = L.polyline([userL, scorecardGreenCenter], {color: '#10B981', weight: 4, opacity: 0.8}).addTo(mapInstance);
             return;
         }
         
         // Layup Logic
         const layupL = targetMarker.getLatLng();
         const layupYds = Math.round(userL.distanceTo(layupL) * 1.09361);
         const restYds = Math.round(layupL.distanceTo(scorecardGreenCenter) * 1.09361);
         
         layupPolyline = L.polyline([userL, layupL, scorecardGreenCenter], {color: '#F59E0B', weight: 4, dashArray: '8, 8'}).addTo(mapInstance);

         document.getElementById('gps-distance-hud').innerHTML = `L: <b>${layupYds}y</b> | 🚩: <b>${restYds}y</b>`;
         document.getElementById('gps-distance-hud').style.display = 'block';
    }

    return {
        initMap,
        setActivePointType,
        getHoleData,
        resetHolePoints,
        loadPreexistingPoints,
        isInitialized,
        initScorecardMap,
        loadScorecardGreen,
        centerOnUser
    };
})();
