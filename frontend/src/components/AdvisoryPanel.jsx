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
      <div className="panel-loading">
        <div>Generating health advisory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-error">
        <div className="card-title-container">
          <svg className="card-icon icon-advisory" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          <h3 className="card-title">Health Advisory</h3>
        </div>
        <p>{error}</p>
        <button onClick={handleRetry} className="btn">Retry</button>
      </div>
    );
  }

  if (!advisory) {
    return null;
  }

  return (
    <div className="advisory-panel-container panel-container">
      <div className="card-title-container">
        <svg className="card-icon icon-advisory" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
        <h3 className="card-title">Citizen Health Advisory ({activeCity})</h3>
      </div>

      <div className="advisory-box">
        {advisory.advisory_text}
      </div>

      <div className="panel-footer-meta">
        <span>Based on AQI Level: <strong style={{ color: 'var(--text-primary)' }}>{advisory.aqi_value}</strong></span>
        <span>Advisory Language: <strong style={{ color: 'var(--text-primary)' }}>{advisory.language}</strong></span>
      </div>

      {advisory.error && (
        <div className="error-banner">
          ⚠️ Live advisory generation is temporarily unavailable — showing a general fallback message
        </div>
      )}
    </div>
  );
}
