/**
 * Map Integration Logic using Leaflet.js
 * Handles pinning 6 points per hole and calculating the Green Center.
 */

window.GolfMap = (function() {
    let mapInstance = null;
    let markers = {};
    let currentHolePoints = {
        tee1: null,
        tee2: null,
        greenTop: null,
        greenBottom: null,
        greenLeft: null,
        greenRight: null
    };
    
    // Configurable state
    let activePointType = null; // Which point is the user currently placing?

    let userLocation = null;
    let locationWatchId = null;
    let targetMarker = null;

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

        Object.keys(pointsObj).forEach(type => {
            if(pointsObj[type] && pointsObj[type].lat && pointsObj[type].lng) {
                 currentHolePoints[type] = { lat: pointsObj[type].lat, lng: pointsObj[type].lng };
                 drawMarker(type, L.latLng(pointsObj[type].lat, pointsObj[type].lng));
                 
                 // Mark button as captured if UI is listening
                 if (window.onPointRestored) {
                     window.onPointRestored(type);
                 }
            }
        });

        if (isGreenComplete()) {
            drawGreenCenter();
        }
    }

    function onEditorMapClick(e) {
        if (!activePointType) {
            alert("Selecione qual ponto deseja marcar primeiro.");
            return;
        }

        const latLng = e.latlng;
        
        // Save coordinates
        currentHolePoints[activePointType] = { lat: latLng.lat, lng: latLng.lng };
        
        // Draw Maker
        drawMarker(activePointType, latLng);
        
        // Check if green is complete to draw the center
        if (activePointType.startsWith('green') && isGreenComplete()) {
            drawGreenCenter();
        }
        
        // Notify UI that a point was captured
        if (window.onPointCaptured) {
            window.onPointCaptured(activePointType);
            activePointType = null; // reset
        }
    }

    function drawMarker(type, latLng) {
        if (markers[type]) {
            mapInstance.removeLayer(markers[type]);
        }
        
        let color = '#3B82F6'; // Blue
        if (type.startsWith('tee')) color = '#F59E0B'; // Orange
        if (type.startsWith('green')) color = '#10B981'; // Green
        
        const myCustomColour = color;
        const markerHtmlStyles = `
          background-color: ${myCustomColour};
          width: 1rem;
          height: 1rem;
          display: block;
          left: -0.5rem;
          top: -0.5rem;
          position: relative;
          border-radius: 1rem 1rem 0;
          transform: rotate(45deg);
          border: 2px solid #FFFFFF`;

        const icon = L.divIcon({
          className: "my-custom-pin",
          iconAnchor: [0, 8],
          labelAnchor: [-2, 0],
          popupAnchor: [0, -10],
          html: `<span style="${markerHtmlStyles}" />`
        });

        markers[type] = L.marker(latLng, { icon: icon, draggable: true }).addTo(mapInstance);
        
        // Listen to Drag
        markers[type].on('dragend', function(e) {
            const newPos = markers[type].getLatLng();
            currentHolePoints[type] = { lat: newPos.lat, lng: newPos.lng };
            
            // Re-draw green center if a green point was moved and all 4 exist
            if (type.startsWith('green') && isGreenComplete()) {
                drawGreenCenter();
            }
        });
    }
    
    function isGreenComplete() {
         return currentHolePoints.greenTop && 
                currentHolePoints.greenBottom && 
                currentHolePoints.greenLeft && 
                currentHolePoints.greenRight;
    }

    function drawGreenCenter() {
         const pts = [
             currentHolePoints.greenTop,
             currentHolePoints.greenBottom,
             currentHolePoints.greenLeft,
             currentHolePoints.greenRight
         ];
         
         // Calculate simple centroid map bounds
         const lats = pts.map(p => p.lat);
         const lngs = pts.map(p => p.lng);
         
         const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
         const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
         
         const centerLatLng = [centerLat, centerLng];
         
         if (markers['greenCenter']) {
             mapInstance.removeLayer(markers['greenCenter']);
         }
         
         // Draw a red star or dot for center
         const icon = L.divIcon({
             className: "center-pin",
             html: `<div style="background:#EF4444;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(239,68,68,0.8);"></div>`,
             iconAnchor: [6, 6]
         });
         
         markers['greenCenter'] = L.marker(centerLatLng, { icon }).addTo(mapInstance);
         currentHolePoints.greenCenter = { lat: centerLat, lng: centerLng };
         
         // Also draw a polygon connecting the 4 points just for visual feedback
         if (markers['greenPoly']) mapInstance.removeLayer(markers['greenPoly']);
         markers['greenPoly'] = L.polygon([
             [currentHolePoints.greenTop.lat, currentHolePoints.greenTop.lng],
             [currentHolePoints.greenRight.lat, currentHolePoints.greenRight.lng],
             [currentHolePoints.greenBottom.lat, currentHolePoints.greenBottom.lng],
             [currentHolePoints.greenLeft.lat, currentHolePoints.greenLeft.lng]
         ], { color: '#10B981', fillOpacity: 0.2 }).addTo(mapInstance);
    }

    function setActivePointType(type) {
        activePointType = type;
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

    function loadHoleGPS(courseId, holeNum) {
         // In MVP we don't have hole coords persisted robustly yet, we center on user
         centerOnUser();
    }

    function updateUserLocation(lat, lng) {
         const latlng = [lat, lng];
         userLocation = latlng;
         
         if (markers['user']) mapInstance.removeLayer(markers['user']);
         
         const userIcon = L.divIcon({
             className: "user-loc-pin",
             html: `<div style="background:#3B82F6;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 16px rgba(59,130,246,0.8);"></div>`,
             iconAnchor: [7, 7]
         });
         
         markers['user'] = L.marker(latlng, { icon: userIcon }).addTo(mapInstance);
         updateDistanceHUD();
    }

    function centerOnUser() {
         if (userLocation && mapInstance) {
             mapInstance.setView(userLocation, 18);
         } else {
             alert('Aguardando sinal GPS...');
         }
    }

    function onScorecardMapClick(e) {
         if (targetMarker) mapInstance.removeLayer(targetMarker);
         
         targetMarker = L.marker(e.latlng, {
              icon: L.divIcon({
                  html: '🎯',
                  iconSize: [24,24],
                  className: 'target-pin',
                  iconAnchor: [12,12]
              })
         }).addTo(mapInstance);
         
         updateDistanceHUD();
    }

    function updateDistanceHUD() {
         if (!userLocation || !targetMarker) return;
         
         const from = L.latLng(userLocation[0], userLocation[1]);
         const to = targetMarker.getLatLng();
         
         const distMeters = from.distanceTo(to);
         const distYards = Math.round(distMeters * 1.09361);
         
         document.getElementById('gps-yards').innerText = distYards;
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
        loadHoleGPS,
        centerOnUser
    };
})();
