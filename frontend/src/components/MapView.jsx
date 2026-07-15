import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { getAqiCurrent, getVulnerableSites } from '../api';

// Fix Leaflet marker icons issues under webpack/vite bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

// Custom Leaflet DivIcons for site types
const hospitalIcon = L.divIcon({
  html: `<div style="
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background-color: #EF4444;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    color: #FFFFFF;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  ">✚</div>`,
  className: 'custom-leaflet-icon-hospital',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const schoolIcon = L.divIcon({
  html: `<div style="
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background-color: #3B82F6;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    color: #FFFFFF;
    font-size: 11px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  ">📖</div>`,
  className: 'custom-leaflet-icon-school',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

const defaultSiteIcon = L.divIcon({
  html: `<div style="
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background-color: #6B7280;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    color: #FFFFFF;
    font-size: 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  ">📍</div>`,
  className: 'custom-leaflet-icon-default',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

/**
 * Helper component to handle recentering the map when coordinates change.
 */
function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

/**
 * Internal helper component to trigger map invalidation on mount and window resize.
 */
function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    // 1. Initial invalidation to resolve grid rendering offsets
    map.invalidateSize();

    // 2. Delayed invalidation to handle grid settling
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    // 3. Window resize event listener
    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup listener and timeout
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

/**
 * Helper to match AQI value with standard AQI color bands returning CSS variables
 */
function getAqiColor(aqi) {
  if (aqi === null || aqi === undefined) return 'var(--border)';
  if (aqi <= 50) return 'var(--aqi-good)';
  if (aqi <= 100) return 'var(--aqi-moderate)';
  if (aqi <= 150) return 'var(--aqi-unhealthy-sensitive)';
  if (aqi <= 200) return 'var(--aqi-unhealthy)';
  if (aqi <= 300) return 'var(--aqi-very-unhealthy)';
  return 'var(--aqi-hazardous)';
}

export default function MapView({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [aqiData, setAqiData] = useState(null);
  const [vulnerableSites, setVulnerableSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([
      getAqiCurrent(activeCity),
      getVulnerableSites(activeCity)
    ])
      .then(([aqi, sites]) => {
        if (isMounted) {
          setAqiData(aqi);
          setVulnerableSites(sites || []);
          
          // Bug Fix 1: Log counts of each distinct site_type present in raw response
          const siteCounts = (sites || []).reduce((acc, s) => {
            const rawType = s.site_type || 'unknown';
            acc[rawType] = (acc[rawType] || 0) + 1;
            return acc;
          }, {});
          console.log(`[MapView - Mounting] Distinct site types for ${activeCity}:`, siteCounts);
          
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          setError(err.message || 'Failed to load air quality/site data.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeCity]);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getAqiCurrent(activeCity),
      getVulnerableSites(activeCity)
    ])
      .then(([aqi, sites]) => {
        setAqiData(aqi);
        setVulnerableSites(sites || []);
        
        // Bug Fix 1: Log count of distinct site_type in raw response on retry
        const siteCounts = (sites || []).reduce((acc, s) => {
          const rawType = s.site_type || 'unknown';
          acc[rawType] = (acc[rawType] || 0) + 1;
          return acc;
        }, {});
        console.log(`[MapView - Retry] Distinct site types for ${activeCity}:`, siteCounts);
        
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load air quality/site data.');
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <div className="map-placeholder">
        <div>Loading air quality map and vulnerable sites for {activeCity}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="placeholder-error">
        <p>Error Loading Data: {error}</p>
        <button onClick={handleRetry} className="btn">Try Again</button>
      </div>
    );
  }

  // fallback coordinates: India center [20.5937, 78.9629]
  const defaultCenter = [20.5937, 78.9629];
  const targetCenter = aqiData && aqiData.latitude && aqiData.longitude
    ? [aqiData.latitude, aqiData.longitude]
    : defaultCenter;

  const totalSitesCount = vulnerableSites.length;
  
  // Bug Fix 4: Split the 300-marker budget proportionally across whichever site_types are present
  const siteTypes = Array.from(new Set(vulnerableSites.map(s => s.site_type || 'unknown')));
  
  const groupedSites = {};
  siteTypes.forEach(t => {
    groupedSites[t] = vulnerableSites.filter(s => (s.site_type || 'unknown') === t);
  });

  let displaySites = [];
  if (totalSitesCount <= 300) {
    displaySites = vulnerableSites;
  } else {
    const budget = 300;
    let remainingBudget = budget;
    let typesLeft = siteTypes.slice();
    const allocated = {};
    
    typesLeft.forEach(t => { allocated[t] = 0; });
    
    let progress = true;
    while (remainingBudget > 0 && typesLeft.length > 0 && progress) {
      progress = false;
      const targetShare = Math.floor(remainingBudget / typesLeft.length);
      const share = targetShare > 0 ? targetShare : 1;
      
      const nextTypesLeft = [];
      for (const t of typesLeft) {
        const available = groupedSites[t].length - allocated[t];
        if (available <= 0) {
          continue;
        }
        const take = Math.min(available, share, remainingBudget);
        if (take > 0) {
          allocated[t] += take;
          remainingBudget -= take;
          progress = true;
        }
        if (groupedSites[t].length > allocated[t]) {
          nextTypesLeft.push(t);
        }
      }
      typesLeft = nextTypesLeft;
    }
    
    siteTypes.forEach(t => {
      displaySites.push(...groupedSites[t].slice(0, allocated[t]));
    });
  }

  return (
    <div className="map-view-container relative-wrapper">
      <div className="card-title-container">
        <svg className="card-icon icon-map" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <h3 className="card-title">Air Quality Index & Vulnerable Sites Map</h3>
      </div>

      <div className="info-bar">
        <span>
          {totalSitesCount > displaySites.length
            ? `Showing ${displaySites.length} of ${totalSitesCount} vulnerable sites in ${activeCity}`
            : `Showing ${totalSitesCount} vulnerable sites in ${activeCity}`
          }
        </span>
        {aqiData && aqiData.aqi_value !== undefined && (
          <span className="info-bar-bold">
            Current Station AQI: <span className="aqi-badge" style={{ backgroundColor: getAqiColor(aqiData.aqi_value), color: aqiData.aqi_value > 50 && aqiData.aqi_value <= 100 ? '#000' : '#fff' }}>{aqiData.aqi_value}</span>
          </span>
        )}
      </div>

      <MapContainer
        center={targetCenter}
        zoom={13}
        style={{ height: '480px', width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap center={targetCenter} zoom={13} />
        <MapResizeHandler />

        {/* AQI Monitoring Station Marker */}
        {aqiData && aqiData.latitude && aqiData.longitude && (
          <CircleMarker
            center={[aqiData.latitude, aqiData.longitude]}
            radius={18}
            fillColor={getAqiColor(aqiData.aqi_value)}
            color="#000"
            weight={2}
            fillOpacity={0.85}
            dashArray={aqiData.is_stale ? "6, 6" : undefined}
          >
            <Popup>
              <div className="leaf-popup-container">
                <h4 className="leaf-popup-title">{aqiData.station_name || 'Monitoring Station'}</h4>
                <p className="leaf-popup-text">
                  <strong>AQI:</strong> <span className="aqi-badge" style={{ backgroundColor: getAqiColor(aqiData.aqi_value), color: aqiData.aqi_value > 50 && aqiData.aqi_value <= 100 ? '#000' : '#fff' }}>{aqiData.aqi_value}</span>
                </p>
                <p className="leaf-popup-text" style={{ color: 'var(--text-secondary)' }}>
                  Recorded: {aqiData.recorded_at ? new Date(aqiData.recorded_at).toLocaleString() : 'N/A'}
                </p>
                {aqiData.is_stale ? (
                  <>
                    <p className="leaf-popup-warning">
                      This station has not reported fresh data recently — a known gap in current monitoring coverage for this area.
                    </p>
                    <p className="leaf-popup-stale">
                      ⚠️ Stale Data ({aqiData.data_age_hours}h old)
                    </p>
                  </>
                ) : (
                  <p className="leaf-popup-fresh">
                    ✓ Data is fresh
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Vulnerable Sites Markers - Bug Fix 3: Select distinct Leaflet Icon */}
        {displaySites.map((site, index) => {
          const type = site.site_type || 'unknown';
          const icon = type === 'school' ? schoolIcon : type === 'hospital' ? hospitalIcon : defaultSiteIcon;
          return (
            <Marker
              key={`site-${index}`}
              position={[site.latitude, site.longitude]}
              icon={icon}
            >
              <Popup>
                <div>
                  <strong>{site.name || 'Unnamed Vulnerable Site'}</strong><br />
                  Type: {type === 'school' ? '🏫 School' : type === 'hospital' ? '🏥 Hospital' : `📍 ${type}`}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Persistent Map Legend */}
      <div className="map-legend">
        <strong className="legend-title">AQI Station Legend:</strong>
        <div className="legend-item">
          <span className="legend-circle" />
          <span>Live station data</span>
        </div>
        <div className="legend-item">
          <span className="legend-circle dashed" />
          <span>Stale data (verified via repeated checks)</span>
        </div>

        {/* Bug Fix 5: Color-coded vulnerable site key entries dynamically based on siteTypes */}
        {siteTypes.length > 0 && <strong className="legend-title" style={{ marginLeft: 'var(--space-4)' }}>Vulnerable Sites:</strong>}
        {siteTypes.map(t => {
          const displayLabel = t.charAt(0).toUpperCase() + t.slice(1);
          let color = '#6B7280';
          let symbol = '';
          if (t === 'hospital') {
            color = '#EF4444';
            symbol = '✚';
          } else if (t === 'school') {
            color = '#3B82F6';
            symbol = '📖';
          }

          return (
            <div className="legend-item" key={`legend-site-${t}`}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                backgroundColor: color,
                border: '1px solid #FFFFFF',
                borderRadius: '50%',
                color: '#FFFFFF',
                fontSize: t === 'hospital' ? '12px' : '9px',
                fontWeight: 'bold',
                marginRight: '4px'
              }}>{symbol || '📍'}</span>
              <span>{displayLabel}s</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
