import React, { useState, useEffect } from 'react';
import { getAqiCurrent } from '../api';

function getAqiColor(aqi) {
  if (aqi === null || aqi === undefined) return '#cccccc';
  if (aqi <= 50) return '#00e400';   // Good (Green)
  if (aqi <= 100) return '#ffff00';  // Moderate (Yellow)
  if (aqi <= 150) return '#ff7e00';  // Unhealthy for Sensitive Groups (Orange)
  if (aqi <= 200) return '#ff0000';  // Unhealthy (Red)
  if (aqi <= 300) return '#8f3f97';  // Very Unhealthy (Purple)
  return '#7e0023';                 // Hazardous (Maroon)
}

export default function CityComparison({ city, selectedCity }) {
  const activeCity = city || selectedCity;
  const [data, setData] = useState({
    Chennai: { value: null, error: null },
    Delhi: { value: null, error: null },
    Bengaluru: { value: null, error: null }
  });
  const [loading, setLoading] = useState(true);

  const fetchAllCities = (isMounted) => {
    setLoading(true);
    Promise.allSettled([
      getAqiCurrent('Chennai'),
      getAqiCurrent('Delhi'),
      getAqiCurrent('Bengaluru')
    ]).then((results) => {
      if (isMounted) {
        const newData = {};
        const citiesList = ['Chennai', 'Delhi', 'Bengaluru'];
        results.forEach((result, idx) => {
          const cityName = citiesList[idx];
          if (result.status === 'fulfilled') {
            newData[cityName] = { value: result.value, error: null };
          } else {
            console.error(`Failed to fetch current AQI of ${cityName}:`, result.reason);
            newData[cityName] = { value: null, error: 'Data unavailable' };
          }
        });
        setData(newData);
        setLoading(false);
      }
    }).catch((err) => {
      if (isMounted) {
        console.error('Promise.allSettled failed unexpectedly: ', err);
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    let isMounted = true;
    fetchAllCities(isMounted);
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    fetchAllCities(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc', padding: '1rem', boxSizing: 'border-box' }}>
        <div>Comparing cities AQI...</div>
      </div>
    );
  }

  const citiesList = ['Chennai', 'Delhi', 'Bengaluru'];

  return (
    <div className="city-comparison-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', minHeight: '180px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Multi-City AQI Comparison</h3>
        <button
          onClick={handleRefresh}
          style={{
            padding: '4px 10px',
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {citiesList.map((cityName) => {
          const cityData = data[cityName];
          const isSelected = activeCity === cityName;
          const hasError = !!cityData.error;
          const aqi = cityData.value ? cityData.value.aqi_value : null;
          const station = cityData.value ? cityData.value.station_name : null;
          const color = getAqiColor(aqi);

          const colStyle = {
            flex: 1,
            minWidth: '160px',
            border: isSelected ? '2px solid #007bff' : '1px solid #ddd',
            borderRadius: '6px',
            padding: '1rem',
            textAlign: 'center',
            background: isSelected ? '#f0f7ff' : '#fafafa',
            boxShadow: isSelected ? '0 4px 8px rgba(0,123,255,0.15)' : 'none',
            transition: 'all 0.2s ease',
            position: 'relative'
          };

          const textDarkColor = aqi > 50 && aqi <= 100 ? '#000' : '#fff';

          return (
            <div key={cityName} style={colStyle}>
              {isSelected && (
                <span style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#007bff',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}>
                  Selected
                </span>
              )}

              <h4 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#2c3e50' }}>{cityName}</h4>

              {hasError ? (
                <div style={{ color: '#d9534f', fontSize: '0.9rem', margin: '15px 0', fontWeight: 'bold' }}>
                  ⚠️ Data unavailable
                </div>
              ) : (
                <>
                  <div style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    background: color,
                    color: textDarkColor,
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    margin: '10px 0'
                  }}>
                    {aqi !== null ? aqi : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#7f8c8d', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {station || 'Station Unknown'}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
