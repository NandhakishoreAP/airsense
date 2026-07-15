import React, { useState, useEffect } from 'react';
import { getAqiCurrent } from '../api';

function getAqiClassName(aqi) {
  if (aqi === null || aqi === undefined) return 'aqi-unknown';
  if (aqi <= 50) return 'aqi-good';
  if (aqi <= 100) return 'aqi-moderate';
  if (aqi <= 150) return 'aqi-unhealthy-sensitive';
  if (aqi <= 200) return 'aqi-unhealthy';
  if (aqi <= 300) return 'aqi-very-unhealthy';
  return 'aqi-hazardous';
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
      <div className="panel-loading">
        <div>Comparing cities AQI...</div>
      </div>
    );
  }

  const citiesList = ['Chennai', 'Delhi', 'Bengaluru'];

  return (
    <div className="city-comparison-container panel-container">
      <div className="panel-footer-meta" style={{ marginBottom: 'var(--space-3)' }}>
        <div className="card-title-container">
          <svg className="card-icon icon-comparison" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="10" width="10" height="12" rx="2" />
            <path d="M12 2h6a2 2 0 0 1 2 2v18h-8Z" />
            <path d="M6 14h2M6 18h2M16 6h2M16 10h2M16 14h2M16 18h2" />
          </svg>
          <h3 className="card-title">Multi-City AQI Comparison</h3>
        </div>
        <button
          onClick={handleRefresh}
          className="btn"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="cards-row">
        {citiesList.map((cityName) => {
          const cityData = data[cityName];
          const isSelected = activeCity === cityName;
          const hasError = !!cityData.error;
          const aqi = cityData.value ? cityData.value.aqi_value : null;
          const station = cityData.value ? cityData.value.station_name : null;

          return (
            <div key={cityName} className={`comparison-col ${isSelected ? 'selected' : ''}`}>
              {isSelected && (
                <span className="selected-badge">
                  Selected
                </span>
              )}

              <h4 className="city-col-title">{cityName}</h4>

              {hasError ? (
                <div style={{ color: 'var(--urgency-priority-text)', fontSize: '0.9rem', margin: 'var(--space-3) 0', fontWeight: 'bold' }}>
                  ⚠️ Data unavailable
                </div>
              ) : (
                <>
                  <div className={`aqi-badge ${getAqiClassName(aqi)}`} style={{ fontSize: '1.5rem', padding: 'var(--space-2) var(--space-4)', margin: 'var(--space-2) 0' }}>
                    {aqi !== null ? aqi : 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
