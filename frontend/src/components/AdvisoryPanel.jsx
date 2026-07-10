import React, { useState, useEffect } from 'react';
import { getAdvisory } from '../api';

export default function AdvisoryPanel({ city, selectedCity, language }) {
  const activeCity = city || selectedCity;
  const [advisory, setAdvisory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = (isMounted) => {
    setLoading(true);
    setError(null);
    setAdvisory(null);

    getAdvisory(activeCity, language)
      .then((res) => {
        if (isMounted) {
          setAdvisory(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error(err);
          const errMsg = err.message || '';
          if (errMsg.includes('404')) {
            setError('No advisory available yet for this city');
          } else {
            setError(errMsg || 'Failed to load health advisory.');
          }
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    let isMounted = true;
    fetchData(isMounted);
    return () => {
      isMounted = false;
    };
  }, [activeCity, language]);

  const handleRetry = () => {
    fetchData(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', border: '1px solid #ddd', borderRadius: '8px', background: '#fcfcfc', padding: '1rem', boxSizing: 'border-box' }}>
        <div>Generating health advisory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem', background: '#fff5f5', minHeight: '180px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Health Advisory</h3>
        <p style={{ color: '#cc0000', margin: '0 0 15px 0', textAlign: 'center', fontWeight: 'bold' }}>{error}</p>
        <button onClick={handleRetry} style={{ padding: '0.5rem 1rem', cursor: 'pointer', background: '#cc0000', color: '#fff', border: 'none', borderRadius: '4px' }}>Retry</button>
      </div>
    );
  }

  if (!advisory) {
    return null;
  }

  return (
    <div className="advisory-panel-container" style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem', background: '#fff', minHeight: '180px', boxSizing: 'border-box' }}>
      <h3 style={{ margin: '0 0 10px 0' }}>Citizen Health Advisory ({activeCity})</h3>

      <div style={{
        padding: '1rem',
        borderRadius: '6px',
        background: '#f4f6f9',
        borderLeft: '4px solid #28a745',
        margin: '10px 0',
        fontSize: '1.05rem',
        lineHeight: '1.6',
        color: '#2c3e50',
        fontWeight: '500'
      }}>
        {advisory.advisory_text}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#7f8c8d', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        <span>Based on AQI Level: <strong style={{ color: '#2c3e50' }}>{advisory.aqi_value}</strong></span>
        <span>Advisory Language: <strong style={{ color: '#2c3e50' }}>{advisory.language}</strong></span>
      </div>

      {advisory.error && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: '#fff3cd', border: '1px solid #ffeeba', color: '#856404', borderRadius: '4px', fontSize: '0.85rem' }}>
          ⚠️ Live advisory generation is temporarily unavailable — showing a general fallback message
        </div>
      )}
    </div>
  );
}
