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
 * Helper to match AQI value with standard AQI color bands
 */
function getAqiColor(aqi) {
  if (aqi === null || aqi === undefined) return '#cccccc';
  if (aqi <= 50) return '#00e400';   // Good (Green)
  if (aqi <= 100) return '#ffff00';  // Moderate (Yellow)
  if (aqi <= 150) return '#ff7e00';  // Unhealthy for Sensitive Groups (Orange)
  if (aqi <= 200) return '#ff0000';  // Unhealthy (Red)
  if (aqi <= 300) return '#8f3f97';  // Very Unhealthy (Purple)
  return '#7e0023';                 // Hazardous (Maroon)
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
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load air quality/site data.');
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <div style={{ height: '500px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc' }}>
        <div>Loading air quality map and vulnerable sites for {activeCity}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid #ffcccc', borderRadius: '8px', padding: '1rem', background: '#fff5f5' }}>
        <p style={{ color: '#cc0000', fontWeight: 'bold' }}>Error Loading Data: {error}</p>
        <button onClick={handleRetry} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px' }}>Try Again</button>
      </div>
    );
  }

  // fallback coordinates: India center [20.5937, 78.9629]
  const defaultCenter = [20.5937, 78.9629];
  const targetCenter = aqiData && aqiData.latitude && aqiData.longitude
    ? [aqiData.latitude, aqiData.longitude]
    : defaultCenter;

  const displaySites = vulnerableSites.slice(0, 300);
  const totalSitesCount = vulnerableSites.length;

  return (
    <div className="map-view-container" style={{ position: 'relative' }}>
      <div style={{ marginBottom: '8px', fontSize: '0.9rem', color: '#555', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {totalSitesCount > 300
            ? `Showing 300 of ${totalSitesCount} vulnerable sites in ${activeCity}`
            : `Showing ${totalSitesCount} vulnerable sites in ${activeCity}`
          }
        </span>
        {aqiData && aqiData.aqi_value !== undefined && (
          <span style={{ fontWeight: 'bold' }}>
            Current Station AQI: <span style={{ padding: '2px 8px', borderRadius: '4px', background: getAqiColor(aqiData.aqi_value), color: aqiData.aqi_value > 50 && aqiData.aqi_value <= 100 ? '#000' : '#fff' }}>{aqiData.aqi_value}</span>
          </span>
        )}
      </div>

      <MapContainer
        center={targetCenter}
        zoom={13}
        style={{ height: '500px', width: '100%', borderRadius: '8px', border: '1px solid #ccc', zIndex: 1 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap center={targetCenter} zoom={13} />

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
              <div style={{ minWidth: '180px' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>{aqiData.station_name || 'Monitoring Station'}</h4>
                <p style={{ margin: '4px 0' }}>
                  <strong>AQI:</strong> <span style={{ padding: '2px 6px', borderRadius: '4px', background: getAqiColor(aqiData.aqi_value), color: aqiData.aqi_value > 50 && aqiData.aqi_value <= 100 ? '#000' : '#fff', fontWeight: 'bold' }}>{aqiData.aqi_value}</span>
                </p>
                <p style={{ margin: '4px 0', fontSize: '0.85rem', color: '#666' }}>
                  Recorded: {aqiData.recorded_at ? new Date(aqiData.recorded_at).toLocaleString() : 'N/A'}
                </p>
                {aqiData.is_stale ? (
                  <>
                    <p style={{ margin: '6px 0', fontSize: '0.8rem', color: '#888', fontStyle: 'italic', lineHeight: '1.3' }}>
                      This station has not reported fresh data recently — a known gap in current monitoring coverage for this area.
                    </p>
                    <p style={{ margin: '4px 0 0 0', color: '#d9534f', fontSize: '0.85rem', fontWeight: 'bold' }}>
                      ⚠️ Stale Data ({aqiData.data_age_hours}h old)
                    </p>
                  </>
                ) : (
                  <p style={{ margin: '4px 0 0 0', color: '#5cb85c', fontSize: '0.85rem', fontWeight: 'bold' }}>
                    ✓ Data is fresh
                  </p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Vulnerable Sites Markers */}
        {displaySites.map((site, index) => (
          <Marker
            key={`site-${index}`}
            position={[site.latitude, site.longitude]}
          >
            <Popup>
              <div>
                <strong>{site.name || 'Unnamed Vulnerable Site'}</strong><br />
                Type: {site.site_type === 'school' ? '🏫 School' : '🏥 Hospital'}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Persistent Map Legend */}
      <div style={{
        marginTop: '10px',
        padding: '10px 12px',
        border: '1px solid #ddd',
        borderRadius: '6px',
        background: '#fff',
        display: 'flex',
        gap: '20px',
        fontSize: '0.82rem',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <strong style={{ color: '#2c3e50' }}>AQI Station Legend:</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid #000',
            borderRadius: '50%',
            background: '#e0e0e0'
          }} />
          <span>Live station data</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px dashed #000',
            borderRadius: '50%',
            background: '#e0e0e0'
          }} />
          <span>Stale data (verified via repeated checks)</span>
        </div>
      </div>
    </div>
  );
}
